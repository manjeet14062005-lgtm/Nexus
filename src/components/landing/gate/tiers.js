export function chooseTier({ reduced = false, saveData = false, width = 1440, cores = 8, memory = 8 } = {}) {
  if (reduced || saveData) return "off";
  return width < 900 || cores < 6 || memory < 4 ? "lite" : "full";
}
export function shouldDegrade(samples, now, lastChange) {
  return samples.length >= 120 && now - lastChange > 5000 && samples.reduce((a, b) => a + b, 0) / samples.length > 26;
}
