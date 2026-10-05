# simple_js_game

Cloud Run で公開する SPA ゲーム。現在はすべてのリクエストに `200 OK` を返すだけの最小構成。

## ローカル実行

```sh
npm start          # http://localhost:8080
npm run dev        # ファイル変更で自動再起動
```

## Docker で確認

```sh
docker build -t simple-js-game .
docker run --rm -p 8080:8080 simple-js-game
```

## Cloud Run へデプロイ

```sh
gcloud run deploy simple-js-game \
  --source . \
  --region asia-northeast1 \
  --allow-unauthenticated
```

`--source .` を指定すると Cloud Build が Dockerfile からイメージをビルドし、Artifact Registry に保存してからデプロイする。
