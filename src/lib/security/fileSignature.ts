/**
 * Prüft die ersten Bytes einer hochgeladenen Datei gegen den angegebenen Typ.
 * Der MIME-Typ aus dem Formular stammt vom Client und ist frei wählbar; ohne diese
 * Prüfung landet z. B. HTML oder ein Skript als "image/png" im Storage.
 */

function ascii(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

/** ISO-BMFF/QuickTime: Box-Typ an Offset 4 (ftyp bei MP4/MOV, ältere MOV beginnen mit moov/mdat/free/wide/skip). */
function isIsoMediaContainer(bytes: Uint8Array): boolean {
  return ["ftyp", "moov", "mdat", "free", "wide", "skip"].some((box) => ascii(bytes, 4, box));
}

const MIME_CHECKS: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/jpg": (b) => startsWith(b, [0xff, 0xd8, 0xff]),
  "image/png": (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/gif": (b) => ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a"),
  "image/webp": (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP"),
  "video/mp4": isIsoMediaContainer,
  "video/quicktime": isIsoMediaContainer,
  "video/webm": (b) => startsWith(b, [0x1a, 0x45, 0xdf, 0xa3]),
  "audio/mpeg": (b) => ascii(b, 0, "ID3") || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  "audio/mp3": (b) => ascii(b, 0, "ID3") || (b.length >= 2 && b[0] === 0xff && (b[1] & 0xe0) === 0xe0),
  "audio/wav": (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WAVE"),
  "audio/ogg": (b) => ascii(b, 0, "OggS"),
};

/** true, wenn die Bytes zum (bereits per Allowlist geprüften) MIME-Typ passen. Unbekannte Typen: false. */
export function matchesDeclaredMime(mime: string, bytes: Uint8Array): boolean {
  const check = MIME_CHECKS[mime.trim().toLowerCase()];
  return check ? check(bytes) : false;
}

const FONT_CHECKS: Record<string, (bytes: Uint8Array) => boolean> = {
  woff2: (b) => ascii(b, 0, "wOF2"),
  woff: (b) => ascii(b, 0, "wOFF"),
  ttf: (b) => startsWith(b, [0x00, 0x01, 0x00, 0x00]) || ascii(b, 0, "true"),
  otf: (b) => ascii(b, 0, "OTTO") || startsWith(b, [0x00, 0x01, 0x00, 0x00]),
};

/** true, wenn die Bytes zur Schrift-Dateiendung passen. */
export function matchesFontExtension(ext: string, bytes: Uint8Array): boolean {
  const check = FONT_CHECKS[ext.trim().toLowerCase()];
  return check ? check(bytes) : false;
}
