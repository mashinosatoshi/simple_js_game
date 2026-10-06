<script setup lang="ts">
import { ref } from 'vue';
import PlinkoBoard from './components/PlinkoBoard.vue';
import { DROP_ZONE_HALF_WIDTH, useGame } from './composables/useGame';
import { formatDuration, formatNet, formatNumber } from './game/format';

const game = useGame();
const { state, offlineReport, ballsOnBoard, nets, perSecond, expectedNet, rescuable, upgrades } = game;

const saveText = ref('');
const saveMessage = ref('');

function onExport() {
  game.save();
  saveText.value = game.exportSave();
  saveMessage.value = 'セーブデータを書き出しました。テキストをコピーして保管してください。';
}

function onImport() {
  saveMessage.value = game.importSave(saveText.value)
    ? 'セーブデータを読み込みました。'
    : '読み込めませんでした。テキストが正しいか確認してください。';
}

function onReset() {
  if (!confirm('進行状況をすべて消去します。よろしいですか？')) return;
  game.reset();
  saveText.value = '';
  saveMessage.value = 'リセットしました。';
}
</script>

<template>
  <main class="container">
    <header class="header">
      <h1>Ball Drop</h1>
      <p class="balls">{{ formatNumber(state.balls) }} <span class="unit">個</span></p>
      <p class="sub">
        落下中 {{ ballsOnBoard }} 個
        <template v-if="perSecond > 0"> ・ 自動 {{ formatNumber(perSecond, true) }} 個/秒</template>
      </p>
    </header>

    <div v-if="offlineReport" class="notice" role="status">
      留守の間（{{ formatDuration(offlineReport.seconds) }}）に自動で {{ formatNumber(offlineReport.drops) }} 個落とし、
      ボールが {{ formatNet(offlineReport.gain) }} 個になりました。
      <button class="link" @click="offlineReport = null">閉じる</button>
    </div>

    <section class="panel board-panel">
      <PlinkoBoard :sim="game.sim" :nets="nets" :zone-half-width="DROP_ZONE_HALF_WIDTH" @drop="game.drop" />
      <button v-if="rescuable" class="primary big" @click="game.rescue">ボールがなくなりました。5 個もらう</button>
      <button v-else class="primary big" :disabled="state.balls < 1" @click="game.drop()">ボールを落とす</button>
      <p class="hint">盤面をタップすると、その位置から落とせます。1 個ずつ落としたときの平均: {{ formatNet(expectedNet, true) }} 個（たくさん同時に落とすと端に散りやすくなります）</p>
    </section>

    <section class="panel">
      <h2>アップグレード</h2>
      <ul class="upgrades">
        <li v-for="u in upgrades" :key="u.id" class="upgrade">
          <div>
            <div class="upgrade-name">
              {{ u.name }} <span class="level">Lv {{ u.level }}<template v-if="u.maxed"> (最大)</template></span>
            </div>
            <div class="upgrade-desc">{{ u.description }}</div>
          </div>
          <button class="primary" :disabled="!u.affordable" @click="game.buyUpgrade(u.id)">
            {{ u.maxed ? '最大' : `${formatNumber(u.cost)} 個` }}
          </button>
        </li>
      </ul>
    </section>

    <section class="panel stats">
      <div>最高所持数 <strong>{{ formatNumber(state.bestBalls) }}</strong></div>
      <div>落とした数 <strong>{{ formatNumber(state.totalDrops) }}</strong></div>
    </section>

    <details class="panel">
      <summary>セーブデータ</summary>
      <p class="hint">
        進行状況はこのブラウザに自動保存されます。別の端末へ移すときやバックアップには書き出しを使ってください。
      </p>
      <textarea v-model="saveText" rows="3" placeholder="ここにセーブデータを貼り付けて「読み込み」"></textarea>
      <div class="actions">
        <button @click="onExport">書き出し</button>
        <button @click="onImport">読み込み</button>
        <button class="danger" @click="onReset">リセット</button>
      </div>
      <p v-if="saveMessage" class="hint">{{ saveMessage }}</p>
    </details>
  </main>
</template>
