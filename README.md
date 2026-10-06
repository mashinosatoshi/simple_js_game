# simple_js_game

ブラウザで動くインクリメンタルゲーム。Vue 3 + TypeScript + Vite の SPA を Cloud Run で配信する。

## 構成

```
src/
  game/         ゲームロジック（Vue に依存しない純粋な TypeScript。単体テスト対象）
    state.ts      状態の型・定数・進行計算 (advance, 購入など)
    save.ts       セーブ/ロード（localStorage・書き出し/読み込み）
    format.ts     数値・時間の表示整形
  composables/
    useGame.ts  ゲームロジックと Vue をつなぐ（ループ・自動保存・オフライン進行）
  App.vue       画面
server/
  server.js     本番用サーバー。dist/ を配信する（Node 標準モジュールのみ）
```

### 設計ルール

- **ロジックと画面を分ける**: 計算は `src/game/` に書き、Vue 側は状態の表示と関数の呼び出しだけにする。
- **経過時間で計算する**: 進行は必ず「経過秒数 × 生産量」で計算する (`advance`)。タブが裏に回っても進行がずれない。
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
