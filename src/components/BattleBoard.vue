<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import {
  ballRadius,
  CELL_COUNT,
  CELL_SIZE,
  CORE_RADIUS,
  CORE_MAX_HP,
  FIELD_SIZE,
  GATE_LABELS,
  GATE_RADIUS,
  GRID_SIZE,
  ITEM_RADIUS,
  NEUTRAL,
  RUSH_HOLE,
  TEAMS,
  type Battle,
  type ItemKind,
  type TeamId,
} from '../game/battle';

const props = defineProps<{ battle: Battle }>();

const EFFECT_SECONDS = 1.2;
const BANNER_SECONDS = 2.5;
const NEUTRAL_RGB: Rgb = [138, 143, 152];
/** 本拠地を削っている敵のマスに重ねる色 */
const DANGER_RGB: Rgb = [200, 0, 20];
const ITEM_ICONS: Record<ItemKind, string> = { laser: 'L', bomb: 'B', shield: 'S', giant: 'G', spread: 'W' };

type Rgb = [number, number, number];
const teamRgb = TEAMS.map((t) => hexToRgb(t.color));
/** 自分の陣地の上でも見えるよう、弾は陣地より明るい色で描く */
const ballColors = teamRgb.map((rgb) => toCss(mix(rgb, [255, 255, 255], 0.5)));
const coreColors = teamRgb.map((rgb) => toCss(mix(rgb, [0, 0, 0], 0.25)));

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgb;
}
function toCss([r, g, b]: Rgb, alpha = 1): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function teamCss(team: TeamId | null, alpha = 1): string {
  return team === null ? `rgba(255, 255, 255, ${alpha})` : toCss(teamRgb[team]!, alpha);
}

const canvas = ref<HTMLCanvasElement>();
let ctx: CanvasRenderingContext2D | null = null;
let scale = 1;
let frameId: number | undefined;
let resizeObserver: ResizeObserver | undefined;

// 陣地はマス 1 つを 1 ピクセルとした小さな画像に描き、拡大して表示する (マスごとに fillRect するより速い)
const gridCanvas = document.createElement('canvas');
gridCanvas.width = GRID_SIZE;
gridCanvas.height = GRID_SIZE;
const gridCtx = gridCanvas.getContext('2d')!;
const gridImage = gridCtx.createImageData(GRID_SIZE, GRID_SIZE);

function resize() {
  const el = canvas.value;
  if (!el) return;
  const dpr = window.devicePixelRatio || 1;
  el.width = Math.round(el.clientWidth * dpr);
  el.height = Math.round(el.clientHeight * dpr);
  scale = el.width / FIELD_SIZE;
}

function drawCells(b: Battle) {
  const data = gridImage.data;
  // 本拠地の周りの円の中にある敵のマス (= 本拠地を削っているマス) を赤く点滅させる
  const zoneRadius = b.coreZoneRadius();
  const zoneRadius2 = zoneRadius * zoneRadius;
  const aliveCores = b.cores.filter((c) => c.alive);
  const danger = 0.45 + 0.2 * Math.sin(b.time * 8);
  for (let i = 0; i < CELL_COUNT; i++) {
    const owner = b.owner[i]!;
    let rgb = owner === NEUTRAL ? NEUTRAL_RGB : teamRgb[owner]!;
    if (owner !== NEUTRAL) {
      const x = ((i % GRID_SIZE) + 0.5) * CELL_SIZE;
      const y = (Math.floor(i / GRID_SIZE) + 0.5) * CELL_SIZE;
      for (const core of aliveCores) {
        if (core.team === owner) continue;
        if ((x - core.x) ** 2 + (y - core.y) ** 2 <= zoneRadius2) {
          rgb = mix(rgb, DANGER_RGB, danger);
          break;
        }
      }
    }
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  gridCtx.putImageData(gridImage, 0, 0);
  ctx!.imageSmoothingEnabled = false;
  ctx!.drawImage(gridCanvas, 0, 0, FIELD_SIZE, FIELD_SIZE);
}

function circle(x: number, y: number, r: number) {
  ctx!.beginPath();
  ctx!.arc(x, y, r, 0, Math.PI * 2);
}

function text(value: string, x: number, y: number, size: number, fill: string, stroke = 'rgba(0, 0, 0, 0.6)') {
  const c = ctx!;
  c.font = `bold ${size}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineWidth = Math.max(2, size / 5);
  c.strokeStyle = stroke;
  c.lineJoin = 'round';
  c.strokeText(value, x, y);
  c.fillStyle = fill;
  c.fillText(value, x, y);
}

function drawGimmicks(b: Battle) {
  const c = ctx!;
  // 大当たり穴
  circle(RUSH_HOLE.x, RUSH_HOLE.y, RUSH_HOLE.radius + 4);
  c.fillStyle = 'rgba(20, 20, 24, 0.85)';
  c.fill();
  c.lineWidth = 3;
  // 開いている間は虹色に光らせ、閉じている間は暗くする
  const ready = b.rushReady();
  c.strokeStyle = ready ? `hsl(${(b.time * 120) % 360}, 90%, 65%)` : 'rgba(255, 255, 255, 0.25)';
  c.stroke();
  text('RUSH', RUSH_HOLE.x, RUSH_HOLE.y, 8, ready ? '#fff' : 'rgba(255, 255, 255, 0.35)');

  for (const bumper of b.bumpers) {
    circle(bumper.x, bumper.y, bumper.radius);
    c.fillStyle = 'rgba(255, 255, 255, 0.9)';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(0, 0, 0, 0.35)';
    c.stroke();
  }

  for (const gate of b.gates) {
    circle(gate.x, gate.y, GATE_RADIUS);
    c.fillStyle = 'rgba(255, 255, 255, 0.18)';
    c.fill();
    c.lineWidth = 3;
    c.setLineDash([6, 4]);
    c.lineDashOffset = -b.time * 20;
    c.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    c.stroke();
    c.setLineDash([]);
    text(GATE_LABELS[gate.kind], gate.x, gate.y, gate.kind === 'split' ? 12 : 15, '#fff');
  }

  for (const item of b.items) {
    const bob = Math.sin(b.time * 4 + item.x) * 1.5;
    circle(item.x, item.y + bob, ITEM_RADIUS);
    c.fillStyle = '#ffffff';
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = '#ff9f1c';
    c.stroke();
    text(ITEM_ICONS[item.kind], item.x, item.y + bob, 12, '#222', 'rgba(255, 255, 255, 0)');
  }
}

function drawCores(b: Battle) {
  const c = ctx!;
  const zoneRadius = b.coreZoneRadius();
  for (const core of b.cores) {
    // 本拠地の周りの「塗られると削られる」範囲。サドンデス中は広がっていく
    if (core.alive) {
      circle(core.x, core.y, zoneRadius);
      c.lineWidth = b.suddenDeath() ? 3 : 2;
      c.setLineDash([4, 6]);
      c.strokeStyle =
        core.zoneEnemyCells > 0
          ? `rgba(255, 60, 60, ${0.5 + 0.4 * Math.sin(b.time * 10)})`
          : 'rgba(255, 255, 255, 0.35)';
      c.stroke();
      c.setLineDash([]);
    }

    if (!core.alive) {
      circle(core.x, core.y, CORE_RADIUS);
      c.fillStyle = 'rgba(60, 60, 66, 0.9)';
      c.fill();
      text('×', core.x, core.y, 26, '#ddd');
      continue;
    }

    // 砲身
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.strokeStyle = '#222';
    c.beginPath();
    c.moveTo(core.x, core.y);
    c.lineTo(core.x + Math.cos(core.aim) * (CORE_RADIUS + 10), core.y + Math.sin(core.aim) * (CORE_RADIUS + 10));
    c.stroke();
    c.lineCap = 'butt';

    circle(core.x, core.y, CORE_RADIUS);
    c.fillStyle = coreColors[core.team]!;
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = b.time < core.rushUntil ? `hsl(${(b.time * 300) % 360}, 90%, 65%)` : '#fff';
    c.stroke();

    // 耐久の残りを外周のリングで示す
    c.beginPath();
    c.arc(core.x, core.y, CORE_RADIUS + 5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * core.hp) / CORE_MAX_HP);
    c.lineWidth = 4;
    c.strokeStyle = '#fff';
    c.stroke();

    if (b.time < core.shieldUntil) {
      circle(core.x, core.y, CORE_RADIUS + 12);
      c.lineWidth = 4;
      c.strokeStyle = `rgba(120, 220, 255, ${0.6 + 0.3 * Math.sin(b.time * 8)})`;
      c.stroke();
    }
    text(String(Math.ceil(core.hp)), core.x, core.y, 13, '#fff');
  }
}

function drawBalls(b: Battle) {
  const c = ctx!;
  for (const ball of b.balls) {
    const r = ballRadius(ball.power);
    circle(ball.x, ball.y, r);
    c.fillStyle = ball.bomb ? '#222' : ballColors[ball.team]!;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = ball.bomb ? teamCss(ball.team) : 'rgba(0, 0, 0, 0.55)';
    c.stroke();
    if (r >= 8) text(String(Math.ceil(ball.power)), ball.x, ball.y, Math.min(r * 0.9, 18), '#fff');
  }
}

function drawEffects(b: Battle) {
  const c = ctx!;
  for (const e of b.effects) {
    const age = (b.time - e.time) / EFFECT_SECONDS;
    const alpha = Math.max(0, 1 - age);
    if (e.kind === 'laser') {
      c.lineCap = 'round';
      c.lineWidth = 14 * alpha + 2;
      c.strokeStyle = teamCss(e.team, alpha * 0.5);
      c.beginPath();
      c.moveTo(e.x1, e.y1);
      c.lineTo(e.x2, e.y2);
      c.stroke();
      c.lineWidth = 3;
      c.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      c.stroke();
      c.lineCap = 'butt';
    } else if (e.kind === 'explosion') {
      circle(e.x, e.y, e.radius * Math.min(1, 0.3 + age * 2));
      c.fillStyle = teamCss(e.team, alpha * 0.35);
      c.fill();
      c.lineWidth = 4;
      c.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
      c.stroke();
    } else if (e.kind === 'banner') {
      // 決着後は時間が止まって消えなくなるので出さない (結果は画面のカードで見せる)
      if (b.finished) continue;
      // 中央に帯を出し、最後の 0.5 秒で消す
      const remaining = BANNER_SECONDS - (b.time - e.time);
      c.globalAlpha = Math.min(1, remaining / 0.5);
      c.fillStyle = 'rgba(0, 0, 0, 0.6)';
      c.fillRect(0, FIELD_SIZE / 2 - 34, FIELD_SIZE, 68);
      text(e.text, FIELD_SIZE / 2, FIELD_SIZE / 2, 38, teamCss(e.team), 'rgba(0, 0, 0, 0.9)');
      c.globalAlpha = 1;
    } else {
      c.globalAlpha = alpha;
      text(e.text, e.x, e.y - age * 30, e.big ? 24 : 15, teamCss(e.team), 'rgba(0, 0, 0, 0.75)');
      c.globalAlpha = 1;
    }
  }
}

function draw() {
  if (!ctx) return;
  const b = props.battle;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  drawCells(b);
  drawGimmicks(b);
  drawCores(b);
  drawBalls(b);
  drawEffects(b);
}

function loop() {
  draw();
  frameId = requestAnimationFrame(loop);
}

onMounted(() => {
  ctx = canvas.value!.getContext('2d');
  resize();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.value!);
  frameId = requestAnimationFrame(loop);
});

onUnmounted(() => {
  if (frameId !== undefined) cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
});
</script>

<template>
  <canvas ref="canvas" class="board" role="img" aria-label="Battlefield of the four-color territory war"></canvas>
</template>

<style scoped>
.board {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
}
</style>
