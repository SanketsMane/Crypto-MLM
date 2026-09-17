/**
 * Build the four brand assets from the supplied artwork.
 *
 * The source is a 1536x1024 render with an OPAQUE black background and no
 * alpha channel at all, so it cannot be used as-is anywhere: on the navy rail
 * it would show as a black rectangle with a visible edge, and on a white page
 * it would be a black box with white lettering inside it.
 *
 * Three transforms:
 *
 * 1. Key the black ground out. Alpha is taken from the brightest channel
 *    rather than from luminance — luminance would make the orange roughly
 *    half-transparent, because orange is a dark colour by luminance. The
 *    colour is then un-premultiplied so antialiased edges keep their real hue
 *    instead of darkening toward the ground they were composited on.
 *
 * 2. Rebuild the lockup horizontally. The source stacks the monogram above the
 *    wordmark at 1083x681, which is nearly square; the places this actually
 *    gets rendered are a 52px-tall sidebar header and a site header, where a
 *    square lockup has to shrink until the wordmark is unreadable.
 *
 * 3. Make a second, dark-ink copy for light surfaces. The white in the
 *    artwork is what makes it a dark-mode logo; on a white page "ELITE"
 *    simply disappears. Achromatic pixels are re-inked to the platform's
 *    light-mode ink; the orange is left exactly as it is, because it is the
 *    brand colour and it reads on both grounds.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* sharp is a frontend dependency and this script lives outside it, so resolve
   it from there explicitly — a bare `import 'sharp'` resolves from this file's
   own directory and fails wherever the script is run from. */
const sharp = createRequire(new URL('../../frontend/package.json', import.meta.url))('sharp');

/* Resolved from this file rather than the working directory, because it is
   run from `frontend/` — that is where sharp is installed. */
const here = fileURLToPath(new URL('.', import.meta.url));
const SRC = fileURLToPath(new URL('./source/elite-club-artwork.png', import.meta.url));
const OUT = here;
fs.mkdirSync(OUT, { recursive: true });

/** Measured from the source in measure-logo.mjs. */
const MONOGRAM = { left: 432, top: 162, width: 738, height: 523 };
const WORDMARK = { left: 233, top: 728, width: 1083, height: 115 };

const INK_LIGHT = [0x0c, 0x13, 0x20];   // --color-ink, light theme

/** Black-ground key + un-premultiply. Returns a raw RGBA buffer. */
async function keyed(region) {
  const { data, info } = await sharp(SRC).extract(region).removeAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i += info.channels, o += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const a = Math.max(r, g, b);
    if (a === 0) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
    const k = 255 / a;                   // un-premultiply
    out[o] = Math.min(255, Math.round(r * k));
    out[o + 1] = Math.min(255, Math.round(g * k));
    out[o + 2] = Math.min(255, Math.round(b * k));
    out[o + 3] = a;
  }
  return { data: out, width: info.width, height: info.height };
}

/** Re-ink the achromatic (white/silver) parts, leave anything coloured alone. */
function reInk(raw, ink) {
  const d = Buffer.from(raw.data);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    // orange sits around sat 0.9; the silver gradient stays under ~0.22
    if (sat < 0.28) { d[i] = ink[0]; d[i + 1] = ink[1]; d[i + 2] = ink[2]; }
  }
  return { ...raw, data: d };
}

const png = (raw) => sharp(raw.data, { raw: { width: raw.width, height: raw.height, channels: 4 } }).png();

/** Horizontal lockup: monogram, gap, wordmark — vertically centred. */
async function lockup(mono, word, { height = 132, gap = 30, pad = 4 } = {}) {
  const mH = height, mW = Math.round(mH * (mono.width / mono.height));
  const wH = Math.round(height * 0.34), wW = Math.round(wH * (word.width / word.height));

  const mBuf = await png(mono).resize(mW, mH).toBuffer();
  const wBuf = await png(word).resize(wW, wH).toBuffer();

  const W = pad + mW + gap + wW + pad, H = height + pad * 2;
  return sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: mBuf, left: pad, top: pad },
      // optical centring on the wordmark's own box, not the canvas
      { input: wBuf, left: pad + mW + gap, top: Math.round((H - wH) / 2) },
    ])
    .png({ compressionLevel: 9 });
}

const mono = await keyed(MONOGRAM);
const word = await keyed(WORDMARK);
const monoDark = reInk(mono, INK_LIGHT);
const wordDark = reInk(word, INK_LIGHT);

// ── logo-dark: light artwork, for the navy rail and dark pages ──────────
await (await lockup(mono, word)).toFile(`${OUT}/logo-dark.png`);

// ── logo-light: dark ink, for white pages ───────────────────────────────
await (await lockup(monoDark, wordDark)).toFile(`${OUT}/logo-light.png`);

// ── icon: the monogram on its own navy tile ─────────────────────────────
// A wordmark is unreadable at 16px, so the favicon is the monogram alone.
// But half this monogram is white, and a favicon lands on a browser tab whose
// colour we do not control — on a light tab the "E" vanishes and the mark
// reads as a lone orange "C". Giving it its own ground is what makes one
// square work everywhere, and it is why app icons are almost never
// transparent.
{
  const side = 512, inset = 58, radius = 112;
  const box = side - inset * 2;
  const scale = Math.min(box / mono.width, box / mono.height);
  const w = Math.round(mono.width * scale), h = Math.round(mono.height * scale);
  const m = await png(mono).resize(w, h).toBuffer();
  const tile = Buffer.from(
    `<svg width="${side}" height="${side}" xmlns="http://www.w3.org/2000/svg">`
    + `<rect width="${side}" height="${side}" rx="${radius}" ry="${radius}" fill="#0B111C"/>`
    + `</svg>`);
  await sharp(tile)
    .composite([{ input: m, left: Math.round((side - w) / 2), top: Math.round((side - h) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/icon.png`);
}

// ── og-image: the stacked lockup on brand navy, 1200x630 ────────────────
{
  const W = 1200, H = 630;
  const lock = await (await lockup(mono, word, { height: 190, gap: 40 })).toBuffer();
  const meta = await sharp(lock).metadata();
  const scale = Math.min((W * 0.68) / meta.width, (H * 0.5) / meta.height);
  const w = Math.round(meta.width * scale), h = Math.round(meta.height * scale);
  const resized = await sharp(lock).resize(w, h).toBuffer();
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0x07, g: 0x0b, b: 0x12, alpha: 1 } } })
    .composite([{ input: resized, left: Math.round((W - w) / 2), top: Math.round((H - h) / 2) }])
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/og-image.png`);
}

// ── preview sheets: each logo on the ground it will actually sit on ──────
for (const [name, bg] of [['on-navy', { r: 7, g: 11, b: 18, alpha: 1 }], ['on-white', { r: 255, g: 255, b: 255, alpha: 1 }]]) {
  const which = name === 'on-navy' ? 'logo-dark' : 'logo-light';
  const l = await sharp(`${OUT}/${which}.png`).resize({ height: 90 }).toBuffer();
  const lm = await sharp(l).metadata();
  const ic = await sharp(`${OUT}/icon.png`).resize(64, 64).toBuffer();
  const sm = await sharp(`${OUT}/${which}.png`).resize({ height: 28 }).toBuffer();  // real sidebar size
  const smm = await sharp(sm).metadata();
  await sharp({ create: { width: 900, height: 230, channels: 4, background: bg } })
    .composite([
      { input: l, left: 40, top: 30 },
      { input: sm, left: 40, top: 150 },
      { input: ic, left: 60 + Math.max(lm.width, smm.width), top: 140 },
    ])
    .png().toFile(`${OUT}/preview-${name}.png`);
}

console.log('built:');
for (const f of fs.readdirSync(OUT).filter((n) => n.endsWith('.png'))) {
  const { size } = fs.statSync(`${OUT}/${f}`);
  const m = await sharp(`${OUT}/${f}`).metadata();
  const over = size > 1024 * 1024 ? '   !! OVER 1MB CAP' : '';
  console.log(`  ${f.padEnd(20)} ${String(m.width).padStart(5)}x${String(m.height).padEnd(5)} ${(size / 1024).toFixed(0).padStart(5)}KB${over}`);
}
