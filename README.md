# simple_js_game

上から落としたボールが下の枠に入ると増減する、ブラウザで動くインクリメンタルゲーム。Vue 3 + TypeScript + Vite の SPA を Cloud Run で配信する。

## 構成

```
src/
  game/         ゲームロジック（Vue に依存しない純粋な TypeScript。単体テスト対象）
    state.ts      状態の型・ルール (枠の増減・アップグレード・オフライン進行)
    physics.ts    盤面の物理シミュレーション (釘・壁・ボール)
    save.ts       セーブ/ロード（localStorage・書き出し/読み込み）
    format.ts     数値・時間の表示整形
  composables/
    useGame.ts  ゲームロジックと Vue をつなぐ（ループ・自動投入・自動保存・オフライン進行）
  components/
    PlinkoBoard.vue  盤面を canvas に描画する
  App.vue       画面
server/
  server.js     本番用サーバー。dist/ を配信する（Node 標準モジュールのみ）
```

### 設計ルール

- **ロジックと画面を分ける**: 計算は `src/game/` に書き、Vue 側は状態の表示と関数の呼び出しだけにする。
- **画面を開いている間は物理、閉じている間は期待値**: ページを閉じていた間やタブが裏に回っていた間の自動投入は、`SLOT_PROBABILITIES` を使った期待値でまとめて反映する (`advanceOffline`)。
- **盤面の物理を変えたら確率も更新する**: `physics.ts` の定数を変えると各枠に入る確率が変わる。`physics.test.ts` が `SLOT_PROBABILITIES` とのずれを検出するので、失敗したら計測し直して値を更新する。
- **セーブデータにバージョンを付ける**: `GameState` の形を変えたら `SAVE_VERSION` を上げ、`save.ts` の `deserialize` に旧形式からの移行処理を足す。

## 開発

```sh
npm install
npm run dev        # 開発サーバー (http://localhost:5173、変更が即反映)
npm test           # 単体テスト
npm run typecheck  # 型チェック
```

## 本番相当の確認

```sh
npm run build      # 型チェック + dist/ へ出力
npm start          # dist/ を http://localhost:8080 で配信
```

## Docker

```sh
docker build -t simple-js-game .
docker run --rm -p 8080:8080 simple-js-game
```

`docker build` の中でテストと型チェックを実行するので、どちらかが失敗するとビルドも失敗する。

## デプロイ

`main` ブランチへの push（プルリクエストのマージを含む）で Cloud Build のトリガーが起動し、Dockerfile からビルドして Cloud Run にデプロイする。テストが失敗した場合はデプロイされない。

手動でデプロイする場合:

```sh
gcloud run deploy simple-js-game \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated
```
