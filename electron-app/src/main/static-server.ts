/**
 * Minimal zero-dependency static file server with live reload.
 *
 * Launched as a child process (via Electron-as-Node) for user projects that
 * have no runnable dev script — plain HTML/CSS/JS sites. It binds to a free
 * port on 127.0.0.1 and prints the resulting URL to stdout so that
 * DevServerManager's URL detection picks it up like any other dev server.
 *
 * Live reload: HTML responses get a small client script injected that opens an
 * SSE connection to /__livereload. A recursive watcher on the served directory
 * broadcasts a reload event on any file change, and the page refreshes itself.
 *
 * Usage: node static-server.js <rootDir> [port]
 *   - rootDir: directory to serve (defaults to cwd)
 *   - port:    port to bind (defaults to 0 → OS picks a free port)
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const LIVERELOAD_PATH = "/__livereload";
const LIVERELOAD_SNIPPET = `
<script>
(function () {
  function connect() {
    var es = new EventSource("${LIVERELOAD_PATH}");
    es.onmessage = function (e) { if (e.data === "reload") location.reload(); };
    es.onerror = function () { es.close(); setTimeout(connect, 1000); };
  }
  connect();
})();
</script>`;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const rootDir = path.resolve(process.argv[2] ?? process.cwd());
const requestedPort = process.argv[3] ? parseInt(process.argv[3], 10) : 0;

function send(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}

function resolveSafe(urlPath: string): string | null {
  // Strip query/hash, decode, and prevent path traversal outside rootDir.
  const decoded = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  const resolved = path.resolve(rootDir, "." + decoded);
  if (resolved !== rootDir && !resolved.startsWith(rootDir + path.sep)) {
    return null;
  }
  return resolved;
}

// Open SSE connections; each gets a "reload" event when a file changes.
const reloadClients = new Set<http.ServerResponse>();

function injectLiveReload(html: Buffer): Buffer {
  const text = html.toString("utf-8");
  const idx = text.toLowerCase().lastIndexOf("</body>");
  const injected =
    idx === -1
      ? text + LIVERELOAD_SNIPPET
      : text.slice(0, idx) + LIVERELOAD_SNIPPET + text.slice(idx);
  return Buffer.from(injected, "utf-8");
}

const server = http.createServer((req, res) => {
  const url = req.url ?? "/";

  if (url.split("?")[0] === LIVERELOAD_PATH) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write("retry: 1000\n\n");
    reloadClients.add(res);
    req.on("close", () => reloadClients.delete(res));
    return;
  }

  const target = resolveSafe(url);
  if (target === null) {
    send(res, 403, "Forbidden");
    return;
  }

  let filePath = target;
  try {
    if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch {
    send(res, 404, "Not Found");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not Found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === ".html" || ext === ".htm";
    const body = isHtml ? injectLiveReload(data) : data;
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(body);
  });
});

server.on("error", (err) => {
  console.error(`[static-server] ${err.message}`);
  process.exit(1);
});

function broadcastReload(): void {
  for (const client of reloadClients) {
    client.write("data: reload\n\n");
  }
}

// Watch the served tree and reload connected pages on any change. Editors emit
// bursts of events per save, so debounce before broadcasting.
function startWatcher(): fs.FSWatcher | null {
  let timer: NodeJS.Timeout | null = null;
  const onChange = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(broadcastReload, 100);
  };
  try {
    return fs.watch(rootDir, { recursive: true }, onChange);
  } catch {
    // Recursive watch unsupported on this platform — fall back to top level.
    try {
      return fs.watch(rootDir, onChange);
    } catch (err) {
      console.error(`[static-server] File watch unavailable: ${String(err)}`);
      return null;
    }
  }
}

let watcher: fs.FSWatcher | null = null;

server.listen(requestedPort, "127.0.0.1", () => {
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : requestedPort;
  watcher = startWatcher();
  console.log(`[static-server] Serving ${rootDir}`);
  console.log(`Listening on http://localhost:${port}`);
});

// Exit cleanly when the parent kills the process group.
function shutdown(): void {
  watcher?.close();
  for (const client of reloadClients) client.end();
  server.close(() => process.exit(0));
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
