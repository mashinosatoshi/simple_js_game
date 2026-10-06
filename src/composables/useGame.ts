import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { clearStorage, exportSave, importSave, loadFromStorage, saveToStorage } from '../game/save';
import {
  advance,
  buyMiner,
  click,
  createInitialState,
  MAX_OFFLINE_SECONDS,
  minerCost,
  productionPerSecond,
  type GameState,
} from '../game/state';

const TICK_INTERVAL_MS = 100;
const AUTOSAVE_INTERVAL_MS = 10_000;
/** これより短い不在ならオフライン報告を出さない */
const OFFLINE_REPORT_MIN_SECONDS = 60;

export interface OfflineReport {
  seconds: number;
  coins: number;
}

/** ゲーム状態を Vue のリアクティブにし、ループ・自動保存・オフライン進行をまとめて管理する */
export function useGame() {
  const state = reactive(loadFromStorage(Date.now()));
  const offlineReport = ref<OfflineReport | null>(null);

  const coinsBefore = state.coins;
  const offlineSeconds = advance(state, Date.now(), MAX_OFFLINE_SECONDS);
  if (offlineSeconds >= OFFLINE_REPORT_MIN_SECONDS) {
    offlineReport.value = { seconds: offlineSeconds, coins: state.coins - coinsBefore };
  }

  const nextMinerCost = computed(() => minerCost(state.miners));
  const canBuyMiner = computed(() => state.coins >= nextMinerCost.value);
  const perSecond = computed(() => productionPerSecond(state));

  const save = () => saveToStorage(state);
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') save();
  };

  let tickTimer: number | undefined;
  let saveTimer: number | undefined;

  onMounted(() => {
    tickTimer = window.setInterval(() => advance(state, Date.now()), TICK_INTERVAL_MS);
    saveTimer = window.setInterval(save, AUTOSAVE_INTERVAL_MS);
    // タブを閉じる・裏に回すときにも保存しておく
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', save);
  });

  onUnmounted(() => {
    window.clearInterval(tickTimer);
    window.clearInterval(saveTimer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', save);
  });

  function replaceState(next: GameState) {
    Object.assign(state, next);
    save();
  }

  return {
    state,
    offlineReport,
    nextMinerCost,
    canBuyMiner,
    perSecond,
    click: () => click(state),
    buyMiner: () => buyMiner(state),
    save,
    exportSave: () => exportSave(state),
    /** 成功したら true */
    importSave(text: string): boolean {
      const imported = importSave(text);
      if (!imported) return false;
      // 書き出した時点からの経過分も進める
      advance(imported, Date.now(), MAX_OFFLINE_SECONDS);
      replaceState(imported);
      return true;
    },
    reset() {
      clearStorage();
      replaceState(createInitialState(Date.now()));
    },
  };
}
