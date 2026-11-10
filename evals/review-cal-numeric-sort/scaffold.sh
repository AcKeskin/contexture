#!/usr/bin/env bash
cat > scores.js <<'JS'
// Returns the median of a list of match scores (integers, 0 to 500).
function medianScore(scores) {
  const sorted = [...scores].sort();
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

module.exports = { medianScore };
JS
