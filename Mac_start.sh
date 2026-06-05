#!/usr/bin/env bash
# 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。
cd "$(dirname "$0")"

export PYTHONUTF8=1
export NPM_CONFIG_UNICODE=true

if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js was not found. Please install Node.js 22 or newer."
    echo "Download: https://nodejs.org/"
    read -r -p "Press Enter to exit..."
    exit 1
fi

export FARM_LAUNCH_TARGET_PLATFORM=macos
node scripts/start-entry.cjs "$@"
