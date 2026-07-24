#!/usr/bin/env python3
"""Local rembg HTTP server for Sprite Cutter.

Run from the repository root:
  python tools/sprite-cutter/rembg-server.py

Then open the browser tool and click "AI 去背景".
"""

from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import argparse
import cgi
import json
import sys


def load_rembg():
    try:
        from rembg import new_session, remove
    except ImportError:
        print(
            "rembg is not installed. Run: python -m pip install -r tools/sprite-cutter/requirements-rembg.txt",
            file=sys.stderr,
        )
        raise
    return new_session, remove


class RembgHandler(BaseHTTPRequestHandler):
    session = None
    remove = None

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/health":
            self.send_json({"ok": True})
            return
        self.send_error(404)

    def do_POST(self):
        if self.path != "/remove-bg":
            self.send_error(404)
            return

        content_type = self.headers.get("content-type", "")
        if "multipart/form-data" not in content_type:
            self.send_error(400, "Expected multipart/form-data")
            return

        form = cgi.FieldStorage(
            fp=self.rfile,
            headers=self.headers,
            environ={
                "REQUEST_METHOD": "POST",
                "CONTENT_TYPE": content_type,
            },
        )
        file_item = form["image"] if "image" in form else None
        if file_item is None or not getattr(file_item, "file", None):
            self.send_error(400, "Missing image file field")
            return

        source = file_item.file.read()
        try:
            output = type(self).remove(
                source,
                session=type(self).session,
                force_return_bytes=True,
            )
        except Exception as error:
            self.send_json({"ok": False, "error": str(error)}, status=500)
            return

        self.send_response(200)
        self.send_cors_headers()
        self.send_header("Content-Type", "image/png")
        self.send_header("Content-Length", str(len(output)))
        self.end_headers()
        self.wfile.write(output)

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        print("[rembg]", format % args)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=5180)
    args = parser.parse_args()

    new_session, remove = load_rembg()
    RembgHandler.session = new_session("u2net")
    RembgHandler.remove = remove

    server = ThreadingHTTPServer((args.host, args.port), RembgHandler)
    print(f"rembg server running at http://{args.host}:{args.port}")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
