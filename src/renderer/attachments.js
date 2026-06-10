// CAR-346: DOM-bound orchestration for processing a picked image File into a
// downscaled, size-capped base64 data-URL attachment. The PURE parts (mime
// allow-list, size cap, dimension math, byte-size estimation) live in the
// sibling `attachments.mjs` and are unit-tested there. This file is the thin
// canvas/DOM wrapper that can only run in a browser/renderer.

import {
  ALLOWED_MIMES,
  MAX_EDGE,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TX,
  ENCODE_QUALITY,
  validateMime,
  withinSizeCap,
  targetDimensions,
  estimateBytesFromDataUrl,
} from './attachments.mjs';

export {
  ALLOWED_MIMES,
  MAX_EDGE,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TX,
  validateMime,
  withinSizeCap,
  targetDimensions,
  estimateBytesFromDataUrl,
};

const HUMAN_CAP = `${Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB`;

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not decode the image.'));
    img.src = dataUrl;
  });
}

// Pick the output mime: PNG with transparency stays lossless-ish only if
// small; otherwise we re-encode to JPEG for size. We keep it simple: encode
// PNG sources as PNG (canvas preserves alpha), JPEG/WebP as JPEG.
function outputMimeFor(inputMime) {
  return inputMime.toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg';
}

// Process a picked File into an attachment object, or throw with a
// user-facing message. Returns:
//   { id, dataUrl, name, mime, w, h, bytes, addedAt }
//
// Caps enforced:
//   - mime must be in the allow-list (else: wrong-type error)
//   - longest edge downscaled to <= MAX_EDGE
//   - FINAL encoded size must be <= MAX_ATTACHMENT_BYTES (else: too-large error)
export async function processImageFile(file) {
  if (!file || !validateMime(file.type)) {
    throw new Error(
      `Unsupported image type. Allowed: ${ALLOWED_MIMES.map(m => m.replace('image/', '')).join(', ')}.`,
    );
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(sourceDataUrl);
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  if (!sw || !sh) {
    throw new Error('Could not read the image dimensions.');
  }

  const { w, h } = targetDimensions(sw, sh, MAX_EDGE);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not process the image.');
  ctx.drawImage(img, 0, 0, w, h);

  const outMime = outputMimeFor(file.type);
  const dataUrl = canvas.toDataURL(outMime, ENCODE_QUALITY);
  const bytes = estimateBytesFromDataUrl(dataUrl);

  if (!withinSizeCap(bytes, MAX_ATTACHMENT_BYTES)) {
    throw new Error(`Image is too large after compression (limit ${HUMAN_CAP}). Try a smaller photo.`);
  }

  return {
    id: 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    dataUrl,
    name: file.name || undefined,
    mime: outMime,
    w,
    h,
    bytes,
    addedAt: new Date().toISOString(),
  };
}

// Guard for the per-tx count cap. Returns a user-facing error string when
// adding one more would exceed the cap, else null.
export function attachmentCountError(currentCount) {
  if (currentCount >= MAX_ATTACHMENTS_PER_TX) {
    return `You can attach at most ${MAX_ATTACHMENTS_PER_TX} images per transaction.`;
  }
  return null;
}
