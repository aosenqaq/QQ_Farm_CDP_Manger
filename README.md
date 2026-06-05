<!-- 水印：二开倒卖先别急，README 都没看明白就上链接，属实有点绷不住。 -->
# 农场自动化控制台 v1.8.2

一个面向 QQ 经典农场 / 微信小游戏农场调试与自动化的工程化控制台。

这个项目的重点不只是“自动种地”，更是把两条原本不太顺手的调试链路整理成了可启动、可控制、可扩展的统一工作台：

- 微信路线：`CDP + wmpf + 自动注入 button.js`
- QQ 路线：`WebSocket 宿主 + QQ bundle + game.js 补丁`

适合想快速启动、继续二开，或者研究小游戏自动化链路的人。

相关致谢：

- hook 代码参考 [evi0s/WMPFDebugger](https://github.com/evi0s/WMPFDebugger)
- 部分功能设计思路参考 [Penty-d/qq-farm-bot-ui](https://github.com/Penty-d/qq-farm-bot-ui)
- 原作者仓库：[linguo2625469/qq-farm-cdp-auto](https://github.com/linguo2625469/qq-farm-cdp-auto)

交流 QQ 群：`922286747`

## 项目能做什么

- 统一启动 QQ / 微信两条运行路线
- 提供网页控制台，集中管理自动农场、调度、运行时状态和日志
- 自动执行收获、浇水、除草、杀虫、种植、施肥、偷菜、帮忙等流程
- 支持 QQ 小程序 `game.js` 一键打补丁，或导出 bundle 手动注入
- 支持微信调试环境自动探测上下文并注入 `button.js`
- 支持仓库聚合、自动出售、地块详情、阶段图展示、日报与通知推送

## 先看这张表

| 路线 | 适用场景 | 底层方式 | 推荐启动命令 |
|------|------|------|------|
| QQ | 可访问本地 QQ 小程序资源文件 | `WebSocket 宿主 + bundle` | `npm run start -- --qq` |
| 微信 | 有可用的微信 PC 调试环境 | `CDP + wmpf + frida` | `npm run start -- --wx` |

两条路线共用同一套启动入口和网页控制台，但底层链路不同，这是项目的核心设计。

当前代码入口已经统一到 `run.cjs -> src/index.js -> src/gateway.js`，控制台静态页只使用 `public/index.html`。
如果后续要二开或修 bug，请优先修改 `src/` 与 `public/` 下文件，不要再寻找根目录旧副本。

## 30 秒快速开始

### 最省心的方式

1. 安装 Node.js 22 或更高版本
2. 把项目放到本地任意目录
3. Windows 双击运行 `Windows_start.bat`；macOS 先执行 `chmod +x ./Mac_start.sh`，再执行 `./Mac_start.sh`
4. 按提示选择 `普通启动 / Lite 悬浮窗`，以及普通启动下的 `QQ / 微信`
5. 等浏览器自动打开控制页

启动脚本会自动做这些事：

- 检查 Node.js 版本
- 在同一个菜单里选择普通启动或 Lite 悬浮窗
- 微信路线自动检测 `frida` 是否可用
- 启动网关并自动打开控制页
- 自动按启动器平台匹配 QQ 小程序默认路径

默认控制页地址：

- [http://127.0.0.1:8787/](http://127.0.0.1:8787/)

### 命令行方式

安装依赖：

```bash
npm install
```

启动 QQ 路线：

```bash
npm run start -- --qq
```

启动微信路线：

```bash
npm run start -- --wx
```

也可以用等价简写：

```bash
npm run start:qq
npm run start:wx
```

## QQ 路线怎么用

### 典型流程

1. 运行 `npm run start -- --qq`
2. 打开控制页
3. 进入“运行时”页签
4. 选择以下任意一种方式接入 QQ 小程序

### 方式 1：导出 bundle 后手动放进 `game.js`

适合不想直接改本地缓存、想自己控制注入内容的人。

操作方式：

1. 在控制页点击“保存 QQ Bundle”
2. 把导出的 bundle 放进 QQ 小程序 `game.js`
3. 启动 QQ 小程序

### 方式 2：控制页一键打补丁

适合直接上手。

满足下面任意条件即可：

- 已配置 `FARM_QQ_GAME_JS`
- 已配置 `FARM_QQ_APPID`
- 在控制页临时填入 `QQ 小程序 AppID`

补丁行为说明：

- 首次打补丁会生成 `game.js.qq-farm.bak`
- 重复执行会替换旧区块，不会无限追加
- 如果没有显式指定 `game.js`，项目会按 `appid` 自动扫描最新版本目录

### 方式 3：命令行生成或打补丁

只生成 bundle：

```bash
npm run qq:bundle
```

直接给 `game.js` 打补丁：

```bash
npm run qq:patch
```

临时指定 `appid`：

```bash
npm run qq:patch -- --qq-appid 1112386029
```

临时导出完整调试包：

```bash
npm run qq:bundle -- --bundle-mode full
```

导出当前小程序缓存图片：

```bash
npm run qq:images
```

### QQ lite 注入包维护

QQ 路线默认使用 `lite` 注入包，来源文件是 [`button-lite.js`](button-lite.js)，由 [`button.js`](button.js) 生成。`lite` 包会保留自动农场必要能力，同时裁掉大部分诊断扫描和 spy，降低注入解析、后台占用和小程序卡顿。

只要改动了 `button.js` 中会影响 QQ 运行时的能力层代码，都需要重新封装 lite 注入包：

```bash
npm run qq:build-lite
npm run qq:verify
npm run qq:bundle
```

如果需要直接打进 QQ 小程序缓存里的 `game.js`：

```bash
npm run qq:patch
```

如果只想导出到指定文件：

```cmd
npm run qq:bundle -- --out "%TEMP%\\qq-miniapp-bootstrap.js"
```

PowerShell 可使用：

```powershell
npm run qq:bundle -- --out "$env:TEMP\qq-miniapp-bootstrap.js"
```

维护规则：

- `button.js` 是微信路线和 full 调试包的来源；`button-lite.js` 是 QQ 默认运行包来源。
- 改了 `button.js` 后不要手工编辑 `button-lite.js`，应执行 `npm run qq:build-lite` 重新生成。
- `button-lite.js` 属于构建产物，日常不要直接手改；除非你正在维护 `scripts/build-button-lite.cjs` 本身。
- `npm run qq:build-lite` 会做语法检查和 210KB 体积上限检查；超过上限会失败。
- `npm run qq:verify` 用于确认当前默认 bundle 可构建、host 地址和脚本 hash 正常。
- 需要完整诊断能力时，临时使用 `FARM_QQ_BUNDLE_MODE=full` 或命令参数 `--bundle-mode full`；日常运行建议保持默认 `lite`。

### 本轮关键运行时调整

- QQ 默认 bundle 模式为 `lite`，降低注入包体积和小程序解析压力。
- 默认不再自动启动 runtime spies、interaction spies 和 reconnect watcher，需要诊断时再手动开启。
- 网关对短时间重复的只读 `gameCtl.*` 调用做短 TTL 缓存，操作类调用后自动清缓存。
- 健康状态中新增统一 `rpcStats`，QQ 和微信路线都可以查看慢调用、调用次数和缓存命中。
- 奖励弹窗拦截支持 QQ 与微信两端，并把用户开关保存到 `data/reward-popup-interceptor-state.json`。
- 奖励弹窗拦截关闭时会恢复被隐藏的节点，避免关闭后仍持续屏蔽弹窗。

## 微信路线怎么用

1. 运行 `npm run start -- --wx`
2. 打开目标小游戏
3. 等待控制页与调试上下文就绪
4. 项目会自动注入 `button.js`
5. 在网页控制台里执行后续操作

说明：

- 微信路线的预览、点击、拖动等交互走的是 CDP
- 如果遇到 `CDP timeout`，优先检查小游戏是否在前台，以及调试链路是否正常
- `frida` 安装慢、编译慢或安装失败，通常是本机环境问题，不是业务逻辑问题

## 控制台主要能力

### 自动农场

- 支持自己农场和好友农场两类任务
- 支持收获、浇水、除草、杀虫、自动种植、自动施肥
- 支持偷菜、帮忙、自动回家、巡查间隔和错误停止
- 支持背包优先种植、保留优先级、单轮连续补种

### 调度与日志

- 调度中心统一管理常驻任务，不靠多个模块各自并发轮询
- 支持任务启停、优先级、轮询间隔和缓冲时间
- 提供运行时状态、账户状态、任务日志和异常通知

### 仓库与土地详情

- 仓库支持四页签聚合、缓存刷新、批量出售和自动出售
- 土地详情支持阶段图、成熟倒计时、品质信息
- 支持单地块手动 `无机 / 有机` 施肥

## 项目结构

| 路径 | 作用 |
|------|------|
| [`src/`](src) | 主运行代码：网关、运行时适配、自动农场调度、QQ WS/CDP 会话管理 |
| [`public/`](public) | 控制台真实静态资源；浏览器访问 `/` 时实际返回这里的 `index.html` |
| [`wmpf/`](wmpf) | 微信小游戏调试桥、Frida hook、CDP 代理相关代码 |
| [`scripts/`](scripts) | 打补丁、发布清理、项目修复、图片导出等脚本 |
| [`gameConfig/`](gameConfig) | 游戏资源配置，包含作物阶段图和物品映射 |
| [`button.js`](button.js) | 游戏内能力层，对外暴露 `gameCtl.*` |
| [`button-lite.js`](button-lite.js) | QQ 默认 `lite` 注入包，由 `npm run qq:build-lite` 从 `button.js` 生成 |
| [`qq-host.js`](qq-host.js) | QQ 小程序内常驻宿主模板 |
| [`run.cjs`](run.cjs) | 统一启动入口 |
| [`scripts/start-entry.cjs`](scripts/start-entry.cjs) | 跨平台启动菜单，统一承接普通启动和 Lite 悬浮窗 |
| [`Windows_start.bat`](Windows_start.bat) | Windows 启动入口，调用统一启动菜单 |
| [`Mac_start.sh`](Mac_start.sh) | macOS 启动入口，调用统一启动菜单 |

当前仓库已经移除了根目录历史副本 `gateway.js`、`auto-farm-executor.js`、`index.html`，避免和 `src/`、`public/` 下的真实文件重名误导。

## 图片资源约定

项目内资源图统一放在 `gameConfig/plant_images/`。

主要约定如下：

- `default/`：默认兜底图
- `stages/作物/<作物名>/`：作物主图和各阶段图片
- `stages/<资源包目录>/`：仓库物品、道具、活动资源等非作物图片

命名建议：

- 主图：`<作物名>_00_作物图.*` 或 `<作物名>_00_主图.*`
- 阶段图：`<作物名>_01_种子.*`、`<作物名>_02_发芽.*` 这类按顺序编号的文件
- 仓库资源目录建议附带 `*_mapping.json`，方便建立 `item_id -> 名称 / 图片` 映射

## 环境要求

- QQ 路线支持 Windows / macOS
- 微信路线当前仍以 Windows 为前提
- Node.js `>= 22`
- QQ 路线需要能访问 QQ 小程序本地资源文件
- 微信路线需要可用的微信 PC 调试环境

补充说明：

- macOS 支持当前主要覆盖 QQ 路线：QQ 小程序目录自动识别、`FARM_QQ_MINIAPP_SRC_ROOT=~/...` 路径展开、启动前平台选择对应的默认路径匹配
- 微信路线依赖现有 `wmpf + frida + WeChatAppEx.exe` 调试链路，当前未声明支持 macOS
- 普通启动和 Lite 悬浮窗共用 [`scripts/start-entry.cjs`](scripts/start-entry.cjs)，平台由对应启动器自动注入

微信兼容版本可参考 [`wmpf/frida/config`](wmpf/frida/config)。

## 常用脚本

| 命令 | 说明 |
|------|------|
| `npm run start -- --qq` | 启动 QQ 路线 |
| `npm run start -- --wx` | 启动微信路线 |
| `npm run start:qq:auto` | 启动 QQ 路线并进入自动农场模式 |
| `npm run start:wx:auto` | 启动微信路线并进入自动农场模式 |
| `npm run gateway -- --qq` | 仅启动 QQ 网关 |
| `npm run gateway -- --wx` | 仅启动微信网关 |
| `npm run qq:build-lite` | 从 `button.js` 重新生成默认 QQ lite 注入包 `button-lite.js` |
| `npm run qq:bundle` | 生成 QQ bundle |
| `npm run qq:patch` | 给 QQ 小程序 `game.js` 打补丁 |
| `npm run qq:verify` | 校验 QQ bundle |
| `npm run qq:images` | 导出当前 QQ 小程序缓存图片 |
| `npm run release:prepare` | 清理运行痕迹，保留 `node_modules`，适合直接打包分发 |
| `npm run release:slim` | 生成更瘦的发布目录，不保留依赖 |
| `npm run release:verify` | 校验发布包关键文件 |
| `npm run clean:runtime` | 仅清理运行时痕迹 |
| `npm run repair` | 修复项目结构或缺失文件 |

说明：

- 如果只是给别人打包发一份现成可运行版本，优先用 `npm run release:prepare`
- 如果你手动压缩成 `.zip`，建议再运行 `node scripts/verify-release-package.cjs 你的发布包.zip`

## 环境变量

项目会自动读取：

- `.env`
- `.env.local`

也支持通过环境变量 `FARM_ENV_FILE` 临时指定额外配置文件。PowerShell 示例：

```powershell
$env:FARM_ENV_FILE=".env.qq"
npm run start -- --qq
```

参考模板见 [`.env.example`](.env.example)。

### 最常用的一组变量

| 变量 | 说明 |
|------|------|
| `FARM_RUNTIME_TARGET` | `cdp` / `qq_ws` / `auto` |
| `FARM_GATEWAY_HOST` | 网关监听地址 |
| `FARM_GATEWAY_PORT` | 网关端口 |
| `FARM_CDP_WS` | 微信 CDP 目标地址 |
| `FARM_QQ_WS_PATH` | QQ 宿主 WebSocket 路径，默认 `/miniapp` |
| `FARM_QQ_GAME_JS` | QQ 小程序 `game.js` 路径 |
| `FARM_QQ_APPID` | QQ 小程序 `appid`，用于自动定位最新目录 |
| `FARM_QQ_MINIAPP_SRC_ROOT` | QQ 本地 `miniapp_src` 根目录 |
| `FARM_QQ_HOST_WS_URL` | 写入 QQ bundle 的本地宿主地址 |
| `FARM_QQ_BUNDLE_MODE` | QQ 注入包模式：`lite` 默认运行包，`full` 调试包 |
| `FARM_QQ_BUNDLE_OUT` | 命令行导出 bundle 的默认输出路径 |

### QQ 路线示例

```env
FARM_RUNTIME_TARGET=qq_ws
FARM_GATEWAY_HOST=127.0.0.1
FARM_GATEWAY_PORT=8787
FARM_QQ_WS_PATH=/miniapp
FARM_QQ_WS_READY_TIMEOUT_MS=15000
FARM_QQ_WS_CALL_TIMEOUT_MS=15000
# FARM_QQ_GAME_JS=D:\path\to\qq-miniapp\game.js
FARM_QQ_APPID=1112386029
FARM_QQ_HOST_WS_URL=ws://127.0.0.1:8787/miniapp
FARM_QQ_HOST_VERSION=qq-host-1
FARM_QQ_BUNDLE_MODE=lite
```

QQ 路线建议保持 `FARM_RUNTIME_TARGET=qq_ws`，不要同时启动微信 CDP / WMPF / Frida 桥接；需要运行时诊断时再临时切换 `FARM_QQ_BUNDLE_MODE=full`。

## 默认端口与地址

| 项目 | 默认值 |
|------|------|
| 网关 HTTP | `127.0.0.1:8787` |
| 网关控制 WebSocket | `/ws` |
| QQ 宿主 WebSocket | `/miniapp` |
| 微信 CDP 代理 | `ws://127.0.0.1:62000` |

## 常见问题

### 为什么 QQ 和微信不是同一条底层链路

因为宿主条件不一样：

- 微信天然更适合走调试协议和 CDP
- QQ 更适合走本地资源注入和常驻宿主

项目统一的是“启动方式”和“网页控制台”，不是强行把两端伪装成同一种协议。

### 为什么 QQ 路线没有网页实时画面

当前实时预览能力主要来自 CDP。QQ 路线目前优先解决的是控制链路、自动化动作和补丁工程化，暂时没有把实时画面采集补进宿主层。

## 免责声明

- 本项目仅用于学习、研究和安全测试
- 作者与贡献者与腾讯、QQ、微信及其小游戏无关联
- 对第三方软件进行注入、调试或自动化可能违反相关协议，并可能导致封号、功能限制或其他后果
- 一切风险由使用者自行承担

## 许可证

本项目基于 [GNU GPL v3.0](LICENSE) 开源。
