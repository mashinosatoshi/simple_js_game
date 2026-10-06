import { describe, expect, it } from 'vitest';
import { PlinkoSim, SLOT_COUNT } from './physics';
import { BASE_SLOT_NETS, SLOT_PROBABILITIES } from './state';

/** テストの結果を毎回同じにするための、シード付きの乱数 (mulberry32) */
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** count 個を順に落とし、全部着地するまで進める。各枠の着地数と、着地までの最長秒数を返す */
function simulate(count: number, seed: number) {
  const random = seededRandom(seed);
  const sim = new PlinkoSim(random);
  const counts = new Array<number>(SLOT_COUNT).fill(0);
  const bornAt = new Map<number, number>();
  let dropped = 0;
  let landed = 0;
  let maxLifetime = 0;
  while (landed < count) {
    if (dropped < count && sim.balls.length < 100) {
      sim.drop(random() * 2 - 1);
      dropped++;
    }
    for (const b of sim.balls) bornAt.set(b.id, b.bornAt);
    const before = sim.balls.map((b) => b.id);
    for (const landing of sim.update(1 / 60)) {
      counts[landing.slot]!++;
      landed++;
    }
    const remaining = new Set(sim.balls.map((b) => b.id));
    for (const id of before) {
      if (!remaining.has(id)) maxLifetime = Math.max(maxLifetime, sim.time - bornAt.get(id)!);
    }
  }
  return { counts, maxLifetime };
}

describe('PlinkoSim', () => {
  it('枠の数がゲームのルールと一致する', () => {
    expect(SLOT_COUNT).toBe(BASE_SLOT_NETS.length);
  });

  it('着地の分布が SLOT_PROBABILITIES (期待値計算に使う値) とおおむね一致する', () => {
    const n = 3000;
    const { counts } = simulate(n, 42);
    counts.forEach((c, i) => {
      expect(Math.abs(c / n - SLOT_PROBABILITIES[i]!)).toBeLessThan(0.03);
    });
  });

  it('ボールが途中で引っかからずに数秒で着地する', () => {
    const { maxLifetime } = simulate(500, 7);
    expect(maxLifetime).toBeLessThan(6);
  });

  it('盤面が満杯ならそれ以上落とせない', () => {
    const sim = new PlinkoSim(seededRandom(1));
    let accepted = 0;
    for (let i = 0; i < 1000; i++) if (sim.drop(0)) accepted++;
    expect(accepted).toBeLessThan(1000);
    expect(sim.balls.length).toBe(accepted);
  });
});
