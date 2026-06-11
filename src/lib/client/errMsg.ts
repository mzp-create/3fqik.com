import type { Dict } from "@/lib/i18n/en";

const CODE_KEYS: Record<string, keyof Dict> = {
  wrong_credentials: "errWrong",
  locked: "errLocked",
  line_suspended: "suspended",
  line_moved: "lineMoved",
};

export function errMsg(t: Dict, e: unknown): string {
  const code = (e as { code?: string }).code;
  if (code && CODE_KEYS[code]) return t[CODE_KEYS[code]];
  return e instanceof Error ? e.message : "error";
}
