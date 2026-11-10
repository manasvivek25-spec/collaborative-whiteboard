import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, '../public');

// Minimal pure-JS PNG generator
function createSolidPng(width, height, r, g, b, a = 255) {
  const lineBuffer = Buffer.alloc(1 + width * 4);
  lineBuffer[0] = 0; // Filter type 0: None
  for (let x = 0; x < width; x++) {
    const idx = 1 + x * 4;
    // Draw rounded-ish border or clean blue canvas icon
    const isBorder = x < 4 || x >= width - 4;
    lineBuffer[idx] = isBorder ? Math.min(255, r + 40) : r;
    lineBuffer[idx + 1] = isBorder ? Math.min(255, g + 40) : g;
    lineBuffer[idx + 2] = isBorder ? Math.min(255, b + 40) : b;
    lineBuffer[idx + 3] = a;
  }

  const rawData = Buffer.alloc((1 + width * 4) * height);
  for (let y = 0; y < height; y++) {
    lineBuffer.copy(rawData, y * (1 + width * 4));
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Header
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // Color type 6 (RGBA)
  ihdr[10] = 0; // Compression method
  ihdr[11] = 0; // Filter method
  ihdr[12] = 0; // Interlace method

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);

  const crc = crc32(Buffer.concat([Buffer.from(type), data]));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = c ^ buf[i];
    for (let j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

const icon192 = createSolidPng(192, 192, 37, 99, 235); // #2563eb Blue
const icon512 = createSolidPng(512, 512, 37, 99, 235); // #2563eb Blue

fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);

console.log('Successfully created icon-192.png and icon-512.png in public directory');
