export type Scores = {
  speech_rate_score: number;
  speech_rate_comment: string;
  fluency_score: number;
  fluency_comment: string;
  empathy_score: number;
  empathy_comment: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  scores?: Scores;
};

export type OverallGrade = "good" | "normal" | "needs_improvement";

export type SessionReport = {
  overall_grade: OverallGrade;
  overall_comment: string;
  strengths: string[];
  improvements: string[];
};

export type StoredReport = {
  persona: string;
  turns: ChatTurn[];
  report: SessionReport;
  durationSec: number;
  createdAt: string;
};

export const REPORT_STORAGE_KEY = "cp_report";
export const RETRY_PERSONA_KEY = "cp_retry_persona";

export const GRADE_META: Record<
  OverallGrade,
  { emoji: string; label: string; bg: string; text: string }
> = {
  good: {
    emoji: "🟢",
    label: "양호",
    bg: "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  normal: {
    emoji: "🟡",
    label: "보통",
    bg: "bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-900",
    text: "text-amber-700 dark:text-amber-300",
  },
  needs_improvement: {
    emoji: "🔴",
    label: "개선 필요",
    bg: "bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-900",
    text: "text-rose-700 dark:text-rose-300",
  },
};

export function scoreGrade(score: number): OverallGrade {
  if (score >= 8) return "good";
  if (score >= 5) return "normal";
  return "needs_improvement";
}

export function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}분 ${s}초`;
}
