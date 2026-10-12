// Generator obrazków podglądu linków (public/og/<sport>.png, 1200×630).
// Narzędzia nie są zależnościami projektu — uruchomienie w osobnym katalogu:
//   npm i sharp@0.34.1 opentype.js@1.3.4 @fontsource/big-shoulders-display@5.2.5 @fontsource/work-sans@5.2.5
//   node make-og.mjs "<ścieżka do projektu>"
import { createRequire } from "node:module";
import { Buffer } from "node:buffer";
import { mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const opentype = require("opentype.js");

const [project] = process.argv.slice(2);
const { SPORTS, ALL_SPORTS_ICON } = await import(pathToFileURL(project + "/src/lib/sports.ts").href);
const font = (pkg, file) => opentype.loadSync(require.resolve(`@fontsource/${pkg}/files/${file}`));
const head = [
  font("big-shoulders-display", "big-shoulders-display-latin-900-normal.woff"),
  font("big-shoulders-display", "big-shoulders-display-latin-ext-900-normal.woff"),
];
const body = [
  font("work-sans", "work-sans-latin-600-normal.woff"),
  font("work-sans", "work-sans-latin-ext-600-normal.woff"),
];

// Tekst jako ścieżki SVG (bez zależności od czcionek systemowych); znak bierzemy z pierwszego kroju, który go ma.
function text(fonts, str, x, y, size, fill, extra = "") {
  let cursor = x,
    d = "";
  for (const ch of str) {
    const f = fonts.find((f) => f.charToGlyphIndex(ch) > 0) ?? fonts[0];
    const glyph = f.charToGlyph(ch);
    d += glyph.getPath(cursor, y, size).toPathData(2);
    cursor += (glyph.advanceWidth / f.unitsPerEm) * size;
  }
  return { svg: `<path d="${d}" fill="${fill}" ${extra}/>`, width: cursor - x };
}

const W = 1200,
  H = 630;
const out = project + "/public/og";
mkdirSync(out, { recursive: true });

async function render(id, label, icon) {
  const brand = text(head, "METANDO", 470, 250, 150, "#ff7a1a");
  const shadow = text(head, "METANDO", 478, 258, 150, "#0a2e23");
  const sport = text(head, label.toUpperCase(), 470, 345, 78, "#f3ead3");
  const tag1 = text(body, "Brakuje ludzi do gry?", 472, 440, 40, "#f3ead3");
  const tag2 = text(body, "Dołącz do składu jednym kliknięciem.", 472, 495, 34, "#c9d8cf");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#0f3b2e"/>
    ${Array.from({ length: 13 }, (_, i) => `<rect x="${i * 96}" y="0" width="48" height="${H}" fill="#164a3a" opacity="0.35"/>`).join("")}
    <rect x="0" y="${H - 40}" width="${W}" height="16" fill="#ff7a1a"/>
    <rect x="0" y="${H - 18}" width="${W}" height="18" fill="#f3ead3"/>
    <rect x="80" y="135" width="320" height="320" rx="64" fill="#ff7a1a"/>
    <g transform="translate(120 175) scale(10)" fill="none" stroke="#13261f" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"/></g>
    ${shadow.svg}${brand.svg}${sport.svg}${tag1.svg}${tag2.svg}
  </svg>`;
  await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(`${out}/${id}.png`);
}

for (const s of SPORTS) await render(s.id, s.label, s.icon);
await render("default", "Wspólny sport", ALL_SPORTS_ICON);
console.log("done", SPORTS.length + 1);
