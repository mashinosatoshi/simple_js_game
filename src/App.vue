<script setup lang="ts">
import { ref } from 'vue';
import { useGame } from './composables/useGame';
import { formatDuration, formatNumber } from './game/format';

const game = useGame();
const { state, offlineReport, nextMinerCost, canBuyMiner, perSecond } = game;

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
      <h1>Simple Incremental</h1>
      <p class="coins">{{ formatNumber(state.coins) }} <span class="unit">コイン</span></p>
      <p class="rate">毎秒 +{{ formatNumber(perSecond, true) }}</p>
    </header>

    <div v-if="offlineReport" class="notice" role="status">
      留守の間（{{ formatDuration(offlineReport.seconds) }}）に
      {{ formatNumber(offlineReport.coins) }} コインを獲得しました。
      <button class="link" @click="offlineReport = null">閉じる</button>
    </div>

    <section class="panel">
      <button class="primary big" @click="game.click">コインを掘る (+1)</button>
    </section>

    <section class="panel">
      <h2>施設</h2>
      <div class="building">
        <div>
          <div class="building-name">採掘機 <span class="owned">×{{ state.miners }}</span></div>
          <div class="building-desc">1 台につき毎秒 1 コインを生産</div>
        </div>
        <button class="primary" :disabled="!canBuyMiner" @click="game.buyMiner">
          購入 {{ formatNumber(nextMinerCost) }}
        </button>
      </div>
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
