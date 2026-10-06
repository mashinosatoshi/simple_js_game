<script setup lang="ts">
import BattleBoard from './components/BattleBoard.vue';
import { useBattle } from './composables/useBattle';
import { TEAMS } from './game/battle';
import { formatClock, formatPercent } from './game/format';

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
      <BattleBoard :battle="battle" />
      <div v-if="battle.finished" class="result">
        <p v-if="battle.winner !== null" class="result-title" :style="{ color: TEAMS[battle.winner]!.color }">
          {{ TEAMS[battle.winner]!.name }} wins!
        </p>
        <p v-else class="result-title">Draw</p>
        <p v-if="nextMatchIn !== null" class="result-sub">Next match in {{ Math.ceil(nextMatchIn) }}s</p>
        <button @click="replay">Watch again</button>
      </div>
    </section>

    <aside class="side">
      <section class="panel">
        <h2>Standings</h2>
        <ol class="scores">
          <li v-for="(s, i) in scores" :key="s.team" class="score" :class="{ out: !s.alive }">
            <span class="rank">{{ s.alive ? i + 1 : '-' }}</span>
            <span class="chip" :style="{ background: s.color }"></span>
            <div class="score-body">
              <div class="score-head">
                <strong>{{ s.name }}</strong>
                <span v-if="s.alive">{{ formatPercent(s.share) }}</span>
                <span v-else>Out</span>
              </div>
              <div class="bar"><div :style="{ width: `${s.share * 100}%`, background: s.color }"></div></div>
              <div v-if="s.alive" class="hp">
                Base <div class="bar thin"><div :style="{ width: `${s.hp * 100}%` }"></div></div>
              </div>
              <div v-if="s.status.length" class="status">{{ s.status.join(' · ') }}</div>
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
          <li>Enemy territory inside the dotted circle around a base wears the base down, and enemy balls that hit the base damage it directly. A color whose base reaches 0 is eliminated.</li>
          <li>There is no time limit. Ball power grows over time, and after 1:30 the dotted circles start expanding (sudden death). The last color standing wins.</li>
        </ul>
      </details>
    </aside>
  </main>
</template>
