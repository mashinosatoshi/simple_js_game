import { describe, expect, it } from 'vitest';
import { advance, buyMiner, click, createInitialState, minerCost } from './state';

describe('advance', () => {
  it('経過時間 × 生産量だけコインが増える', () => {
    const state = createInitialState(0);
    state.miners = 3;
    advance(state, 2500);
    expect(state.coins).toBeCloseTo(7.5);
    expect(state.lastUpdate).toBe(2500);
  });

  it('上限秒数を超えて進めない', () => {
    const state = createInitialState(0);
    state.miners = 1;
    expect(advance(state, 100_000, 10)).toBe(10);
    expect(state.coins).toBe(10);
  });

  it('時刻が巻き戻っても減らない', () => {
    const state = createInitialState(1000);
    state.miners = 1;
    advance(state, 0);
    expect(state.coins).toBe(0);
  });
});

describe('buyMiner', () => {
  it('コストを払って購入し、次のコストが上がる', () => {
    const state = createInitialState(0);
    state.coins = minerCost(0);
    expect(buyMiner(state)).toBe(true);
    expect(state.coins).toBe(0);
    expect(state.miners).toBe(1);
    expect(minerCost(1)).toBeGreaterThan(minerCost(0));
  });

  it('コインが足りなければ購入しない', () => {
    const state = createInitialState(0);
    click(state);
    expect(buyMiner(state)).toBe(false);
    expect(state.miners).toBe(0);
    expect(state.coins).toBe(1);
  });
});
