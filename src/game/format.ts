const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 1 });

/** 100万未満は桁区切り、それ以上は指数表記 (1.23e6) */
export function formatNumber(n: number, fractional = false): string {
  if (Math.abs(n) >= 1e6) return n.toExponential(2).replace('+', '');
  return fractional ? decimalFormat.format(n) : integerFormat.format(Math.floor(n));
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s % 60}秒`;
  return `${s}秒`;
}
