// ゲームの状態と計算ロジック。Vue に依存しない純粋な TypeScript に保ち、単体テストできるようにする。

export const SAVE_VERSION = 1;

export interface GameState {
  version: typeof SAVE_VERSION;
  coins: number;
  miners: number;
  /** 最後に進行計算をした時刻 (epoch ms)。オフライン進行の起点にもなる */
  lastUpdate: number;
}

export const CLICK_GAIN = 1;
export const MINER_BASE_COST = 10;
export const MINER_COST_GROWTH = 1.15;
export const MINER_PRODUCTION_PER_SEC = 1;
/** オフライン進行の上限 (秒) */
export const MAX_OFFLINE_SECONDS = 24 * 60 * 60;

export function createInitialState(now: number): GameState {
  return { version: SAVE_VERSION, coins: 0, miners: 0, lastUpdate: now };
}

export function minerCost(owned: number): number {
  return Math.ceil(MINER_BASE_COST * MINER_COST_GROWTH ** owned);
}

export function productionPerSecond(state: GameState): number {
  return state.miners * MINER_PRODUCTION_PER_SEC;
}

/**
 * 前回の更新からの経過時間ぶん進行させ、進めた秒数を返す。
 * 固定量の加算ではなく経過時間で計算するので、タブが裏に回ってタイマーが間引かれてもずれない。
 */
export function advance(state: GameState, now: number, maxSeconds = Infinity): number {
  const seconds = Math.min(Math.max(0, (now - state.lastUpdate) / 1000), maxSeconds);
  state.coins += productionPerSecond(state) * seconds;
  state.lastUpdate = now;
  return seconds;
}

export function click(state: GameState): void {
  state.coins += CLICK_GAIN;
}

export function buyMiner(state: GameState): boolean {
  const cost = minerCost(state.miners);
  if (state.coins < cost) return false;
  state.coins -= cost;
  state.miners += 1;
  return true;
}
