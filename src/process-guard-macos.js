// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const { spawn } = require("node:child_process");

function runAppleScript(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn("osascript", ["-"], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const limitMs = Math.max(1000, Number(timeoutMs) || 30_000);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (_) {}
      reject(new Error(`osascript timeout (${limitMs}ms)`));
    }, limitMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `osascript exit code ${code}`;
      reject(new Error(detail));
    });

    child.stdin.write(script, "utf8");
    child.stdin.end();
  });
}

function escapeAppleScriptString(text) {
  return String(text == null ? "" : text).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildCloseWindowScript(windowTitle, matchMode) {
  const title = escapeAppleScriptString(windowTitle);
  const exact = (matchMode || "contains") === "exact";
  const matchExpr = exact
    ? `winTitle is "${title}"`
    : `winTitle contains "${title}"`;
  return `
set matchCount to 0
tell application "System Events"
  repeat with proc in (every process whose visible is true)
    try
      repeat with win in (windows of proc)
        try
          set winTitle to name of win
          if ${matchExpr} then
            set matchCount to matchCount + 1
            try
              click (first button of win whose subrole is "AXCloseButton")
            end try
          end if
        end try
      end repeat
    end try
  end repeat
end tell
return matchCount
`;
}

function closeWindowsByTitle(windowTitle, matchMode, timeoutMs) {
  if (!windowTitle) {
    return Promise.resolve({ matched: [], mode: "skip" });
  }
  return runAppleScript(buildCloseWindowScript(windowTitle, matchMode), timeoutMs)
    .then((result) => {
      const count = parseInt(result.stdout, 10) || 0;
      return {
        matched: Array.from({ length: count }, (_, i) => ({ index: i })),
        mode: "window_close",
      };
    })
    .catch((error) => {
      // 辅助功能权限未授予时降级为 skip，不中断重启流程
      const msg = String(error && error.message ? error.message : error);
      if (
        msg.toLowerCase().includes("not authorized") ||
        msg.includes("1743") ||
        msg.toLowerCase().includes("assistive access")
      ) {
        return { matched: [], mode: "skip", reason: "accessibility_denied" };
      }
      throw error;
    });
}

function launchByProtocol(protocol, timeoutMs) {
  if (!protocol) {
    return Promise.reject(new Error("launch protocol missing"));
  }
  return new Promise((resolve, reject) => {
    const child = spawn("open", [protocol], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    let settled = false;
    const limitMs = Math.max(1000, Number(timeoutMs) || 30_000);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (_) {}
      reject(new Error(`open timeout (${limitMs}ms)`));
    }, limitMs);

    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ mode: "protocol", target: protocol });
        return;
      }
      const detail = stderr.trim() || `open exit code ${code}`;
      reject(new Error(detail));
    });
  });
}

function runShellCommand(command, timeoutMs) {
  if (!command) {
    return Promise.reject(new Error("launch command missing"));
  }
  return new Promise((resolve, reject) => {
    const child = spawn("sh", ["-c", command], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;
    const limitMs = Math.max(1000, Number(timeoutMs) || 30_000);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch (_) {}
      reject(new Error(`command timeout (${limitMs}ms)`));
    }, limitMs);

    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
    child.on("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ mode: "command", command, stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `command exit code ${code}`;
      reject(new Error(detail));
    });
  });
}

module.exports = {
  closeWindowsByTitle,
  launchByProtocol,
  runShellCommand,
};
