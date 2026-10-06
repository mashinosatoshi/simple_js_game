<script setup lang="ts">
import BattleBoard from './components/BattleBoard.vue';
import { useBattle } from './composables/useBattle';
import { TEAMS } from './game/battle';
import { formatClock, formatPercent, formatPlace } from './game/format';

const { battle, scores, events, elapsed, speed, nextMatchIn, wins, skip, replay } = useBattle();
const SPEEDS = [1, 2, 4];
</script>

<template>
  <main class="layout">
    <header class="header">
      <h1>Color Gate Wars</h1>
      <div class="header-right">
        <span class="clock" :class="{ urgent: battle.suddenDeath() && !battle.finished }">
          <template v-if="battle.suddenDeath() && !battle.finished">Sudden death </template>{{ formatClock(Math.floor(elapsed)) }}
        </span>
        <div class="speeds" role="group" aria-label="Playback speed">
          <button v-for="s in SPEEDS" :key="s" :class="{ active: speed === s }" @click="speed = s">×{{ s }}</button>
        </div>
      </div>
    </header>

    <section class="board-wrap">
      <div class="board-frame">
        <BattleBoard :battle="battle" />
        <div v-if="battle.finished" class="result">
          <div class="result-card">
            <div
              class="result-head"
              :style="{ background: battle.winner === null ? 'var(--muted)' : TEAMS[battle.winner]!.color }"
            >
              <p class="result-label">{{ battle.winner === null ? 'Result' : 'Winner' }}</p>
              <p class="result-title">{{ battle.winner === null ? 'Draw' : `${TEAMS[battle.winner]!.name} wins!` }}</p>
            </div>
            <ol class="result-ranking">
              <li v-for="s in scores" :key="s.team" :class="{ first: s.place === 1 }">
                <span class="result-place">{{ s.place ? formatPlace(s.place) : '-' }}</span>
                <span class="chip" :style="{ background: s.color }"></span>
                <span class="result-name">{{ s.name }}</span>
                <span class="result-note">
                  {{ s.place === 1 ? 'Last one standing' : s.eliminatedAt !== null ? `Out at ${formatClock(Math.floor(s.eliminatedAt))}` : '' }}
                </span>
              </li>
            </ol>
            <p class="result-sub">
              Match time {{ formatClock(Math.floor(elapsed)) }}
              <template v-if="nextMatchIn !== null"> · Next match in {{ Math.ceil(nextMatchIn) }}s</template>
            </p>
            <div class="result-actions">
              <button @click="replay">Watch again</button>
              <button class="primary" @click="skip">Next match</button>
            </div>
          </div>
        </div>
      </div>
      <p class="board-hint">
        <span class="hint-zone"></span>
        Enemy color inside a base's dotted circle (flashing red) drains that base's HP. A base at 0 HP is eliminated.
      </p>
    </section>

    <aside class="side">
      <section class="panel">
        <h2>Standings</h2>
        <ol class="scores">
          <!-- 行の高さが変わると画面が揺れるので、どの状態でも同じ行数で表示する -->
          <li v-for="(s, i) in scores" :key="s.team" class="score" :class="{ out: !s.alive }">
            <span class="rank">{{ s.place ? formatPlace(s.place) : i + 1 }}</span>
            <span class="chip" :style="{ background: s.color }"></span>
            <div class="score-body">
              <div class="score-head">
                <strong>{{ s.name }}</strong>
                <span v-if="s.place === 1">Winner</span>
                <span v-else-if="s.alive">{{ formatPercent(s.share) }}</span>
                <span v-else>Out</span>
              </div>
              <div class="bar"><div :style="{ width: `${s.share * 100}%`, background: s.color }"></div></div>
              <div class="hp">
                <template v-if="s.alive">
                  <span class="hp-label">Base {{ s.hpValue }}</span>
                  <div class="bar thin"><div :style="{ width: `${s.hp * 100}%` }"></div></div>
                </template>
                <template v-else-if="s.eliminatedAt !== null">Eliminated at {{ formatClock(Math.floor(s.eliminatedAt)) }}</template>
              </div>
              <div class="status">{{ s.status.join(' · ') }}</div>
            </div>
          </li>
        </ol>
      </section>

      <section class="panel">
        <h2>Live feed</h2>
        <ul class="events">
          <li v-for="e in events" :key="e.id">
            <span class="event-time">{{ formatClock(Math.floor(e.time)) }}</span>
            <span class="dot" :style="{ background: e.team === null ? 'var(--muted)' : TEAMS[e.team]!.color }"></span>
            {{ e.text }}
          </li>
          <li v-if="events.length === 0" class="muted">The match has started!</li>
        </ul>
      </section>

      <section class="panel">
        <h2>Total wins</h2>
        <div class="wins">
          <span v-for="(t, i) in TEAMS" :key="t.name">
            <span class="chip" :style="{ background: t.color }"></span>{{ t.name }} {{ wins[i] }}
          </span>
        </div>
        <p class="muted small">
          Match #{{ battle.seed }} (open this URL to watch the same match again)
          <button class="link" @click="skip">Next match</button>
        </p>
      </section>

      <details class="panel">
        <summary>Rules</summary>
        <ul class="rules">
          <li>Each color's cannon fires automatically from its base in a corner. There is nothing to control — just watch.</li>
          <li>Balls pass freely over their own territory. When a ball touches enemy territory, it paints each cell it touches in its own color, using 1 power (the number on the ball) per cell, and bounces back.</li>
          <li>When balls of different colors collide, both lose power equal to the smaller ball's power.</li>
          <li><strong>×2 / ×4 gates</strong> multiply a ball's power and size. A <strong>Split</strong> gate splits a ball into three. Each ball can use only one gate.</li>
          <li>Items power up that color's next shot: <strong>L</strong> Laser, <strong>B</strong> Bomb, <strong>G</strong> Giant ball, <strong>W</strong> Wide (5-way) shot. <strong>S</strong> Shield protects the base for a while.</li>
          <li>A ball that drops into the <strong>RUSH</strong> hole in the center gives its color 5 seconds of rapid fire. The hole then closes for a while.</li>
          <li>
            <strong>How a base loses HP:</strong> every base has 100 HP and a dotted circle around it. Any enemy color inside that circle
            (flashing red) drains the base every second — the more enemy territory inside, the faster. The drain stops when the base is
            shielded or the enemy color is pushed back out. Lasers and enemy balls that reach the base also deal damage.
          </li>
          <li>A color whose base reaches 0 HP is eliminated, and its territory turns gray.</li>
          <li>There is no time limit. Ball power grows over time, and after 1:30 the dotted circles start expanding (sudden death). The last color standing wins.</li>
        </ul>
      </details>
    </aside>
  </main>
</template>
