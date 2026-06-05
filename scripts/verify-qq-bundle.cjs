#!/usr/bin/env node
// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const path = require("node:path");
const projectRoot = path.join(__dirname, "..");
require(path.join(projectRoot, "load-env.cjs")).loadEnvFiles(projectRoot);
require(path.join(projectRoot, "apply-cli-overrides.cjs")).applyCliOverrides(process.argv.slice(2));

const { getConfig } = require(path.join(projectRoot, "src", "config.js"));
const { buildQqBundle } = require(path.join(projectRoot, "src", "qq-bundle.js"));

const config = getConfig();
const built = buildQqBundle({ config, projectRoot });
const url = built.meta.hostWsUrl;
const port = config.gatewayPort;
const pathSuffix = config.qqWsPath || "/miniapp";
const expectDefault = `ws://127.0.0.1:${port}${pathSuffix}`;

if (!url.includes(`:${port}`) || !url.endsWith(pathSuffix)) {
  console.warn(
    `[verify-qq-bundle] 提示: 当前 bundle 写入的 ws 为 ${url}，网关端口为 ${port}、路径为 ${pathSuffix}。` +
      `若未设置 FARM_QQ_HOST_WS_URL，期望为 ${expectDefault}。请确认与一键打补丁时网关配置一致。`,
  );
}

console.log("[verify-qq-bundle] ok, mode=" + (built.meta.bundleMode || "full") + ", hostWsUrl=" + url + ", scriptHash=" + built.meta.scriptHash);
