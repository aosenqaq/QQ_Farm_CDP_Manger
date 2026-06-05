// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("farmDesktop", {
  getSnapshot: () => ipcRenderer.invoke("desktop:get-snapshot"),
  setRuntimeSelection: (runtimeKey) => ipcRenderer.invoke("desktop:set-runtime", runtimeKey),
  startService: (runtimeKey) => ipcRenderer.invoke("desktop:start-service", runtimeKey),
  stopService: () => ipcRenderer.invoke("desktop:stop-service"),
  startAutoFarm: () => ipcRenderer.invoke("desktop:start-auto-farm"),
  stopAutoFarm: () => ipcRenderer.invoke("desktop:stop-auto-farm"),
  openSettings: () => ipcRenderer.invoke("desktop:open-settings"),
  openCommunityLink: (linkKey) => ipcRenderer.invoke("desktop:open-community-link", linkKey),
  closeWindow: () => ipcRenderer.invoke("desktop:close-window"),
  onStatus(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    const wrapped = (_event, payload) => listener(payload);
    ipcRenderer.on("desktop:status", wrapped);
    return () => {
      ipcRenderer.removeListener("desktop:status", wrapped);
    };
  },
});
