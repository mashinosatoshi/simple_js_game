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
/** 順位の並べ替えの最短間隔。陣地の割合が近い色同士が毎フレーム入れ替わって表示が震えないようにする */
const SORT_INTERVAL_MS = 1000;
const WINS_STORAGE_KEY = 'simple-js-game:wins';

export interface TeamScore {
  team: TeamId;
  name: string;
  color: string;
  /** 陣地の割合 (0〜1) */
  share: number;
  /** 本拠地の残り耐久の割合 (0〜1) */
  hp: number;
  /** 本拠地の残り耐久 (表示用に切り上げた値) */
  hpValue: number;
  alive: boolean;
  /** 最終順位 (1 が優勝)。試合中で決まっていなければ null */
  place: number | null;
  /** 脱落した時刻 (秒) */
  eliminatedAt: number | null;
  /** 状態の表示 (シールド中・連射中・次弾の武器など) */
  status: string[];
}

/** 順位が決まっている色は順位順、まだ戦っている色はその前に陣地の広い順 */
function compareScores(a: TeamScore, b: TeamScore): number {
  return (a.place ?? 0) - (b.place ?? 0) || b.share - a.share;
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

  let order: TeamId[] = [...TEAM_IDS];
  let lastSortAt = -Infinity;
  let lastAliveCount = TEAM_IDS.length;

  function startMatch(seed: number) {
    battle.value = markRaw(new Battle({ seed }));
    nextMatchIn.value = null;
    lastSortAt = -Infinity;
    writeSeedToUrl(seed);
    refresh();
  }

  function refresh() {
    const b = battle.value;
    elapsed.value = b.time;
    events.value = b.events.slice(-6).reverse();
    const all = TEAM_IDS.map((team): TeamScore => {
      const core = b.cores[team]!;
      const status: string[] = [];
      if (core.alive) {
        if (b.time < core.shieldUntil) status.push('Shielded');
        if (b.time < core.rushUntil) status.push('Rapid fire');
        if (core.pendingWeapon) status.push(`Next shot: ${ITEM_LABELS[core.pendingWeapon]}`);
        if (core.zoneDamageRate > 0) status.push(`Base losing ${core.zoneDamageRate.toFixed(1)} HP/s`);
      }
      return {
        team,
        name: TEAMS[team]!.name,
        color: TEAMS[team]!.color,
        share: b.cellCounts[team]! / CELL_COUNT,
        hp: core.hp / CORE_MAX_HP,
        hpValue: Math.ceil(core.hp),
        alive: core.alive,
        place: core.place,
        eliminatedAt: core.eliminatedAt,
        status,
      };
    });
    // 並べ替えは一定間隔ごと。ただし脱落や決着で順位が確定したときはすぐに反映する
    const aliveCount = b.aliveTeams().length;
    const now = performance.now();
    if (now - lastSortAt >= SORT_INTERVAL_MS || aliveCount !== lastAliveCount || b.finished) {
      order = [...all].sort(compareScores).map((s) => s.team);
      lastSortAt = now;
      lastAliveCount = aliveCount;
    }
    scores.value = order.map((team) => all[team]!);
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
