import http from 'node:http';
import { apiMiddleware } from './app.ts';

const port = Number(process.env.PORT) || 3001;

const server = http.createServer((req, res) => {
  apiMiddleware(req, res, () => {
    res.statusCode = 404;
    res.end('Not Found');
  });
});

server.listen(port, () => {
  console.log(`[VocabServer] 后端服务已启动: http://localhost:${port}`);
});

