#!/usr/bin/env node
// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const args = new Set(process.argv.slice(2));

process.env.PYTHONUTF8 = process.env.PYTHONUTF8 || "1";
process.env.NPM_CONFIG_UNICODE = process.env.NPM_CONFIG_UNICODE || "true";

function printHeader(title) {
  console.log("");
  console.log("==========================================");
  console.log(`  ${title}`);
  console.log("==========================================");
  console.log("");
}

function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(String(answer || "").trim()));
  });
}

async function askChoice(rl, title, choices) {
  while (true) {
    console.log(title);
    choices.forEach((choice, index) => {
      console.log(`  [${index + 1}] ${choice.label}`);
    });
    console.log("");
    const answer = await ask(rl, `Choose [1/${choices.length}]: `);
    const index = Number.parseInt(answer, 10) - 1;
    if (Number.isInteger(index) && index >= 0 && index < choices.length) {
      return choices[index];
    }
    console.log(`Please enter 1-${choices.length}.`);
    console.log("");
  }
}

async function pauseOnError() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return;
  const rl = createPrompt();
  await ask(rl, "Press Enter to exit...");
  rl.close();
}

function npmCommand() {
  return "npm";
}

function useShellForNpm() {
  return process.platform === "win32";
}

function ensureNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (!Number.isInteger(major)) {
    throw new Error("Failed to detect Node.js version.");
  }
  if (major < 22) {
    throw new Error(`Node.js 22 or newer is required. Current major version: ${major}`);
  }
  console.log(`[OK] Node.js v${major} detected.`);
  console.log("");
}

function getLaunchPlatform() {
  const raw = String(process.env.FARM_LAUNCH_TARGET_PLATFORM || "").trim().toLowerCase();
  if (raw === "windows" || raw === "win32" || raw === "win") {
    return "windows";
  }
  if (raw === "macos" || raw === "darwin" || raw === "mac") {
    return "macos";
  }
  return process.platform === "win32" ? "windows" : "macos";
}

function runNpmInstall(message) {
  console.log(message);
  const env = {
    ...process.env,
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || "https://npmmirror.com/mirrors/electron/",
  };
  const result = spawnSync(npmCommand(), ["install"], {
    cwd: ROOT,
    env,
    stdio: "inherit",
    shell: useShellForNpm(),
    windowsHide: true,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error("Dependency installation failed.");
  }
}

function ensureLiteDependencies() {
  if (!fs.existsSync(path.join(ROOT, "node_modules"))) {
    runNpmInstall("[INFO] node_modules not found. Installing dependencies...");
    return;
  }
  if (!fs.existsSync(path.join(ROOT, "node_modules", "electron"))) {
    runNpmInstall("[INFO] Electron runtime not found. Installing dependencies...");
  }
}

function getElectronExecutable() {
  return require(path.join(ROOT, "node_modules", "electron"));
}

function runForeground(command, commandArgs, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: ROOT,
      env,
      stdio: "inherit",
      shell: false,
      windowsHide: false,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        resolve(1);
        return;
      }
      resolve(typeof code === "number" ? code : 0);
    });
  });
}

function launchLite(env) {
  ensureLiteDependencies();
  console.log("");
  console.log("[INFO] Launching lite floating window...");
  const child = spawn(getElectronExecutable(), [path.join(ROOT, "desktop-sample", "main.js")], {
    cwd: ROOT,
    env,
    detached: true,
    stdio: "ignore",
    shell: false,
    windowsHide: true,
  });
  child.unref();
  console.log("[OK] Lite float window started in background.");
  console.log("");
}

function getForcedMode() {
  if (args.has("--lite")) return "lite";
  if (args.has("--normal") || args.has("--standard")) return "normal";
  return "";
}

async function main() {
  const forcedMode = getForcedMode();
  printHeader(forcedMode === "lite" ? "QQ Farm Auto - Lite Float Mode" : "QQ Farm Auto - Start Menu");
  ensureNodeVersion();

  const rl = createPrompt();
  try {
    const mode = forcedMode || (await askChoice(rl, "Select launch mode:", [
      { key: "normal", label: "Standard service + browser console" },
      { key: "lite", label: "Lite floating window" },
    ])).key;

    if (!forcedMode) {
      console.log("");
    }
    const platform = getLaunchPlatform();

    const env = {
      ...process.env,
      FARM_LAUNCH_TARGET_PLATFORM: platform,
    };

    if (mode === "lite") {
      rl.close();
      console.log("");
      console.log(`Selected platform: ${platform}`);
      launchLite(env);
      return;
    }

    console.log("");
    const runtime = (await askChoice(rl, "Select runtime:", [
      { key: "qq", label: "QQ     WebSocket host + QQ bundle" },
      { key: "wx", label: "WeChat CDP + auto inject button.js" },
    ])).key;
    rl.close();

    const runtimeFlag = runtime === "wx" ? "--wx" : "--qq";
    const runtimeName = runtime === "wx" ? "WeChat" : "QQ";

    console.log("");
    console.log(`Selected platform: ${platform}`);
    console.log(`Selected runtime: ${runtimeName}`);
    console.log("");

    const exitCode = await runForeground(process.execPath, [path.join(ROOT, "setup.cjs"), runtimeFlag], env);
    if (exitCode !== 0) {
      process.exitCode = exitCode;
      await pauseOnError();
    }
  } finally {
    if (!rl.closed) {
      rl.close();
    }
  }
}

main().catch(async (error) => {
  console.error(`[ERROR] ${error && error.message ? error.message : String(error)}`);
  await pauseOnError();
  process.exit(1);
});
