#!/usr/bin/env node
// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
/**
 * 单进程同时启动 wmpf（Frida + 调试 + CDP）与 WebSocket 网关，无需子进程 spawn。
 */
"use strict";

require("./load-env.cjs").loadEnvFiles(__dirname);
require("./apply-cli-overrides.cjs").applyCliOverrides(process.argv.slice(2));

const APP_ONLY_OPTIONS_WITH_VALUE = new Set([
  "--runtime",
  "--gateway-port",
  "--gateway-host",
  "--cdp-ws",
  "--qq-game-js",
  "--qq-appid",
  "--qq-miniapp-src-root",
  "--qq-host-ws-url",
  "--qq-host-version",
]);
const APP_ONLY_OPTIONS_FLAG = new Set([
  "--qq",
  "--wx",
]);

function stripAppOnlyArgs(argv) {
  const kept = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "");
    if (!arg) continue;

    const eqIndex = arg.indexOf("=");
    const optionName = eqIndex >= 0 ? arg.slice(0, eqIndex) : arg;
    if (APP_ONLY_OPTIONS_FLAG.has(optionName)) {
      continue;
    }
    if (APP_ONLY_OPTIONS_WITH_VALUE.has(optionName)) {
      if (eqIndex < 0) {
        i += 1;
      }
      continue;
    }
    kept.push(arg);
  }
  return kept;
}

process.argv = [process.argv[0], process.argv[1] || "run.cjs", ...stripAppOnlyArgs(process.argv.slice(2))];

const { getConfig } = require("./src/config");
const { ensureLatestQqPatch } = require("./src/qq-auto-patch");
const config = getConfig();

async function main() {
  if (config.runtimeTarget === "qq_ws") {
    try {
      const result = await ensureLatestQqPatch({ config, projectRoot: __dirname });
      if (!result.ok) {
        console.warn(`[qq-auto-patch] 自动补丁跳过：${result.reason || "需要手动补丁"}`);
        console.warn("[qq-auto-patch] 可在运行时弹窗中使用“一键打补丁”手动处理。");
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(`[qq-auto-patch] 自动补丁失败：${err.message}`);
      console.warn("[qq-auto-patch] 已回退为手动补丁方式，可在运行时弹窗中点击“一键打补丁”。");
    }
  }

  if (config.runtimeTarget !== "qq_ws") {
    require("./wmpf/src/index.js");
  }
  require("./src/index.js");
}

main().catch((error) => {
  const err = error instanceof Error ? error : new Error(String(error));
  console.error(`[run] failed: ${err.stack || err.message}`);
  process.exit(1);
});
