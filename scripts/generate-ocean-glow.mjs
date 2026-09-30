// Bake a continuous, dithered light field once; the browser only composites it.
// Run with node scripts/generate-ocean-glow.mjs after changing the field.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const size = 512;
const pixels = Buffer.alloc((size * 4 + 1) * size);
let seed = 71;
const random = () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
for (const variant of ['a', 'b']) {
const waves = Array.from({ length: 12 }, (_, i) => ({
  x: (random() - .5) * 9, y: (random() - .5) * 9,
  phase: random() * Math.PI * 2, amplitude: 1 / (1 + i * .3),
}));
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const u = x / size;
    const v = y / size;
    // Independent directional waves, without circular masks or clipped peaks.
    const field = waves.reduce((sum, wave) => sum + wave.amplitude
      * Math.sin(u * wave.x + v * wave.y + wave.phase), 0);
    const light = .58 + .26 * Math.tanh(field * .55);
    const i = y * (size * 4 + 1) + 1 + x * 4;
    // Continuous color and alpha, with subpixel noise to break up banding.
    pixels[i] = Math.round(178 + light * 66 + random() - .5);
    pixels[i + 1] = 255;
    pixels[i + 2] = Math.round(155 + light * 82 + random() - .5);
    pixels[i + 3] = Math.round(light * 255 + random() - .5);
  }
}
function chunk(type, data) {
  const name = Buffer.from(type);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0);
header.writeUInt32BE(size, 4);
header[8] = 8;
header[9] = 6;
writeFileSync(new URL(`../public/assets/ocean-glow-${variant}.png`, import.meta.url), Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
]));

}
