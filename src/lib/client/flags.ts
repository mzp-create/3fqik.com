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

// FIFA 3-letter code → full country name, for the 48 WC2026 finalists.
// Knockout placeholders ("1H", "W73", "3rd-best") have no entry.
const FIFA_NAME: Record<string, string> = {
  MEX: "Mexico",
  RSA: "South Africa",
  KOR: "South Korea",
  CZE: "Czechia",
  CAN: "Canada",
  BIH: "Bosnia & Herzegovina",
  QAT: "Qatar",
  SUI: "Switzerland",
  BRA: "Brazil",
  MAR: "Morocco",
  HAI: "Haiti",
  USA: "United States",
  PAR: "Paraguay",
  AUS: "Australia",
  TUR: "Türkiye",
  GER: "Germany",
  CUW: "Curaçao",
  CIV: "Côte d'Ivoire",
  ECU: "Ecuador",
  NED: "Netherlands",
  JPN: "Japan",
  SWE: "Sweden",
  TUN: "Tunisia",
  BEL: "Belgium",
  EGY: "Egypt",
  IRN: "Iran",
  NZL: "New Zealand",
  ESP: "Spain",
  CPV: "Cape Verde",
  KSA: "Saudi Arabia",
  URU: "Uruguay",
  FRA: "France",
  SEN: "Senegal",
  IRQ: "Iraq",
  NOR: "Norway",
  ARG: "Argentina",
  ALG: "Algeria",
  AUT: "Austria",
  JOR: "Jordan",
  POR: "Portugal",
  COD: "DR Congo",
  UZB: "Uzbekistan",
  COL: "Colombia",
  CRO: "Croatia",
  GHA: "Ghana",
  PAN: "Panama",
  ENG: "England",
  SCO: "Scotland",
};

/** Full country name for a FIFA code, or the code itself for placeholders. */
export function teamName(code: string): string {
  return FIFA_NAME[code] ?? code;
}

/** "Germany (GER)" for known finalists; bare code for placeholders ("1H"). */
export function teamLabel(code: string): string {
  const name = FIFA_NAME[code];
  return name ? `${name} (${code})` : code;
}
