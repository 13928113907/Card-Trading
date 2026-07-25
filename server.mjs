import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(root, "web");
const dataRoot = path.join(webRoot, "data");
const livePath = path.join(dataRoot, "auctions.live.json");
const samplePath = path.join(dataRoot, "auctions.example.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const nodeBin = process.execPath;

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".csv", "text/csv; charset=utf-8"],
]);

let refreshing = false;
let lastRefreshError = "";

async function readJsonWithFallback() {
  try {
    const live = JSON.parse(await fs.readFile(livePath, "utf8"));
    return { ...live, mode: "live", lastRefreshError };
  } catch {
    const sample = JSON.parse(await fs.readFile(samplePath, "utf8"));
    return { ...sample, mode: "sample", lastRefreshError };
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

function runRefresh() {
  if (refreshing) return Promise.resolve({ ok: false, message: "refresh already running" });
  refreshing = true;
  lastRefreshError = "";
  return new Promise((resolve) => {
    const child = spawn(nodeBin, [path.join(root, "scripts", "scrape_auctions.mjs")], {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      refreshing = false;
      if (code === 0) {
        resolve({ ok: true, message: "refresh complete" });
      } else {
        lastRefreshError = stderr.trim() || `refresh exited with ${code}`;
        resolve({ ok: false, message: lastRefreshError });
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/auctions") {
      sendJson(res, 200, await readJsonWithFallback());
      return;
    }
    if (url.pathname === "/api/refresh" && req.method === "POST") {
      sendJson(res, 200, await runRefresh());
      return;
    }
    if (url.pathname === "/api/status") {
      sendJson(res, 200, { refreshing, lastRefreshError });
      return;
    }

    const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const filePath = path.normalize(path.join(webRoot, requested));
    if (!filePath.startsWith(webRoot)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const body = await fs.readFile(filePath);
    res.writeHead(200, {
      "content-type": mime.get(path.extname(filePath)) || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (error) {
    if (error.code === "ENOENT") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(500);
    res.end(error.message);
  }
});

server.listen(port, host, () => {
  console.log(`PTCG PSA10 monitor: http://${host}:${port}`);
});

if (process.env.AUTO_REFRESH === "1") {
  runRefresh();
  setInterval(runRefresh, Number(process.env.REFRESH_MS || 300000));
}
