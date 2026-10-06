import { computed, markRaw, onMounted, onUnmounted, reactive, ref } from 'vue';
import { PlinkoSim } from '../game/physics';
import { clearStorage, exportSave, importSave, loadFromStorage, saveToStorage } from '../game/save';
import {
  advanceOffline,
  autoDropsPerSecond,
  buyUpgrade,
  canBuyUpgrade,
  canRescue,
  createInitialState,
  expectedNetPerDrop,
  isMaxLevel,
  landBall,
  rescue,
  slotNets,
  takeBall,
  upgradeCost,
  UPGRADE_IDS,
  UPGRADES,
  type GameState,
  type OfflineResult,
  type UpgradeId,
} from '../game/state';

const AUTOSAVE_INTERVAL_MS = 10_000;
/** これより短い不在ならオフライン報告を出さない */
const OFFLINE_REPORT_MIN_SECONDS = 60;
/** 投入口の幅 (中央から左右に、釘の間隔を 1 とした単位) */
export const DROP_ZONE_HALF_WIDTH = 1;

/**
 * ゲーム状態を Vue のリアクティブにし、盤面のシミュレーション・自動投入・自動保存・オフライン進行をまとめて管理する。
 * 盤面 (sim) は毎フレーム大量に書き換わるので、Vue の監視対象から外しておく (markRaw)
 */
export function useGame() {
  const sim = markRaw(new PlinkoSim());
  const state = reactive(loadFromStorage(Date.now()));
  const offlineReport = ref<OfflineResult | null>(null);
  const ballsOnBoard = ref(0);

  function catchUp() {
    const result = advanceOffline(state, Date.now());
    if (result.seconds >= OFFLINE_REPORT_MIN_SECONDS && result.drops > 0) offlineReport.value = result;
  }
  catchUp();

  const nets = computed(() => slotNets(state));
  const perSecond = computed(() => autoDropsPerSecond(state));
  const expectedNet = computed(() => expectedNetPerDrop(state));
  const rescuable = computed(() => canRescue(state, ballsOnBoard.value));
  const upgrades = computed(() =>
    UPGRADE_IDS.map((id) => ({
      id,
      ...UPGRADES[id],
      level: state.upgrades[id],
      cost: upgradeCost(id, state.upgrades[id]),
      maxed: isMaxLevel(state, id),
      affordable: canBuyUpgrade(state, id),
    })),
  );

  /** offset: 盤面の中央からの位置 (釘の間隔を 1 とした単位)。省略すると投入口の中のランダムな位置 */
  function drop(offset?: number): boolean {
    if (state.balls < 1) return false;
    const x = offset ?? (Math.random() * 2 - 1) * DROP_ZONE_HALF_WIDTH;
    if (!sim.drop(Math.min(Math.max(x, -DROP_ZONE_HALF_WIDTH), DROP_ZONE_HALF_WIDTH))) return false;
    takeBall(state);
    return true;
  }

  let autoDropProgress = 0;
  let lastFrame: number | undefined;
  let frameId: number | undefined;
  let saveTimer: number | undefined;

  function frame(now: number) {
    // タブが裏に回ると requestAnimationFrame は止まる。その間の進行は catchUp で期待値として反映する
    const dt = lastFrame === undefined ? 0 : (now - lastFrame) / 1000;
    lastFrame = now;

    autoDropProgress += Math.min(dt, 0.1) * perSecond.value;
    while (autoDropProgress >= 1) {
      autoDropProgress -= 1;
      drop();
    }
    for (const landing of sim.update(dt)) {
      landing.net = landBall(state, landing.slot);
    }
    ballsOnBoard.value = sim.balls.length;
    state.lastUpdate = Date.now();
    frameId = requestAnimationFrame(frame);
  }

  function save() {
    // 落下中のボールは手持ちに戻した状態で保存する (再読み込みで失われないように)
    saveToStorage({ ...state, balls: state.balls + sim.balls.length });
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      save();
    } else {
      catchUp();
      lastFrame = undefined;
    }
  }

  onMounted(() => {
    frameId = requestAnimationFrame(frame);
    saveTimer = window.setInterval(save, AUTOSAVE_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', save);
  });

  onUnmounted(() => {
    if (frameId !== undefined) cancelAnimationFrame(frameId);
    window.clearInterval(saveTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', save);
  });

  function replaceState(next: GameState) {
    sim.clear();
    autoDropProgress = 0;
    Object.assign(state, next);
    save();
  }

  return {
    sim,
    state,
    offlineReport,
    ballsOnBoard,
    nets,
    perSecond,
    expectedNet,
    rescuable,
    upgrades,
    drop,
    buyUpgrade: (id: UpgradeId) => buyUpgrade(state, id),
    rescue: () => {
      if (rescuable.value) rescue(state);
    },
    save,
    exportSave: () => exportSave({ ...state, balls: state.balls + sim.balls.length }),
    /** 成功したら true */
    importSave(text: string): boolean {
      const now = Date.now();
      const imported = importSave(text, now);
      if (!imported) return false;
      // 書き出した時点からの経過分も進める
      advanceOffline(imported, now);
      replaceState(imported);
      return true;
    },
    reset() {
      clearStorage();
      replaceState(createInitialState(Date.now()));
    },
  };
}
