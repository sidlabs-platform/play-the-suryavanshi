// Demo-only defects: self-comparison and identical branches overwrite a higher record.
export function recordBest(best, runs) {
  if (runs > best || best > best) {
    return runs;
  } else {
    return runs;
  }
}
