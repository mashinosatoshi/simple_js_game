// 盤面の物理シミュレーション。描画や Vue に依存せず、固定の時間刻みで進める。
// 座標は盤面の論理座標 (BOARD_WIDTH × BOARD_HEIGHT)。画面サイズへの拡大縮小は描画側で行う。

export const BOARD_WIDTH = 360;
export const BOARD_HEIGHT = 480;
export const ROWS = 8;
export const SLOT_COUNT = ROWS + 1;
export const PEG_SPACING = 36;
export const ROW_GAP = 34;
export const TOP_Y = 70;
export const PEG_RADIUS = 4;
export const BALL_RADIUS = 6;
export const SPAWN_Y = 22;
/** 最下段の釘の高さ。ここから下が仕切りで区切られた枠 */
export const DIVIDER_TOP_Y = TOP_Y + (ROWS - 1) * ROW_GAP;
/** ここまで落ちたら着地とみなす */
export const LAND_Y = BOARD_HEIGHT - 28;
/** 盤面に同時に存在できるボールの上限 */
export const MAX_BALLS = 300;

const GRAVITY = 2000;
const RESTITUTION = 0.3;
const WALL_HALF_THICKNESS = 1;
const STEP_SECONDS = 1 / 240;
/** 1 回の update で進める最大秒数。タブ復帰直後などに大量のステップを回さないため */
const MAX_UPDATE_SECONDS = 0.1;
const MAX_SPEED = 1050;
const MAX_HORIZONTAL_SPEED = 150;
/** 釘に当たったときに加える横方向のぶれ。結果が決定的にならないようにする */
const PEG_JITTER = 90;
/** 釘に当たったときに横方向の速度を減らす割合。小さいほど中央に集まる */
const PEG_HORIZONTAL_DAMPING = 0.3;
/** これより遅い衝突は「釘の上に乗っている」とみなす */
const IMPACT_SPEED = 60;
/** 釘の上に乗ったボールを転がり落とすための横方向の最低速度 */
const ROLL_OFF_SPEED = 30;
/** これより長く盤面に残ったボールは引っかかったとみなして強制的に着地させる */
const MAX_BALL_LIFETIME = 15;
const LANDING_HISTORY_SECONDS = 2;

export interface Peg {
  x: number;
  y: number;
  /** 最後にボールが当たった時刻 (sim.time)。描画の光る演出に使う */
  hitAt: number;
}

export interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  bornAt: number;
  /** 釘の上に乗ったときに転がり落ちる向き。強くぶつかるたびに選び直す */
  rollDir: -1 | 1;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Landing {
  slot: number;
  time: number;
  /** 着地で増減したボール数。ゲームロジック側が設定する */
  net: number;
}

export function pegX(row: number, index: number): number {
  const count = row + 3;
  return BOARD_WIDTH / 2 + (index - (count - 1) / 2) * PEG_SPACING;
}

export function rowY(row: number): number {
  return TOP_Y + row * ROW_GAP;
}

/** 枠 slot の左右の境界。両端の枠は盤面の端まで広がる */
export function slotBounds(slot: number): [number, number] {
  const left = slot === 0 ? 0 : pegX(ROWS - 1, slot);
  const right = slot === SLOT_COUNT - 1 ? BOARD_WIDTH : pegX(ROWS - 1, slot + 1);
  return [left, right];
}

export function slotAt(x: number): number {
  const index = Math.floor((x - pegX(ROWS - 1, 0)) / PEG_SPACING);
  return Math.min(Math.max(index, 0), SLOT_COUNT - 1);
}

function createPegs(): Peg[][] {
  const rows: Peg[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: Peg[] = [];
    for (let i = 0; i < r + 3; i++) row.push({ x: pegX(r, i), y: rowY(r), hitAt: -Infinity });
    rows.push(row);
  }
  return rows;
}

function createWalls(): Segment[] {
  const walls: Segment[] = [];
  // 釘の三角形の外側に沿ったガイド。三角形からこぼれたボールを盤面内に留める
  const offset = PEG_SPACING * 0.75;
  const guideTopY = rowY(-1);
  for (const side of [-1, 1]) {
    const topX = BOARD_WIDTH / 2 + side * (PEG_SPACING / 2 + offset);
    const bottomX = BOARD_WIDTH / 2 + side * (((ROWS + 1) / 2) * PEG_SPACING + offset);
    walls.push({ x1: topX, y1: 0, x2: topX, y2: guideTopY });
    walls.push({ x1: topX, y1: guideTopY, x2: bottomX, y2: DIVIDER_TOP_Y });
  }
  // 盤面の左右の端
  walls.push({ x1: 0, y1: 0, x2: 0, y2: BOARD_HEIGHT });
  walls.push({ x1: BOARD_WIDTH, y1: 0, x2: BOARD_WIDTH, y2: BOARD_HEIGHT });
  // 枠の仕切り (最下段の内側の釘から真下へ)
  for (let i = 1; i < SLOT_COUNT; i++) {
    const x = pegX(ROWS - 1, i);
    // 上端は釘の中に隠す。釘の中心から始めると、ボールが仕切りの先端に乗って止まる
    walls.push({ x1: x, y1: DIVIDER_TOP_Y + PEG_RADIUS, x2: x, y2: BOARD_HEIGHT });
  }
  return walls;
}

export class PlinkoSim {
  readonly pegRows = createPegs();
  readonly walls = createWalls();
  balls: Ball[] = [];
  /** 直近の着地 (演出用)。古いものは自動で消える */
  landings: Landing[] = [];
  /** シミュレーション内の経過秒数 */
  time = 0;

  private accumulator = 0;
  private nextId = 1;
  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
  }

  /**
   * 盤面の中央から offset (釘の間隔を 1 とした単位) だけずれた位置にボールを落とす。
   * 盤面が満杯なら false
   */
  drop(offset: number): boolean {
    if (this.balls.length >= MAX_BALLS) return false;
    this.balls.push({
      id: this.nextId++,
      x: BOARD_WIDTH / 2 + offset * PEG_SPACING,
      y: SPAWN_Y,
      vx: (this.random() - 0.5) * 10,
      vy: 0,
      bornAt: this.time,
      rollDir: this.randomSign(),
    });
    return true;
  }

  /** dt 秒ぶん進め、その間に着地したボールを返す */
  update(dt: number): Landing[] {
    this.accumulator += Math.min(Math.max(dt, 0), MAX_UPDATE_SECONDS);
    const landed: Landing[] = [];
    while (this.accumulator >= STEP_SECONDS) {
      this.accumulator -= STEP_SECONDS;
      this.step(landed);
    }
    this.landings = this.landings.filter((l) => this.time - l.time < LANDING_HISTORY_SECONDS);
    this.landings.push(...landed);
    return landed;
  }

  clear(): void {
    this.balls = [];
    this.landings = [];
  }

  private randomSign(): -1 | 1 {
    return this.random() < 0.5 ? -1 : 1;
  }

  private step(landed: Landing[]): void {
    this.time += STEP_SECONDS;
    const remaining: Ball[] = [];
    for (const ball of this.balls) {
      ball.vy += GRAVITY * STEP_SECONDS;
      const speed = Math.hypot(ball.vx, ball.vy);
      if (speed > MAX_SPEED) {
        ball.vx *= MAX_SPEED / speed;
        ball.vy *= MAX_SPEED / speed;
      }
      ball.x += ball.vx * STEP_SECONDS;
      ball.y += ball.vy * STEP_SECONDS;

      this.collidePegs(ball);
      for (const wall of this.walls) collideSegment(ball, wall);
      // 横に速すぎると釘の列に沿って斜めに滑り続けてしまうので抑える
      ball.vx = Math.min(Math.max(ball.vx, -MAX_HORIZONTAL_SPEED), MAX_HORIZONTAL_SPEED);

      if (ball.y >= LAND_Y || this.time - ball.bornAt > MAX_BALL_LIFETIME) {
        landed.push({ slot: slotAt(ball.x), time: this.time, net: 0 });
      } else {
        remaining.push(ball);
      }
    }
    this.balls = remaining;
  }

  private collidePegs(ball: Ball): void {
    // 近くの段の釘だけを調べる
    const nearest = Math.round((ball.y - TOP_Y) / ROW_GAP);
    for (let r = Math.max(nearest - 1, 0); r <= Math.min(nearest + 1, ROWS - 1); r++) {
      for (const peg of this.pegRows[r]!) {
        const dx = ball.x - peg.x;
        const dy = ball.y - peg.y;
        const minDist = BALL_RADIUS + PEG_RADIUS;
        const d2 = dx * dx + dy * dy;
        if (d2 >= minDist * minDist || d2 === 0) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        ball.x += nx * (minDist - d);
        ball.y += ny * (minDist - d);
        const impact = bounce(ball, nx, ny);
        if (impact >= IMPACT_SPEED) {
          ball.vx = ball.vx * PEG_HORIZONTAL_DAMPING + (this.random() - 0.5) * PEG_JITTER;
          // 向きは衝突ごとにランダムに選ぶ。釘の位置から決めると、同じ向きに斜めに滑り続けてしまう
          ball.rollDir = this.randomSign();
          peg.hitAt = this.time;
        } else if (impact > 0 && Math.abs(ball.vx) < ROLL_OFF_SPEED) {
          // 釘の上に乗って止まりかけているので転がり落とす
          ball.vx = ball.rollDir * ROLL_OFF_SPEED;
        }
      }
    }
  }
}

function collideSegment(ball: Ball, s: Segment): void {
  const sx = s.x2 - s.x1;
  const sy = s.y2 - s.y1;
  const t = Math.min(Math.max(((ball.x - s.x1) * sx + (ball.y - s.y1) * sy) / (sx * sx + sy * sy), 0), 1);
  const dx = ball.x - (s.x1 + t * sx);
  const dy = ball.y - (s.y1 + t * sy);
  const minDist = BALL_RADIUS + WALL_HALF_THICKNESS;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minDist * minDist || d2 === 0) return;
  const d = Math.sqrt(d2);
  ball.x += (dx / d) * (minDist - d);
  ball.y += (dy / d) * (minDist - d);
  bounce(ball, dx / d, dy / d);
}

/** 法線 (nx, ny) の面で跳ね返らせ、衝突の速さ (面に向かう速度成分) を返す。離れていく途中なら 0 */
function bounce(ball: Ball, nx: number, ny: number): number {
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= 0) return 0;
  ball.vx -= (1 + RESTITUTION) * vn * nx;
  ball.vy -= (1 + RESTITUTION) * vn * ny;
  return -vn;
}
