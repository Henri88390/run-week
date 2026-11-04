// Display only: preserve nulls and recording gaps; analytics use raw samples.
export function smoothSeries(time: readonly number[], values: readonly (number | null)[]): (number | null)[] {
  const result: (number | null)[] = Array(time.length).fill(null);
  let start = 0;
  while (start < time.length) {
    if (values[start] == null) { start++; continue; }
    let end = start + 1;
    while (end < time.length && values[end] != null && time[end] - time[end - 1] <= 15) end++;
    const filtered = Array.from({ length: end - start }, (_, offset) => {
      const i = start + offset;
      const current = values[i];
      if (current == null) throw new Error("Missing sample inside a continuous chart segment");
      // Three-point median removes isolated spikes without flattening sustained changes.
      if (i === start || i === end - 1) return current;
      return [values[i - 1] ?? current, current, values[i + 1] ?? current].sort((a, b) => a - b)[1];
    });
    let left = start;
    let right = start;
    let sum = 0;
    for (let i = start; i < end; i++) {
      while (right < end && time[right] <= time[i] + 7.5) { sum += filtered[right - start]; right++; }
      while (left < i && time[left] < time[i] - 7.5) { sum -= filtered[left - start]; left++; }
      result[i] = sum / (right - left);
    }
    start = end;
  }
  return result;
}
