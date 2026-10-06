<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { formatNet } from '../game/format';
import {
  BALL_RADIUS,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  DIVIDER_TOP_Y,
  LAND_Y,
  PEG_RADIUS,
  PEG_SPACING,
  SLOT_COUNT,
  slotBounds,
  SPAWN_Y,
  type PlinkoSim,
} from '../game/physics';

const props = defineProps<{
  sim: PlinkoSim;
  nets: number[];
  /** 投入口の幅 (中央から左右に、釘の間隔を 1 とした単位) */
  zoneHalfWidth: number;
}>();

const emit = defineEmits<{
  /** offset: 盤面の中央からの位置 (釘の間隔を 1 とした単位) */
  drop: [offset: number];
}>();

const PEG_GLOW_SECONDS = 0.25;
const SLOT_FLASH_SECONDS = 0.3;
const FLOAT_TEXT_SECONDS = 1.2;

const canvas = ref<HTMLCanvasElement>();
let ctx: CanvasRenderingContext2D | null = null;
let scale = 1;
let frameId: number | undefined;
let resizeObserver: ResizeObserver | undefined;
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

/** canvas は CSS 変数を直接使えないので、テーマの色を読み取っておく */
function readColors() {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    bg: v('--board-bg'),
    peg: v('--peg'),
    accent: v('--accent'),
    ball: v('--ball'),
    plus: v('--plus'),
    minus: v('--minus'),
    zero: v('--muted'),
    wall: v('--border'),
  };
}
let colors = readColors();
const onThemeChange = () => (colors = readColors());

function netColor(net: number): string {
  if (net > 0) return colors.plus;
  if (net < 0) return colors.minus;
  return colors.zero;
}

function resize() {
  const el = canvas.value;
  if (!el) return;
  const dpr = window.devicePixelRatio || 1;
  el.width = Math.round(el.clientWidth * dpr);
  el.height = Math.round(el.clientHeight * dpr);
  scale = el.width / BOARD_WIDTH;
}

function draw() {
  const sim = props.sim;
  if (!ctx) return;
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

  // 枠: 色で増減を示し、着地した直後は明るくする
  const lastLanding = new Array<number>(SLOT_COUNT).fill(-Infinity);
  for (const l of sim.landings) lastLanding[l.slot] = Math.max(lastLanding[l.slot]!, l.time);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let slot = 0; slot < SLOT_COUNT; slot++) {
    const [left, right] = slotBounds(slot);
    const net = props.nets[slot] ?? 0;
    const flash = Math.max(0, 1 - (sim.time - lastLanding[slot]!) / SLOT_FLASH_SECONDS);
    ctx.fillStyle = netColor(net);
    ctx.globalAlpha = 0.12 + flash * 0.4;
    ctx.fillRect(left, DIVIDER_TOP_Y, right - left, BOARD_HEIGHT - DIVIDER_TOP_Y);
    ctx.globalAlpha = 1;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(formatNet(net), (left + right) / 2, BOARD_HEIGHT - 13);
  }

  // 投入口
  const zone = props.zoneHalfWidth * PEG_SPACING + BALL_RADIUS;
  ctx.globalAlpha = 0.18;
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.roundRect(BOARD_WIDTH / 2 - zone, SPAWN_Y - 10, zone * 2, 20, 10);
  ctx.fill();
  ctx.globalAlpha = 1;

  // 壁と仕切り
  ctx.strokeStyle = colors.wall;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const w of sim.walls) {
    ctx.moveTo(w.x1, w.y1);
    ctx.lineTo(w.x2, w.y2);
  }
  ctx.stroke();

  // 釘: 当たった直後は光って少し大きくなる
  for (const row of sim.pegRows) {
    for (const peg of row) {
      const glow = Math.max(0, 1 - (sim.time - peg.hitAt) / PEG_GLOW_SECONDS);
      ctx.fillStyle = glow > 0 ? colors.accent : colors.peg;
      ctx.beginPath();
      ctx.arc(peg.x, peg.y, PEG_RADIUS + glow * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ボール
  ctx.fillStyle = colors.ball;
  ctx.beginPath();
  for (const ball of sim.balls) {
    ctx.moveTo(ball.x + BALL_RADIUS, ball.y);
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
  }
  ctx.fill();

  // 着地した枠の上に増減を浮かび上がらせる
  for (const l of sim.landings) {
    const age = sim.time - l.time;
    if (age > FLOAT_TEXT_SECONDS) continue;
    const [left, right] = slotBounds(l.slot);
    ctx.globalAlpha = 1 - age / FLOAT_TEXT_SECONDS;
    ctx.fillStyle = netColor(l.net);
    ctx.font = `bold ${Math.abs(l.net) >= 5 ? 22 : 15}px system-ui, sans-serif`;
    ctx.fillText(formatNet(l.net), (left + right) / 2, LAND_Y - 16 - age * 70);
  }
  ctx.globalAlpha = 1;
}

function loop() {
  draw();
  frameId = requestAnimationFrame(loop);
}

function onPointerDown(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * BOARD_WIDTH;
  emit('drop', (x - BOARD_WIDTH / 2) / PEG_SPACING);
}

onMounted(() => {
  ctx = canvas.value!.getContext('2d');
  resize();
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas.value!);
  darkQuery.addEventListener('change', onThemeChange);
  frameId = requestAnimationFrame(loop);
});

onUnmounted(() => {
  if (frameId !== undefined) cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
  darkQuery.removeEventListener('change', onThemeChange);
});
</script>

<template>
  <canvas
    ref="canvas"
    class="board"
    role="img"
    aria-label="ボールを落とす盤面。タップした位置からボールを落とせます"
    @pointerdown="onPointerDown"
  ></canvas>
</template>

<style scoped>
.board {
  display: block;
  width: 100%;
  aspect-ratio: 360 / 480;
  border-radius: 12px;
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
}
</style>
