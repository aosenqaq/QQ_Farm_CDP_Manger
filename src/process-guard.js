// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const {
  closeWindowsByTitle,
  launchByProtocol,
  runShellCommand,
} = process.platform === "win32"
  ? require("./process-guard-windows")
  : require("./process-guard-macos");

const PROCESS_GUARD_RESTART_EXIT_CODE = 75;
const PROCESS_GUARD_WINDOW_MS = 10 * 60 * 1000;

function toBool(value, defaultValue) {
  if (value == null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (!text) return defaultValue;
  if (["1", "true", "yes", "on"].includes(text)) return true;
  if (["0", "false", "no", "off"].includes(text)) return false;
  return defaultValue;
}

function toInt(value, defaultValue, min, max) {
  const n = Number.parseInt(String(value ?? ""), 10);
  const resolved = Number.isFinite(n) ? n : defaultValue;
  return Math.min(max, Math.max(min, resolved));
}

function toStringValue(value, fallback = "") {
  return value == null ? fallback : String(value).trim();
}

function normalizeMatchMode(value, fallback = "contains") {
  const text = String(value == null ? "" : value).trim().toLowerCase();
  return ["exact", "contains"].includes(text) ? text : fallback;
}

function normalizeProcessGuardConfig(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: toBool(src.enabled, false),
    timeoutThreshold: toInt(src.timeoutThreshold, 3, 1, 20),
    monitorIntervalMs: toInt(src.monitorIntervalMs, 3000, 500, 60_000),
    restartPauseSec: toInt(src.restartPauseSec, 15, 0, 600),
    maxRestartsPer10Min: toInt(src.maxRestartsPer10Min, 4, 1, 20),
    commandTimeoutMs: toInt(src.commandTimeoutMs, 30_000, 1000, 300_000),
    qqWindowTitle: toStringValue(src.qqWindowTitle, "QQ经典农场"),
    qqWindowMatchMode: normalizeMatchMode(src.qqWindowMatchMode, "exact"),
    qqLaunchProtocol: toStringValue(src.qqLaunchProtocol, "tencent://ntqq-open/?&subCmd=miniapp&action=openQQMiniApp&actionParams=%7B%22sourceType%22%3A%22open%22%2C%22appId%22%3A%221112386029%22%2C%22hostScene%22%3A%221246700100%22%7D"),
    qqLaunchCommand: toStringValue(src.qqLaunchCommand),
    wxWindowTitle: toStringValue(src.wxWindowTitle, "QQ经典农场"),
    wxWindowMatchMode: normalizeMatchMode(src.wxWindowMatchMode, "contains"),
    wxLaunchProtocol: toStringValue(src.wxLaunchProtocol, "weixin://launchapplet/?app_id=wx5306c5978fdb76e4"),
    wxLaunchCommand: toStringValue(src.wxLaunchCommand),
    wxRestartCommand: toStringValue(src.wxRestartCommand),
  };
}

function toIsoNow() {
  return new Date().toISOString();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function trimRestartWindow(nowMs, restartTimes) {
  const keepAfter = nowMs - PROCESS_GUARD_WINDOW_MS;
  while (restartTimes.length > 0 && restartTimes[0] < keepAfter) {
    restartTimes.shift();
  }
}

function resolveRuntimeTarget(snapshot) {
  const src = snapshot && typeof snapshot === "object" ? snapshot : {};
  const resolved = String(src.resolvedTarget || src.runtimeTarget || src.configuredTarget || "").trim().toLowerCase();
  if (resolved === "qq_ws") return "qq_ws";
  return "cdp";
}

function isHealthySnapshot(snapshot) {
  const src = snapshot && typeof snapshot === "object" ? snapshot : {};
  const runtimeTarget = resolveRuntimeTarget(src);
  if (runtimeTarget === "qq_ws") {
    return !!(src.qqWs && src.qqWs.ready);
  }
  return !!(src.cdp && src.cdp.contextReady);
}

function normalizeErrorMessage(error) {
  return String(error && error.message ? error.message : error || "").trim();
}

function classifyGuardError(error, runtimeTarget) {
  const message = normalizeErrorMessage(error);
  const text = message.toLowerCase();
  if (!text) {
    return {
      isTimeout: false,
      summary: "",
    };
  }
  const qqTimeout = [
    "qq ws runtime not ready within",
    "qq ws call timed out",
    "qq ws runtime not connected",
    "qq ws client disconnected",
  ];
  const wxTimeout = [
    "cdp timeout:",
    "等待小游戏 executioncontextid 超时",
    "小游戏调试桥尚未连接",
    "自动探测 execution context 失败",
  ];
  const genericTimeout = [
    "timed out",
    "timeout",
    "连接超时",
    "网络连接超时",
    "etimedout",
  ];
  const patterns = runtimeTarget === "qq_ws"
    ? qqTimeout.concat(genericTimeout)
    : wxTimeout.concat(genericTimeout);
  const isTimeout = patterns.some((item) => text.includes(item));
  return {
    isTimeout,
    summary: message,
  };
}

async function performRuntimeRestart(config, runtimeTarget) {
  const settings = normalizeProcessGuardConfig(config);
  const timeoutMs = settings.commandTimeoutMs;
  const pauseMs = settings.restartPauseSec * 1000;

  if (runtimeTarget === "qq_ws") {
    const closed = await closeWindowsByTitle(settings.qqWindowTitle, settings.qqWindowMatchMode, timeoutMs);
    if (pauseMs > 0) {
      await delay(pauseMs);
    }
    if (settings.qqLaunchProtocol) {
      const launched = await launchByProtocol(settings.qqLaunchProtocol, timeoutMs);
      return { runtimeTarget, closed, launched };
    }
    if (settings.qqLaunchCommand) {
      const launched = await runShellCommand(settings.qqLaunchCommand, timeoutMs);
      return { runtimeTarget, closed, launched };
    }
    throw new Error("QQ 自动重启缺少 launchProtocol 或 launchCommand");
  }

  const closed = await closeWindowsByTitle(settings.wxWindowTitle, settings.wxWindowMatchMode, timeoutMs);
  if (pauseMs > 0) {
    await delay(pauseMs);
  }
  if (settings.wxLaunchProtocol) {
    const launched = await launchByProtocol(settings.wxLaunchProtocol, timeoutMs);
    return { runtimeTarget, closed, launched };
  }
  if (settings.wxLaunchCommand) {
    const launched = await runShellCommand(settings.wxLaunchCommand, timeoutMs);
    return { runtimeTarget, closed, launched };
  }
  if (settings.wxRestartCommand) {
    const launched = await runShellCommand(settings.wxRestartCommand, timeoutMs);
    return { runtimeTarget, closed, launched };
  }
  throw new Error("微信自动重启缺少 restartCommand、launchProtocol 或 launchCommand");
}

class ProcessGuardManager {
  constructor(options = {}) {
    this.getTransportSnapshot = typeof options.getTransportSnapshot === "function"
      ? options.getTransportSnapshot
      : () => null;
    this.onTriggerRestart = typeof options.onTriggerRestart === "function"
      ? options.onTriggerRestart
      : null;
    this.logger = options.logger && typeof options.logger === "object"
      ? options.logger
      : console;
    this.config = normalizeProcessGuardConfig(options.initialConfig);
    this.timer = null;
    this.restartTimes = [];
    this.state = {
      enabled: this.config.enabled,
      phase: this.config.enabled ? "watching" : "disabled",
      runtimeTarget: "cdp",
      timeoutStreak: 0,
      threshold: this.config.timeoutThreshold,
      lastTimeoutAt: null,
      lastHealthyAt: null,
      lastRestartAt: null,
      lastReason: "",
      lastActionError: "",
      restartCountInWindow: 0,
      maxRestartsPerWindow: this.config.maxRestartsPer10Min,
      circuitOpen: false,
      actionMode: "",
      recentRestartReason: "",
    };
  }

  start() {
    this.stop();
    this._scheduleTick();
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  close() {
    this.stop();
  }

  updateConfig(raw) {
    this.config = normalizeProcessGuardConfig(raw);
    this.state.enabled = this.config.enabled;
    this.state.threshold = this.config.timeoutThreshold;
    this.state.maxRestartsPerWindow = this.config.maxRestartsPer10Min;
    if (!this.config.enabled) {
      this.state.phase = "disabled";
      this.state.timeoutStreak = 0;
      this.state.circuitOpen = false;
      this.state.lastActionError = "";
    } else if (this.state.phase === "disabled") {
      this.state.phase = "watching";
    }
    this._scheduleTick();
    return this.getState();
  }

  getState() {
    const nowMs = Date.now();
    trimRestartWindow(nowMs, this.restartTimes);
    return {
      enabled: this.state.enabled,
      phase: this.state.phase,
      runtimeTarget: this.state.runtimeTarget,
      timeoutStreak: this.state.timeoutStreak,
      threshold: this.state.threshold,
      lastTimeoutAt: this.state.lastTimeoutAt,
      lastHealthyAt: this.state.lastHealthyAt,
      lastRestartAt: this.state.lastRestartAt,
      lastReason: this.state.lastReason,
      lastActionError: this.state.lastActionError,
      restartCountInWindow: this.restartTimes.length,
      maxRestartsPerWindow: this.state.maxRestartsPerWindow,
      circuitOpen: this.state.circuitOpen,
      actionMode: this.state.actionMode,
      recentRestartReason: this.state.recentRestartReason,
      config: this.config,
    };
  }

  noteHealthy(meta = {}) {
    const snapshot = meta.snapshot && typeof meta.snapshot === "object"
      ? meta.snapshot
      : this.getTransportSnapshot();
    this.state.runtimeTarget = resolveRuntimeTarget(snapshot);
    this.state.lastHealthyAt = toIsoNow();
    this.state.lastActionError = "";
    this.state.lastReason = "";
    this.state.timeoutStreak = 0;
    if (!this.config.enabled && this.state.phase === "restarting") {
      this.state.phase = "disabled";
    } else if (this.config.enabled && !this.state.circuitOpen) {
      this.state.phase = "watching";
    }
  }

  async manualRestart(meta = {}) {
    if (!this.onTriggerRestart) {
      throw new Error("未配置进程重启回调");
    }
    if (this.state.phase === "restarting") {
      throw new Error("当前已有重启流程正在进行");
    }
    const snapshot = meta.snapshot && typeof meta.snapshot === "object"
      ? meta.snapshot
      : this.getTransportSnapshot();
    const runtimeTarget = resolveRuntimeTarget(snapshot);
    const reason = normalizeErrorMessage(meta.reason) || "manual restart";
    const nowMs = Date.now();
    trimRestartWindow(nowMs, this.restartTimes);
    this.restartTimes.push(nowMs);
    this.state.runtimeTarget = runtimeTarget;
    this.state.phase = "restarting";
    this.state.lastRestartAt = new Date(nowMs).toISOString();
    this.state.recentRestartReason = reason;
    this.state.lastReason = reason;
    this.state.lastActionError = "";
    this.state.actionMode = runtimeTarget === "qq_ws" ? "qq_restart" : "wx_restart";
    try {
      return await this.onTriggerRestart({
        runtimeTarget,
        reason,
        config: this.config,
        snapshot,
        manual: true,
      });
    } catch (error) {
      this.state.lastActionError = normalizeErrorMessage(error) || "未知重启错误";
      this.state.phase = this.config.enabled && !this.state.circuitOpen ? "degraded" : "disabled";
      throw error;
    }
  }

  noteRuntimeError(error, meta = {}) {
    const snapshot = meta.snapshot && typeof meta.snapshot === "object"
      ? meta.snapshot
      : this.getTransportSnapshot();
    const runtimeTarget = resolveRuntimeTarget(snapshot);
    this.state.runtimeTarget = runtimeTarget;
    const classified = classifyGuardError(error, runtimeTarget);
    if (!classified.isTimeout) {
      return false;
    }
    this.state.lastTimeoutAt = toIsoNow();
    this.state.lastReason = classified.summary;
    this.state.timeoutStreak += 1;
    if (this.config.enabled && !this.state.circuitOpen && this.state.phase !== "restarting") {
      this.state.phase = "degraded";
    }
    this._maybeTriggerRestart(snapshot);
    return true;
  }

  _scheduleTick() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.config.enabled) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this._runTick();
    }, this.config.monitorIntervalMs);
  }

  _runTick() {
    try {
      const snapshot = this.getTransportSnapshot();
      this.state.runtimeTarget = resolveRuntimeTarget(snapshot);
      trimRestartWindow(Date.now(), this.restartTimes);
      if (this.state.circuitOpen && this.restartTimes.length < this.config.maxRestartsPer10Min) {
        this.state.circuitOpen = false;
        if (this.config.enabled && this.state.phase === "circuit_open") {
          this.state.phase = "watching";
          this.state.lastActionError = "";
        }
      }
      if (this.state.phase !== "restarting" && isHealthySnapshot(snapshot)) {
        this.noteHealthy({ snapshot });
      } else if (this.config.enabled && !this.state.circuitOpen && this.state.phase === "watching") {
        this.state.phase = "watching";
      }
    } catch (_) {
      // 忽略守护轮询异常，避免反向放大问题
    } finally {
      this._scheduleTick();
    }
  }

  _maybeTriggerRestart(snapshot) {
    if (!this.config.enabled || this.state.phase === "restarting" || this.state.circuitOpen) {
      return;
    }
    if (this.state.timeoutStreak < this.config.timeoutThreshold) {
      return;
    }
    const nowMs = Date.now();
    trimRestartWindow(nowMs, this.restartTimes);
    if (this.restartTimes.length >= this.config.maxRestartsPer10Min) {
      this.state.circuitOpen = true;
      this.state.phase = "circuit_open";
      this.state.lastActionError = "10 分钟内自动重启次数已达上限";
      return;
    }
    this.state.phase = "restarting";
    this.state.lastRestartAt = new Date(nowMs).toISOString();
    this.state.recentRestartReason = this.state.lastReason;
    this.state.actionMode = this.state.runtimeTarget === "qq_ws" ? "qq_restart" : "wx_restart";
    this.restartTimes.push(nowMs);
    if (!this.onTriggerRestart) {
      this.state.lastActionError = "未配置进程重启回调";
      this.state.circuitOpen = true;
      this.state.phase = "circuit_open";
      return;
    }
    void Promise.resolve()
      .then(() => this.onTriggerRestart({
        runtimeTarget: this.state.runtimeTarget,
        reason: this.state.lastReason,
        config: this.config,
        snapshot,
      }))
      .then(() => {
        // 重启命令已发出，重置 streak 和 phase，等待小程序重连
        // 若小程序成功重连，noteHealthy 会再次确认；若未重连，下轮超时仍可触发重启
        if (this.state.phase === "restarting") {
          this.state.timeoutStreak = 0;
          this.state.phase = this.config.enabled && !this.state.circuitOpen ? "watching" : "disabled";
        }
      })
      .catch((error) => {
        this.state.lastActionError = normalizeErrorMessage(error) || "未知重启错误";
        this.state.phase = this.state.circuitOpen ? "circuit_open" : "degraded";
      });
  }
}

module.exports = {
  PROCESS_GUARD_RESTART_EXIT_CODE,
  ProcessGuardManager,
  classifyGuardError,
  isHealthySnapshot,
  normalizeProcessGuardConfig,
  performRuntimeRestart,
  resolveRuntimeTarget,
};
