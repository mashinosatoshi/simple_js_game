# simple_js_game

4 色が自動で陣地を奪い合うのを眺めるゲーム「Color Gate Wars」。プレイヤーの操作はない。Vue 3 + TypeScript + Vite の SPA を Cloud Run で配信する。

各色の砲台が撃つ弾は、敵の陣地を塗り替えながら跳ね返る。戦場の中にある倍率ゲート・アイテム・大当たり穴がランダムに弾を強化するので、抽選と陣取りが 1 つの画面の中で起きる。ルールの詳細は画面の「ルール」欄を参照。

## 構成

```
src/
  game/         ゲームロジック（Vue に依存しない純粋な TypeScript。単体テスト対象）
    battle.ts     試合のシミュレーション (陣地のマス・弾・砲台・ゲート・アイテム・勝敗)
    rng.ts        シード付き乱数
    format.ts     時間・割合の表示整形
  composables/
    useBattle.ts  試合を進めて画面用の情報を取り出す（自動リスタート・勝利数の記録）
  components/
    BattleBoard.vue  戦場を canvas に描画する
  App.vue       画面
server/
  server.js     本番用サーバー。dist/ を配信する（Node 標準モジュールのみ）
```

### 設計ルール

- **ロジックと画面を分ける**: 計算は `src/game/` に書き、Vue 側は状態の表示だけにする。
- **乱数は必ず `Battle` の乱数から取る**: `Math.random()` を混ぜると、同じシードで同じ試合を再現できなくなる。試合のシードは URL の `?seed=` に入る。
- **バランス調整は `battle.ts` 先頭の定数で行う**: 弾のパワー、連射間隔、本拠地の耐久、ゲートやアイテムの効果などはすべて定数にまとめてある。

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
