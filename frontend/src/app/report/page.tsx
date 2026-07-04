"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  average,
  formatDuration,
  GRADE_META,
  REPORT_STORAGE_KEY,
  RETRY_PERSONA_KEY,
  Scores,
  scoreGrade,
  StoredReport,
} from "@/lib/report";

type Metric = { label: string; avg: number };

function metricsFrom(turns: StoredReport["turns"]): Metric[] {
  const scoresList = turns
    .filter((t) => t.role === "user" && t.scores)
    .map((t) => t.scores as Scores);

  return [
    { label: "말속도", avg: average(scoresList.map((s) => s.speech_rate_score)) },
    { label: "유창성", avg: average(scoresList.map((s) => s.fluency_score)) },
    { label: "공감", avg: average(scoresList.map((s) => s.empathy_score)) },
  ];
}

export default function ReportPage() {
  const router = useRouter();
  const [stored, setStored] = useState<StoredReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [showScript, setShowScript] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem(REPORT_STORAGE_KEY);
    if (raw) {
      try {
        setStored(JSON.parse(raw));
      } catch {
        setStored(null);
      }
    }
    setLoaded(true);
  }, []);

  function retrySameScenario() {
    if (stored) sessionStorage.setItem(RETRY_PERSONA_KEY, stored.persona);
    router.push("/");
  }

  function tryNewScenario() {
    router.push("/");
  }

  if (loaded && !stored) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-zinc-50 px-4 text-center dark:bg-zinc-950">
        <p className="text-zinc-500">표시할 리포트가 없습니다.</p>
        <button
          onClick={() => router.push("/")}
          className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
        >
          연습하러 가기
        </button>
      </div>
    );
  }

  if (!stored) return null;

  const grade = GRADE_META[stored.report.overall_grade];
  const metrics = metricsFrom(stored.turns);
  const userTurnCount = stored.turns.filter((t) => t.role === "user").length;

  return (
    <div className="min-h-[100dvh] bg-zinc-50 dark:bg-zinc-950 pb-16">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-3 sm:px-4 pt-6">
        <div>
          <h1 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">세션 리포트</h1>
          <p className="text-sm text-zinc-400">
            {new Date(stored.createdAt).toLocaleDateString("ko-KR")} · 발화 {userTurnCount}회 ·{" "}
            {formatDuration(stored.durationSec)}
          </p>
        </div>

        {/* 1단계: 종합 등급 배너 */}
        <div className={`rounded-2xl border-2 p-6 text-center ${grade.bg}`}>
          <div className="text-5xl">{grade.emoji}</div>
          <div className={`mt-2 text-2xl font-extrabold ${grade.text}`}>{grade.label}</div>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
            {stored.report.overall_comment}
          </p>
        </div>

        {/* 2단계: 지표별 카드 */}
        <div className="grid grid-cols-3 gap-3">
          {metrics.map((m) => {
            const g = GRADE_META[scoreGrade(m.avg)];
            return (
              <div
                key={m.label}
                className="flex flex-col items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white p-3 text-center dark:border-zinc-800 dark:bg-zinc-900"
              >
                <span className="text-xs font-semibold text-zinc-500">{m.label}</span>
                <span className="text-xl">{g.emoji}</span>
                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  {m.avg.toFixed(1)}/10
                </span>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${m.avg * 10}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* 3단계: 잘한 점 / 개선점 */}
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950">
            <h2 className="mb-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
              ✓ 잘한 점
            </h2>
            <ul className="flex flex-col gap-1.5">
              {stored.report.strengths.map((s, i) => (
                <li key={i} className="text-sm leading-relaxed text-emerald-900 dark:text-emerald-100">
                  {s}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950">
            <h2 className="mb-2 text-sm font-bold text-amber-800 dark:text-amber-300">
              △ 개선하면 좋은 점
            </h2>
            <ul className="flex flex-col gap-1.5">
              {stored.report.improvements.map((s, i) => (
                <li key={i} className="text-sm leading-relaxed text-amber-900 dark:text-amber-100">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* 4단계: 전체 대화 스크립트 (접기/펼치기) */}
        <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <button
            onClick={() => setShowScript((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-zinc-700 dark:text-zinc-200"
          >
            전체 대화 보기
            <span>{showScript ? "▴" : "▾"}</span>
          </button>
          {showScript && (
            <div className="flex flex-col gap-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
              {stored.turns.map((t, i) => (
                <div key={i} className={`flex flex-col ${t.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                      t.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    }`}
                  >
                    {t.text}
                  </div>
                  {t.scores && (
                    <div className="mt-1 flex flex-wrap justify-end gap-1">
                      {t.scores.speech_rate_score <= 5 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          ⚠️ 말속도
                        </span>
                      )}
                      {t.scores.fluency_score <= 5 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          ⚠️ 유창성
                        </span>
                      )}
                      {t.scores.empathy_score <= 5 && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                          ⚠️ 공감
                        </span>
                      )}
                      {t.scores.speech_rate_score > 5 &&
                        t.scores.fluency_score > 5 &&
                        t.scores.empathy_score > 5 && (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            ✓ 양호
                          </span>
                        )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 재도전 유도 */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={retrySameScenario}
            className="w-full rounded-full bg-blue-600 px-5 py-4 text-base font-bold text-white hover:bg-blue-700"
          >
            같은 시나리오로 다시 연습하기
          </button>
          <button
            onClick={tryNewScenario}
            className="w-full rounded-full border border-zinc-300 px-5 py-3.5 text-sm font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200"
          >
            다른 시나리오 도전하기
          </button>
        </div>
      </div>
    </div>
  );
}
