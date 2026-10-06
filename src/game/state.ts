// ゲームの状態とルール。Vue や盤面の物理計算に依存しない純粋な TypeScript に保ち、単体テストできるようにする。

export const SAVE_VERSION = 2;

export type UpgradeId = 'autoDrop' | 'payout' | 'penalty';

export interface GameState {
  version: typeof SAVE_VERSION;
  /** 手持ちのボール (盤面を落下中のものは含まない) */
  balls: number;
  bestBalls: number;
  totalDrops: number;
  upgrades: Record<UpgradeId, number>;
  /** 最後に進行計算をした時刻 (epoch ms)。オフライン進行の起点になる */
  lastUpdate: number;
}

export const INITIAL_BALLS = 10;
/** 手持ちも盤面上のボールもなくなったときにもらえる数 */
export const RESCUE_BALLS = 5;
/** オフライン進行の上限 (秒) */
export const MAX_OFFLINE_SECONDS = 24 * 60 * 60;

/**
 * 各枠に着地したときのボールの増減 (落としたボール自体を含む)。
 * 例: +2 なら落とした 1 個が 3 個になって戻る、-2 なら落とした 1 個に加えて手持ちから 1 個減る
 */
export const BASE_SLOT_NETS: readonly number[] = [6, 2, 1, -1, -2, -1, 1, 2, 6];

/**
 * 各枠に着地する確率。盤面の物理シミュレーションで計測した値 (physics.test.ts で検証)。
 * オフライン進行の期待値計算に使う
 */
export const SLOT_PROBABILITIES: readonly number[] = [0.035, 0.075, 0.13, 0.165, 0.19, 0.165, 0.13, 0.075, 0.035];

export interface UpgradeDef {
  name: string;
  description: string;
  baseCost: number;
  costGrowth: number;
  maxLevel: number;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  autoDrop: {
    name: '自動投入機',
    description: '1 レベルごとに毎秒 0.5 個のボールを自動で落とす',
    baseCost: 10,
    costGrowth: 1.6,
    maxLevel: 20,
  },
  payout: {
    name: '当たり強化',
    description: 'プラスの枠の増加量が 1 レベルごとに +50%',
    baseCost: 30,
    costGrowth: 2.2,
    maxLevel: 10,
  },
  penalty: {
    name: 'ハズレ軽減',
    description: 'マイナスの枠の減少量が 1 レベルごとに 1 減る',
    baseCost: 80,
    costGrowth: 4,
    maxLevel: 2,
  },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as UpgradeId[];

export function createInitialState(now: number): GameState {
  return {
    version: SAVE_VERSION,
    balls: INITIAL_BALLS,
    bestBalls: INITIAL_BALLS,
    totalDrops: 0,
    upgrades: { autoDrop: 0, payout: 0, penalty: 0 },
    lastUpdate: now,
  };
}

export function slotNets(state: GameState): number[] {
  const { payout, penalty } = state.upgrades;
  return BASE_SLOT_NETS.map((net) => (net > 0 ? Math.round(net * (1 + 0.5 * payout)) : Math.min(net + penalty, 0)));
}

export function autoDropsPerSecond(state: GameState): number {
  return state.upgrades.autoDrop * 0.5;
}

/** 1 回落としたときに増減するボール数の期待値 */
export function expectedNetPerDrop(state: GameState): number {
  return slotNets(state).reduce((sum, net, i) => sum + net * SLOT_PROBABILITIES[i]!, 0);
}

export function upgradeCost(id: UpgradeId, level: number): number {
  const def = UPGRADES[id];
  return Math.ceil(def.baseCost * def.costGrowth ** level);
}

export function isMaxLevel(state: GameState, id: UpgradeId): boolean {
  return state.upgrades[id] >= UPGRADES[id].maxLevel;
}

export function canBuyUpgrade(state: GameState, id: UpgradeId): boolean {
  return !isMaxLevel(state, id) && state.balls >= upgradeCost(id, state.upgrades[id]);
}

export function buyUpgrade(state: GameState, id: UpgradeId): boolean {
  if (!canBuyUpgrade(state, id)) return false;
  state.balls -= upgradeCost(id, state.upgrades[id]);
  state.upgrades[id] += 1;
  return true;
}

/** 手持ちからボールを 1 個取り出して落とす。手持ちがなければ false */
export function takeBall(state: GameState): boolean {
  if (state.balls < 1) return false;
  state.balls -= 1;
  state.totalDrops += 1;
  return true;
}

/** ボールが枠に着地したときの処理。増減した数を返す */
export function landBall(state: GameState, slot: number): number {
  const net = slotNets(state)[slot] ?? 0;
  // 落とした 1 個は takeBall で引いてあるので、戻ってくるのは net + 1 個
  state.balls = Math.max(0, state.balls + net + 1);
  state.bestBalls = Math.max(state.bestBalls, state.balls);
  return net;
}

export function canRescue(state: GameState, ballsOnBoard: number): boolean {
  return state.balls < 1 && ballsOnBoard === 0;
}

export function rescue(state: GameState): void {
  state.balls += RESCUE_BALLS;
}

export interface OfflineResult {
  seconds: number;
  drops: number;
  /** 増減したボール数 */
  gain: number;
}

/**
 * 前回の更新から now までの自動投入の結果を、物理計算の代わりに期待値でまとめて反映する。
 * ページを閉じていた間や、タブが裏に回っていた間の進行に使う
 */
export function advanceOffline(state: GameState, now: number, maxSeconds = MAX_OFFLINE_SECONDS): OfflineResult {
  const seconds = Math.min(Math.max(0, (now - state.lastUpdate) / 1000), maxSeconds);
  state.lastUpdate = now;
  const drops = state.balls >= 1 ? Math.floor(seconds * autoDropsPerSecond(state)) : 0;
  const before = state.balls;
  state.balls = Math.max(0, Math.round(state.balls + drops * expectedNetPerDrop(state)));
  state.bestBalls = Math.max(state.bestBalls, state.balls);
  state.totalDrops += drops;
  return { seconds, drops, gain: state.balls - before };
}
