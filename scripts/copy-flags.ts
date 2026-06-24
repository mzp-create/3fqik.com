// Copies the square (1x1) SVG flags WC2026 needs from the flag-icons package
// into public/flags/, so the PWA ships them offline (no runtime dependency on
// the package). Re-run if the finalist list changes.
//   npm run flags:copy
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Lowercase ISO2 for every WC2026 finalist (mirrors FIFA_TO_ISO2 in
// src/lib/client/flags.ts) plus GB regional codes for England/Scotland.
const ISO = [
  "mx",
  "za",
  "kr",
  "cz",
  "ca",
  "ba",
  "qa",
  "ch",
  "br",
  "ma",
  "ht",
  "us",
  "py",
  "au",
  "tr",
  "de",
  "cw",
  "ci",
  "ec",
  "nl",
  "jp",
  "se",
  "tn",
  "be",
  "eg",
  "ir",
  "nz",
  "es",
  "cv",
  "sa",
  "uy",
  "fr",
  "sn",
  "iq",
  "no",
  "ar",
  "dz",
  "at",
  "jo",
  "pt",
  "cd",
  "uz",
  "co",
  "hr",
  "gh",
  "pa",
  "gb-eng",
  "gb-sct",
];

const srcDir = join(
  process.cwd(),
  "node_modules",
  "flag-icons",
  "flags",
  "1x1",
);
const destDir = join(process.cwd(), "public", "flags");
mkdirSync(destDir, { recursive: true });

let copied = 0;
const missing: string[] = [];
for (const iso of ISO) {
  const from = join(srcDir, `${iso}.svg`);
  if (!existsSync(from)) {
    missing.push(iso);
    continue;
  }
  copyFileSync(from, join(destDir, `${iso}.svg`));
  copied++;
}

console.log(`Copied ${copied}/${ISO.length} flags to public/flags/`);
if (missing.length) {
  console.error(`MISSING in flag-icons: ${missing.join(", ")}`);
  process.exit(1);
}
