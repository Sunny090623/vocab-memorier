import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiMiddleware } from './app.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.resolve(__dirname, '../dist');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.zip': 'application/zip',
  '.mdx': 'application/octet-stream',
  '.mdd': 'application/octet-stream',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string): void {
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Accept-Ranges', 'bytes');

  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
    if (start >= stat.size || end >= stat.size || start > end) {
      res.statusCode = 416;
      res.setHeader('Content-Range', `bytes */${stat.size}`);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Length', stat.size);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

const port = Number(process.env.PORT) || 3001;

const server = http.createServer((req, res) => {
  apiMiddleware(req, res, () => {
    const urlObj = new URL(req.url || '/', `http://localhost:${port}`);
    const decodedPathname = decodeURIComponent(urlObj.pathname);
    const safePath = path.normalize(decodedPathname).replace(/^(\.\.(\/|\\|$))+/, '');
    const candidatePath = path.join(distDir, safePath);

    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      serveStaticFile(req, res, candidatePath);
      return;
    }

    const indexPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexPath) && (req.method === 'GET' || req.method === 'HEAD')) {
      serveStaticFile(req, res, indexPath);
      return;
    }

    res.statusCode = 404;
    res.end('Not Found');
  });
});

server.listen(port, () => {
  console.log(`[VocabServer] 全栈服务已启动 (API + 静态前端): http://localhost:${port}`);
});
