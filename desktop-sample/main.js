// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const path = require("node:path");
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, nativeTheme, shell } = require("electron");

const serviceController = require("./service-controller");

let mainWindow = null;
let settingsWindow = null;
let tray = null;
let statusTimer = null;
let isQuitting = false;
let quitCleanupStarted = false;
let latestSnapshot = null;
let trayIconImage = null;
const DEFAULT_SHELL_EMOJI = "🌾";
const TRAY_ICON_PATH = path.resolve(__dirname, "..", "gameConfig", "plant_images", "default", "400.jpg");
const APP_USER_MODEL_ID = "qq-farm-cdp-auto.desktop-sample";
const APP_VERSION = require(path.resolve(__dirname, "..", "package.json")).version || app.getVersion();
const COMMUNITY_LINKS = {
  github: "https://github.com/aosenqaq/qq-farm-cdp-auto",
  qq: "https://qm.qq.com/q/L2nAFSXJ0u",
};

function runDetached(task) {
  void Promise.resolve()
    .then(task)
    .catch(() => {});
}

function buildTrayIcon() {
  let image = null;
  image = nativeImage.createFromPath(TRAY_ICON_PATH);
  if (image.isEmpty()) {
    image = null;
  }
  if (!image) {
    image = nativeImage.createFromDataURL(
      `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
          <rect x="6" y="6" width="52" height="52" rx="18" fill="#17212d"/>
          <text x="32" y="42" text-anchor="middle" font-size="30">${DEFAULT_SHELL_EMOJI}</text>
        </svg>
      `.trim())}`,
    );
  }
  const targetSize = process.platform === "win32"
    ? { width: 16, height: 16, quality: "best" }
    : { width: 18, height: 18, quality: "best" };
  const resized = image.resize(targetSize);
  return resized.isEmpty() ? image : resized;
}

function hasTray() {
  return !!tray && !tray.isDestroyed();
}

async function ensureTray() {
  if (hasTray()) return tray;
  await createTray();
  return tray;
}

function decorateSnapshot(snapshot) {
  const base = snapshot && typeof snapshot === "object" ? { ...snapshot } : {};
  return {
    ...base,
    appVersion: APP_VERSION,
    shell: {
      emoji: DEFAULT_SHELL_EMOJI,
    },
  };
}

function getConfigPageUrl(snapshot) {
  const source = snapshot && snapshot.gateway ? snapshot.gateway : null;
  const host = source && source.host ? source.host : "127.0.0.1";
  const port = source && source.port ? source.port : 8787;
  return `http://${host}:${port}/`;
}

async function loadSettingsWindowContent() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  const snapshot = latestSnapshot || await serviceController.getSnapshot();
  if (snapshot && snapshot.service && snapshot.service.running) {
    await settingsWindow.loadURL(getConfigPageUrl(snapshot));
    return;
  }
  const html = `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="UTF-8" />
      <title>配置页面</title>
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
          background: linear-gradient(180deg, #0f1720, #162434);
          color: rgba(247,250,255,0.94);
        }
        .card {
          width: min(520px, calc(100vw - 48px));
          padding: 28px;
          border-radius: 24px;
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 18px 50px rgba(0,0,0,0.24);
        }
        h1 { margin: 0 0 12px; font-size: 24px; }
        p { margin: 0; line-height: 1.7; color: rgba(220,229,242,0.8); }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>配置页面暂不可用</h1>
        <p>本地服务尚未启动。请先在悬浮窗或托盘菜单中启动服务，然后再次打开配置页面。</p>
      </div>
    </body>
    </html>
  `;
  await settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

async function openSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    await loadSettingsWindowContent();
    return true;
  }

  settingsWindow = new BrowserWindow({
    width: 1240,
    height: 860,
    minWidth: 960,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: "#0f1720",
    title: "Farm 配置页面",
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
    },
  });

  settingsWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideSettingsWindow();
  });

  settingsWindow.on("minimize", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideSettingsWindow();
  });

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });

  await loadSettingsWindowContent();
  return true;
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  runDetached(() => ensureTray());
  mainWindow.show();
  mainWindow.focus();
}

function hideMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  runDetached(() => ensureTray());
  mainWindow.hide();
}

function hideSettingsWindow() {
  if (!settingsWindow || settingsWindow.isDestroyed()) return;
  runDetached(() => ensureTray());
  settingsWindow.hide();
}

async function rebuildTrayMenu() {
  if (!hasTray()) return;
  const snapshot = latestSnapshot || await serviceController.getSnapshot().catch(() => null);
  const serviceRunning = !!(snapshot && snapshot.service && snapshot.service.running);
  const serviceStarting = !!(snapshot && snapshot.service && snapshot.service.phase === "starting");
  const autoFarmRunning = !!(snapshot && snapshot.autoFarm && snapshot.autoFarm.running);

  const menu = Menu.buildFromTemplate([
    {
      label: "显示悬浮窗",
      click: () => {
        showMainWindow();
      },
    },
    {
      label: "设置",
      submenu: [
        {
          label: serviceRunning || serviceStarting ? "停止服务" : "启动服务",
          click: () => {
            runDetached(async () => {
              if (serviceRunning || serviceStarting) {
                await serviceController.stopService();
              } else {
                const runtimeKey = snapshot && snapshot.selection ? snapshot.selection.runtimeKey : "qq";
                await serviceController.startService(runtimeKey);
              }
              await pushStatus();
            });
          },
        },
        {
          label: autoFarmRunning ? "停止自动任务" : "启动自动任务",
          enabled: serviceRunning,
          click: () => {
            runDetached(async () => {
              if (autoFarmRunning) {
                await serviceController.stopAutoFarm();
              } else {
                await serviceController.startAutoFarm();
              }
              await pushStatus();
            });
          },
        },
        { type: "separator" },
        {
          label: "打开配置页面",
          click: () => {
            runDetached(async () => {
              await openSettingsWindow();
            });
          },
        },
      ],
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  const title = snapshot && snapshot.service && snapshot.service.running
    ? `Farm 悬浮窗 - ${snapshot.runtime && snapshot.runtime.runtimeLabel ? snapshot.runtime.runtimeLabel : "运行中"}`
    : "Farm 悬浮窗 - 未启动";
  tray.setToolTip(title);
}

async function pushStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    latestSnapshot = decorateSnapshot(await serviceController.getSnapshot());
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:status", latestSnapshot);
    }
  } catch (error) {
    latestSnapshot = decorateSnapshot({
      timestamp: new Date().toISOString(),
      appVersion: APP_VERSION,
      selection: {
        runtimeKey: "qq",
        runtimeLabel: "QQ 轻量模式",
      },
      service: {
        running: false,
        phase: "stopped",
        origin: "none",
        pid: null,
        startedAt: null,
        launchModeLabel: "QQ 轻量模式",
        stopSupported: false,
      },
      gateway: {
        host: "127.0.0.1",
        port: 8787,
        configuredRuntimeTarget: "cdp",
        healthUrl: "http://127.0.0.1:8787/api/health",
        uptimeSec: 0,
        wsClients: 0,
      },
      runtime: {
        runtimeLabel: "读取失败",
        transportLabel: String(error && error.message ? error.message : error || ""),
        readinessLabel: "桌面悬浮窗无法获取状态",
        resolvedRuntimeTarget: null,
        processGuardPhase: "disabled",
        autoFarmRunning: false,
      },
      autoFarm: {
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
        runtimeRouteLabel: "未启动",
      },
      account: {
        name: null,
        greeting: "上午好",
        greetingText: "未识别账户",
        level: null,
        gid: null,
      },
    });
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:status", latestSnapshot);
    }
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    const currentUrl = String(settingsWindow.webContents.getURL() || "");
    if (latestSnapshot && latestSnapshot.service && latestSnapshot.service.running && currentUrl.startsWith("data:")) {
      await loadSettingsWindowContent().catch(() => {});
    }
  }
  await rebuildTrayMenu();
}

function startStatusLoop() {
  stopStatusLoop();
  statusTimer = setInterval(() => {
    void pushStatus();
  }, 2000);
}

function stopStatusLoop() {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
}

async function createTray() {
  if (hasTray()) return tray;
  trayIconImage = buildTrayIcon();
  tray = new Tray(trayIconImage);
  tray.on("destroyed", () => {
    tray = null;
    trayIconImage = null;
  });
  tray.on("click", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isVisible()) {
      hideMainWindow();
    } else {
      showMainWindow();
    }
  });
  tray.setImage(trayIconImage);
  await rebuildTrayMenu();
  return tray;
}

function createWindow() {
  nativeTheme.themeSource = "system";

  mainWindow = new BrowserWindow({
    width: 428,
    height: 386,
    minWidth: 428,
    minHeight: 386,
    maxWidth: 428,
    maxHeight: 386,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: true,
    roundedCorners: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    title: "Farm Float Sample",
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, "screen-saver");
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.show();

  mainWindow.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideMainWindow();
  });

  mainWindow.on("minimize", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideMainWindow();
  });

  mainWindow.on("closed", () => {
    stopStatusLoop();
    mainWindow = null;
  });

  mainWindow.webContents.once("did-finish-load", () => {
    void pushStatus();
    startStatusLoop();
  });
}

app.whenReady().then(async () => {
  app.setAppUserModelId(APP_USER_MODEL_ID);
  createWindow();
  await createTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      return;
    }
    showMainWindow();
  });
});

app.on("before-quit", (event) => {
  isQuitting = true;
  if (quitCleanupStarted) {
    return;
  }
  event.preventDefault();
  quitCleanupStarted = true;
  isQuitting = true;
  runDetached(async () => {
    await serviceController.stopService().catch(() => {});
    app.quit();
  });
});

app.on("window-all-closed", (event) => {
  if (!isQuitting) {
    event.preventDefault();
  }
});

ipcMain.handle("desktop:get-snapshot", async () => decorateSnapshot(await serviceController.getSnapshot()));
ipcMain.handle("desktop:set-runtime", async (_event, runtimeKey) => {
  const snapshot = decorateSnapshot(await serviceController.setRuntimeSelection(runtimeKey));
  latestSnapshot = snapshot;
  await pushStatus();
  return snapshot;
});
ipcMain.handle("desktop:start-service", async (_event, runtimeKey) => {
  const snapshot = decorateSnapshot(await serviceController.startService(runtimeKey));
  latestSnapshot = snapshot;
  await pushStatus();
  return snapshot;
});
ipcMain.handle("desktop:stop-service", async () => {
  const snapshot = decorateSnapshot(await serviceController.stopService());
  latestSnapshot = snapshot;
  await pushStatus();
  return snapshot;
});
ipcMain.handle("desktop:start-auto-farm", async () => {
  const snapshot = decorateSnapshot(await serviceController.startAutoFarm());
  latestSnapshot = snapshot;
  await pushStatus();
  return snapshot;
});
ipcMain.handle("desktop:stop-auto-farm", async () => {
  const snapshot = decorateSnapshot(await serviceController.stopAutoFarm());
  latestSnapshot = snapshot;
  await pushStatus();
  return snapshot;
});
ipcMain.handle("desktop:open-settings", async () => {
  await openSettingsWindow();
  return true;
});
ipcMain.handle("desktop:open-community-link", async (_event, linkKey) => {
  const url = COMMUNITY_LINKS[String(linkKey || "")];
  if (!url) {
    throw new Error("未知链接");
  }
  await shell.openExternal(url);
  return true;
});
ipcMain.handle("desktop:close-window", async () => {
  hideMainWindow();
  return true;
});
