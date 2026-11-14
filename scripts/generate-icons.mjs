// Deterministic PNG app icons, rendered from the same mint diamond geometry as public/icon.svg.
// Node standard library only: no image dependencies or lockfile changes.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const COLORS = {
  background: [32, 51, 79],
  outline: [141, 168, 185],
  mint: [185, 243, 221],
  lightMint: [221, 251, 240],
};

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}
function roundedSquare(x, y) {
  const r = 42, size = 192;
  const cx = Math.max(r, Math.min(size - r, x));
  const cy = Math.max(r, Math.min(size - r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}
function sample(x, y) {
  if (!roundedSquare(x, y)) return null;
  const distance = Math.abs(x - 96) + Math.abs(y - 96);
  // Four painted SVG paths: outer outline, mint diamond, dark inset and pale center.
  if (distance <= 33.46) return COLORS.lightMint;
  if (distance <= 40.54) return COLORS.background;
  if (distance <= 51.42) return COLORS.mint;
  if (Math.abs(distance - 61) <= 4.95) return COLORS.outline;
  return COLORS.background;
}
function makePng(size) {
  const pixels = Buffer.alloc(size * (1 + size * 4));
  // 2x supersampling softens diagonal edges, preserving sharp detail at 180px.
  const offsets = [0.25, 0.75];
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    for (let x = 0; x < size; x++) {
      const channels = [0, 0, 0, 0];
      for (const oy of offsets) for (const ox of offsets) {
        const color = sample((x + ox) * 192 / size, (y + oy) * 192 / size);
        if (color) {
          for (let ch = 0; ch < 3; ch++) channels[ch] += color[ch];
          channels[3] += 255;
        }
      }
      const index = row + 1 + x * 4;
      const alpha = channels[3] / 4;
      for (let ch = 0; ch < 3; ch++) pixels[index + ch] = alpha ? Math.round(channels[ch] * 255 / channels[3]) : 0;
      pixels[index + 3] = Math.round(alpha);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8-bit RGBA
  header[9] = 6; // Truecolor with alpha
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(pixels, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const [file, size] of [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
]) {
  writeFileSync(new URL(`../public/${file}`, import.meta.url), makePng(size));
  console.log(`Generated ${file} (${size}x${size})`);
}
