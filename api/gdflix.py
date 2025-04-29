# /api/gdflix.py (Simplified Debugging Version)
from http.server import BaseHTTPRequestHandler
import json
import time
import sys

print("DEBUG: gdflix.py top-level execution START", file=sys.stderr) # Log very first thing

class handler(BaseHTTPRequestHandler):

    print("DEBUG: handler class definition executed", file=sys.stderr)

    def _set_headers(self, status_code=200, content_type='application/json'):
        print(f"DEBUG: Setting headers, status={status_code}", file=sys.stderr)
        self.send_response(status_code)
        self.send_header('Content-type', content_type)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        print("DEBUG: Headers sent", file=sys.stderr)

    def do_OPTIONS(self):
        print("DEBUG: Handling OPTIONS request", file=sys.stderr)
        self._set_headers(200)

    def do_POST(self):
        start_time = time.time()
        print("DEBUG: Handling POST request START", file=sys.stderr)
        logs = ["Debug log initialized"]
        response_data = {"success": False, "message": "Simplified debug response", "logs": logs}
        status_code = 500 # Default to error

        try:
            content_length = int(self.headers.get('content-length', 0))
            logs.append(f"Content-Length: {content_length}")
            print(f"DEBUG: Reading POST body ({content_length} bytes)", file=sys.stderr)

            if content_length > 0:
                post_body = self.rfile.read(content_length)
                logs.append("Read POST body.")
                print("DEBUG: POST body read.", file=sys.stderr)
                try:
                    # Try decoding for logging, ignore errors
                    logs.append(f"Body snippet: {post_body.decode('utf-8', errors='ignore')[:100]}")
                except Exception:
                     logs.append("Could not decode body snippet for logging.")
            else:
                logs.append("POST body is empty.")

            # Simulate success for testing purposes
            response_data["success"] = True
            response_data["message"] = "Debug endpoint reached successfully!"
            status_code = 200
            logs.append("Simulated success.")
            print("DEBUG: Simulated success, setting status 200", file=sys.stderr)

        except Exception as e:
            error_msg = f"FATAL Handler Error in simplified script: {e}"
            print(error_msg, file=sys.stderr)
            logs.append(error_msg)
            response_data["message"] = "Error in simplified handler."
            status_code = 500

        finally:
            print(f"DEBUG: Preparing final response, status={status_code}", file=sys.stderr)
            response_data["logs"] = logs
            self._set_headers(status_code)
            self.wfile.write(json.dumps(response_data).encode('utf-8'))
            print(f"DEBUG: POST request finished in {time.time() - start_time:.3f}s", file=sys.stderr)

print("DEBUG: gdflix.py top-level execution END", file=sys.stderr)
