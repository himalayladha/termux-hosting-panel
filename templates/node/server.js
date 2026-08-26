const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify(
      {
        status: 'online',
        message: 'Hello from Node.js on TermuxPanel!',
        runtime: `Node.js ${process.version}`,
        timestamp: new Date().toISOString(),
        url: req.url
      },
      null,
      2
    )
  );
});

server.listen(PORT, HOST, () => {
  console.log(`[Node.js App] Server listening at http://${HOST}:${PORT}`);
});
