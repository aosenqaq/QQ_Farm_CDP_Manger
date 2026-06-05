#!/usr/bin/env node
// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。

const WebSocket = require("ws");

function parseArgs(argv) {
  const out = {
    wsUrl: process.env.FARM_GATEWAY_WS_URL || "ws://127.0.0.1:8787/ws",
    timeoutMs: 180000,
    limit: 4,
    type: "auto",
    dryRunOnly: true,
    betweenLandWait: 0,
    waitAfterOpen: 350,
    waitAfterAction: 500,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--ws-url") out.wsUrl = argv[++i];
    else if (arg === "--timeout-ms") out.timeoutMs = Math.max(1000, Number(argv[++i]) || out.timeoutMs);
    else if (arg === "--limit") out.limit = Math.max(1, Number(argv[++i]) || out.limit);
    else if (arg === "--type") out.type = String(argv[++i] || "auto").trim().toLowerCase();
    else if (arg === "--apply") out.dryRunOnly = false;
    else if (arg === "--dry-run") out.dryRunOnly = true;
    else if (arg === "--between-land-wait") out.betweenLandWait = Math.max(0, Number(argv[++i]) || 0);
    else if (arg === "--wait-after-open") out.waitAfterOpen = Math.max(100, Number(argv[++i]) || out.waitAfterOpen);
    else if (arg === "--wait-after-action") out.waitAfterAction = Math.max(100, Number(argv[++i]) || out.waitAfterAction);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return out;
}

function printHelp() {
  console.log([
    "Usage:",
    "  node scripts/test-auto-fertilize-batch.cjs [--apply] [--type auto|normal|organic] [--limit 4]",
    "",
    "Options:",
    "  --ws-url <url>            gateway websocket url",
    "  --timeout-ms <ms>         per-call timeout",
    "  --limit <n>               max land count to test",
    "  --type <mode>             fertilizer mode",
    "  --apply                   run real batch after dry-run",
    "  --dry-run                 only preview the batch",
    "  --between-land-wait <ms>  interval between lands in batch",
    "  --wait-after-open <ms>    batch open wait",
    "  --wait-after-action <ms>  batch action wait",
  ].join("\n"));
}

class GatewayClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connecting = null;
    this.seq = 0;
    this.pending = new Map();
  }

  async connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      let settled = false;
      this.ws = ws;

      ws.once("open", () => {
        settled = true;
        this.connecting = null;
        resolve();
      });
      ws.once("error", (error) => {
        if (settled) return;
        settled = true;
        this.connecting = null;
        reject(error instanceof Error ? error : new Error(String(error)));
      });
      ws.on("message", (raw) => this._handleMessage(raw));
      ws.on("close", () => this._handleClose(new Error("gateway websocket closed")));
      ws.on("error", (error) => this._handleClose(error instanceof Error ? error : new Error(String(error))));
    });

    return this.connecting;
  }

  _handleMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw));
    } catch (_) {
      return;
    }

    const id = msg && msg.id ? String(msg.id) : "";
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(id);

    if (msg.ok) {
      pending.resolve(msg.result);
      return;
    }
    pending.reject(new Error(msg.error || "gateway request failed"));
  }

  _handleClose(error) {
    const ws = this.ws;
    if (ws) ws.removeAllListeners();
    this.ws = null;
    this.connecting = null;
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  async request(packet, timeoutMs) {
    await this.connect();
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("gateway websocket not connected");
    }

    const id = "fertilize-batch-test-" + (++this.seq);
    const payload = { id, ...packet };

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`gateway websocket timeout (${timeoutMs}ms)`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async call(pathName, args, timeoutMs) {
    return await this.request({
      op: "call",
      path: String(pathName || ""),
      args: Array.isArray(args) ? args : [],
    }, timeoutMs);
  }

  async close() {
    if (!this.ws) return;
    try {
      this.ws.close();
    } catch (_) {}
    this.ws = null;
    this.connecting = null;
  }
}

function asInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

function formatLandState(grid) {
  const landId = Number(grid && grid.landId) || 0;
  const stageKind = String(grid && grid.stageKind || "unknown");
  const matureInSec = grid && grid.matureInSec != null ? Number(grid.matureInSec) : null;
  const canFertilize = !!(grid && grid.canFertilize);
  return `land ${landId}: ${stageKind}${matureInSec != null ? `, matureInSec=${matureInSec}` : ""}${canFertilize ? ", canFertilize" : ""}`;
}

function pickCandidateLands(status, limit) {
  const grids = Array.isArray(status && status.grids) ? status.grids : [];
  return grids
    .filter((grid) => grid && Number(grid.landId) > 0)
    .filter((grid) => (
      grid.stageKind === "growing" &&
      grid.hasPlant === true &&
      grid.hasDirectPlant !== false &&
      grid.occupiedByMultiTilePlant !== true
    ))
    .map((grid) => ({
      landId: Number(grid.landId),
      stageKind: grid.stageKind,
      matureInSec: grid.matureInSec,
      canFertilize: !!grid.canFertilize,
      land: grid,
    }))
    .slice(0, Math.max(1, limit));
}

function printBatchResult(label, payload) {
  console.log(`\n[${label}] ok=${payload && payload.ok === true ? "true" : "false"} action=${payload && payload.action ? payload.action : "unknown"}`);
  console.log(`mode=${payload && payload.resolvedMode ? payload.resolvedMode : payload && payload.mode ? payload.mode : "unknown"} seed=${payload && payload.seedName ? payload.seedName : payload && payload.seedId ? payload.seedId : "unknown"}`);
  console.log(`landIds=${Array.isArray(payload && payload.landIds) ? payload.landIds.join(",") : "n/a"}`);
  console.log(`success=${payload && payload.successCount != null ? payload.successCount : "n/a"} failure=${payload && payload.failureCount != null ? payload.failureCount : "n/a"} skipped=${payload && payload.skippedCount != null ? payload.skippedCount : "n/a"}`);
  if (payload && Array.isArray(payload.results)) {
    payload.results.forEach((item) => {
      const before = item && item.before ? item.before : {};
      const after = item && item.after ? item.after : {};
      console.log(
        `- land ${item && item.landId != null ? item.landId : "?"}: ok=${item && item.ok === true ? "true" : "false"} ` +
        `stage ${before.stageKind || "?"} -> ${after.stageKind || "?"} ` +
        `mature ${before.matureInSec != null ? before.matureInSec : "?"} -> ${after.matureInSec != null ? after.matureInSec : "?"} ` +
        `delta=${item && item.deltaMatureInSec != null ? item.deltaMatureInSec : "n/a"} ` +
        `${item && item.error ? `error=${item.error}` : item && item.reason ? `reason=${item.reason}` : ""}`
      );
    });
  }
}

async function ensureOwnFarm(client, timeoutMs) {
  let ownership = await client.call("gameCtl.getFarmOwnership", [{ silent: true }], timeoutMs);
  if (ownership && ownership.farmType === "own") return ownership;

  try {
    await client.call("gameCtl.enterOwnFarm", [{ silent: true, includeAfterOwnership: true }], timeoutMs);
  } catch (error) {
    console.log(`[info] enterOwnFarm failed once: ${error.message}`);
  }

  ownership = await client.call("gameCtl.getFarmOwnership", [{ silent: true }], timeoutMs);
  if (!ownership || ownership.farmType !== "own") {
    throw new Error("not in own farm");
  }
  return ownership;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const client = new GatewayClient(opts.wsUrl);

  try {
    console.log(`[connect] ${opts.wsUrl}`);
    await client.connect();

    const ownership = await ensureOwnFarm(client, opts.timeoutMs);
    console.log(`[farm] type=${ownership.farmType || "unknown"}`);

    const status = await client.call("gameCtl.getFarmStatus", [{
      silent: true,
      includeGrids: true,
      includeLandIds: false,
    }], opts.timeoutMs);

    const candidates = pickCandidateLands(status, opts.limit);
    console.log(`[scan] candidateCount=${candidates.length}`);
    candidates.forEach((item) => {
      console.log(`[scan] ${formatLandState(item.land)}`);
    });

    if (candidates.length === 0) {
      throw new Error("no eligible growing lands found");
    }

    const landIds = candidates.map((item) => item.landId);
    const batchBase = {
      landIds,
      type: opts.type,
      mode: opts.type,
      dryRun: true,
      betweenLandWait: opts.betweenLandWait,
      waitAfterOpen: opts.waitAfterOpen,
      waitAfterAction: opts.waitAfterAction,
      silent: true,
    };

    const preview = await client.call("gameCtl.fertilizeLandsBatch", [batchBase], opts.timeoutMs);
    printBatchResult("dry-run", preview);

    if (opts.dryRunOnly) {
      console.log("\n[dry-run] finished. Re-run with --apply to execute the real batch.");
      return;
    }

    const apply = await client.call("gameCtl.fertilizeLandsBatch", [{
      ...batchBase,
      dryRun: false,
    }], Math.max(opts.timeoutMs, 300000));
    printBatchResult("apply", apply);

    const after = await client.call("gameCtl.getFarmStatus", [{
      silent: true,
      includeGrids: true,
      includeLandIds: false,
    }], opts.timeoutMs);
    const afterMap = new Map((Array.isArray(after && after.grids) ? after.grids : []).map((grid) => [Number(grid && grid.landId) || 0, grid]));
    console.log("\n[after]");
    landIds.forEach((landId) => {
      const grid = afterMap.get(landId);
      if (!grid) return;
      console.log(`[after] land ${landId}: ${formatLandState(grid)}`);
    });
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`[error] ${error && error.stack ? error.stack : error.message || String(error)}`);
  process.exit(1);
});
