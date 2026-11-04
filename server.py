#!/usr/bin/env python3
"""Notaku self-host server. Python stdlib only, SQLite, no external account.
Run:  python3 server.py --port 3000
Data: ./data/notaku.db (SQLite file, back it up with the JSON export too).
Intended behind your own network: LAN, Tailscale, or Caddy reverse proxy.
No auth by default on purpose for a private LAN; do not expose it directly
to the public internet without Caddy basic_auth / Tailscale in front of it.
"""
import argparse, json, os, sqlite3, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE, "data")
DB = os.path.join(DATA_DIR, "notaku.db")

def db():
    os.makedirs(DATA_DIR, exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute("CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)")
    return c

class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=os.path.join(BASE, "public"), **kw)
    def log_message(self, *a):
        sys.stderr.write("%s\n" % " ".join(str(x) for x in a))
    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        p = urlparse(self.path).path
        if p == "/api/health":
            return self.send_json({"ok": True, "app": "notaku"})
        if p == "/api/notes":
            c = db(); rows = c.execute("SELECT data FROM notes ORDER BY updated_at DESC").fetchall(); c.close()
            return self.send_json([json.loads(r[0]) for r in rows])
        return super().do_GET()
    def do_POST(self):
        p = urlparse(self.path).path
        if p != "/api/notes":
            return self.send_json({"error": "not found"}, 404)
        n = int(self.headers.get("Content-Length") or 0)
        note = json.loads(self.rfile.read(n) or b"{}")
        if not note.get("id"):
            return self.send_json({"error": "id required"}, 400)
        c = db(); c.execute("INSERT INTO notes VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
                            (note["id"], json.dumps(note), int(note.get("updatedAt") or 0))); c.commit(); c.close()
        return self.send_json({"ok": True})
    def do_DELETE(self):
        p = urlparse(self.path).path
        if p.startswith("/api/notes/"):
            nid = p.rsplit("/", 1)[-1]
            c = db(); c.execute("DELETE FROM notes WHERE id=?", (nid,)); c.commit(); c.close()
            return self.send_json({"ok": True})
        return self.send_json({"error": "not found"}, 404)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--port", type=int, default=3000); ap.add_argument("--host", default="0.0.0.0")
    a = ap.parse_args(); db().close()
    print(f"Notaku berjalan di http://{a.host}:{a.port}  (data: {DB})")
    ThreadingHTTPServer((a.host, a.port), H).serve_forever()
