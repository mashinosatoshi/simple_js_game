// 4 色の陣取りバトルのシミュレーション。描画や Vue に依存しない。
// 乱数はすべて this.random から取るので、シードが同じなら毎回同じ展開になる。
// 座標は戦場の論理座標 (FIELD_SIZE × FIELD_SIZE)。画面サイズへの拡大縮小は描画側で行う。

import { createRandom, type Random } from './rng';

export const FIELD_SIZE = 600;
export const CELL_SIZE = 10;
export const GRID_SIZE = FIELD_SIZE / CELL_SIZE;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE;
/** どの色の陣地でもないマス (脱落した色の跡地) */
export const NEUTRAL = -1;

export type TeamId = 0 | 1 | 2 | 3;
export const TEAM_IDS: readonly TeamId[] = [0, 1, 2, 3];
export const TEAMS: readonly { name: string; color: string }[] = [
  { name: '黄', color: '#f2b705' },
  { name: '青', color: '#2f7de1' },
  { name: '赤', color: '#e5383b' },
  { name: '緑', color: '#2a9d4b' },
];

export const CORE_RADIUS = 24;
/** 本拠地の周りのこの範囲を敵に塗られると、塗られたマスの数に応じて本拠地が削られる */
export const CORE_ZONE_RADIUS = 100;
export const CORE_MAX_HP = 100;
/** 制限時間 (秒)。過ぎたら陣地が一番広い色の勝ち */
export const TIME_LIMIT = 180;
/** 中央の大当たり穴。入るとその色の砲台が一定時間連射する */
export const RUSH_HOLE = { x: FIELD_SIZE / 2, y: FIELD_SIZE / 2, radius: 14 } as const;
export const GATE_RADIUS = 24;
export const ITEM_RADIUS = 13;

const STEP_SECONDS = 1 / 120;
/** 1 回の update で進める最大秒数。タブ復帰直後などに大量のステップを回さないため */
const MAX_UPDATE_SECONDS = 0.25;
const BALL_SPEED = 240;
const MAX_BALLS = 400;
const MAX_POWER = 999;
const BALL_MAX_LIFETIME = 6;
/** 試合開始時の弾のパワー。時間とともに増えて、終盤ほど激しくなる */
const BASE_POWER = 8;
const POWER_RAMP_SECONDS = 60;
const BASE_FIRE_INTERVAL = 0.45;
/** 陣地の広さによる連射間隔の倍率 = SLOPE × 陣地の割合 + OFFSET (MIN〜MAX に収める)。狭いほど速く撃てる */
const FIRE_FACTOR_SLOPE = 1.2;
const FIRE_FACTOR_OFFSET = 0.7;
const FIRE_FACTOR_MIN = 0.7;
const FIRE_FACTOR_MAX = 1.3;
/** 砲台が首を振る角度 (中央方向から左右に) */
const AIM_SWEEP = 0.75;
/** 陣地のマスに当たって跳ね返るときのぶれ (ラジアン)。同じ軌道を繰り返さないようにする */
const BOUNCE_JITTER = 0.3;
const RUSH_SECONDS = 5;
/** 大当たり穴が一度当たってから、次に当たるようになるまでの秒数 */
const RUSH_COOLDOWN = 12;
const RUSH_FIRE_FACTOR = 0.2;
const SHIELD_SECONDS = 10;
const ITEM_SPAWN_INTERVAL = 5;
const MAX_ITEMS = 3;
const GATE_SPEED = 25;
/** ゲートとアイテムが動き回る範囲 (中央寄り) */
const GIMMICK_AREA = { min: 130, max: FIELD_SIZE - 130 } as const;
const GIANT_MULTIPLIER = 4;
const SPREAD_COUNT = 5;
const SPREAD_ANGLE = 0.5;
const LASER_WIDTH = 9;
const LASER_CELLS = 80;
const LASER_CORE_DAMAGE_MULTIPLIER = 4;
const BOMB_RADIUS = 60;
/** 本拠地の周りの敵のマス 1 つにつき、1 秒あたりに受けるダメージ */
const ZONE_DAMAGE_PER_CELL = 0.3;
const ZONE_CHECK_INTERVAL = 0.5;
const EFFECT_SECONDS = 1.2;
const MAX_EVENTS = 30;

export type GateKind = 'x2' | 'x4' | 'split';
export type ItemKind = 'laser' | 'bomb' | 'shield' | 'giant' | 'spread';
export type Weapon = Exclude<ItemKind, 'shield'>;

export const GATE_LABELS: Record<GateKind, string> = { x2: '×2', x4: '×4', split: '分裂' };
export const ITEM_LABELS: Record<ItemKind, string> = {
  laser: 'レーザー',
  bomb: 'ボム',
  shield: 'シールド',
  giant: '巨大弾',
  spread: '拡散',
};
const ITEM_KINDS = Object.keys(ITEM_LABELS) as ItemKind[];

export interface Ball {
  id: number;
  team: TeamId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 塗り替えられるマスの残り数。0 になると消える */
  power: number;
  bornAt: number;
  /** ゲートを通過済みか。1 個の弾が使えるゲートは 1 つだけ (何度も倍化して一方的になるのを防ぐ) */
  gated: boolean;
  bomb: boolean;
}

export interface Core {
  team: TeamId;
  x: number;
  y: number;
  hp: number;
  alive: boolean;
  /** 砲台の向き (ラジアン) */
  aim: number;
  baseAim: number;
  aimPhase: number;
  aimSpeed: number;
  fireCooldown: number;
  rushUntil: number;
  shieldUntil: number;
  /** アイテムで手に入れた、次の 1 発で使う武器 */
  pendingWeapon: Weapon | null;
  /** 本拠地の周りのマス (cellIndex) */
  zoneCells: number[];
  /** 本拠地の周りにある敵のマスの数 (ZONE_CHECK_INTERVAL ごとに更新) */
  zoneEnemyCells: number;
}

export interface Gate {
  id: number;
  kind: GateKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Bumper {
  x: number;
  y: number;
  radius: number;
}

export interface Item {
  kind: ItemKind;
  x: number;
  y: number;
}

/** 描画用の演出。一定時間で消える */
export type Effect =
  | { kind: 'laser'; team: TeamId; time: number; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'explosion'; team: TeamId; time: number; x: number; y: number; radius: number }
  | { kind: 'text'; team: TeamId | null; time: number; x: number; y: number; text: string; big: boolean };

export interface BattleEvent {
  id: number;
  time: number;
  team: TeamId | null;
  text: string;
}

export interface BattleOptions {
  seed: number;
  /** false にすると砲台が撃たない (テスト用) */
  autoFire?: boolean;
  /** false にするとゲート・アイテム・バンパー・大当たり穴を置かない (テスト用) */
  gimmicks?: boolean;
}

export function ballRadius(power: number): number {
  return Math.min(2.5 + 1.3 * Math.sqrt(power), 34);
}

export function cellIndex(cx: number, cy: number): number {
  return cy * GRID_SIZE + cx;
}

/** 試合開始時に各マスを持っている色。左上・右上・左下・右下の 4 分割 */
function initialOwner(cx: number, cy: number): TeamId {
  return ((cy < GRID_SIZE / 2 ? 0 : 2) + (cx < GRID_SIZE / 2 ? 0 : 1)) as TeamId;
}

/** 中心 (x, y) から radius 以内に中心があるマスの一覧 */
function cellsWithin(x: number, y: number, radius: number): number[] {
  const cells: number[] = [];
  for (let cy = 0; cy < GRID_SIZE; cy++) {
    for (let cx = 0; cx < GRID_SIZE; cx++) {
      if (Math.hypot((cx + 0.5) * CELL_SIZE - x, (cy + 0.5) * CELL_SIZE - y) <= radius) cells.push(cellIndex(cx, cy));
    }
  }
  return cells;
}

function reflect(ball: Ball, nx: number, ny: number): boolean {
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return false;
  ball.vx -= 2 * vn * nx;
  ball.vy -= 2 * vn * ny;
  return true;
}

export class Battle {
  readonly seed: number;
  /** 各マスを持っている色 (TeamId か NEUTRAL)。インデックスは cellIndex(cx, cy) */
  readonly owner = new Int8Array(CELL_COUNT);
  /** 各色が持っているマスの数 */
  readonly cellCounts = [0, 0, 0, 0];
  readonly cores: Core[];
  readonly bumpers: Bumper[];
  readonly gates: Gate[];
  balls: Ball[] = [];
  items: Item[] = [];
  effects: Effect[] = [];
  events: BattleEvent[] = [];
  time = 0;
  finished = false;
  winner: TeamId | null = null;

  private readonly random: Random;
  private readonly autoFire: boolean;
  private readonly gimmicks: boolean;
  private pending: Ball[] = [];
  private accumulator = 0;
  private nextBallId = 1;
  private itemTimer = ITEM_SPAWN_INTERVAL;
  private zoneTimer = ZONE_CHECK_INTERVAL;
  private nextEventId = 1;
  private rushReadyAt = 0;

  constructor(options: BattleOptions) {
    this.seed = options.seed;
    this.random = createRandom(options.seed);
    this.autoFire = options.autoFire ?? true;
    this.gimmicks = options.gimmicks ?? true;

    for (let cy = 0; cy < GRID_SIZE; cy++) {
      for (let cx = 0; cx < GRID_SIZE; cx++) {
        const team = initialOwner(cx, cy);
        this.owner[cellIndex(cx, cy)] = team;
        this.cellCounts[team]!++;
      }
    }

    const margin = 50;
    const corners: [number, number][] = [
      [margin, margin],
      [FIELD_SIZE - margin, margin],
      [margin, FIELD_SIZE - margin],
      [FIELD_SIZE - margin, FIELD_SIZE - margin],
    ];
    this.cores = TEAM_IDS.map((team) => {
      const [x, y] = corners[team]!;
      const baseAim = Math.atan2(FIELD_SIZE / 2 - y, FIELD_SIZE / 2 - x);
      return {
        team,
        x,
        y,
        hp: CORE_MAX_HP,
        alive: true,
        aim: baseAim,
        baseAim,
        aimPhase: this.random() * Math.PI * 2,
        aimSpeed: 0.6 + this.random() * 0.6,
        fireCooldown: this.random() * BASE_FIRE_INTERVAL,
        rushUntil: -Infinity,
        shieldUntil: -Infinity,
        pendingWeapon: null,
        zoneCells: cellsWithin(x, y, CORE_ZONE_RADIUS),
        zoneEnemyCells: 0,
      };
    });

    // バンパーは公平になるよう上下左右対称に置く
    const c = FIELD_SIZE / 2;
    this.bumpers = this.gimmicks
      ? [
          [c - 120, c],
          [c + 120, c],
          [c, c - 120],
          [c, c + 120],
          [c - 70, c - 70],
          [c + 70, c - 70],
          [c - 70, c + 70],
          [c + 70, c + 70],
        ].map(([x, y]) => ({ x: x!, y: y!, radius: 9 }))
      : [];

    const gateKinds: GateKind[] = ['x2', 'x2', 'x4', 'split'];
    this.gates = this.gimmicks
      ? gateKinds.map((kind, id) => {
          const angle = this.random() * Math.PI * 2;
          return {
            id,
            kind,
            x: this.randomInGimmickArea(),
            y: this.randomInGimmickArea(),
            vx: Math.cos(angle) * GATE_SPEED,
            vy: Math.sin(angle) * GATE_SPEED,
          };
        })
      : [];
  }

  /** dt 秒ぶん試合を進める */
  update(dt: number): void {
    this.accumulator += Math.min(Math.max(dt, 0), MAX_UPDATE_SECONDS);
    while (this.accumulator >= STEP_SECONDS && !this.finished) {
      this.accumulator -= STEP_SECONDS;
      this.step();
    }
  }

  /** 弾を撃ち出す。次のステップから盤面に加わる。上限に達していたら null */
  spawnBall(team: TeamId, x: number, y: number, angle: number, power: number, bomb = false): Ball | null {
    if (this.balls.length + this.pending.length >= MAX_BALLS) return null;
    const ball: Ball = {
      id: this.nextBallId++,
      team,
      x,
      y,
      vx: Math.cos(angle) * BALL_SPEED,
      vy: Math.sin(angle) * BALL_SPEED,
      power: Math.min(power, MAX_POWER),
      bornAt: this.time,
      gated: false,
      bomb,
    };
    this.pending.push(ball);
    return ball;
  }

  /** 現在の通常弾のパワー。時間とともに増える */
  basePower(): number {
    return Math.round(BASE_POWER * (1 + this.time / POWER_RAMP_SECONDS));
  }

  /** 大当たり穴が開いているか (当たった直後はしばらく閉じる) */
  rushReady(): boolean {
    return this.time >= this.rushReadyAt;
  }

  aliveTeams(): TeamId[] {
    return this.cores.filter((c) => c.alive).map((c) => c.team);
  }

  setOwner(index: number, team: TeamId | typeof NEUTRAL): void {
    const prev = this.owner[index]!;
    if (prev === team) return;
    if (prev !== NEUTRAL) this.cellCounts[prev]!--;
    if (team !== NEUTRAL) this.cellCounts[team]!++;
    this.owner[index] = team;
  }

  private step(): void {
    this.time += STEP_SECONDS;
    this.moveGates();
    if (this.autoFire) {
      for (const core of this.cores) if (core.alive) this.updateCore(core);
    }
    this.spawnItems();
    this.damageByZones();
    for (const ball of this.balls) this.updateBall(ball);
    this.clashBalls();
    this.balls = this.balls.filter((b) => b.power > 0);
    this.balls.push(...this.pending);
    this.pending = [];
    this.checkEnd();
    this.effects = this.effects.filter((e) => this.time - e.time < EFFECT_SECONDS);
  }

  // ---- 砲台 ----

  private updateCore(core: Core): void {
    core.aimPhase += core.aimSpeed * STEP_SECONDS;
    core.aim = core.baseAim + Math.sin(core.aimPhase) * AIM_SWEEP;
    core.fireCooldown -= STEP_SECONDS;
    if (core.fireCooldown > 0) return;
    this.fire(core);
    core.fireCooldown += this.fireInterval(core);
  }

  /** 陣地が狭い色ほど連射が速くなる (一方的な展開になりにくくするため) */
  private fireInterval(core: Core): number {
    const share = this.cellCounts[core.team]! / CELL_COUNT;
    const factor = Math.min(Math.max(FIRE_FACTOR_OFFSET + FIRE_FACTOR_SLOPE * share, FIRE_FACTOR_MIN), FIRE_FACTOR_MAX);
    const rush = this.time < core.rushUntil ? RUSH_FIRE_FACTOR : 1;
    return BASE_FIRE_INTERVAL * factor * rush;
  }

  private fire(core: Core): void {
    const weapon = core.pendingWeapon;
    core.pendingWeapon = null;
    const power = this.basePower();
    const spawnAt = (angle: number, p: number) => {
      const d = CORE_RADIUS + ballRadius(p) + 2;
      return [core.x + Math.cos(angle) * d, core.y + Math.sin(angle) * d] as const;
    };
    switch (weapon) {
      case 'laser':
        this.fireLaser(core);
        return;
      case 'giant': {
        const p = power * GIANT_MULTIPLIER;
        this.spawnBall(core.team, ...spawnAt(core.aim, p), core.aim, p);
        return;
      }
      case 'spread':
        for (let i = 0; i < SPREAD_COUNT; i++) {
          const angle = core.aim + (i / (SPREAD_COUNT - 1) - 0.5) * 2 * SPREAD_ANGLE;
          this.spawnBall(core.team, ...spawnAt(angle, power), angle, power);
        }
        return;
      case 'bomb':
        this.spawnBall(core.team, ...spawnAt(core.aim, power), core.aim, power, true);
        return;
      default:
        this.spawnBall(core.team, ...spawnAt(core.aim, power), core.aim, power);
    }
  }

  private fireLaser(core: Core): void {
    const dx = Math.cos(core.aim);
    const dy = Math.sin(core.aim);
    let x = core.x + dx * CORE_RADIUS;
    let y = core.y + dy * CORE_RADIUS;
    const x1 = x;
    const y1 = y;
    let budget = LASER_CELLS;
    const hitCores = new Set<TeamId>();
    while (budget > 0 && x >= 0 && x <= FIELD_SIZE && y >= 0 && y <= FIELD_SIZE) {
      budget -= this.paintCircle(core.team, x, y, LASER_WIDTH, budget);
      for (const enemy of this.cores) {
        if (enemy.team === core.team || !enemy.alive || hitCores.has(enemy.team)) continue;
        if (Math.hypot(enemy.x - x, enemy.y - y) < CORE_RADIUS) {
          hitCores.add(enemy.team);
          this.damageCore(enemy, this.basePower() * LASER_CORE_DAMAGE_MULTIPLIER, core.team);
        }
      }
      x += dx * 4;
      y += dy * 4;
    }
    this.effects.push({ kind: 'laser', team: core.team, time: this.time, x1, y1, x2: x, y2: y });
  }

  /** (x, y) から radius 以内にある他の色のマスを、最大 limit 個まで team の色に塗る。塗った数を返す */
  private paintCircle(team: TeamId, x: number, y: number, radius: number, limit: number): number {
    let painted = 0;
    const minCx = Math.max(0, Math.floor((x - radius) / CELL_SIZE));
    const maxCx = Math.min(GRID_SIZE - 1, Math.floor((x + radius) / CELL_SIZE));
    const minCy = Math.max(0, Math.floor((y - radius) / CELL_SIZE));
    const maxCy = Math.min(GRID_SIZE - 1, Math.floor((y + radius) / CELL_SIZE));
    for (let cy = minCy; cy <= maxCy && painted < limit; cy++) {
      for (let cx = minCx; cx <= maxCx && painted < limit; cx++) {
        const index = cellIndex(cx, cy);
        if (this.owner[index] === team) continue;
        const centerX = (cx + 0.5) * CELL_SIZE;
        const centerY = (cy + 0.5) * CELL_SIZE;
        if (Math.hypot(centerX - x, centerY - y) > radius) continue;
        this.setOwner(index, team);
        painted++;
      }
    }
    return painted;
  }

  /** 本拠地の周りを敵に塗られている分だけ、本拠地を削る。一番多く塗っている色の攻撃として扱う */
  private damageByZones(): void {
    this.zoneTimer -= STEP_SECONDS;
    if (this.zoneTimer > 0) return;
    this.zoneTimer += ZONE_CHECK_INTERVAL;
    for (const core of this.cores) {
      if (!core.alive) continue;
      const counts = [0, 0, 0, 0];
      for (const index of core.zoneCells) {
        const owner = this.owner[index]!;
        if (owner !== NEUTRAL && owner !== core.team) counts[owner]!++;
      }
      core.zoneEnemyCells = counts.reduce((a, b) => a + b, 0);
      if (core.zoneEnemyCells === 0 || this.time < core.shieldUntil) continue;
      const attacker = counts.indexOf(Math.max(...counts)) as TeamId;
      core.hp = Math.max(0, core.hp - core.zoneEnemyCells * ZONE_DAMAGE_PER_CELL * ZONE_CHECK_INTERVAL);
      if (core.hp <= 0) this.eliminate(core, attacker);
    }
  }

  private damageCore(core: Core, amount: number, by: TeamId): void {
    if (this.time < core.shieldUntil) return;
    core.hp = Math.max(0, core.hp - amount);
    this.effects.push({
      kind: 'text',
      team: by,
      time: this.time,
      x: core.x,
      y: core.y - CORE_RADIUS - 8,
      text: `-${amount}`,
      big: amount >= 50,
    });
    if (core.hp <= 0) this.eliminate(core, by);
  }

  private eliminate(core: Core, by: TeamId): void {
    core.alive = false;
    core.pendingWeapon = null;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (this.owner[i] === core.team) this.setOwner(i, NEUTRAL);
    }
    for (const ball of [...this.balls, ...this.pending]) {
      if (ball.team === core.team) ball.power = 0;
    }
    this.log(core.team, `${TEAMS[core.team]!.name}が脱落（${TEAMS[by]!.name}の攻撃）`);
    this.effects.push({ kind: 'explosion', team: by, time: this.time, x: core.x, y: core.y, radius: 80 });
  }

  // ---- 弾 ----

  private updateBall(ball: Ball): void {
    if (ball.power <= 0) return;
    ball.x += ball.vx * STEP_SECONDS;
    ball.y += ball.vy * STEP_SECONDS;
    const r = ballRadius(ball.power);

    let hitWall = true;
    if (ball.x < r) {
      ball.x = r;
      ball.vx = Math.abs(ball.vx);
    } else if (ball.x > FIELD_SIZE - r) {
      ball.x = FIELD_SIZE - r;
      ball.vx = -Math.abs(ball.vx);
    } else if (ball.y < r) {
      ball.y = r;
      ball.vy = Math.abs(ball.vy);
    } else if (ball.y > FIELD_SIZE - r) {
      ball.y = FIELD_SIZE - r;
      ball.vy = -Math.abs(ball.vy);
    } else {
      hitWall = false;
    }
    // 壁に垂直に当たると同じ直線を往復し続けるので、少し向きをぶらす
    if (hitWall) this.rotate(ball, (this.random() - 0.5) * BOUNCE_JITTER);

    for (const bumper of this.bumpers) this.bounceOffCircle(ball, r, bumper.x, bumper.y, bumper.radius);

    this.paintByBall(ball, r);
    if (ball.power <= 0) return;

    this.touchGates(ball);
    this.touchItems(ball, r);
    this.touchRushHole(ball);
    this.touchCores(ball, r);
    if (this.time - ball.bornAt > BALL_MAX_LIFETIME) ball.power = 0;
  }

  private bounceOffCircle(ball: Ball, r: number, x: number, y: number, radius: number): boolean {
    const dx = ball.x - x;
    const dy = ball.y - y;
    const minDist = r + radius;
    const d = Math.hypot(dx, dy);
    if (d >= minDist || d === 0) return false;
    const nx = dx / d;
    const ny = dy / d;
    ball.x = x + nx * minDist;
    ball.y = y + ny * minDist;
    reflect(ball, nx, ny);
    return true;
  }

  /** 弾が重なっている他の色のマスを塗り替え、1 マスにつきパワーを 1 消費する。敵の陣地に当たったら跳ね返る */
  private paintByBall(ball: Ball, r: number): void {
    const minCx = Math.max(0, Math.floor((ball.x - r) / CELL_SIZE));
    const maxCx = Math.min(GRID_SIZE - 1, Math.floor((ball.x + r) / CELL_SIZE));
    const minCy = Math.max(0, Math.floor((ball.y - r) / CELL_SIZE));
    const maxCy = Math.min(GRID_SIZE - 1, Math.floor((ball.y + r) / CELL_SIZE));
    let nx = 0;
    let ny = 0;
    let hitEnemy = false;
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        if (ball.power <= 0) break;
        const index = cellIndex(cx, cy);
        const prev = this.owner[index]!;
        if (prev === ball.team) continue;
        // 円とマス (正方形) が重なっているか
        const left = cx * CELL_SIZE;
        const top = cy * CELL_SIZE;
        const px = Math.min(Math.max(ball.x, left), left + CELL_SIZE);
        const py = Math.min(Math.max(ball.y, top), top + CELL_SIZE);
        if ((ball.x - px) ** 2 + (ball.y - py) ** 2 > r * r) continue;
        if (ball.bomb && prev !== NEUTRAL) {
          this.explode(ball);
          return;
        }
        this.setOwner(index, ball.team);
        ball.power -= 1;
        // 空き地 (NEUTRAL) は塗るだけで跳ね返らない
        if (prev !== NEUTRAL) {
          hitEnemy = true;
          nx += ball.x - (left + CELL_SIZE / 2);
          ny += ball.y - (top + CELL_SIZE / 2);
        }
      }
    }
    if (!hitEnemy) return;
    const len = Math.hypot(nx, ny);
    if (len > 0) reflect(ball, nx / len, ny / len);
    // 少し向きをぶらして、同じ軌道の往復にならないようにする
    this.rotate(ball, (this.random() - 0.5) * BOUNCE_JITTER);
  }

  private rotate(ball: Ball, angle: number): void {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    [ball.vx, ball.vy] = [ball.vx * cos - ball.vy * sin, ball.vx * sin + ball.vy * cos];
  }

  private explode(ball: Ball): void {
    const radius = BOMB_RADIUS;
    this.paintCircle(ball.team, ball.x, ball.y, radius, Infinity);
    this.effects.push({ kind: 'explosion', team: ball.team, time: this.time, x: ball.x, y: ball.y, radius });
    ball.power = 0;
  }

  private touchGates(ball: Ball): void {
    if (ball.gated) return;
    for (const gate of this.gates) {
      if (Math.hypot(ball.x - gate.x, ball.y - gate.y) > GATE_RADIUS) continue;
      ball.gated = true;
      const before = ball.power;
      if (gate.kind === 'x2') ball.power = Math.min(ball.power * 2, MAX_POWER);
      if (gate.kind === 'x4') ball.power = Math.min(ball.power * 4, MAX_POWER);
      if (gate.kind === 'split') {
        const angle = Math.atan2(ball.vy, ball.vx);
        for (const offset of [-0.45, 0.45]) {
          const child = this.spawnBall(ball.team, ball.x, ball.y, angle + offset, ball.power, ball.bomb);
          if (child) child.gated = true;
        }
      }
      const big = ball.power >= 100 && before < 100;
      this.effects.push({
        kind: 'text',
        team: ball.team,
        time: this.time,
        x: gate.x,
        y: gate.y - GATE_RADIUS - 6,
        text: GATE_LABELS[gate.kind],
        big: gate.kind === 'x4' || big,
      });
      if (big) this.log(ball.team, `${TEAMS[ball.team]!.name}の弾が${GATE_LABELS[gate.kind]}でパワー ${ball.power} に`);
      return;
    }
  }

  private touchItems(ball: Ball, r: number): void {
    const core = this.cores[ball.team]!;
    this.items = this.items.filter((item) => {
      if (Math.hypot(ball.x - item.x, ball.y - item.y) > r + ITEM_RADIUS) return true;
      if (item.kind === 'shield') {
        core.shieldUntil = this.time + SHIELD_SECONDS;
      } else {
        core.pendingWeapon = item.kind;
      }
      this.log(ball.team, `${TEAMS[ball.team]!.name}が${ITEM_LABELS[item.kind]}を獲得`);
      this.effects.push({
        kind: 'text',
        team: ball.team,
        time: this.time,
        x: item.x,
        y: item.y - 18,
        text: ITEM_LABELS[item.kind],
        big: false,
      });
      return false;
    });
  }

  private touchRushHole(ball: Ball): void {
    if (!this.gimmicks || !this.rushReady()) return;
    if (Math.hypot(ball.x - RUSH_HOLE.x, ball.y - RUSH_HOLE.y) > RUSH_HOLE.radius) return;
    ball.power = 0;
    this.rushReadyAt = this.time + RUSH_COOLDOWN;
    const core = this.cores[ball.team]!;
    core.rushUntil = this.time + RUSH_SECONDS;
    core.fireCooldown = 0;
    this.log(ball.team, `${TEAMS[ball.team]!.name}が大当たり！ ${RUSH_SECONDS} 秒間連射`);
    this.effects.push({
      kind: 'text',
      team: ball.team,
      time: this.time,
      x: RUSH_HOLE.x,
      y: RUSH_HOLE.y - 24,
      text: 'RUSH!',
      big: true,
    });
  }

  private touchCores(ball: Ball, r: number): void {
    for (const core of this.cores) {
      if (core.team === ball.team || !core.alive) continue;
      if (Math.hypot(ball.x - core.x, ball.y - core.y) >= r + CORE_RADIUS) continue;
      if (this.time < core.shieldUntil) {
        this.bounceOffCircle(ball, r, core.x, core.y, CORE_RADIUS);
        continue;
      }
      const damage = ball.power;
      ball.power = 0;
      this.damageCore(core, damage, ball.team);
      return;
    }
  }

  /**
   * 色の違う弾同士がぶつかると、小さい方のパワーの分だけ両方が削られる。
   * 全ペアを調べると重いので、戦場をマス目に分けて近くの弾同士だけを調べる
   */
  private clashBalls(): void {
    const bucketSize = 80;
    const buckets = new Map<number, Ball[]>();
    const keyOf = (bx: number, by: number) => bx * 64 + by;
    for (const ball of this.balls) {
      if (ball.power <= 0) continue;
      const key = keyOf(Math.floor(ball.x / bucketSize), Math.floor(ball.y / bucketSize));
      const bucket = buckets.get(key);
      if (bucket) bucket.push(ball);
      else buckets.set(key, [ball]);
    }
    for (const a of this.balls) {
      if (a.power <= 0) continue;
      const bx = Math.floor(a.x / bucketSize);
      const by = Math.floor(a.y / bucketSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (const b of buckets.get(keyOf(bx + dx, by + dy)) ?? []) {
            if (b.id <= a.id || b.team === a.team || b.power <= 0 || a.power <= 0) continue;
            if (Math.hypot(a.x - b.x, a.y - b.y) >= ballRadius(a.power) + ballRadius(b.power)) continue;
            const loss = Math.min(a.power, b.power);
            a.power -= loss;
            b.power -= loss;
          }
        }
      }
    }
  }

  // ---- ゲートとアイテム ----

  private randomInGimmickArea(): number {
    return GIMMICK_AREA.min + this.random() * (GIMMICK_AREA.max - GIMMICK_AREA.min);
  }

  private moveGates(): void {
    for (const gate of this.gates) {
      gate.x += gate.vx * STEP_SECONDS;
      gate.y += gate.vy * STEP_SECONDS;
      if (gate.x < GIMMICK_AREA.min || gate.x > GIMMICK_AREA.max) gate.vx *= -1;
      if (gate.y < GIMMICK_AREA.min || gate.y > GIMMICK_AREA.max) gate.vy *= -1;
    }
  }

  private spawnItems(): void {
    if (!this.gimmicks) return;
    this.itemTimer -= STEP_SECONDS;
    if (this.itemTimer > 0) return;
    this.itemTimer += ITEM_SPAWN_INTERVAL;
    if (this.items.length >= MAX_ITEMS) return;
    const kind = ITEM_KINDS[Math.floor(this.random() * ITEM_KINDS.length)]!;
    this.items.push({ kind, x: this.randomInGimmickArea(), y: this.randomInGimmickArea() });
  }

  // ---- 試合の進行 ----

  private checkEnd(): void {
    const alive = this.cores.filter((c) => c.alive);
    if (alive.length <= 1) {
      this.finish(alive[0]?.team ?? null, '最後まで生き残った');
      return;
    }
    if (this.time >= TIME_LIMIT) {
      const best = alive.reduce((a, b) =>
        this.cellCounts[b.team]! > this.cellCounts[a.team]! ||
        (this.cellCounts[b.team] === this.cellCounts[a.team] && b.hp > a.hp)
          ? b
          : a,
      );
      this.finish(best.team, '時間切れで陣地が最も広い');
    }
  }

  private finish(winner: TeamId | null, reason: string): void {
    this.finished = true;
    this.winner = winner;
    this.log(winner, winner === null ? '引き分け' : `${TEAMS[winner]!.name}の勝利（${reason}）`);
  }

  private log(team: TeamId | null, text: string): void {
    this.events.push({ id: this.nextEventId++, time: this.time, team, text });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }
}
