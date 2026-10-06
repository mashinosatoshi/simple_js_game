# ---- ビルド用ステージ: テストを通してから静的ファイルを生成する ----
FROM node:24-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
# テストか型チェックが失敗するとイメージのビルドが失敗し、Cloud Run へのデプロイも行われない
RUN npm test && npm run build

# ---- 実行用ステージ: ビルド成果物とサーバーだけを入れる ----
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

# サーバーは Node 標準モジュールだけで動くので npm install は不要。
# package.json は "type": "module" (ESM として実行) を有効にするためにコピーする
COPY package.json ./
COPY server ./server
COPY --from=build /app/dist ./dist

USER node
EXPOSE 8080
CMD ["node", "server/server.js"]
