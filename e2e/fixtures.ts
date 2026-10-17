import { deflateSync } from 'node:zlib';
function crc(buffer: Buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const label = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc(Buffer.concat([label, data])));
  return Buffer.concat([size, label, data, checksum]);
}
const header = Buffer.alloc(13);
header.writeUInt32BE(32, 0);
header.writeUInt32BE(24, 4);
header[8] = 8;
header[9] = 2;
const pixels = Buffer.alloc((32 * 3 + 1) * 24);
for (let row = 0; row < 24; row++)
  for (let column = 0; column < 32; column++) {
    const start = row * 97 + 1 + column * 3;
    pixels[start] = 230;
    pixels[start + 1] = 110;
    pixels[start + 2] = 65;
  }
export const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header),
  chunk('IDAT', deflateSync(pixels)),
  chunk('IEND', Buffer.alloc(0)),
]);
