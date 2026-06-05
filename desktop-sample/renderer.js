// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const statusDot = document.getElementById("statusDot");
const statusTitle = document.getElementById("statusTitle");
const runtimeHint = document.getElementById("runtimeHint");
const transportValue = document.getElementById("transportValue");
const autoValue = document.getElementById("autoValue");
const metaValue = document.getElementById("metaValue");
const statsValue = document.getElementById("statsValue");
const accountName = document.getElementById("accountName");
const accountGreeting = document.getElementById("accountGreeting");
const emojiBox = document.getElementById("emojiBox");
const versionBadge = document.getElementById("versionBadge");
const btnRuntimeQq = document.getElementById("btnRuntimeQq");
const btnRuntimeWx = document.getElementById("btnRuntimeWx");
const btnService = document.getElementById("btnService");
const btnAutoFarm = document.getElementById("btnAutoFarm");
const btnSettings = document.getElementById("btnSettings");
const btnClose = document.getElementById("btnClose");
const btnGithub = document.getElementById("btnGithub");
const btnQqGroup = document.getElementById("btnQqGroup");
const btnSponsor = document.getElementById("btnSponsor");
const sponsorOverlay = document.getElementById("sponsorOverlay");
const btnSponsorClose = document.getElementById("btnSponsorClose");

let latestSnapshot = null;
let serviceActionPending = false;
let autoActionPending = false;
let runtimeActionPending = false;
let settingsActionPending = false;
let uiNotice = "";

function setVersionBadge(version) {
  const text = version ? `v${String(version).trim()}` : "v--";
  versionBadge.textContent = text;
  versionBadge.title = version ? `当前版本 ${text}` : "当前版本未知";
}

function formatUptime(totalSec) {
  const seconds = Math.max(0, Number(totalSec) || 0);
  if (!seconds) return "--";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function setDotState(state) {
  statusDot.className = "dot";
  if (state) statusDot.classList.add(state);
}

function setSelectedRuntime(runtimeKey) {
  const selected = runtimeKey === "wx" ? "wx" : "qq";
  btnRuntimeQq.classList.toggle("on", selected === "qq");
  btnRuntimeWx.classList.toggle("on", selected === "wx");
}

function setButtonState() {
  const snapshot = latestSnapshot;
  const serviceRunning = !!(snapshot && snapshot.service && snapshot.service.running);
  const serviceStarting = !!(snapshot && snapshot.service && snapshot.service.phase === "starting");
  const autoRunning = !!(snapshot && snapshot.autoFarm && snapshot.autoFarm.running);

  btnService.disabled = serviceActionPending || (serviceRunning || serviceStarting
    ? !(snapshot && snapshot.service && snapshot.service.stopSupported)
    : false);
  btnService.textContent = serviceRunning || serviceStarting ? "停止服务" : "启动服务";

  btnAutoFarm.disabled = autoActionPending || !(snapshot && snapshot.service && snapshot.service.running);
  btnAutoFarm.textContent = autoRunning ? "停止自动任务" : "启动自动任务";

  btnRuntimeQq.disabled = runtimeActionPending;
  btnRuntimeWx.disabled = runtimeActionPending;
  btnSettings.disabled = settingsActionPending;
}

function render(snapshot) {
  latestSnapshot = snapshot;
  if (!snapshot || !snapshot.service || !snapshot.gateway || !snapshot.runtime || !snapshot.autoFarm) {
    setDotState("bad");
    statusTitle.textContent = "状态读取失败";
    runtimeHint.textContent = "等待恢复";
    transportValue.textContent = "无法获取状态";
    autoValue.textContent = "无法获取状态";
    metaValue.textContent = uiNotice || "等待重试";
    statsValue.textContent = "--";
    accountName.textContent = "未识别账户";
    accountGreeting.textContent = "等待识别";
    emojiBox.textContent = snapshot && snapshot.shell && snapshot.shell.emoji ? snapshot.shell.emoji : "🌾";
    setVersionBadge(snapshot && snapshot.appVersion);
    setButtonState();
    return;
  }

  const { selection, service, gateway, runtime, autoFarm, account, shell, appVersion } = snapshot;
  const isRunning = service.running === true;
  const isStarting = service.phase === "starting";
  const phaseState = isRunning ? "good" : (isStarting ? "warn" : "bad");

  setDotState(phaseState);
  setSelectedRuntime(selection && selection.runtimeKey);
  emojiBox.textContent = shell && shell.emoji ? shell.emoji : "🌾";
  setVersionBadge(appVersion);

  statusTitle.textContent = isRunning
    ? (service.origin === "external" ? "服务运行中（外部实例）" : "服务运行中")
    : (isStarting ? "服务启动中" : "服务未运行");

  runtimeHint.textContent = isRunning
    ? `当前 ${runtime.runtimeLabel || service.launchModeLabel || "--"}`
    : `待启动 ${selection && selection.runtimeLabel ? selection.runtimeLabel : "--"}`;

  accountName.textContent = account && account.name ? account.name : "未识别账户";
  accountGreeting.textContent = account && account.greeting ? account.greeting : "等待识别";

  transportValue.textContent = [
    runtime.transportLabel || "等待启动",
    runtime.readinessLabel || "",
  ].filter(Boolean).join(" · ");

  autoValue.textContent = [
    autoFarm.stateLabel || "未启动",
    autoFarm.currentTaskLabel && autoFarm.currentTaskLabel !== "当前无任务" ? autoFarm.currentTaskLabel : "",
    autoFarm.schedulerEnabled ? "调度开" : "调度关",
  ].filter(Boolean).join(" · ");

  metaValue.textContent = [
    service.pid ? `PID ${service.pid}` : "PID --",
    `在线 ${formatUptime(gateway.uptimeSec)}`,
    `守护 ${runtime.processGuardPhase || "disabled"}`,
    uiNotice || "",
  ].filter(Boolean).join(" · ");

  statsValue.textContent = `收 ${autoFarm.collectCount || 0} · 偷 ${autoFarm.stealCount || 0} · 帮 ${autoFarm.helpCount || 0}`;
  setButtonState();
}

async function refreshAfterAction() {
  const snapshot = await window.farmDesktop.getSnapshot();
  render(snapshot);
}

async function handleRuntimeSelect(runtimeKey) {
  if (runtimeActionPending) return;
  runtimeActionPending = true;
  setButtonState();
  try {
    const snapshot = await window.farmDesktop.setRuntimeSelection(runtimeKey);
    uiNotice = "";
    render(snapshot);
  } catch (error) {
    uiNotice = error && error.message ? String(error.message) : "切换运行方式失败";
    if (latestSnapshot) render(latestSnapshot);
  } finally {
    runtimeActionPending = false;
    setButtonState();
  }
}

async function handleServiceToggle() {
  if (serviceActionPending) return;
  serviceActionPending = true;
  setButtonState();
  try {
    if (latestSnapshot && latestSnapshot.service && (latestSnapshot.service.running || latestSnapshot.service.phase === "starting")) {
      await window.farmDesktop.stopService();
      uiNotice = "服务已停止";
    } else {
      const runtimeKey = latestSnapshot && latestSnapshot.selection ? latestSnapshot.selection.runtimeKey : "qq";
      await window.farmDesktop.startService(runtimeKey);
      uiNotice = "";
    }
  } catch (error) {
    uiNotice = error && error.message ? String(error.message) : "服务操作失败";
  } finally {
    serviceActionPending = false;
    await refreshAfterAction();
  }
}

async function handleAutoFarmToggle() {
  if (autoActionPending) return;
  autoActionPending = true;
  setButtonState();
  try {
    if (latestSnapshot && latestSnapshot.autoFarm && latestSnapshot.autoFarm.running) {
      await window.farmDesktop.stopAutoFarm();
      uiNotice = "自动任务已停止";
    } else {
      await window.farmDesktop.startAutoFarm();
      uiNotice = "";
    }
  } catch (error) {
    uiNotice = error && error.message ? String(error.message) : "自动任务操作失败";
  } finally {
    autoActionPending = false;
    await refreshAfterAction();
  }
}

async function handleOpenSettings() {
  if (settingsActionPending) return;
  settingsActionPending = true;
  setButtonState();
  try {
    await window.farmDesktop.openSettings();
    uiNotice = "";
  } catch (error) {
    uiNotice = error && error.message ? String(error.message) : "打开配置页面失败";
    if (latestSnapshot) render(latestSnapshot);
  } finally {
    settingsActionPending = false;
    setButtonState();
  }
}

async function handleOpenCommunityLink(linkKey) {
  try {
    await window.farmDesktop.openCommunityLink(linkKey);
    uiNotice = "";
  } catch (error) {
    uiNotice = error && error.message ? String(error.message) : "打开链接失败";
    if (latestSnapshot) render(latestSnapshot);
  }
}

function setSponsorVisible(visible) {
  sponsorOverlay.hidden = !visible;
}

btnRuntimeQq.addEventListener("click", () => {
  void handleRuntimeSelect("qq");
});

btnRuntimeWx.addEventListener("click", () => {
  void handleRuntimeSelect("wx");
});

btnService.addEventListener("click", () => {
  void handleServiceToggle();
});

btnAutoFarm.addEventListener("click", () => {
  void handleAutoFarmToggle();
});

btnSettings.addEventListener("click", () => {
  void handleOpenSettings();
});

btnClose.addEventListener("click", () => {
  void window.farmDesktop.closeWindow();
});

btnGithub.addEventListener("click", () => {
  void handleOpenCommunityLink("github");
});

btnQqGroup.addEventListener("click", () => {
  void handleOpenCommunityLink("qq");
});

btnSponsor.addEventListener("click", () => {
  setSponsorVisible(true);
});

btnSponsorClose.addEventListener("click", () => {
  setSponsorVisible(false);
});

sponsorOverlay.addEventListener("click", (event) => {
  if (event.target === sponsorOverlay) {
    setSponsorVisible(false);
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !sponsorOverlay.hidden) {
    setSponsorVisible(false);
  }
});

window.farmDesktop.onStatus((snapshot) => {
  render(snapshot);
});

window.addEventListener("DOMContentLoaded", async () => {
  await refreshAfterAction();
});
