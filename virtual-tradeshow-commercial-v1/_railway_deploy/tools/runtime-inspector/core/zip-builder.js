/**
 * Simple, zero-dependency pure JS ZIP generator for Chrome Extensions & Node.js
 */
function createZip(files) {
  // files: Array of { name: string, data: Uint8Array }
  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
    }
    crcTable[i] = c >>> 0;
  }

  function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  const parts = [];
  const centralDirs = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = new TextEncoder().encode(file.name);
    const dataBuf = file.data instanceof Uint8Array ? file.data : new TextEncoder().encode(file.data || '');
    const checksum = crc32(dataBuf);
    const size = dataBuf.length;

    // Local file header (30 bytes)
    const localHeader = new Uint8Array(30 + nameBuf.length);
    const v = new DataView(localHeader.buffer);
    v.setUint32(0, 0x04034b50, true); // signature
    v.setUint16(4, 20, true);         // version needed
    v.setUint16(6, 0, true);          // flags
    v.setUint16(8, 0, true);          // method 0 (store)
    v.setUint16(10, 0, true);         // time
    v.setUint16(12, 0, true);         // date
    v.setUint32(14, checksum, true);   // crc32
    v.setUint32(18, size, true);       // compressed size
    v.setUint32(22, size, true);       // uncompressed size
    v.setUint16(26, nameBuf.length, true); // filename length
    v.setUint16(28, 0, true);         // extra length
    localHeader.set(nameBuf, 30);

    parts.push(localHeader);
    parts.push(dataBuf);

    // Central directory header (46 bytes)
    const cdHeader = new Uint8Array(46 + nameBuf.length);
    const cdView = new DataView(cdHeader.buffer);
    cdView.setUint32(0, 0x02014b50, true); // signature
    cdView.setUint16(4, 20, true);         // version made by
    cdView.setUint16(6, 20, true);         // version needed
    cdView.setUint16(8, 0, true);          // flags
    cdView.setUint16(10, 0, true);         // method 0
    cdView.setUint16(12, 0, true);         // time
    cdView.setUint16(14, 0, true);         // date
    cdView.setUint32(16, checksum, true);  // crc32
    cdView.setUint32(20, size, true);      // compressed size
    cdView.setUint32(24, size, true);      // uncompressed size
    cdView.setUint16(28, nameBuf.length, true); // filename length
    cdView.setUint16(30, 0, true);         // extra length
    cdView.setUint16(32, 0, true);         // comment length
    cdView.setUint16(34, 0, true);         // disk start
    cdView.setUint16(36, 0, true);         // internal attrs
    cdView.setUint32(38, 0, true);         // external attrs
    cdView.setUint32(42, offset, true);    // local header offset
    cdHeader.set(nameBuf, 46);

    centralDirs.push(cdHeader);
    offset += localHeader.length + dataBuf.length;
  }

  const cdStart = offset;
  let cdSize = 0;
  for (const cd of centralDirs) {
    parts.push(cd);
    cdSize += cd.length;
  }

  // End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // signature
  ev.setUint16(4, 0, true);          // disk number
  ev.setUint16(6, 0, true);          // disk start
  ev.setUint16(8, files.length, true);  // count this disk
  ev.setUint16(10, files.length, true); // total count
  ev.setUint32(12, cdSize, true);       // central dir size
  ev.setUint32(16, cdStart, true);      // central dir offset
  ev.setUint16(20, 0, true);            // comment length
  parts.push(eocd);

  // Combine into single Uint8Array
  let totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const zipBytes = new Uint8Array(totalLength);
  let pos = 0;
  for (const p of parts) {
    zipBytes.set(p, pos);
    pos += p.length;
  }
  return zipBytes;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createZip };
}
