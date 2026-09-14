import { tryGet } from './state.mjs';
import { newRequestId } from './env.mjs';

/** Node req -> Web fetch Request, preserving body and connection info. */
function toWebRequest(req) {
  const url = `http://${req.headers.host || 'localhost'}${req.url}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else headers.set(k, String(v));
  }
  const method = req.method || 'GET';
  const hasBody = method !== 'GET' && method !== 'HEAD';
  const init = { method, headers };
  if (hasBody) init.body = req;
  init.duplex = 'half';
  return new Request(url, init);
}

let astroHandler = null;

export async function makeHandler({ api }) {
  // Build the Astro SSR entry once.
  const { handler } = await import('../dist/server/entry.mjs');
  astroHandler = handler;

  return async function handle(req, res) {
    const requestId = req.headers['x-request-id'] || newRequestId();
    const start = Date.now();
    const url = req.url || '/';
    const path = url.split('?')[0];

    const log = (status, extra = {}) => {
      process.stdout.write(JSON.stringify({
        ts: new Date().toISOString(),
        request_id: requestId,
        method: req.method,
        path,
        status,
        ms: Date.now() - start,
        ...extra,
      }) + '\n');
    };

    let webReq;
    try {
      webReq = toWebRequest(req);
    } catch (e) {
      log(400, { level: 'error', message: e.message });
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { code: 'bad_request', message: 'That did not work.', request_id: requestId } }));
      return;
    }
    webReq.headers.set('x-request-id', requestId);

    try {
      if (path === '/api/health') {
        const s = tryGet();
        let code = 200;
        if (!s) {
          code = 503;
          res.writeHead(code, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ ok: false, status: 'starting' }));
        } else {
          try {
            await s.db.query('SELECT 1');
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: true, status: 'ok', time: new Date().toISOString() }));
          } catch {
            code = 503;
            res.writeHead(code, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ ok: false, status: 'db_unreachable' }));
          }
        }
        log(code);
        return;
      }

      if (path.startsWith('/api/')) {
        const out = await api.fetch(webReq, { requestId });
        const headers = Object.fromEntries(out.headers.entries());
        // multiple set-cookie must survive
        const setCookies = out.headers.getSetCookie ? out.headers.getSetCookie() : [];
        if (setCookies.length) headers['set-cookie'] = setCookies;
        const body = await out.arrayBuffer();
        res.writeHead(out.status, headers);
        res.end(req.method === 'HEAD' ? undefined : Buffer.from(body));
        log(out.status);
        return;
      }

      // Astro page: the node adapter speaks Node req/res directly.
      req.headers['x-request-id'] = requestId;
      await astroHandler(req, res);
      log(res.statusCode);
    } catch (e) {
      const rid = requestId;
      process.stdout.write(JSON.stringify({
        ts: new Date().toISOString(), request_id: rid, method: req.method, path,
        status: 500, ms: Date.now() - start, level: 'error', message: e.message,
        stack: String(e.stack || '').split('\n').slice(0, 5).join(' | '),
      }) + '\n');
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
      }
      const isApi = path.startsWith('/api/');
      if (isApi && !res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'internal_error', message: `Something went wrong at our end. Reference ${rid}.`, request_id: rid } }));
      } else if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'text/html; charset=utf-8' });
        res.end(errorPage(rid));
      }
    }
  };
}

export function errorPage(requestId) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Something went wrong</title>
<style>body{font-family:system-ui,sans-serif;background:#141414;color:#f4f1ec;margin:0;display:grid;place-items:center;min-height:100vh}main{max-width:32rem;padding:2rem}h1{font-size:1.25rem;font-weight:700}p{line-height:1.5}code{font-family:ui-monospace,monospace}</style></head>
<body><main><h1>Something went wrong at our end.</h1><p>Reference <code>${requestId}</code>. <a href="/" style="color:inherit">Start again</a>.</p></main></body></html>`;
}
