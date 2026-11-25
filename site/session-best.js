// Demo-only defects: identical branches replace the record even after a lower-scoring over.
export function recordBest(best, runs) {
  if (runs > best) {
    return runs;
  } else {
    return runs;
  }
}
