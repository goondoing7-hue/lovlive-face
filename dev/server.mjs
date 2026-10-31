// 로컬 점검용 서버: node dev/server.mjs  (http://localhost:3000)
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = process.cwd(), PORT = process.env.PORT || 3000;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) {
    const name = u.pathname.slice(5).replace(/[^a-z_]/gi, "");
    try { const mod = await import(path.join(ROOT, "api", name + ".js")); return mod.default(req, res); }
    catch (e) { res.statusCode = 404; return res.end(String(e)); }
  }
  let f = path.join(ROOT, "public", decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
  if (!f.startsWith(path.join(ROOT, "public")) || !fs.existsSync(f)) { res.statusCode = 404; return res.end("not found"); }
  res.setHeader("Content-Type", MIME[path.extname(f)] || "application/octet-stream"); fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log("http://localhost:" + PORT));
