import { deflateRawSync, inflateRawSync } from 'node:zlib';

const FIXED_DOS_TIME = 0x00210000;
const METHOD_DEFLATE = 8;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function sanitizeZipEntryName(name) {
  let n = String(name).replace(/\\/g, '/');
  if (n === '') return null;
  if (n.startsWith('/')) return null;
  if (/^[a-zA-Z]:/.test(n)) return null;
  if (n.includes('\0')) return null;
  const segments = [];
  for (const seg of n.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') return null;
    segments.push(seg);
  }
  n = segments.join('/');
  if (n === '') return null;
  return n;
}

export function writeZip(files) {
  const names = Object.keys(files).sort();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const name of names) {
    const data = Buffer.from(String(files[name]), 'utf8');
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const nameBuf = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(METHOD_DEFLATE, 8);
    local.writeUInt32LE(FIXED_DOS_TIME, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, compressed);
    const localLen = 30 + nameBuf.length + compressed.length;

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(METHOD_DEFLATE, 10);
    central.writeUInt32LE(FIXED_DOS_TIME, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);
    offset += localLen;
  }

  const centralDir = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDir, eocd]);
}

export function readZip(buf) {
  const out = {};
  if (buf.length < 22) return out;
  const eocdStart = buf.length - 22;
  if (buf.readUInt32LE(eocdStart) !== 0x06054b50) return out;
  const count = buf.readUInt16LE(eocdStart + 10);
  const cdOffset = buf.readUInt32LE(eocdStart + 16);
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compSize = buf.readUInt32LE(p + 20);
    const uncompSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const data = buf.subarray(localOffset + 30 + nameLen, localOffset + 30 + nameLen + compSize);
    let inflated = null;
    try {
      inflated = method === 8 ? inflateRawSync(data) : data;
    } catch {
      inflated = null;
    }
    if (inflated && crc32(inflated) === crc) {
      const safe = sanitizeZipEntryName(name);
      if (safe) out[safe] = inflated.toString('utf8');
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
