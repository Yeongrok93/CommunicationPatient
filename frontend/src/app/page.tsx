"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const DEFAULT_PERSONA = `45세 남성 환자. 3일 전부터 시작된 상복부 통증으로 내원.
평소 무뚝뚝하고 짧게 대답하는 편이며, 병원 오는 것 자체를 귀찮아함.
공감받는다고 느끼면 조금씩 마음을 열고 정보를 더 이야기함.`;

type ClaudeMessage = { role: "user" | "assistant"; content: string };

type Prosody = {
  duration_sec: number;
  f0_mean_hz: number | null;
  f0_std_hz: number | null;
  intensity_mean_db: number;
  pause_count: number;
  total_pause_sec: number;
  longest_pause_sec: number;
  words_per_minute: number;
};

type ProsodyItem = { label: string; value: string; attention: boolean };

type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  prosody?: Prosody;
};

function prosodyItems(p: Prosody): ProsodyItem[] {
  const items: ProsodyItem[] = [];

  const wpm = p.words_per_minute;
  items.push({
    label: "말속도",
    value: `${wpm.toFixed(0)} 단어/분${wpm > 170 ? " · 빠른 편" : wpm > 0 && wpm < 90 ? " · 느린 편" : ""}`,
    attention: wpm > 170 || (wpm > 0 && wpm < 90),
  });

  if (p.f0_std_hz !== null) {
    const monotone = p.f0_std_hz < 15;
    items.push({
      label: "억양 변화",
      value: `${p.f0_std_hz.toFixed(1)}Hz${monotone ? " · 단조로움" : ""}`,
      attention: monotone,
    });
  }

  const longPause = p.longest_pause_sec > 2.5;
  items.push({
    label: "침묵",
    value: `${p.pause_count}회 · 최장 ${p.longest_pause_sec.toFixed(1)}초${longPause ? " · 긴 침묵" : ""}`,
    attention: longPause,
  });

  return items;
}

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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);

  function drawWaveform() {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      analyser.getByteTimeDomainData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#2563eb";
      ctx.beginPath();

      const sliceWidth = canvas.width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * canvas.height) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();

      animationRef.current = requestAnimationFrame(render);
    };
    render();
  }

  function stopWaveform() {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyserRef.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  useEffect(() => stopWaveform, []);

  async function startRecording() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "Unknown";
      const messages: Record<string, string> = {
        NotAllowedError: "마이크 권한이 거부되었습니다. 주소창 왼쪽 자물쇠 아이콘 → 사이트 설정에서 마이크를 허용해주세요.",
        NotFoundError: "마이크 장치를 찾을 수 없습니다. 마이크가 연결되어 있는지 확인해주세요.",
        NotReadableError: "다른 프로그램(Zoom, Discord 등)이 마이크를 사용 중일 수 있습니다. 다른 프로그램을 종료하고 다시 시도해주세요.",
        SecurityError: "보안 컨텍스트(HTTPS)가 아니어서 마이크를 사용할 수 없습니다.",
      };
      setError(messages[name] ?? `마이크 접근 실패: ${name}`);
      return;
    }
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];

    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    drawWaveform();

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      stopWaveform();
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
        { role: "user", text: data.transcript, prosody: data.prosody },
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
            prosody_summary_kr: t.prosody
              ? prosodyItems(t.prosody).map((i) => `${i.label}: ${i.value}`).join(" / ")
              : "",
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
    <div className="min-h-[100dvh] bg-zinc-50 dark:bg-zinc-950 flex flex-col">
      <div className="mx-auto w-full max-w-2xl flex flex-col gap-4 px-3 sm:px-4 pt-4 pb-56">
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            환자 시나리오
          </label>
          <textarea
            className="w-full resize-none rounded-lg bg-transparent text-base leading-relaxed text-zinc-800 dark:text-zinc-100 focus:outline-none disabled:opacity-70"
            rows={4}
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            disabled={turns.length > 0}
          />
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 min-h-[240px]">
          {turns.length === 0 && (
            <p className="text-sm text-zinc-400">
              아래 녹음 버튼을 눌러 학습자 발화를 녹음하세요.
            </p>
          )}
          {turns.map((t, i) => (
            <div
              key={i}
              className={`flex flex-col ${t.role === "user" ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                  t.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100"
                }`}
              >
                {t.text}
              </div>
              {t.prosody && (
                <div className="mt-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5">
                  {prosodyItems(t.prosody).map((item, j) => (
                    <span
                      key={j}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        item.attention
                          ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                      }`}
                    >
                      <span className="font-semibold">{item.label}</span>
                      {item.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
          {loading && <p className="text-sm text-zinc-400">분석 중...</p>}
        </div>

        {sessionFeedback && (
          <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 p-4">
            <h2 className="mb-2 text-sm font-semibold text-blue-900 dark:text-blue-200">
              종합 코칭 피드백
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-blue-950 dark:text-blue-100">
              {sessionFeedback}
            </p>
          </div>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur">
        <div className="mx-auto w-full max-w-2xl px-3 sm:px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] flex flex-col gap-2">
          {error && <p className="text-sm text-red-500">{error}</p>}

          <canvas
            ref={canvasRef}
            width={600}
            height={56}
            className={`w-full rounded-lg border transition-opacity ${
              recording
                ? "border-blue-400 dark:border-blue-700 opacity-100 bg-white dark:bg-zinc-900"
                : "border-zinc-200 dark:border-zinc-800 opacity-40 bg-white dark:bg-zinc-900"
            }`}
          />

          <button
            onClick={recording ? stopRecording : startRecording}
            disabled={loading}
            className={`w-full rounded-full px-5 py-4 text-base font-semibold text-white transition-colors ${
              recording ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            } disabled:opacity-50`}
          >
            {recording ? "녹음 중지 & 전송" : "녹음 시작"}
          </button>

          <div className="flex gap-2">
            <button
              onClick={endSession}
              disabled={turns.length === 0 || feedbackLoading}
              className="flex-1 rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 disabled:opacity-50"
            >
              {feedbackLoading ? "리포트 생성 중..." : "세션 종료 & 피드백"}
            </button>
            <button
              onClick={resetSession}
              className="rounded-full border border-zinc-300 dark:border-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200"
            >
              초기화
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
