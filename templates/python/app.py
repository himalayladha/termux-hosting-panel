import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
import json
from datetime import datetime

PORT = int(os.environ.get('PORT', 8000))
HOST = os.environ.get('HOST', '127.0.0.1')

class RequestHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        
        response = {
            'status': 'online',
            'message': 'Hello from Python on TermuxPanel!',
            'runtime': f'Python {sys.version.split()[0]}',
            'timestamp': datetime.now().isoformat(),
            'path': self.path
        }
        self.wfile.write(json.dumps(response, indent=2).encode('utf-8'))

    def log_message(self, format, *args):
        # Format log output
        sys.stdout.write("%s - - [%s] %s\n" %
                         (self.address_string(),
                          self.log_date_time_string(),
                          format%args))
        sys.stdout.flush()

if __name__ == '__main__':
    server = HTTPServer((HOST, PORT), RequestHandler)
    print(f"[Python App] Server listening at http://{HOST}:{PORT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
