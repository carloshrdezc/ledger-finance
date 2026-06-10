import { describe, it, expect } from 'vitest';
import {
  ALLOWED_MIMES,
  MAX_EDGE,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_TX,
  validateMime,
  withinSizeCap,
  targetDimensions,
  estimateBytesFromDataUrl,
} from './attachments.mjs';

describe('validateMime', () => {
  it('accepts the allow-listed image mimes', () => {
    expect(validateMime('image/png')).toBe(true);
    expect(validateMime('image/jpeg')).toBe(true);
    expect(validateMime('image/webp')).toBe(true);
  });

  it('rejects everything else', () => {
    expect(validateMime('image/gif')).toBe(false);
    expect(validateMime('image/svg+xml')).toBe(false);
    expect(validateMime('application/pdf')).toBe(false);
    expect(validateMime('text/plain')).toBe(false);
    expect(validateMime('')).toBe(false);
    expect(validateMime(undefined)).toBe(false);
    expect(validateMime(null)).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(validateMime('IMAGE/PNG')).toBe(true);
    expect(validateMime('Image/Jpeg')).toBe(true);
  });

  it('exposes the canonical allow-list', () => {
    expect(ALLOWED_MIMES).toEqual(['image/png', 'image/jpeg', 'image/webp']);
  });
});

describe('withinSizeCap', () => {
  it('is true strictly at or below the cap', () => {
    expect(withinSizeCap(0, 100)).toBe(true);
    expect(withinSizeCap(99, 100)).toBe(true);
    expect(withinSizeCap(100, 100)).toBe(true); // boundary inclusive
  });

  it('is false above the cap', () => {
    expect(withinSizeCap(101, 100)).toBe(false);
  });

  it('rejects non-finite / negative byte counts', () => {
    expect(withinSizeCap(NaN, 100)).toBe(false);
    expect(withinSizeCap(-1, 100)).toBe(false);
    expect(withinSizeCap(Infinity, 100)).toBe(false);
  });

  it('defaults to MAX_ATTACHMENT_BYTES when no cap given', () => {
    expect(withinSizeCap(MAX_ATTACHMENT_BYTES)).toBe(true);
    expect(withinSizeCap(MAX_ATTACHMENT_BYTES + 1)).toBe(false);
  });
});

describe('targetDimensions', () => {
  it('scales a landscape image so the longest edge equals maxEdge', () => {
    expect(targetDimensions(3200, 1600, 1600)).toEqual({ w: 1600, h: 800 });
  });

  it('scales a portrait image so the longest edge equals maxEdge', () => {
    expect(targetDimensions(1600, 3200, 1600)).toEqual({ w: 800, h: 1600 });
  });

  it('does NOT upscale an already-small image', () => {
    expect(targetDimensions(800, 600, 1600)).toEqual({ w: 800, h: 600 });
    expect(targetDimensions(1600, 1200, 1600)).toEqual({ w: 1600, h: 1200 });
  });

  it('rounds to whole pixels', () => {
    const { w, h } = targetDimensions(1000, 333, 500);
    expect(Number.isInteger(w)).toBe(true);
    expect(Number.isInteger(h)).toBe(true);
    expect(w).toBe(500);
    expect(h).toBe(167); // round(333 * 0.5) = round(166.5) = 167
  });

  it('handles a square image', () => {
    expect(targetDimensions(2000, 2000, 1600)).toEqual({ w: 1600, h: 1600 });
  });

  it('never returns a zero dimension when input is valid', () => {
    const { w, h } = targetDimensions(2000, 1, 1600);
    expect(w).toBeGreaterThanOrEqual(1);
    expect(h).toBeGreaterThanOrEqual(1);
  });

  it('defaults maxEdge to MAX_EDGE', () => {
    expect(targetDimensions(MAX_EDGE * 2, MAX_EDGE * 2)).toEqual({ w: MAX_EDGE, h: MAX_EDGE });
  });

  it('returns zeros for invalid input', () => {
    expect(targetDimensions(0, 0, 1600)).toEqual({ w: 0, h: 0 });
  });
});

describe('estimateBytesFromDataUrl', () => {
  it('computes the decoded byte size of a data URL payload', () => {
    // "AAAA" -> 4 base64 chars, no padding -> 3 bytes
    expect(estimateBytesFromDataUrl('data:image/png;base64,AAAA')).toBe(3);
  });

  it('accounts for a single padding char (=)', () => {
    // 4 chars with one '=' -> 2 bytes
    expect(estimateBytesFromDataUrl('data:image/png;base64,AAA=')).toBe(2);
  });

  it('accounts for two padding chars (==)', () => {
    // 4 chars with two '=' -> 1 byte
    expect(estimateBytesFromDataUrl('data:image/png;base64,AA==')).toBe(1);
  });

  it('computes the right size for a longer payload', () => {
    // 8 base64 chars, no padding -> 6 bytes
    expect(estimateBytesFromDataUrl('data:image/jpeg;base64,QUJDREVG')).toBe(6);
  });

  it('returns 0 for a non-data-url or empty input', () => {
    expect(estimateBytesFromDataUrl('')).toBe(0);
    expect(estimateBytesFromDataUrl('not-a-data-url')).toBe(0);
    expect(estimateBytesFromDataUrl(undefined)).toBe(0);
    expect(estimateBytesFromDataUrl(null)).toBe(0);
  });

  it('handles a data url with no base64 payload', () => {
    expect(estimateBytesFromDataUrl('data:image/png;base64,')).toBe(0);
  });

  it('agrees with the 3/4 inflation rule on a realistic-length payload', () => {
    const payload = 'A'.repeat(1000); // 1000 b64 chars, no padding -> 750 bytes
    expect(estimateBytesFromDataUrl('data:image/jpeg;base64,' + payload)).toBe(750);
  });
});

describe('caps are sane defaults', () => {
  it('exposes the documented cap values', () => {
    expect(MAX_EDGE).toBe(1600);
    expect(MAX_ATTACHMENT_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_ATTACHMENTS_PER_TX).toBe(5);
  });
});
