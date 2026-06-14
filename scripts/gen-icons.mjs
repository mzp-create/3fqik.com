/**
 * Generates branded PWA icons using sharp.
 * Run once: node scripts/gen-icons.mjs
 * Colors: ink=#14161B bg, triband (green/red/blue), white "WB26" text.
 * We composite SVG data over a sharp canvas.
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const GREEN = "#007A33";
const RED = "#E03C31";
const BLUE = "#0A3A82";

function makeSvg(size, padFraction = 0) {
  const pad = Math.round(size * padFraction);
  const inner = size - pad * 2;
  // Triband: 3 equal horizontal stripes across the lower 20% of the icon
  const bandH = Math.round(inner * 0.14);
  const bandY = pad + Math.round(inner * 0.6);
  const bw = Math.round(inner / 3);

  // Text sizing
  const fontSize = Math.round(inner * 0.34);
  const cx = size / 2;
  const cy = pad + Math.round(inner * 0.44);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <!-- ink background -->
  <rect width="${size}" height="${size}" fill="#14161B"/>
  <!-- triband -->
  <rect x="${pad}" y="${bandY}" width="${bw}" height="${bandH}" fill="${GREEN}"/>
  <rect x="${pad + bw}" y="${bandY}" width="${bw}" height="${bandH}" fill="${RED}"/>
  <rect x="${pad + bw * 2}" y="${bandY}" width="${inner - bw * 2}" height="${bandH}" fill="${BLUE}"/>
  <!-- WB26 text -->
  <text
    x="${cx}"
    y="${cy}"
    text-anchor="middle"
    dominant-baseline="middle"
    font-family="Arial Black, Arial, sans-serif"
    font-weight="900"
    font-size="${fontSize}"
    fill="white"
    letter-spacing="-1"
  >WB26</text>
</svg>`;
}

async function gen(filename, size, padFraction = 0) {
  const svg = Buffer.from(makeSvg(size, padFraction));
  await sharp(svg).png().toFile(path.join(publicDir, filename));
  console.log(`  created ${filename} (${size}x${size})`);
}

console.log("Generating PWA icons…");
await gen("icon-192.png", 192, 0);
await gen("icon-512.png", 512, 0);
await gen("icon-512-maskable.png", 512, 0.1); // 10% safe-zone padding
await gen("apple-touch-icon.png", 180, 0);
console.log("Done.");
