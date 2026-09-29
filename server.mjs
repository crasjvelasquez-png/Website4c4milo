import { createServer } from 'node:http';
import { readFile, stat, realpath } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createListeningService } from './lib/lastfm.mjs';

const root = fileURLToPath(new URL('./',import.meta.url));
const types = {'.mp3':'audio/mpeg','.wav':'audio/wav','.m4a':'audio/mp4','.ogg':'audio/ogg','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2'};
export function createApp({ directory=resolve(root,'dist'), listening=createListeningService(), } = {}) {
  return createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; frame-src https://open.spotify.com https://w.soundcloud.com https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    const send = (code,body,type='text/plain; charset=utf-8') => {res.writeHead(code,{'Content-Type':type});res.end(req.method==='HEAD' ? undefined : body);};
    if (!['GET','HEAD'].includes(req.method)) {res.setHeader('Allow','GET, HEAD');send(405,'Method not allowed');return;}
    try {
      const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
      if (pathname === '/health') {send(200,'ok');return;}
      if (pathname === '/api/listening') {
        const data = await listening();
        res.setHeader('Cache-Control','no-store');
        send(data.status === 'unavailable' ? 503 : 200,JSON.stringify(data),'application/json; charset=utf-8');return;
      }
      const requested = pathname === '/' ? '/index.html' : pathname;
      if (requested.includes('\0') || requested.includes('\\') || requested.split('/').some(segment=>segment.startsWith('.'))) {send(404,'Not found');return;}
      const path = resolve(directory, `.${requested}`);
      if (!path.startsWith(directory + sep)) {send(404,'Not found');return;}
      const actual = await realpath(path);
      const canonicalDirectory = await realpath(directory);
      if (!actual.startsWith(canonicalDirectory + sep) || !(await stat(actual)).isFile()) {send(404,'Not found');return;}
      const body = await readFile(actual);
      res.setHeader('Cache-Control','no-cache');
      if (types[extname(actual)]?.startsWith('audio/')) {
        res.setHeader('Accept-Ranges','bytes');
        if (req.headers.range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
          let start, end;
          if (match && (match[1] || match[2])) {
            start = match[1] ? Number(match[1]) : Math.max(0, body.length - Number(match[2]));
            end = match[1] ? (match[2] ? Math.min(Number(match[2]),body.length-1) : body.length-1) : body.length-1;
          }
          if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= body.length) {
            res.setHeader('Content-Range',`bytes */${body.length}`);send(416,'Range not satisfiable');return;
          }
          res.setHeader('Content-Range',`bytes ${start}-${end}/${body.length}`);
          res.setHeader('Content-Length',end-start+1);
          send(206,body.subarray(start,end+1),types[extname(actual)]);return;
        }
      }
      res.setHeader('Content-Length',body.length);
      send(200,body,types[extname(actual)] ?? 'application/octet-stream');
    } catch (error) {sendError(res, req, error);}
  });
}
function sendError(res,req,error) {
  if (!res.headersSent) res.writeHead(error instanceof URIError ? 400 : 404,{'Content-Type':'text/plain; charset=utf-8'});
  res.end(req.method==='HEAD' ? undefined : 'Not found');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const content = JSON.parse(await readFile(resolve(root,'content.json'),'utf8'));
  const live = content.listening?.enabled && !content.listening?.demo;
  const server = createApp({listening:createListeningService({username:live ? process.env.LASTFM_USERNAME : '',apiKey:live ? process.env.LASTFM_API_KEY : '',period:content.listening?.period})});
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port,host,()=>console.log(`Artist website: http://${host}:${port}`));
}
