// CAR-346: Pure helpers for receipt/photo attachments on transactions.
//
// NO DOM, NO React, NO canvas — only validation, size math, and dimension
// math live here so they're unit-testable without a browser. The DOM-bound
// downscale/encode orchestration lives in the sibling `attachments.js`.
//
// Storage decision (per Carlos, CAR-346): attachments are stored as
// downscaled, size-capped base64 data-URLs INSIDE the transaction object so
// they ride the existing encrypted persistence (window.ledgerDB.write) and
// the backup `transactions` slice automatically. No separate blob store.

// Image mimes we accept. Anything else is rejected with a clear error in the UI.
export const ALLOWED_MIMES = ['image/png', 'image/jpeg', 'image/webp'];

// Longest-edge cap (px). Images larger than this are downscaled; smaller
// images are never upscaled.
export const MAX_EDGE = 1600;

// Hard cap on the FINAL encoded attachment size (decoded bytes), ~2 MB.
export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

// Cap on the number of attachments per transaction.
export const MAX_ATTACHMENTS_PER_TX = 5;

// Re-encode quality for lossy formats (JPEG/WebP).
export const ENCODE_QUALITY = 0.8;

// True iff `mime` is one of the allow-listed image types (case-insensitive).
export function validateMime(mime) {
  if (typeof mime !== 'string') return false;
  return ALLOWED_MIMES.includes(mime.toLowerCase());
}

// True iff `bytes` is a finite, non-negative count at or below `cap`
// (inclusive). Defaults to the per-attachment hard cap.
export function withinSizeCap(bytes, cap = MAX_ATTACHMENT_BYTES) {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return false;
  return bytes <= cap;
}

// Compute the target {w, h} so the longest edge is <= maxEdge, preserving
// aspect ratio. Never upscales. Rounds to whole pixels and clamps each axis
// to >= 1 (for non-degenerate inputs). Returns {w:0,h:0} for invalid input.
export function targetDimensions(w, h, maxEdge = MAX_EDGE) {
  if (typeof w !== 'number' || typeof h !== 'number' || w <= 0 || h <= 0) {
    return { w: 0, h: 0 };
  }
  const longest = Math.max(w, h);
  if (longest <= maxEdge) {
    return { w: Math.round(w), h: Math.round(h) };
  }
  const scale = maxEdge / longest;
  return {
    w: Math.max(1, Math.round(w * scale)),
    h: Math.max(1, Math.round(h * scale)),
  };
}

// Accurately compute the DECODED byte size of a base64 data-URL payload,
// accounting for the data-URL prefix and base64 padding (the ~4/3 inflation).
// Returns 0 for non-data-urls / empty input.
export function estimateBytesFromDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  if (!dataUrl.startsWith('data:') || comma < 0) return 0;
  const payload = dataUrl.slice(comma + 1);
  const len = payload.length;
  if (len === 0) return 0;
  // Every 4 base64 chars decode to 3 bytes; trailing '=' pads reduce that.
  let padding = 0;
  if (payload.endsWith('==')) padding = 2;
  else if (payload.endsWith('=')) padding = 1;
  return Math.max(0, Math.floor(len / 4) * 3 - padding);
}
