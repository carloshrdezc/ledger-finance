import { describe, it, expect } from 'vitest';
import { scaleSparkPoints } from './Shared';

describe('scaleSparkPoints', () => {
  it('spans the full spark width and height without hidden padding', () => {
    expect(scaleSparkPoints([10, 20, 30], 100, 40)).toEqual([
      { x: 0, y: 40 },
      { x: 50, y: 20 },
      { x: 100, y: 0 },
    ]);
  });
});
