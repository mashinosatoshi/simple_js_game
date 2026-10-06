import { describe, expect, it } from 'vitest';
import {
  advanceOffline,
  BASE_SLOT_NETS,
  buyUpgrade,
  canRescue,
  createInitialState,
  expectedNetPerDrop,
  INITIAL_BALLS,
  landBall,
  SLOT_PROBABILITIES,
  slotNets,
  takeBall,
  upgradeCost,
} from './state';

describe('落とす・着地する', () => {
  it('落とすと 1 個減り、着地した枠の分だけ増減する', () => {
    const state = createInitialState(0);
    expect(takeBall(state)).toBe(true);
    expect(state.balls).toBe(INITIAL_BALLS - 1);
    // 端の枠 (+6) に着地
    expect(landBall(state, 0)).toBe(6);
    expect(state.balls).toBe(INITIAL_BALLS + 6);
    expect(state.bestBalls).toBe(INITIAL_BALLS + 6);
    expect(state.totalDrops).toBe(1);
  });

  it('中央の枠 (-2) では落とした分に加えてさらに 1 個減る', () => {
    const state = createInitialState(0);
    takeBall(state);
    landBall(state, 4);
    expect(state.balls).toBe(INITIAL_BALLS - 2);
  });

  it('手持ちが 0 にならないよう下限で止まる', () => {
    const state = { ...createInitialState(0), balls: 1 };
    takeBall(state);
    landBall(state, 4);
    expect(state.balls).toBe(0);
    expect(takeBall(state)).toBe(false);
    expect(canRescue(state, 0)).toBe(true);
    expect(canRescue(state, 1)).toBe(false);
  });
});

describe('アップグレード', () => {
  it('当たり強化でプラスの枠だけ増える', () => {
    const state = createInitialState(0);
    state.upgrades.payout = 1;
    expect(slotNets(state)).toEqual([9, 3, 2, -1, -2, -1, 2, 3, 9]);
  });

  it('ハズレ軽減でマイナスの枠が 0 に近づく', () => {
    const state = createInitialState(0);
    state.upgrades.penalty = 1;
    expect(slotNets(state)).toEqual([6, 2, 1, 0, -1, 0, 1, 2, 6]);
    state.upgrades.penalty = 2;
    expect(slotNets(state)).toEqual([6, 2, 1, 0, 0, 0, 1, 2, 6]);
  });

  it('コストを払って購入し、次のコストが上がる', () => {
    const state = createInitialState(0);
    state.balls = upgradeCost('autoDrop', 0);
    expect(buyUpgrade(state, 'autoDrop')).toBe(true);
    expect(state.balls).toBe(0);
    expect(state.upgrades.autoDrop).toBe(1);
    expect(upgradeCost('autoDrop', 1)).toBeGreaterThan(upgradeCost('autoDrop', 0));
    expect(buyUpgrade(state, 'autoDrop')).toBe(false);
  });

  it('最大レベルを超えて購入できない', () => {
    const state = createInitialState(0);
    state.balls = 1e9;
    state.upgrades.penalty = 2;
    expect(buyUpgrade(state, 'penalty')).toBe(false);
  });
});

describe('バランス', () => {
  it('確率の合計は 1 で、枠の数と一致する', () => {
    expect(SLOT_PROBABILITIES).toHaveLength(BASE_SLOT_NETS.length);
    expect(SLOT_PROBABILITIES.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it('初期状態でも期待値はわずかにプラス (遊び続ければ増えていく)', () => {
    const ev = expectedNetPerDrop(createInitialState(0));
    expect(ev).toBeGreaterThan(0);
    expect(ev).toBeLessThan(0.5);
  });
});

describe('advanceOffline', () => {
  it('自動投入の回数 × 期待値だけ増える', () => {
    const state = createInitialState(0);
    state.upgrades.autoDrop = 2; // 毎秒 1 個
    const ev = expectedNetPerDrop(state);
    const result = advanceOffline(state, 100_000);
    expect(result.drops).toBe(100);
    expect(state.balls).toBe(Math.round(INITIAL_BALLS + 100 * ev));
    expect(result.gain).toBe(state.balls - INITIAL_BALLS);
    expect(state.lastUpdate).toBe(100_000);
  });

  it('上限秒数を超えて進めない', () => {
    const state = createInitialState(0);
    state.upgrades.autoDrop = 2;
    expect(advanceOffline(state, 1_000_000, 10).drops).toBe(10);
  });

  it('自動投入がなければ何も起きない', () => {
    const state = createInitialState(0);
    const result = advanceOffline(state, 1_000_000);
    expect(result.drops).toBe(0);
    expect(state.balls).toBe(INITIAL_BALLS);
  });
});
