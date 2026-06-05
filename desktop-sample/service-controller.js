// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(PROJECT_ROOT, "data");
const SERVICE_STATE_FILE = path.join(DATA_DIR, "desktop-sample-service.json");
const SETTINGS_FILE = path.join(DATA_DIR, "desktop-sample-settings.json");
const ACCOUNT_CACHE_FILE = path.join(DATA_DIR, "desktop-sample-account.json");

require(path.join(PROJECT_ROOT, "load-env.cjs")).loadEnvFiles(PROJECT_ROOT);

const { getConfig } = require(path.join(PROJECT_ROOT, "src", "config.js"));
const {
  mergeProfileWithFallback,
  profilesMatchIdentity,
  readPlayerProfileCache,
} = require(path.join(PROJECT_ROOT, "src", "player-profile-cache.js"));

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function isWindowsPlatform() {
  return process.platform === "win32";
}

function normalizeRuntimeKey(value) {
  const text = String(value == null ? "" : value).trim().toLowerCase();
  if (["wx", "wechat", "cdp"].includes(text)) return "wx";
  return "qq";
}

function getGatewayConfig() {
  const config = getConfig();
  return {
    host: config.gatewayHost,
    port: config.gatewayPort,
    healthUrl: `http://${config.gatewayHost}:${config.gatewayPort}/api/health`,
    configuredRuntimeTarget: config.runtimeTarget,
  };
}

function resolveLaunchPlan(runtimeKey) {
  const selectedRuntime = normalizeRuntimeKey(runtimeKey);
  if (selectedRuntime === "wx") {
    return {
      key: "wx",
      label: "WX / CDP",
      args: ["run.cjs", "--wx"],
      runtimeTarget: "cdp",
    };
  }
  return {
    key: "qq",
    label: "QQ 轻量模式",
    args: ["run.cjs", "--qq"],
    runtimeTarget: "qq_ws",
  };
}

async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch (_) {
    return fallback;
  }
}

async function readServiceState() {
  return readJsonFile(SERVICE_STATE_FILE, null);
}

async function readSettings() {
  const parsed = await readJsonFile(SETTINGS_FILE, { runtimeKey: "qq" });
  return {
    runtimeKey: normalizeRuntimeKey(parsed && parsed.runtimeKey),
  };
}

async function writeSettings(data) {
  await ensureDataDir();
  const payload = {
    runtimeKey: normalizeRuntimeKey(data && data.runtimeKey),
  };
  await fs.writeFile(SETTINGS_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeServiceState(data) {
  await ensureDataDir();
  await fs.writeFile(SERVICE_STATE_FILE, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readAccountCache() {
  const parsed = await readJsonFile(ACCOUNT_CACHE_FILE, { accounts: {} });
  const accounts = parsed && parsed.accounts && typeof parsed.accounts === "object" ? parsed.accounts : {};
  return {
    accounts: {
      qq: normalizeLockedAccount(accounts.qq),
      wx: normalizeLockedAccount(accounts.wx),
    },
  };
}

async function writeAccountCache(data) {
  await ensureDataDir();
  const payload = {
    accounts: {
      qq: normalizeLockedAccount(data && data.accounts ? data.accounts.qq : null),
      wx: normalizeLockedAccount(data && data.accounts ? data.accounts.wx : null),
    },
  };
  await fs.writeFile(ACCOUNT_CACHE_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function removeServiceState() {
  try {
    await fs.unlink(SERVICE_STATE_FILE);
  } catch (_) {}
}

function isProcessRunning(pid) {
  const targetPid = Number(pid);
  if (!Number.isInteger(targetPid) || targetPid <= 0) return false;
  try {
    process.kill(targetPid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

async function fetchJson(url, init, timeoutMs = 1500) {
  const response = await fetch(url, {
    ...(init && typeof init === "object" ? init : {}),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchHealthSnapshot() {
  const { healthUrl } = getGatewayConfig();
  try {
    return await fetchJson(healthUrl, null, 1500);
  } catch (_) {
    return null;
  }
}

async function fetchPlayerProfileSnapshot() {
  const { healthUrl } = getGatewayConfig();
  const endpoint = healthUrl.replace(/\/api\/health$/, "/api/player-profile");
  try {
    const payload = await fetchJson(endpoint, null, 2000);
    if (!payload || payload.ok !== true || !payload.data || typeof payload.data !== "object") {
      return null;
    }
    return payload.data;
  } catch (_) {
    return null;
  }
}

async function requestAutoFarm(action) {
  const { healthUrl } = getGatewayConfig();
  const endpoint = healthUrl.replace(/\/api\/health$/, "/api/auto-farm");
  const payload = await fetchJson(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  }, 5000).catch((error) => {
    throw new Error(error && error.message ? error.message : `auto-farm ${action} failed`);
  });
  if (!payload || payload.ok !== true) {
    throw new Error(payload && payload.error ? String(payload.error) : `auto-farm ${action} failed`);
  }
  return payload;
}

async function findListeningPid(port) {
  const localPort = Math.max(1, Number(port) || 0);
  if (!localPort) return null;
  if (isWindowsPlatform()) {
    try {
      const { stdout } = await execFileAsync(
        "netstat.exe",
        ["-ano"],
        {
          cwd: PROJECT_ROOT,
          windowsHide: true,
          timeout: 3000,
        },
      );
      const lines = String(stdout || "").split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("TCP")) continue;
        const parts = trimmed.split(/\s+/);
        if (parts.length < 5 || parts[3] !== "LISTENING") continue;
        const localAddress = parts[1] || "";
        const addressMatch = localAddress.match(/:(\d+)$/);
        if (!addressMatch || Number.parseInt(addressMatch[1], 10) !== localPort) continue;
        const parsed = Number.parseInt(parts[4], 10);
        if (Number.isInteger(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  try {
    const { stdout } = await execFileAsync(
      "lsof",
      ["-nP", "-iTCP:" + String(localPort), "-sTCP:LISTEN", "-t"],
      {
        cwd: PROJECT_ROOT,
        timeout: 5000,
      },
    );
    const parsed = Number.parseInt(String(stdout || "").trim().split(/\s+/)[0] || "", 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  } catch (_) {
    return null;
  }
}

function isMissingProcessError(error) {
  const code = error && error.code ? String(error.code) : "";
  if (code === "ESRCH" || code === "ENOENT") return true;
  const detail = String(error && (error.stderr || error.stdout || error.message) || "").toLowerCase();
  return detail.includes("not found")
    || detail.includes("no such process")
    || detail.includes("没有运行的实例")
    || detail.includes("不存在");
}

async function sendProcessSignal(pid, signal) {
  const targetPid = Number(pid);
  if (!Number.isInteger(targetPid) || targetPid === 0) return false;
  try {
    process.kill(targetPid, signal);
    return true;
  } catch (error) {
    if (isMissingProcessError(error)) {
      return false;
    }
    throw error;
  }
}

async function killProcessTree(pid) {
  const targetPid = Number(pid);
  if (!Number.isInteger(targetPid) || targetPid <= 0) return false;
  if (isWindowsPlatform()) {
    try {
      await execFileAsync("taskkill", ["/pid", String(targetPid), "/t", "/f"], {
        cwd: PROJECT_ROOT,
        windowsHide: true,
        timeout: 10000,
      });
      return true;
    } catch (error) {
      if (isMissingProcessError(error)) {
        return false;
      }
      throw error;
    }
  }

  try {
    const signaledGroup = await sendProcessSignal(-targetPid, "SIGTERM");
    const signaledSelf = await sendProcessSignal(targetPid, "SIGTERM");
    if (!signaledGroup && !signaledSelf) {
      return false;
    }
    await delay(300);
    if (!isProcessRunning(targetPid)) {
      return true;
    }
    await sendProcessSignal(-targetPid, "SIGKILL");
    await sendProcessSignal(targetPid, "SIGKILL");
    await delay(200);
    return !isProcessRunning(targetPid);
  } catch (error) {
    if (isMissingProcessError(error)) {
      return false;
    }
    throw error;
  }
}

function isKnownMissingProcessError(error) {
  return isMissingProcessError(error);
}

async function collectServiceCandidates(port, serviceState) {
  const candidates = [];
  if (serviceState && serviceState.pid) {
    candidates.push(Number(serviceState.pid));
  }
  const listeningPid = await findListeningPid(port);
  if (listeningPid) {
    candidates.push(listeningPid);
  }
  return [...new Set(candidates.filter((pid) => Number.isInteger(pid) && pid > 0))];
}

async function waitForHealthState(targetRunning, timeoutMs) {
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || 0);
  let lastHealth = null;
  while (Date.now() < deadline) {
    lastHealth = await fetchHealthSnapshot();
    if (targetRunning ? !!lastHealth : !lastHealth) {
      return lastHealth;
    }
    await delay(500);
  }
  return lastHealth;
}

function formatRuntimeLabel(runtimeTarget) {
  if (runtimeTarget === "qq_ws") return "QQ 路线";
  if (runtimeTarget === "cdp") return "微信 / CDP";
  return "未启动";
}

function findSchedulerTaskLabel(autoFarmState, taskId) {
  const tasks = autoFarmState
    && autoFarmState.scheduler
    && Array.isArray(autoFarmState.scheduler.tasks)
      ? autoFarmState.scheduler.tasks
      : [];
  const matched = tasks.find((item) => item && item.taskId === taskId);
  return matched && matched.label ? String(matched.label) : "";
}

function buildGreetingText(date = new Date()) {
  const hours = Number(date.getHours());
  if (hours < 12) return "上午好";
  if (hours < 18) return "下午好";
  return "晚上好";
}

function toPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeAccountName(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeLockedAccount(profile) {
  const current = profile && typeof profile === "object" ? profile : null;
  if (!current) return null;
  const name = normalizeAccountName(current.name);
  const gid = toPositiveNumber(current.gid);
  const level = toPositiveNumber(current.level);
  const capturedAt = current.capturedAt ? String(current.capturedAt) : null;
  if (!name && gid == null) {
    return null;
  }
  return {
    name: name || null,
    gid,
    level,
    capturedAt: capturedAt || null,
  };
}

function accountsMatchIdentity(left, right) {
  const a = normalizeLockedAccount(left);
  const b = normalizeLockedAccount(right);
  if (!a || !b) return false;
  if (a.gid != null && b.gid != null) {
    return a.gid === b.gid;
  }
  if (a.name && b.name) {
    return a.name === b.name;
  }
  return false;
}

function mergeLockedAccount(baseAccount, overlayAccount) {
  const base = normalizeLockedAccount(baseAccount);
  const overlay = normalizeLockedAccount(overlayAccount);
  if (!base && !overlay) return null;
  if (!base) return overlay;
  if (!overlay) return base;
  return {
    name: base.name || overlay.name || null,
    gid: base.gid != null ? base.gid : overlay.gid,
    level: Math.max(Number(base.level) || 0, Number(overlay.level) || 0) || null,
    capturedAt: base.capturedAt || overlay.capturedAt || new Date().toISOString(),
  };
}

function resolveAccountCacheKey(runtimeKey, resolvedRuntimeTarget) {
  const target = String(resolvedRuntimeTarget || "").trim().toLowerCase();
  if (target === "cdp") return "wx";
  if (target === "qq_ws") return "qq";
  return normalizeRuntimeKey(runtimeKey);
}

function buildTransportSummary(health) {
  if (!health || !health.gateway) {
    return {
      runtimeLabel: "未连接",
      transportLabel: "等待启动",
      readinessLabel: "本地服务未运行",
    };
  }

  const resolvedTarget = String(health.gateway.resolvedRuntimeTarget || health.gateway.runtimeTarget || "").trim().toLowerCase();
  if (resolvedTarget === "qq_ws") {
    return {
      runtimeLabel: formatRuntimeLabel("qq_ws"),
      transportLabel: health.qqWs && health.qqWs.ready ? "QQ 宿主已连接" : "等待 QQ 宿主连接",
      readinessLabel: health.qqWs && health.qqWs.ready ? "自动化链路已就绪" : "网关已启动，宿主未接入",
    };
  }

  return {
    runtimeLabel: formatRuntimeLabel("cdp"),
    transportLabel: health.cdp && health.cdp.connected ? "CDP 已连接" : "等待 CDP 连接",
    readinessLabel: health.cdp && health.cdp.contextReady ? "小游戏上下文已就绪" : "网关已启动，等待上下文",
  };
}

function buildAutoFarmSummary(health) {
  const autoFarm = health && health.autoFarm && typeof health.autoFarm === "object" ? health.autoFarm : null;
  if (!autoFarm) {
    return {
      running: false,
      busy: false,
      stateLabel: "未启动",
      taskLabel: "等待服务启动",
      currentTaskLabel: "当前无任务",
      nextRunAt: null,
      lastEventTime: null,
      lastEventText: "",
      collectCount: 0,
      stealCount: 0,
      helpCount: 0,
      schedulerEnabled: false,
    };
  }

  const runningTaskId = autoFarm.scheduler && autoFarm.scheduler.runningTaskId
    ? String(autoFarm.scheduler.runningTaskId)
    : "";
  const runningTaskLabel = findSchedulerTaskLabel(autoFarm, runningTaskId);
  const recentEvents = Array.isArray(autoFarm.recentEvents) ? autoFarm.recentEvents : [];
  const lastEvent = recentEvents.length > 0 ? recentEvents[recentEvents.length - 1] : null;
  const todayStats = autoFarm.todayStats && typeof autoFarm.todayStats === "object" ? autoFarm.todayStats : {};
  const friendHelpState = autoFarm.friendHelpState && typeof autoFarm.friendHelpState === "object"
    ? autoFarm.friendHelpState
    : {};
  const helpCount = Number.isFinite(Number(friendHelpState.helpCount))
    ? Number(friendHelpState.helpCount)
    : Number(todayStats.help || 0);

  return {
    running: autoFarm.running === true,
    busy: autoFarm.busy === true,
    stateLabel: autoFarm.running === true ? (autoFarm.busy === true ? "运行中" : "已挂机") : "已停止",
    taskLabel: runningTaskLabel || (runningTaskId ? runningTaskId : "当前无任务"),
    currentTaskLabel: runningTaskLabel || (autoFarm.running === true ? "空闲待调度" : "当前无任务"),
    nextRunAt: autoFarm.nextRunAt || null,
    lastEventTime: lastEvent && lastEvent.time ? String(lastEvent.time) : null,
    lastEventText: lastEvent && lastEvent.message ? String(lastEvent.message) : "",
    collectCount: Number(todayStats.collect || 0),
    stealCount: Number(todayStats.steal || 0),
    helpCount: Math.max(0, helpCount || 0),
    schedulerEnabled: !!(autoFarm.scheduler && autoFarm.scheduler.enabled),
  };
}

function buildAccountSummary(profile) {
  const current = normalizeLockedAccount(profile);
  const name = current && current.name ? current.name : "";
  const displayName = name || "";
  return {
    name: displayName || null,
    greeting: buildGreetingText(),
    greetingText: displayName ? `${displayName}，${buildGreetingText()}` : "未识别账户",
    level: current && current.level != null ? current.level : null,
    gid: current && current.gid != null ? current.gid : null,
  };
}

async function resolveLockedAccount({
  runtimeKey,
  resolvedRuntimeTarget,
  runtimeProfile,
  fallbackProfile,
}) {
  const cacheState = await readAccountCache();
  const accountKey = resolveAccountCacheKey(runtimeKey, resolvedRuntimeTarget);
  const lockedAccount = normalizeLockedAccount(cacheState.accounts[accountKey]);
  const fallbackAccount = normalizeLockedAccount(fallbackProfile);
  const runtimeAccount = normalizeLockedAccount(runtimeProfile);
  let selected = lockedAccount;
  let nextLocked = lockedAccount;

  if (lockedAccount) {
    if (fallbackAccount && accountsMatchIdentity(lockedAccount, fallbackAccount)) {
      nextLocked = mergeLockedAccount(nextLocked, fallbackAccount);
    }
    if (runtimeAccount && accountsMatchIdentity(lockedAccount, runtimeAccount)) {
      nextLocked = mergeLockedAccount(nextLocked, runtimeAccount);
    }
    selected = nextLocked;
  } else {
    const seeded = fallbackAccount || runtimeAccount;
    if (seeded) {
      nextLocked = {
        ...seeded,
        capturedAt: seeded.capturedAt || new Date().toISOString(),
      };
      selected = nextLocked;
    }
  }

  if (
    nextLocked &&
    JSON.stringify(nextLocked) !== JSON.stringify(cacheState.accounts[accountKey] || null)
  ) {
    cacheState.accounts[accountKey] = nextLocked;
    await writeAccountCache(cacheState);
  }

  return buildAccountSummary(selected || fallbackAccount || runtimeAccount);
}

async function getSnapshot() {
  const gateway = getGatewayConfig();
  const settings = await readSettings();
  const launchPlan = resolveLaunchPlan(settings.runtimeKey);
  const serviceState = await readServiceState();
  const health = await fetchHealthSnapshot();
  const profile = health ? await fetchPlayerProfileSnapshot() : null;
  const profileCache = await readPlayerProfileCache(PROJECT_ROOT).catch(() => null);

  let ownedPid = serviceState && serviceState.pid ? Number(serviceState.pid) : null;
  let ownedPidAlive = ownedPid ? isProcessRunning(ownedPid) : false;
  if (ownedPid && !ownedPidAlive && !health) {
    await removeServiceState();
    ownedPid = null;
  }

  const externalPid = health ? await findListeningPid(gateway.port) : null;
  if (!ownedPidAlive && ownedPid && externalPid === ownedPid) {
    ownedPidAlive = true;
  }

  const serviceRunning = !!health;
  const servicePhase = serviceRunning ? "running" : (ownedPidAlive ? "starting" : "stopped");
  const origin = serviceRunning
    ? (ownedPidAlive ? "owned" : "external")
    : (ownedPidAlive ? "owned" : "none");
  const transport = buildTransportSummary(health);
  const autoFarm = buildAutoFarmSummary(health);
  const resolvedRuntimeTarget = health && health.gateway ? health.gateway.resolvedRuntimeTarget : null;
  const stableProfile = health && profileCache && profileCache.usableProfile
    ? (
      profile && profilesMatchIdentity(profileCache.usableProfile, profile)
        ? mergeProfileWithFallback(profileCache.usableProfile, profile)
        : profileCache.usableProfile
    )
    : null;
  const account = await resolveLockedAccount({
    runtimeKey: launchPlan.key,
    resolvedRuntimeTarget,
    runtimeProfile: profile,
    fallbackProfile: stableProfile,
  });

  return {
    timestamp: new Date().toISOString(),
    selection: {
      runtimeKey: launchPlan.key,
      runtimeLabel: launchPlan.label,
    },
    service: {
      running: serviceRunning,
      phase: servicePhase,
      origin,
      pid: ownedPidAlive ? ownedPid : externalPid,
      startedAt: serviceState && serviceState.startedAt ? String(serviceState.startedAt) : null,
      launchModeLabel: launchPlan.label,
      stopSupported: serviceRunning || ownedPidAlive,
    },
    gateway: {
      host: gateway.host,
      port: gateway.port,
      configuredRuntimeTarget: gateway.configuredRuntimeTarget,
      healthUrl: gateway.healthUrl,
      uptimeSec: health && Number.isFinite(Number(health.uptimeSec)) ? Number(health.uptimeSec) : 0,
      wsClients: health && Number.isFinite(Number(health.wsClients)) ? Number(health.wsClients) : 0,
    },
    runtime: {
      runtimeLabel: transport.runtimeLabel,
      transportLabel: transport.transportLabel,
      readinessLabel: transport.readinessLabel,
      resolvedRuntimeTarget,
      processGuardPhase: health && health.processGuard ? health.processGuard.phase : "disabled",
      autoFarmRunning: autoFarm.running,
    },
    autoFarm: {
      ...autoFarm,
      runtimeRouteLabel: formatRuntimeLabel(resolvedRuntimeTarget),
    },
    account,
  };
}

async function setRuntimeSelection(runtimeKey) {
  await writeSettings({ runtimeKey });
  return getSnapshot();
}

async function startService(runtimeKey) {
  const before = await getSnapshot();
  if (before.service.running || before.service.phase === "starting") {
    return before;
  }

  const selectedKey = normalizeRuntimeKey(runtimeKey || (before.selection && before.selection.runtimeKey));
  await writeSettings({ runtimeKey: selectedKey });
  const launchPlan = resolveLaunchPlan(selectedKey);
  const child = spawn("node", launchPlan.args, {
    cwd: PROJECT_ROOT,
    env: {
      ...process.env,
      FARM_DESKTOP_SAMPLE_RUNTIME: launchPlan.key,
    },
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });

  await new Promise((resolve, reject) => {
    let settled = false;
    child.once("spawn", () => {
      if (settled) return;
      settled = true;
      resolve();
    });
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });

  child.unref();

  await writeServiceState({
    pid: child.pid,
    startedAt: new Date().toISOString(),
    launchModeLabel: launchPlan.label,
    runtimeTarget: launchPlan.runtimeTarget,
    args: launchPlan.args.slice(1),
  });

  await waitForHealthState(true, 15000);
  return getSnapshot();
}

async function stopService() {
  const gateway = getGatewayConfig();
  const serviceState = await readServiceState();
  const deadline = Date.now() + 15000;
  const killed = new Set();

  while (Date.now() < deadline) {
    const health = await fetchHealthSnapshot();
    const candidates = await collectServiceCandidates(gateway.port, serviceState);

    for (const pid of candidates) {
      if (killed.has(pid)) continue;
      try {
        await killProcessTree(pid);
      } catch (error) {
        if (!isKnownMissingProcessError(error)) {
          throw error;
        }
      }
      killed.add(pid);
    }

    const listeningPid = await findListeningPid(gateway.port);
    if (!health && !listeningPid) {
      await removeServiceState();
      return getSnapshot();
    }

    await delay(500);
  }

  const finalHealth = await fetchHealthSnapshot();
  const finalPid = await findListeningPid(gateway.port);
  if (finalHealth || finalPid) {
    throw new Error(`停止服务失败：端口 ${gateway.port} 仍被占用`);
  }

  await removeServiceState();
  return getSnapshot();
}

async function startAutoFarm() {
  const snapshot = await getSnapshot();
  if (!snapshot.service.running) {
    throw new Error("服务未启动，无法启动自动任务");
  }
  await requestAutoFarm("start");
  await delay(350);
  return getSnapshot();
}

async function stopAutoFarm() {
  const snapshot = await getSnapshot();
  if (!snapshot.service.running) {
    return snapshot;
  }
  await requestAutoFarm("stop");
  await delay(250);
  return getSnapshot();
}

module.exports = {
  getSnapshot,
  setRuntimeSelection,
  startService,
  stopService,
  startAutoFarm,
  stopAutoFarm,
};
