import type { Dict } from "@/lib/i18n/en";

export const STATUS_LABEL: Record<string, keyof Dict> = {
  pending: "stPending",
  won: "stWon",
  half_won: "stHalfWon",
  push: "stPush",
  half_lost: "stHalfLost",
  lost: "stLost",
  void: "stVoid",
};

export function statusKey(status: string): keyof Dict {
  return STATUS_LABEL[status] ?? "stPending";
}
