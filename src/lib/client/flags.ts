// FIFA 3-letter code → ISO 3166-1 alpha-2, for the 48 WC2026 finalists.
// Knockout placeholders ("1H", "W73") and unknown codes return "" (no flag).
const FIFA_TO_ISO2: Record<string, string> = {
  // Group A–L per the Dec 2025 draw
  MEX: "MX",
  RSA: "ZA",
  KOR: "KR",
  CZE: "CZ",
  CAN: "CA",
  BIH: "BA",
  QAT: "QA",
  SUI: "CH",
  BRA: "BR",
  MAR: "MA",
  HAI: "HT",
  USA: "US",
  PAR: "PY",
  AUS: "AU",
  TUR: "TR",
  GER: "DE",
  CUW: "CW",
  CIV: "CI",
  ECU: "EC",
  NED: "NL",
  JPN: "JP",
  SWE: "SE",
  TUN: "TN",
  BEL: "BE",
  EGY: "EG",
  IRN: "IR",
  NZL: "NZ",
  ESP: "ES",
  CPV: "CV",
  KSA: "SA",
  URU: "UY",
  FRA: "FR",
  SEN: "SN",
  IRQ: "IQ",
  NOR: "NO",
  ARG: "AR",
  ALG: "DZ",
  AUT: "AT",
  JOR: "JO",
  POR: "PT",
  COD: "CD",
  UZB: "UZ",
  COL: "CO",
  CRO: "HR",
  GHA: "GH",
  PAN: "PA",
};

// Sub-national flags need Unicode tag sequences, not regional indicators.
const SPECIAL: Record<string, string> = {
  ENG: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}",
  SCO: "\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}",
};

/** Emoji flag for a FIFA team code, or "" when unknown (e.g. "1H", "W73"). */
export function flag(code: string): string {
  if (SPECIAL[code]) return SPECIAL[code];
  const iso = FIFA_TO_ISO2[code];
  if (!iso) return "";
  return [...iso]
    .map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join("");
}
