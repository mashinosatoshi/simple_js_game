import { describe, expect, it } from 'vitest';
import {
  Battle,
  cellIndex,
  CELL_COUNT,
  CELL_SIZE,
  CORE_MAX_HP,
  GRID_SIZE,
  NEUTRAL,
  POWER_PER_CELL,
  type TeamId,
} from './battle';

/** 砲台もギミックもない、手で弾を置いて確かめるための戦場 */
function quietBattle(): Battle {
  return new Battle({ seed: 1, autoFire: false, gimmicks: false });
}

/** update は 1 回で進める秒数に上限があるので、細かく分けて進める */
function advance(battle: Battle, seconds: number): void {
  for (let t = 0; t < seconds - 1e-9; t += 0.1) battle.update(Math.min(0.1, seconds - t));
}

function countCells(battle: Battle, team: TeamId): number {
  let n = 0;
  for (let i = 0; i < CELL_COUNT; i++) if (battle.owner[i] === team) n++;
  return n;
}

/** 矩形 (論理座標) の中のマスを team の色にする */
function paintRect(battle: Battle, team: TeamId, x1: number, y1: number, x2: number, y2: number): void {
  for (let cy = Math.floor(y1 / CELL_SIZE); cy < Math.ceil(y2 / CELL_SIZE); cy++) {
    for (let cx = Math.floor(x1 / CELL_SIZE); cx < Math.ceil(x2 / CELL_SIZE); cx++) battle.setOwner(cellIndex(cx, cy), team);
  }
}

describe('初期状態', () => {
  it('4 色が戦場を 4 等分している', () => {
    const battle = quietBattle();
    expect(battle.cellCounts).toEqual([CELL_COUNT / 4, CELL_COUNT / 4, CELL_COUNT / 4, CELL_COUNT / 4]);
    expect(battle.owner[cellIndex(0, 0)]).toBe(0);
    expect(battle.owner[cellIndex(GRID_SIZE - 1, 0)]).toBe(1);
    expect(battle.owner[cellIndex(0, GRID_SIZE - 1)]).toBe(2);
    expect(battle.owner[cellIndex(GRID_SIZE - 1, GRID_SIZE - 1)]).toBe(3);
  });
});

describe('弾', () => {
  it('自分の陣地の上は何も塗らずに素通りする', () => {
    const battle = quietBattle();
    const ball = battle.spawnBall(0, 100, 150, 0, 10)!;
    advance(battle, 0.3);
    expect(ball.power).toBe(10);
    expect(ball.x).toBeGreaterThan(150);
    expect(battle.cellCounts[0]).toBe(CELL_COUNT / 4);
  });

  it('敵の陣地に当たると、パワーを使って塗り替え、跳ね返る', () => {
    const battle = quietBattle();
    // 黄 (左上) から右へ撃つと、x = 300 の境界で青 (右上) の陣地に当たる
    const ball = battle.spawnBall(0, 270, 150, 0, 10)!;
    advance(battle, 0.3);
    const painted = battle.cellCounts[0]! - CELL_COUNT / 4;
    expect(painted).toBeGreaterThan(0);
    expect(ball.power).toBe(10 - painted * POWER_PER_CELL);
    expect(battle.cellCounts[1]).toBe(CELL_COUNT / 4 - painted);
    if (ball.power > 0) expect(ball.vx).toBeLessThan(0);
  });

  it('×2 のゲートを通るとパワーが 2 倍になる (同じゲートでは 1 回だけ)', () => {
    const battle = new Battle({ seed: 1, autoFire: false });
    battle.gates.forEach((g) => Object.assign(g, { x: 1000, y: 1000, vx: 0, vy: 0 }));
    Object.assign(battle.gates[0]!, { kind: 'x2', x: 160, y: 150 });
    const ball = battle.spawnBall(0, 100, 150, 0, 10)!;
    advance(battle, 0.4);
    expect(ball.power).toBe(20);
  });
});

describe('本拠地', () => {
  it('敵の弾が当たると、その弾のパワーだけ削られる', () => {
    const battle = quietBattle();
    // 青の本拠地 (550, 50) の手前までを黄の陣地にして、弾が届くようにする
    paintRect(battle, 0, 460, 30, 530, 70);
    battle.spawnBall(0, 470, 50, 0, 20);
    advance(battle, 0.4);
    expect(battle.cores[1]!.hp).toBeLessThanOrEqual(CORE_MAX_HP - 20);
  });

  it('周りを敵に塗られると少しずつ削られ、0 になると脱落して陣地が空き地になる', () => {
    const battle = quietBattle();
    paintRect(battle, 1, 0, 0, 150, 150);
    advance(battle, 1);
    const core = battle.cores[0]!;
    expect(core.hp).toBeLessThan(CORE_MAX_HP);

    core.hp = 0.01;
    advance(battle, 0.6);
    expect(core.alive).toBe(false);
    expect(countCells(battle, 0)).toBe(0);
    expect(battle.cellCounts[0]).toBe(0);
    expect(battle.owner.filter((o) => o === NEUTRAL).length).toBeGreaterThan(0);
    expect(battle.events.at(-1)?.text).toContain('eliminated');
    expect(core.place).toBe(4);
    expect(core.eliminatedAt).not.toBeNull();
  });

  it('最後の 1 色になったら勝利で試合が終わる', () => {
    const battle = quietBattle();
    for (const team of [1, 2, 3] as const) paintRect(battle, 0, ...cornerRect(team));
    for (const core of battle.cores.slice(1)) core.hp = 0.01;
    advance(battle, 1);
    expect(battle.finished).toBe(true);
    expect(battle.winner).toBe(0);
    // 1 位から 4 位までがすべて決まっている
    expect(battle.cores.map((c) => c.place).sort()).toEqual([1, 2, 3, 4]);
    expect(battle.cores[0]!.place).toBe(1);
  });
});

function cornerRect(team: TeamId): [number, number, number, number] {
  const x = team % 2 === 0 ? 0 : 300;
  const y = team < 2 ? 0 : 300;
  return [x, y, x + 300, y + 300];
}

describe('試合全体', () => {
  it('同じシードなら毎回同じ展開になる', () => {
    const a = new Battle({ seed: 123 });
    const b = new Battle({ seed: 123 });
    for (let i = 0; i < 300; i++) {
      advance(a, 0.1);
      advance(b, 0.1);
    }
    expect(Array.from(a.owner)).toEqual(Array.from(b.owner));
    expect(a.cores.map((c) => c.hp)).toEqual(b.cores.map((c) => c.hp));
  });

  it('制限時間はないが、サドンデスで本拠地の周りの範囲が広がり、数分で決着がつく', () => {
    const battle = new Battle({ seed: 7 });
    while (!battle.finished && battle.time < 600) advance(battle, 0.25);
    expect(battle.finished).toBe(true);
    expect(battle.winner).not.toBeNull();
    expect(battle.aliveTeams()).toEqual([battle.winner]);
    // マスの数の集計が実際の盤面と一致している
    for (const team of [0, 1, 2, 3] as const) expect(battle.cellCounts[team]).toBe(countCells(battle, team));
  });
});
