import { createInitialState, SAVE_VERSION, UPGRADE_IDS, UPGRADES, type GameState, type UpgradeId } from './state';

const STORAGE_KEY = 'simple-js-game:save';

/**
 * 保存データを検証して GameState に変換する。形式が変わったときはここで旧バージョンから移行する。
 * 不正なデータなら null を返す。
 */
export function deserialize(json: string, now: number): GameState | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;

  // v1 はコインを掘るゲームだったので、引き継げる要素がない。新しいゲームとして始める
  if (d.version === 1) return createInitialState(now);
  if (d.version !== SAVE_VERSION) return null;

  if (
    !isNonNegativeInteger(d.balls) ||
    !isNonNegativeInteger(d.bestBalls) ||
    !isNonNegativeInteger(d.totalDrops) ||
    !isNonNegativeNumber(d.lastUpdate) ||
    typeof d.upgrades !== 'object' ||
    d.upgrades === null
  ) {
    return null;
  }
  const rawUpgrades = d.upgrades as Record<string, unknown>;
  const upgrades = {} as Record<UpgradeId, number>;
  for (const id of UPGRADE_IDS) {
    // 後から追加したアップグレードは 0 として扱う
    const level = rawUpgrades[id] ?? 0;
    if (!isNonNegativeInteger(level) || level > UPGRADES[id].maxLevel) return null;
    upgrades[id] = level;
  }
  return {
    version: SAVE_VERSION,
    balls: d.balls,
    bestBalls: d.bestBalls,
    totalDrops: d.totalDrops,
    upgrades,
    lastUpdate: d.lastUpdate,
  };
}

export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

export function saveToStorage(state: GameState): void {
  try {
    localStorage.setItem(STORAGE_KEY, serialize(state));
  } catch (e) {
    console.warn('Failed to save game', e);
  }
}

export function loadFromStorage(now: number): GameState {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    if (json) return deserialize(json, now) ?? createInitialState(now);
  } catch (e) {
    console.warn('Failed to load game', e);
  }
  return createInitialState(now);
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 保存領域が使えない環境では何もしない
  }
}

/** バックアップ用に、手でコピーしやすい文字列 (Base64) に変換する */
export function exportSave(state: GameState): string {
  return btoa(serialize(state));
}

export function importSave(text: string, now: number): GameState | null {
  try {
    return deserialize(atob(text.trim()), now);
  } catch {
    return null;
  }
}

function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

function isNonNegativeInteger(v: unknown): v is number {
  return isNonNegativeNumber(v) && Number.isInteger(v);
}
