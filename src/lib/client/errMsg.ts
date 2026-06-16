import type { Dict } from "@/lib/i18n/en";

const CODE_KEYS: Record<string, keyof Dict> = {
  wrong_credentials: "errWrong",
  locked: "errLocked",
  line_suspended: "suspended",
  line_moved: "lineMoved",
  match_finished: "errMatchFinished",
  betting_closed: "errBettingClosed",
  window_passed: "cancelTooLate",
  match_started: "cancelMatchStarted",
  not_cancellable: "cancelNotAllowed",
};

export function errMsg(t: Dict, e: unknown): string {
  const code = (e as { code?: string }).code;
  if (code === "limit_reached") {
    const headroom = (e as { extra?: Record<string, unknown> }).extra
      ?.headroomMmk;
    if (typeof headroom === "number")
      return t.errLimit.replace("{n}", headroom.toLocaleString("en-US"));
  }
  if (code && CODE_KEYS[code]) return t[CODE_KEYS[code]];
  return e instanceof Error ? e.message : "error";
}
