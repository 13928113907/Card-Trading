import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(root, "web");
const dataRoot = path.join(webRoot, "data");
const runtimeDataRoot = path.resolve(process.env.DATA_DIR || dataRoot);
const runtimeCaptureRoot = path.resolve(process.env.CAPTURE_DIR || path.join(webRoot, "captures"));
const livePath = path.join(runtimeDataRoot, "auctions.live.json");
const samplePath = path.join(dataRoot, "auctions.example.json");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const nodeBin = process.execPath;
const refreshMs = Number(process.env.REFRESH_MS || 300000);
const refreshTimeoutMs = Number(process.env.REFRESH_TIMEOUT_MS || 240000);
const manualRefreshCooldownMs = Number(process.env.MANUAL_REFRESH_COOLDOWN_MS || 60000);
const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || "https://13928113907.github.io,http://localhost:4173,http://127.0.0.1:4173")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

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
let refreshStartedAt = null;
let refreshCompletedAt = null;
let refreshReason = null;
let refreshRunId = 0;
let refreshResult = null;
let refreshProcess = null;

async function readJsonWithFallback() {
  try {
    const live = JSON.parse(await fs.readFile(livePath, "utf8"));
    return { ...live, mode: "live", lastRefreshError };
  } catch {
    const sample = JSON.parse(await fs.readFile(samplePath, "utf8"));
    return { ...sample, mode: "sample", lastRefreshError };
  }
}

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };
}

function sendJson(req, res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...corsHeaders(req),
  });
  res.end(JSON.stringify(body));
}

function refreshStatus() {
  return {
    refreshing,
    refreshRunId,
    refreshReason,
    refreshResult,
    lastRefreshError,
    refreshStartedAt,
    refreshCompletedAt,
    refreshIntervalSeconds: Math.round(refreshMs / 1000),
  };
}

function runRefresh(reason = "scheduled") {
  if (refreshing) return { accepted: true, alreadyRunning: true, ...refreshStatus() };
  refreshing = true;
  lastRefreshError = "";
  refreshStartedAt = new Date().toISOString();
  refreshCompletedAt = null;
  refreshReason = reason;
  refreshResult = null;
  refreshRunId += 1;
  const currentRunId = refreshRunId;

  refreshProcess = new Promise((resolve) => {
    const child = spawn(nodeBin, [path.join(root, "scripts", "scrape_auctions.mjs")], {
      cwd: root,
      env: {
        ...process.env,
        LIVE_OUTPUT_PATH: livePath,
        CAPTURE_DIR: process.env.CAPTURE_DIR || path.join(root, "web", "captures"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), refreshTimeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      refreshing = false;
      refreshCompletedAt = new Date().toISOString();
      if (code === 0) {
        const output = stdout.trim().split("\n").at(-1) || "";
        let scraperResult = null;
        try {
          scraperResult = JSON.parse(output);
        } catch {
          // Older collectors returned only the output path.
        }
        refreshResult = {
          ok: true,
          message: scraperResult?.message || "refresh complete",
          preserved: Boolean(scraperResult?.preserved),
          output: scraperResult?.outputPath || output,
        };
      } else {
        lastRefreshError =
          stderr.trim() ||
          (code === null ? `refresh exceeded ${Math.round(refreshTimeoutMs / 1000)} seconds` : `refresh exited with ${code}`);
        refreshResult = { ok: false, message: lastRefreshError };
      }
      resolve(refreshResult);
    });
  });
  refreshProcess.finally(() => {
    refreshProcess = null;
  });

  return { accepted: true, alreadyRunning: false, currentRunId, ...refreshStatus() };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, corsHeaders(req));
      res.end();
      return;
    }
    if (url.pathname === "/api/auctions") {
      sendJson(req, res, 200, await readJsonWithFallback());
      return;
    }
    if (url.pathname === "/api/refresh" && req.method === "POST") {
      const lastStartedMs = refreshStartedAt ? new Date(refreshStartedAt).getTime() : 0;
      const cooldownRemainingMs = Math.max(0, manualRefreshCooldownMs - (Date.now() - lastStartedMs));
      if (!refreshing && cooldownRemainingMs > 0) {
        sendJson(req, res, 429, {
          ok: false,
          message: `请在 ${Math.ceil(cooldownRemainingMs / 1000)} 秒后再刷新`,
          cooldownRemainingMs,
          ...refreshStatus(),
        });
        return;
      }
      const result = runRefresh("manual");
      sendJson(req, res, 202, { ok: true, ...result });
      return;
    }
    if (url.pathname === "/api/status") {
      sendJson(req, res, 200, refreshStatus());
      return;
    }
    if (url.pathname === "/healthz") {
      sendJson(req, res, 200, { ok: true });
      return;
    }

    const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const isRuntimeCapture = requested.startsWith("/captures/");
    const staticRoot = isRuntimeCapture ? runtimeCaptureRoot : webRoot;
    const relativePath = isRuntimeCapture ? requested.slice("/captures/".length) : requested;
    const filePath = path.normalize(path.join(staticRoot, relativePath));
    if (!filePath.startsWith(staticRoot)) {
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

if (process.env.AUTO_REFRESH !== "0") {
  fs.mkdir(runtimeDataRoot, { recursive: true })
    .then(() => runRefresh("startup"))
    .catch((error) => {
      lastRefreshError = error.message;
    });
  setInterval(() => runRefresh("scheduled"), refreshMs);
}
