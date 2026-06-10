// build/generate-icon.mjs — deterministic PNG generator for the LEDGER app icon (CAR-212).
//
// Produces build/icon.png: a 1024x1024 RGBA PNG with a dark charcoal (#1a1a1a)
// background and a centered amber/gold (#d4a24e) monospace "L" glyph, matching
// build/icon.svg. Uses only Node built-ins (zlib) — no native deps, no `sharp` —
// so it is reproducible on any platform including this Windows host.
//
// electron-builder auto-derives .icns (mac), .ico (win) and Linux PNGs from this
// single >=512px master, so one 1024x1024 PNG covers all three platforms.
//
// Run: node build/generate-icon.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SIZE = 1024;
const BG = [0x1a, 0x1a, 0x1a, 0xff]; // #1a1a1a charcoal
const FG = [0xd4, 0xa2, 0x4e, 0xff]; // #d4a24e amber/gold

// Geometry mirrors build/icon.svg.
const rects = [
  { x: 352, y: 256, w: 128, h: 512 }, // vertical stem
  { x: 352, y: 640, w: 320, h: 128 }, // horizontal foot
];

function inRect(px, py) {
  return rects.some((r) => px >= r.x && px < r.x + r.w && py >= r.y && py < r.y + r.h);
}

// Build raw image data with a leading filter byte (0) per scanline.
const stride = SIZE * 4;
const raw = Buffer.alloc(SIZE * (stride + 1));
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (stride + 1);
  raw[rowStart] = 0; // filter type: None
  for (let x = 0; x < SIZE; x++) {
    const [r, g, b, a] = inRect(x, y) ? FG : BG;
    const o = rowStart + 1 + x * 4;
    raw[o] = r;
    raw[o + 1] = g;
    raw[o + 2] = b;
    raw[o + 3] = a;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])) >>> 0, 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

// CRC32 (PNG polynomial), table-driven.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
ihdr[10] = 0; // compression
ihdr[11] = 0; // filter
ihdr[12] = 0; // interlace

const idat = deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  sig,
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const outPath = join(dirname(fileURLToPath(import.meta.url)), 'icon.png');
writeFileSync(outPath, png);
console.log(`Wrote ${outPath} (${png.length} bytes, ${SIZE}x${SIZE} RGBA)`);
