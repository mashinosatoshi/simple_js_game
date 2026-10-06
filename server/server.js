import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Cloud Run は PORT 環境変数でリッスンすべきポートを渡してくる
const PORT = Number(process.env.PORT) || 8080;
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const INDEX_HTML = path.join(DIST_DIR, 'index.html');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

/** URL のパスを dist 配下の実ファイルに解決する。dist の外を指すパスや存在しないファイルは null */
async function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const filePath = path.join(DIST_DIR, path.normalize(decoded));
  if (!filePath.startsWith(DIST_DIR + path.sep)) return null;
  try {
    const s = await stat(filePath);
    return s.isFile() ? { filePath, size: s.size } : null;
  } catch {
    return null;
  }
}

function sendFile(req, res, { filePath, size }, status = 200) {
  const ext = path.extname(filePath).toLowerCase();
  // Vite が出力する /assets/ 配下はファイル名にハッシュが付くので長期キャッシュできる。
  // index.html はデプロイのたびに中身が変わるので毎回確認させる
  const cacheControl = filePath.startsWith(path.join(DIST_DIR, 'assets') + path.sep)
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';
  res.writeHead(status, {
    'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
    'Content-Length': size,
    'Cache-Control': cacheControl,
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath)
    .on('error', (err) => {
      console.error(err);
      res.destroy(err);
    })
    .pipe(res);
}

const server = http.createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  const file = await resolveFile(pathname);
  if (file) {
    sendFile(req, res, file);
    return;
  }

  // 拡張子付きのパス (例: /assets/missing.js) は本当に存在しないファイルなので 404。
  // それ以外は SPA のルートとみなして index.html を返す
  if (path.extname(pathname) !== '') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found\n');
    return;
  }

  const index = await resolveFile('/index.html');
  if (!index) {
    console.error(`${INDEX_HTML} not found. Run "npm run build" first.`);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error\n');
    return;
  }
  sendFile(req, res, index);
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// Cloud Run はインスタンス停止時に SIGTERM を送るので、受け付け中のリクエストを処理してから終了する
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});
