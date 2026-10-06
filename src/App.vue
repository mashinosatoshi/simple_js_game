<script setup lang="ts">
import BattleBoard from './components/BattleBoard.vue';
import { useBattle } from './composables/useBattle';
import { TEAMS } from './game/battle';
import { formatClock, formatPercent } from './game/format';

const { battle, scores, events, remaining, speed, nextMatchIn, wins, skip, replay } = useBattle();
const SPEEDS = [1, 2, 4];
</script>

<template>
  <main class="layout">
    <header class="header">
      <h1>Color Gate Wars</h1>
      <div class="header-right">
        <span class="clock" :class="{ urgent: remaining <= 30 && !battle.finished }">残り {{ formatClock(remaining) }}</span>
        <div class="speeds" role="group" aria-label="再生速度">
          <button v-for="s in SPEEDS" :key="s" :class="{ active: speed === s }" @click="speed = s">×{{ s }}</button>
        </div>
      </div>
    </header>

    <section class="board-wrap">
      <BattleBoard :battle="battle" />
      <div v-if="battle.finished" class="result">
        <p v-if="battle.winner !== null" class="result-title" :style="{ color: TEAMS[battle.winner]!.color }">
          {{ TEAMS[battle.winner]!.name }}の勝利！
        </p>
        <p v-else class="result-title">引き分け</p>
        <p v-if="nextMatchIn !== null" class="result-sub">次の試合まで {{ Math.ceil(nextMatchIn) }} 秒</p>
        <button @click="replay">もう一度見る</button>
      </div>
    </section>

    <aside class="side">
      <section class="panel">
        <h2>順位</h2>
        <ol class="scores">
          <li v-for="(s, i) in scores" :key="s.team" class="score" :class="{ out: !s.alive }">
            <span class="rank">{{ s.alive ? i + 1 : '-' }}</span>
            <span class="chip" :style="{ background: s.color }"></span>
            <div class="score-body">
              <div class="score-head">
                <strong>{{ s.name }}</strong>
                <span v-if="s.alive">{{ formatPercent(s.share) }}</span>
                <span v-else>脱落</span>
              </div>
              <div class="bar"><div :style="{ width: `${s.share * 100}%`, background: s.color }"></div></div>
              <div v-if="s.alive" class="hp">
                本拠地 <div class="bar thin"><div :style="{ width: `${s.hp * 100}%` }"></div></div>
              </div>
              <div v-if="s.status.length" class="status">{{ s.status.join(' ・ ') }}</div>
            </div>
          </li>
        </ol>
      </section>

      <section class="panel">
        <h2>実況</h2>
        <ul class="events">
          <li v-for="e in events" :key="e.id">
            <span class="event-time">{{ formatClock(Math.floor(e.time)) }}</span>
            <span class="dot" :style="{ background: e.team === null ? 'var(--muted)' : TEAMS[e.team]!.color }"></span>
            {{ e.text }}
          </li>
          <li v-if="events.length === 0" class="muted">試合開始！</li>
        </ul>
      </section>

      <section class="panel">
        <h2>通算勝利数</h2>
        <div class="wins">
          <span v-for="(t, i) in TEAMS" :key="t.name">
            <span class="chip" :style="{ background: t.color }"></span>{{ t.name }} {{ wins[i] }}
          </span>
        </div>
        <p class="muted small">
          試合番号 {{ battle.seed }}（この URL を開くと同じ試合を見られます）
          <button class="link" @click="skip">次の試合へ</button>
        </p>
      </section>

      <details class="panel">
        <summary>ルール</summary>
        <ul class="rules">
          <li>4 隅の本拠地から、各色の砲台が自動で弾を撃ちます。プレイヤーの操作はありません。</li>
          <li>弾は自分の陣地の上を素通りし、敵の陣地に当たると 1 マスごとにパワー（弾の数字）を 1 使って塗り替え、跳ね返ります。</li>
          <li>違う色の弾同士がぶつかると、小さい方のパワーの分だけ両方が削られます。</li>
          <li><strong>×2 / ×4 ゲート</strong>を通るとパワーと大きさが倍増、<strong>分裂ゲート</strong>では弾が 3 つに分かれます。</li>
          <li>アイテム（レ: レーザー、ボ: ボム、巨: 巨大弾、拡: 拡散、盾: シールド）を弾が取ると、その色の次の 1 発が特殊な攻撃になります。</li>
          <li>中央の <strong>RUSH</strong> 穴に入ると、その色は 5 秒間連射します。一度当たると穴はしばらく閉じます。</li>
          <li>本拠地の周りの点線の円を敵に塗られると、本拠地が少しずつ削られます。敵の弾が直接当たるとさらに削られ、0 になると脱落です。</li>
          <li>最後の 1 色になるか、3 分経った時点で陣地が一番広い色の勝ちです。時間とともに弾のパワーが上がっていきます。</li>
        </ul>
      </details>
    </aside>
  </main>
</template>
