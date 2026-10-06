import { createInitialState, SAVE_VERSION, type GameState } from './state';

const STORAGE_KEY = 'simple-js-game:save';

/**
 * 保存データを検証して GameState に変換する。形式が変わったときはここで旧バージョンから移行する。
 * 不正なデータなら null を返す。
 */
export function deserialize(json: string): GameState | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const d = data as Record<string, unknown>;

  // 例: if (d.version === 1) { d = migrateV1toV2(d) } のように移行処理を足していく
  if (d.version !== SAVE_VERSION) return null;

  if (!isNonNegativeNumber(d.coins) || !isNonNegativeNumber(d.miners) || !isNonNegativeNumber(d.lastUpdate)) {
    return null;
  }
  return {
    version: SAVE_VERSION,
    coins: d.coins,
    miners: Math.floor(d.miners),
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
    if (json) return deserialize(json) ?? createInitialState(now);
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

export function importSave(text: string): GameState | null {
  try {
    return deserialize(atob(text.trim()));
  } catch {
    return null;
  }
}

function isNonNegativeNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}
