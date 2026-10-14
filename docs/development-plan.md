# Orvis Code GUI · 开发计划

目标：用 Electron 桌面应用替代 IDEA 中的 CC GUI 插件，封装 Claude Code / Codex CLI。

架构详见 [architecture.md](./architecture.md)。

## 已完成：脚手架

- **技术栈**：Electron 33 + electron-vite + React 18 + TypeScript 5 + node-pty
- **结构**：`src/{shared,main,preload,renderer}` 四层分离
- **安全模型**：`contextIsolation` + 无 `nodeIntegration` + contextBridge 白名单 + CSP
- **验证**：`npm run typecheck` ✅ · `npm run build`（main/preload/renderer 三端）✅

```
src/
  shared/ipc.ts          # IPC 契约（通道名 + 消息类型）
  main/
    index.ts             # 主进程入口：窗口、IPC 注册、生命周期
    session-manager.ts   # node-pty 启动 CLI，流式转发输出
  preload/
    index.ts             # contextBridge 暴露受控 API (window.orvis)
    index.d.ts
  renderer/
    index.html
    src/App.tsx          # 最小 UI：选 provider / 启停会话 / 流式输出 / 输入
    src/main.tsx
    src/assets/main.css
```

## 阶段 0 · 工程化收尾（0.5 天）

- `.editorconfig`、`lint-staged` + `husky` 预提交钩子
- GitHub Actions CI：typecheck + lint + build
- node-pty 原生模块跨平台重建（electron-rebuild）验证

## 阶段 1 · 代理层打磨（2-3 天）

当前 `SessionManager` 为可运行最小骨架，需产品化：

- CLI 可执行文件自动探测 + 可配置路径（claude / codex / 自定义），处理未安装场景
- **CLI 子进程管理**：监听 stdout/stderr 流式输出；退出/崩溃/超时上报并清理（关键点 1）
- 多会话并发管理、复用、超时回收
- PTY resize 随窗口同步
- **ANSI 转义码处理**：代理侧产出"干净文本 + 样式元数据"，或富文本转换（anser）（关键点 2）
- 输出结构化解析（流式 JSON / ANSI）：区分文本、工具调用、diff、错误
- 代理层统一抽象，预留 [可选] 本地 HTTP 服务 / 直连 API 路径

## 阶段 2 · 核心 UI（4-6 天）

对标 IDEA CC GUI 核心能力：

- **聊天窗口**：消息气泡、Markdown 渲染、代码高亮、流式打字机效果（消费关键点 2 的转换结果）
- **会话管理**：多会话 Tab / 侧边栏、切换、历史回放
- **文件预览 / diff 审查**：集成 Monaco diff editor，变更展示 + 接受/拒绝
- **权限控制 / 工具调用审批 UI**：拦截待批准的工具调用（文件读写、命令执行），确认后放行；
  支持逐次确认 / 本会话记住 / 白名单（关键点 5，对齐 IDEA 体验的关键差异点）
- **[可选] 集成终端**：xterm.js 直接接 PTY，用于原始交互场景

## 阶段 3 · 工作区与上下文（3-4 天）

- **项目选择**：工作目录选择器（替代当前写死的 `cwd: '.'`），每目录一个会话（关键点 3）
- 文件树浏览 + 变更文件高亮
- 配置界面：模型选择 / API Key / 工作目录 / 代理设置（关键点 4 的 UI 入口）

## 阶段 4 · 存储、配置与设置（2-3 天）

- **会话管理持久化**：历史本地存储（better-sqlite3 或 JSON）、回溯、**导出（MD/JSON）**、删除；
  会话元数据与消息体分离存储（关键点 3）
- **配置管理**：模型、API Key、工作目录、代理设置持久化；全局 + per-project 分层（关键点 4）
- API Key 经 OS keychain（keytar / Electron safeStorage）存取
- 应用设置（主题、字体、默认 provider）、窗口状态记忆

## 阶段 4.5 · 日志与可观测性（1 天，可与阶段 1/2 并行推进）

- **日志分层**：界面操作日志 / 代理转发日志 / CLI 原始输出日志分开存储（关键点 6）
- 统一时间戳 + sessionId 关联；文件滚动（rotation）
- CLI 原始输出脱敏开关（可能含敏感信息）
- 应用内日志查看面板（可选）

## 阶段 5 · 打包分发（2 天）

- electron-builder 三平台产物（win/mac/linux）
- 原生模块（node-pty）打包验证、代码签名
- 自动更新（electron-updater）

## MVP 路线

> 阶段 1 → 阶段 2（聊天窗口 + 文件预览/diff + 权限审批）→ 阶段 3（项目选择）→ 阶段 4 存储

即可得到替代 IDEA CC GUI 核心用途的可用版本。其中 **ANSI 处理（关键点 2）** 是聊天窗口可用的前置依赖，
**权限控制审批 UI（关键点 5）** 是与 IDEA 插件体验对齐、保障安全的关键，建议紧随核心聊天窗口之后实现。
