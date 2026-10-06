const integerFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 2 });

/** 100万未満は桁区切り、それ以上は指数表記 (1.23e6) */
export function formatNumber(n: number, fractional = false): string {
  if (Math.abs(n) >= 1e6) return n.toExponential(2).replace('+', '');
  return fractional ? decimalFormat.format(n) : integerFormat.format(Math.floor(n));
}

/** 増減を符号付きで表す (+3 / −2 / ±0) */
export function formatNet(n: number, fractional = false): string {
  if (n === 0) return '±0';
  const abs = formatNumber(Math.abs(n), fractional);
  return n > 0 ? `+${abs}` : `−${abs}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}時間${m}分`;
  if (m > 0) return `${m}分${s % 60}秒`;
  return `${s}秒`;
}
