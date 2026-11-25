// Demo-only defects: the NaN guard never matches and both branches overwrite a higher record.
export function recordBest(best, runs) {
  if (best === NaN || runs > best) {
    return runs;
  } else {
    return runs;
  }
}
