/** 秒を m:ss 形式にする (例: 125 → "2:05") */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

const PLACE_SUFFIXES = ['th', 'st', 'nd', 'rd'];

/** 順位の序数表記 (1 → "1st", 2 → "2nd", 3 → "3rd", 4 → "4th") */
export function formatPlace(place: number): string {
  const teen = place % 100 >= 11 && place % 100 <= 13;
  return `${place}${teen ? 'th' : (PLACE_SUFFIXES[place % 10] ?? 'th')}`;
}
