import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
import json

PORT = int(os.environ.get('PORT', 8100))

class FastApiHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "framework": "FastAPI/Python", "swagger": "/docs"}).encode())
        else:
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            html = """
            <!DOCTYPE html>
            <html>
            <head><title>FastAPI Starter</title><style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:40px;text-align:center;}h1{color:#38bdf8;}</style></head>
            <body>
              <h1>⚡ Python FastAPI Starter</h1>
              <p>High-performance Python REST API running live on Android / Termux.</p>
              <p>Endpoints: <code>GET /api/health</code></p>
            </body>
            </html>
            """
            self.wfile.write(html.encode())

print(f"[FastAPI Starter] Listening on http://127.0.0.1:{PORT}")
httpd = HTTPServer(('0.0.0.0', PORT), FastApiHandler)
httpd.serve_forever()
