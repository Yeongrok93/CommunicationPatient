"use client";

import { useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const DEFAULT_PERSONA = `45세 남성 환자. 3일 전부터 시작된 상복부 통증으로 내원.
평소 무뚝뚝하고 짧게 대답하는 편이며, 병원 오는 것 자체를 귀찮아함.
공감받는다고 느끼면 조금씩 마음을 열고 정보를 더 이야기함.`;

type ClaudeMessage = { role: "user" | "assistant"; content: string };

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  prosodySummary?: string;
};

export default function Home() {
  const [persona, setPersona] = useState(DEFAULT_PERSONA);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [claudeHistory, setClaudeHistory] = useState<ClaudeMessage[]>([]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<string | null>(null);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function startRecording() {
    setError(null);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      submitTurn(blob);
    };

    recorder.start();
    mediaRecorderRef.current = recorder;
    setRecording(true);
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  async function submitTurn(blob: Blob) {
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("audio", blob, "turn.webm");
      form.append("persona", persona);
      form.append("history", JSON.stringify(claudeHistory));

      const res = await fetch(`${API_URL}/api/turn`, { method: "POST", body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? `서버 오류 (${res.status})`);
      }
      const data = await res.json();

      setTurns((prev) => [
        ...prev,
        { role: "user", text: data.transcript, prosodySummary: data.prosody_summary_kr },
        { role: "assistant", text: data.patient_reply },
      ]);
      setClaudeHistory(data.history);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setLoading(false);
    }
  }

  async function endSession() {
    const userTurns = turns.filter((t) => t.role === "user");
    if (userTurns.length === 0) return;

    setFeedbackLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/session-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          turns: userTurns.map((t) => ({
            transcript: t.text,
            prosody_summary_kr: t.prosodySummary ?? "",
          })),
        }),
      });
      if (!res.ok) throw new Error(`서버 오류 (${res.status})`);
      const data = await res.json();
      setSessionFeedback(data.feedback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
    } finally {
      setFeedbackLoading(false);
    }
  }

  function resetSession() {
    setTurns([]);
    setClaudeHistory([]);
    setSessionFeedback(null);
    setError(null);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-10 px-4">
      <div className="mx-auto max-w-2xl flex flex-col gap-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          가상환자 커뮤니케이션 훈련 (feasibility test)
        </h1>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            환자 시나리오
          </label>
          <textarea
            className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3 text-sm text-zinc-900 dark:text-zinc-100"
            rows={3}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            disabled={turns.length > 0}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 min-h-[240px]">
          {turns.length === 0 && (
            <p className="text-sm text-zinc-400">
              마이크 버튼을 눌러 학습자 발화를 녹음하세요.
            </p>
          )}
          {turns.map((t, i) => (
            <div
              key={i}
              className={`flex flex-col ${t.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                  t.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {t.text}
              </div>
              {t.prosodySummary && (
                <div className="mt-1 max-w-[80%] text-xs text-zinc-400">
                  {t.prosodySummary}
                </div>
              )}
            </div>
          ))}
          {loading && <p className="text-sm text-zinc-400">분석 중...</p>}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={loading}
            className={`flex-1 rounded-full px-5 py-3 text-sm font-medium text-white transition-colors ${
              recording ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            } disabled:opacity-50`}
          >
            {recording ? "녹음 중지 & 전송" : "녹음 시작"}
          </button>
          <button
            onClick={endSession}
            disabled={turns.length === 0 || feedbackLoading}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200 disabled:opacity-50"
          >
            {feedbackLoading ? "리포트 생성 중..." : "세션 종료 & 피드백"}
          </button>
          <button
            onClick={resetSession}
            className="rounded-full border border-zinc-300 dark:border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-200"
          >
            초기화
          </button>
        </div>

        {sessionFeedback && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 p-4">
            <h2 className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
              종합 코칭 피드백
            </h2>
            <p className="whitespace-pre-wrap text-sm text-blue-950 dark:text-blue-100">
              {sessionFeedback}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
