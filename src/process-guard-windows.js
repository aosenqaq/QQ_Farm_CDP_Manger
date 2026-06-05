// 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
"use strict";

const { spawn } = require("node:child_process");

function encodePowerShellScript(script) {
  return Buffer.from(String(script || ""), "utf16le").toString("base64");
}

function runPowerShell(script, timeoutMs) {
  const encoded = encodePowerShellScript(script);
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        encoded,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const limitMs = Math.max(1000, Number(timeoutMs) || 30_000);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch (_) {}
      reject(new Error(`powershell timeout (${limitMs}ms)`));
    }, limitMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
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
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `powershell exit code ${code}`;
      reject(new Error(detail));
    });
  });
}

function escapePowerShellSingleQuoted(text) {
  return String(text == null ? "" : text).replace(/'/g, "''");
}

function buildCloseWindowScript(windowTitle, matchMode) {
  const title = escapePowerShellSingleQuoted(windowTitle);
  const mode = escapePowerShellSingleQuoted(matchMode || "contains");
  return `
$ErrorActionPreference = 'Stop'
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class FarmGuardWin32 {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

  [DllImport("user32.dll")]
  public static extern bool IsWindowVisible(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowTextLengthW(IntPtr hWnd);

  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

  [DllImport("user32.dll")]
  public static extern bool PostMessageW(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
}
"@

$target = '${title}'
$mode = '${mode}'
$targetNorm = $target.ToLowerInvariant()
$result = New-Object System.Collections.Generic.List[Object]

[FarmGuardWin32]::EnumWindows({
  param([IntPtr]$hWnd, [IntPtr]$lParam)
  if (-not [FarmGuardWin32]::IsWindowVisible($hWnd)) { return $true }
  $len = [FarmGuardWin32]::GetWindowTextLengthW($hWnd)
  if ($len -le 0) { return $true }
  $builder = New-Object System.Text.StringBuilder ($len + 1)
  [void][FarmGuardWin32]::GetWindowTextW($hWnd, $builder, $builder.Capacity)
  $titleText = $builder.ToString().Trim()
  if ([string]::IsNullOrWhiteSpace($titleText)) { return $true }
  $norm = $titleText.ToLowerInvariant()
  $matched = $false
  if ($mode -eq 'exact') {
    $matched = $norm -eq $targetNorm
  } else {
    $matched = $norm.Contains($targetNorm)
  }
  if ($matched) {
    [void][FarmGuardWin32]::PostMessageW($hWnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
    [void]$result.Add([PSCustomObject]@{
      hwnd = $hWnd.ToInt64()
      title = $titleText
    })
  }
  return $true
}, [IntPtr]::Zero) | Out-Null

$result | ConvertTo-Json -Depth 3 -Compress
`;
}

function buildLaunchProtocolScript(protocol) {
  const target = escapePowerShellSingleQuoted(protocol);
  return `
$ErrorActionPreference = 'Stop'
$target = '${target}'
Start-Process -FilePath $target | Out-Null
[PSCustomObject]@{
  ok = $true
  mode = 'protocol'
  target = $target
} | ConvertTo-Json -Depth 3 -Compress
`;
}

function closeWindowsByTitle(windowTitle, matchMode, timeoutMs) {
  if (!windowTitle) {
    return Promise.resolve({
      matched: [],
      mode: "skip",
    });
  }
  return runPowerShell(buildCloseWindowScript(windowTitle, matchMode), timeoutMs)
    .then((result) => {
      let parsed = [];
      try {
        parsed = result.stdout ? JSON.parse(result.stdout) : [];
      } catch (_) {
        parsed = [];
      }
      if (!Array.isArray(parsed)) parsed = parsed ? [parsed] : [];
      return {
        matched: parsed,
        mode: "window_close",
      };
    });
}

function launchByProtocol(protocol, timeoutMs) {
  if (!protocol) {
    return Promise.reject(new Error("launch protocol missing"));
  }
  return runPowerShell(buildLaunchProtocolScript(protocol), timeoutMs)
    .then(() => ({
      mode: "protocol",
      target: protocol,
    }));
}

function runShellCommand(command, timeoutMs) {
  if (!command) {
    return Promise.reject(new Error("launch command missing"));
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      "cmd.exe",
      ["/d", "/s", "/c", command],
      {
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    let stdout = "";
    let stderr = "";
    let settled = false;
    const limitMs = Math.max(1000, Number(timeoutMs) || 30_000);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch (_) {}
      reject(new Error(`command timeout (${limitMs}ms)`));
    }, limitMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
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
        resolve({
          mode: "command",
          command,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
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
