# Orvis Code GUI · 架构设计

将 Claude Code / Codex 等 CLI 封装为独立桌面应用，替代 IDEA 中的 CC GUI 插件。

## 分层总览

```
┌─────────────────────────────────────────────────────────────┐
│ UI 层 (Renderer · React)                                      │
│   聊天窗口 · 项目选择 · 会话管理 · 文件预览                     │
└───────────────▲───────────────────────────────────────────┬─┘
                │ window.orvis (contextBridge 白名单 API)      │
┌───────────────┴───────────────────────────────────────────▼─┐
│ IPC 层 (Electron IPC)                                         │
│   preload: 受控 API 暴露  ·  shared/ipc.ts: 通道/消息契约      │
└───────────────▲───────────────────────────────────────────┬─┘
                │ ipcMain handle / on / webContents.send       │
┌───────────────┴───────────────────────────────────────────▼─┐
│ 代理层 (Main · Node)                                          │
│   CLI 子进程管理 (node-pty)  ·  [可选] 本地 HTTP 服务          │
│   SessionManager · 输出解析 · 工具调用拦截                     │
└───────────────▲───────────────────────────────────────────┬─┘
                │ spawn / stdin / stdout / stderr               │
┌───────────────┴───────────────────────────────────────────▼─┐
│ 底层 (External)                                               │
│   Claude Code CLI  ·  Codex CLI  ·  [可选] 直连 API            │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│ 存储层 (Main 持有，渲染层无直接访问)                           │
│   本地会话历史 · 项目配置 · API Key (OS keychain)             │
└─────────────────────────────────────────────────────────────┘
```

## UI 层（Renderer · React）

渲染进程，运行在沙箱中，无 Node 权限。所有能力经 `window.orvis` 调用。

| 模块      | 职责                                                       | 当前状态          |
| --------- | ---------------------------------------------------------- | ----------------- |
| 聊天窗口  | 消息流、Markdown/代码高亮、流式输出、输入编辑              | 骨架 (App.tsx)    |
| 项目选择  | 选择工作目录作为 CLI 的 cwd，文件树                        | 待实现            |
| 会话管理  | 多会话 Tab/侧边栏、切换、历史回放                          | 待实现            |
| 文件预览  | Monaco diff 查看变更、接受/拒绝                            | 待实现            |

## IPC 层（Electron IPC）

当前**技术决策：使用 Electron IPC**（非 Tauri Command）。原因：脚手架已基于 Electron，
node-pty 等 Node 原生生态成熟。Tauri 作为未来备选（更小体积、Rust 后端），若迁移则此层
为主要改动面，因此契约集中在 `src/shared/ipc.ts` 以降低耦合。

- `src/shared/ipc.ts`：通道名常量 + 消息类型，主/渲染单一数据源
- `src/preload/index.ts`：经 `contextBridge` 暴露白名单 API（`startSession` / `writeSession` /
  `killSession` / `getAppInfo` / `onSessionChunk` / `onSessionExit`）
- 安全：`contextIsolation: true`、`nodeIntegration: false`、渲染层 CSP

## 代理层（Main · Node）

**主路径：CLI 子进程管理（node-pty）**。通过 PTY 启动 CLI 以支持交互式 TUI 与 ANSI 流。

- `src/main/session-manager.ts`：`SessionManager` 负责会话生命周期（spawn / write / kill /
  回收），输出经 IPC 流式转发到渲染层
- `src/main/index.ts`：窗口创建、IPC 注册、应用生命周期
- **[可选] 本地 HTTP 服务**：当需要对接以 HTTP/SSE 暴露的后端（如直连 API 网关、或 CLI 的
  server 模式）时引入；与 CLI 子进程路径并存，由代理层统一抽象对上层透明

待产品化：CLI 路径自动探测与配置、输出结构化解析（文本/工具调用/diff/错误）、工具调用拦截审批、PTY resize。

## 底层（External）

- **Claude Code CLI** / **Codex CLI**：主要封装对象，经子进程交互
- **[可选] 直连 API**：无 CLI 场景的备选，由代理层以相同接口对上层暴露

## 存储层

由主进程持有，渲染层无直接文件/密钥访问，一律经 IPC。

| 数据         | 载体                              | 安全                         |
| ------------ | --------------------------------- | ---------------------------- |
| 会话历史     | SQLite (better-sqlite3) 或 JSON   | 本地 userData 目录           |
| 项目配置     | JSON (per-project / 全局)         | 本地                         |
| API Key      | OS keychain (keytar/safeStorage)  | 不落渲染层、不写明文配置文件 |

## 关键原则

1. **契约优先**：主/渲染通过 `shared/ipc.ts` 单一数据源通信，杜绝字符串/类型漂移。
2. **最小权限**：渲染进程零 Node 权限，能力经 preload 白名单显式暴露。
3. **代理层抽象**：CLI 子进程与可选 HTTP 服务对上层提供统一接口，便于切换底层。
4. **密钥隔离**：API Key 仅在主进程经 OS keychain 存取。

## 设计关键点与约束

落实到具体机制的硬性要求，贯穿各层实现。

### 1. CLI 子进程管理

- 启动 Claude Code / Codex 后，监听 `stdout` / `stderr`，**支持流式输出**（已由 node-pty
  的 `onData` + `IpcChannels.sessionChunk` 流式转发实现骨架）。
- PTY 合并了 stdout/stderr，若需严格区分错误流，提供 `pipe` 模式（child_process stdio）作为
  备选策略，由 provider 适配器选择。
- 进程退出、异常崩溃、超时均需上报 `sessionExit` 并清理资源。

### 2. ANSI 转义码处理

- CLI 输出含颜色/光标控制码，直接渲染会乱码。渲染前需转换：
  - 轻量路径：`ansi-to-html` / `anser` → 富文本（HTML span + class）。
  - TUI 路径：需要原始交互时用 `xterm.js` 直接消费 ANSI（集成终端场景）。
- 对结构化输出（流式 JSON）优先走解析而非 ANSI，映射为消息/工具调用/diff。
- 转换层位于渲染侧或代理侧均可，默认代理侧产出"干净文本 + 样式元数据"，降低渲染耦合。

### 3. 会话管理

- **每个项目/目录一个会话**（会话以工作目录为主键维度）。
- 支持：历史回溯（回放消息流）、导出（Markdown / JSON）、删除。
- 会话元数据（provider、cwd、创建时间、最后活跃）与消息体分开存储，便于列表检索。

### 4. 配置管理（持久化）

- 需持久化：模型选择、API Key、工作目录、代理（proxy）设置。
- 分层：全局默认配置 + per-project 覆盖。
- API Key 单独经 OS keychain；其余配置落 JSON（userData）。
- 代理设置需同时作用于 CLI 子进程环境变量（`HTTP(S)_PROXY`）与可选 HTTP/直连 API 路径。

### 5. 权限控制（确认机制）

- 文件读写、终端命令执行等高风险操作需**用户确认**，防止 Agent 擅自改代码。
- 机制：代理层拦截工具调用 → 推送审批请求到 UI → 用户确认/拒绝 → 放行或阻断。
- 支持策略：逐次确认 / 本会话内记住 / 白名单目录。破坏性操作（删除、强制覆盖）始终显式确认。
- 审批决策与结果计入操作日志（见下）。

### 6. 日志分层

三类日志分离存储，便于排查：

| 日志        | 内容                                   | 用途                     |
| ----------- | -------------------------------------- | ------------------------ |
| 界面操作日志 | 用户动作（启停会话、审批、配置变更）   | 行为追溯、问题复现        |
| 代理转发日志 | IPC 调用、工具调用拦截、流转发         | 定位主/渲染/代理层问题    |
| CLI 原始输出 | 子进程 stdout/stderr 原始字节（含 ANSI）| 还原 CLI 真实行为         |

- 分文件/分 channel 输出，带时间戳与 sessionId 关联。
- 原始输出日志可能含敏感信息，需支持脱敏开关与大小滚动（rotation）。
