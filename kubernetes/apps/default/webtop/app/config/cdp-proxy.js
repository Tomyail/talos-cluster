const http = require('http');
const net = require('net');

const LISTEN_PORT = parseInt(process.env.PORT || '9223', 10);
const TARGET_HOST = process.env.TARGET_HOST || '127.0.0.1';
const TARGET_PORT = parseInt(process.env.TARGET_PORT || '9222', 10);
const PUBLIC_HOST = process.env.PUBLIC_HOST || 'cdp.tomyail.com';
const PUBLIC_SCHEME = process.env.PUBLIC_SCHEME || 'wss';

function rewritePayload(body) {
  const localHttp = 'http://' + TARGET_HOST + ':' + TARGET_PORT;
  const localWs = 'ws://' + TARGET_HOST + ':' + TARGET_PORT;
  const publicHttp = 'https://' + PUBLIC_HOST;
  const publicWs = PUBLIC_SCHEME + '://' + PUBLIC_HOST;

  return body
    .replaceAll(localWs, publicWs)
    .replaceAll(localHttp, publicHttp)
    .replaceAll('ws://127.0.0.1:9222', publicWs)
    .replaceAll('http://127.0.0.1:9222', publicHttp)
    .replaceAll('ws://localhost:9222', publicWs)
    .replaceAll('http://localhost:9222', publicHttp);
}

function proxyJson(pathname, res) {
  const req = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      path: pathname,
      method: 'GET',
      headers: { Host: TARGET_HOST + ':' + TARGET_PORT },
    },
    (upstream) => {
      let data = '';
      upstream.setEncoding('utf8');
      upstream.on('data', (chunk) => {
        data += chunk;
      });
      upstream.on('end', () => {
        const body = rewritePayload(data);
        res.writeHead(upstream.statusCode || 200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        res.end(body);
      });
    }
  );

  req.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  });

  req.end();
}

function proxyHttp(req, res) {
  const upstream = http.request(
    {
      host: TARGET_HOST,
      port: TARGET_PORT,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: TARGET_HOST + ':' + TARGET_PORT },
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 200, upstreamRes.headers);
      upstreamRes.pipe(res);
    }
  );

  upstream.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(error.message);
  });

  req.pipe(upstream);
}

function connectWebSocket(req, socket) {
  const upstream = net.connect(TARGET_PORT, TARGET_HOST, () => {
    upstream.write(
      req.method + ' ' + req.url + ' HTTP/' + req.httpVersion + '\r\n' +
      Object.entries(req.headers)
        .map(([key, value]) => key + ': ' + value)
        .join('\r\n') +
      '\r\n\r\n'
    );
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
}

const server = http.createServer((req, res) => {
  const pathname = (req.url || '/').split('?')[0];

  if (pathname === '/json/version' || pathname === '/json') {
    proxyJson(req.url || pathname, res);
    return;
  }

  proxyHttp(req, res);
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }

  connectWebSocket(req, socket);
});

server.listen(LISTEN_PORT, '0.0.0.0', () => {
  console.log('cdp-proxy listening on ' + LISTEN_PORT);
});
