// Hand-rolled fuzzy scorer for the command palette (CAR-78).
// All chars must appear in order; bonuses for prefix, word-boundary, and streaks.

export function score(query, label) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  let qi = 0;
  let s = 0;
  let consecutive = 0;
  for (let li = 0; li < l.length; li++) {
    if (qi < q.length && l[li] === q[qi]) {
      let charScore = 1;
      if (li === 0) charScore += 5;
      else if (l[li - 1] === ' ') charScore += 3;
      consecutive++;
      charScore += consecutive;
      s += charScore;
      qi++;
    } else {
      consecutive = 0;
    }
  }
  return qi === q.length ? s : 0;
}

export function matchAndRank(query, items, getLabel) {
  return items
    .map(item => ({ item, score: score(query, getLabel(item)) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.item);
}
