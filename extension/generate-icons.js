const fs = require('fs');
const path = require('path');

// Generate minimal valid uncompressed 16x16, 48x48, 128x128 PNGs with a sleek cyan/blue graphic
function createSimplePNG(width, height, r, g, b) {
  // A simple 1-color or gradient PNG generator in pure Node without external deps
  // We can write a proper BMP or simple PNG format with zlib
  const zlib = require('zlib');

  const colorType = 6; // RGBA
  const bitDepth = 8;
  const bytesPerPixel = 4;
  const scanlineLength = width * bytesPerPixel;
  const rowBuffer = Buffer.alloc(1 + scanlineLength);

  const rawData = Buffer.alloc((1 + scanlineLength) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + scanlineLength);
    rawData[rowOffset] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * bytesPerPixel;
      // Circle gradient pattern
      const dx = x - width / 2;
      const dy = y - height / 2;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const radius = width * 0.45;

      if (dist <= radius) {
        // Cyan gradient to blue
        const t = (x + y) / (width + height);
        rawData[pixelOffset] = Math.floor(0 * (1 - t) + 79 * t);     // R
        rawData[pixelOffset + 1] = Math.floor(242 * (1 - t) + 172 * t); // G
        rawData[pixelOffset + 2] = Math.floor(254 * (1 - t) + 254 * t); // B
        rawData[pixelOffset + 3] = 255; // Alpha
      } else {
        rawData[pixelOffset] = 0;
        rawData[pixelOffset + 1] = 0;
        rawData[pixelOffset + 2] = 0;
        rawData[pixelOffset + 3] = 0; // Transparent
      }
    }
  }

  const deflated = zlib.deflateSync(rawData);

  // PNG Header
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR Chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT Chunk
  const idatChunk = createChunk('IDAT', deflated);

  // IEND Chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([header, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = data.length;
  const chunk = Buffer.alloc(12 + length);
  chunk.writeUInt32BE(length, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  // CRC calculation
  const crc = calculateCRC(chunk.slice(4, 8 + length));
  chunk.writeInt32BE(crc, 8 + length);
  return chunk;
}

function calculateCRC(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let j = 0; j < 8; j++) {
      if ((crc & 1) !== 0) {
        crc = (crc >>> 1) ^ 0xedb88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xffffffff) | 0;
}

const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

fs.writeFileSync(path.join(iconsDir, 'icon16.png'), createSimplePNG(16, 16));
fs.writeFileSync(path.join(iconsDir, 'icon48.png'), createSimplePNG(48, 48));
fs.writeFileSync(path.join(iconsDir, 'icon128.png'), createSimplePNG(128, 128));

console.log('Icons created successfully in extension/icons/');
