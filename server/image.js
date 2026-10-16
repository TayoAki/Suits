// Validates the real image format from bytes (not the filename or MIME header),
// reads dimensions and strips metadata. Supports JPEG and PNG only.
export const MAX_BYTES = 12 * 1024 * 1024;
export const MIN_SIDE = 512;
export const MAX_SIDE = 8000;

export function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.length > 8 && buf.toString('latin1', 0, 8) === '\x89PNG\r\n\x1a\n') return 'png';
  return null;
}

function jpegInfo(buf) {
  let i = 2; let width = 0; let height = 0;
  const out = [buf.subarray(0, 2)];
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('corrupt jpeg');
    const marker = buf[i + 1];
    if (marker === 0xda) { out.push(buf.subarray(i)); break; } // start of scan: rest is image data
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      height = buf.readUInt16BE(i + 5); width = buf.readUInt16BE(i + 7);
    }
    // Drop APP1–APP15 (EXIF, XMP, etc.) and comments; keep APP0 (JFIF) and the rest.
    const strip = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!strip) out.push(seg);
    i += 2 + len;
  }
  return { width, height, clean: Buffer.concat(out) };
}

function pngInfo(buf) {
  const width = buf.readUInt32BE(16); const height = buf.readUInt32BE(20);
  const out = [buf.subarray(0, 8)];
  const drop = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  let i = 8;
  while (i < buf.length) {
    const len = buf.readUInt32BE(i); const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (!drop.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return { width, height, clean: Buffer.concat(out) };
}

export function inspectImage(buf) {
  if (buf.length > MAX_BYTES) return { ok: false, reason: 'too_large' };
  const format = sniff(buf);
  if (!format) return { ok: false, reason: 'unsupported_format' };
  let info;
  try { info = format === 'jpeg' ? jpegInfo(buf) : pngInfo(buf); } catch { return { ok: false, reason: 'corrupt' }; }
  const { width, height } = info;
  if (!width || !height) return { ok: false, reason: 'corrupt' };
  if (Math.min(width, height) < MIN_SIDE) return { ok: false, reason: 'too_small' };
  if (Math.max(width, height) > MAX_SIDE) return { ok: false, reason: 'too_big_dimensions' };
  if (height <= width) return { ok: false, reason: 'not_portrait' };
  return { ok: true, format, width, height, clean: info.clean };
}
