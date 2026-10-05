import http from 'node:http';

// Cloud Run は PORT 環境変数でリッスンすべきポートを渡してくる
const PORT = Number(process.env.PORT) || 8080;

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('OK\n');
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Cloud Run はインスタンス停止時に SIGTERM を送るので、受け付け中のリクエストを処理してから終了する
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
