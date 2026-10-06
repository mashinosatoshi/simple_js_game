import { markRaw, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import {
  Battle,
  CELL_COUNT,
  CORE_MAX_HP,
  ITEM_LABELS,
  TEAM_IDS,
  TEAMS,
  type BattleEvent,
  type TeamId,
} from '../game/battle';
import { randomSeed } from '../game/rng';

/** 決着してから次の試合が始まるまでの秒数 */
const NEXT_MATCH_DELAY = 8;
const WINS_STORAGE_KEY = 'simple-js-game:wins';

export interface TeamScore {
  team: TeamId;
  name: string;
  color: string;
  /** 陣地の割合 (0〜1) */
  share: number;
  /** 本拠地の残り耐久の割合 (0〜1) */
  hp: number;
  alive: boolean;
  /** 状態の表示 (シールド中・連射中・次弾の武器など) */
  status: string[];
}

/**
 * 試合 (Battle) を進め、画面に出す情報を毎フレーム取り出す。決着したら少し待って次の試合を自動で始める。
 * 試合のシードは URL の ?seed= に入れるので、URL を開き直すと同じ試合をもう一度見られる
 */
export function useBattle() {
  const battle = shallowRef(markRaw(new Battle({ seed: seedFromUrl() ?? randomSeed() })));
  const scores = shallowRef<TeamScore[]>([]);
  const events = shallowRef<BattleEvent[]>([]);
  const elapsed = ref(0);
  const speed = ref(1);
  const nextMatchIn = ref<number | null>(null);
  const wins = ref(loadWins());

  function startMatch(seed: number) {
    battle.value = markRaw(new Battle({ seed }));
    nextMatchIn.value = null;
    writeSeedToUrl(seed);
    refresh();
  }

  function refresh() {
    const b = battle.value;
    elapsed.value = b.time;
    events.value = b.events.slice(-6).reverse();
    scores.value = TEAM_IDS.map((team) => {
      const core = b.cores[team]!;
      const status: string[] = [];
      if (core.alive) {
        if (b.time < core.shieldUntil) status.push('Shielded');
        if (b.time < core.rushUntil) status.push('Rapid fire');
        if (core.pendingWeapon) status.push(`Next shot: ${ITEM_LABELS[core.pendingWeapon]}`);
        if (core.zoneEnemyCells > 0) status.push('Base under attack');
      }
      return {
        team,
        name: TEAMS[team]!.name,
        color: TEAMS[team]!.color,
        share: b.cellCounts[team]! / CELL_COUNT,
        hp: core.hp / CORE_MAX_HP,
        alive: core.alive,
        status,
      };
    }).sort((a, b) => Number(b.alive) - Number(a.alive) || b.share - a.share);
  }

  let lastFrame: number | undefined;
  let frameId: number | undefined;

  function frame(now: number) {
    // タブが裏に回っている間は requestAnimationFrame が止まり、試合も一時停止する
    const dt = lastFrame === undefined ? 0 : Math.min((now - lastFrame) / 1000, 0.1);
    lastFrame = now;
    const b = battle.value;

    if (!b.finished) {
      b.update(dt * speed.value);
      if (b.finished) {
        if (b.winner !== null) recordWin(b.winner);
        nextMatchIn.value = NEXT_MATCH_DELAY;
      }
    } else if (nextMatchIn.value !== null) {
      nextMatchIn.value -= dt;
      if (nextMatchIn.value <= 0) startMatch(randomSeed());
    }
    refresh();
    frameId = requestAnimationFrame(frame);
  }

  function recordWin(team: TeamId) {
    const next = [...wins.value];
    next[team]!++;
    wins.value = next;
    try {
      localStorage.setItem(WINS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // 保存できない環境では、このページを開いている間だけ数える
    }
  }

  onMounted(() => {
    writeSeedToUrl(battle.value.seed);
    frameId = requestAnimationFrame(frame);
  });

  onUnmounted(() => {
    if (frameId !== undefined) cancelAnimationFrame(frameId);
  });

  return {
    battle,
    scores,
    events,
    elapsed,
    speed,
    nextMatchIn,
    wins,
    /** 今の試合を飛ばして次の試合を始める */
    skip: () => startMatch(randomSeed()),
    /** 今の試合を最初から見直す */
    replay: () => startMatch(battle.value.seed),
  };
}

function seedFromUrl(): number | null {
  const seed = Number(new URLSearchParams(location.search).get('seed'));
  return Number.isInteger(seed) && seed > 0 ? seed : null;
}

function writeSeedToUrl(seed: number) {
  const url = new URL(location.href);
  url.searchParams.set('seed', String(seed));
  history.replaceState(null, '', url);
}

function loadWins(): number[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(WINS_STORAGE_KEY) ?? 'null');
    if (Array.isArray(data) && data.length === 4 && data.every((n) => Number.isInteger(n) && n >= 0)) {
      return data as number[];
    }
  } catch {
    // 壊れたデータは無視して 0 から数える
  }
  return [0, 0, 0, 0];
}
