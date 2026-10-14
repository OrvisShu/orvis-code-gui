/**
 * IPC 契约：主进程与渲染进程共享的通道名与消息类型。
 * 作为单一数据源，避免两端字符串/类型不一致。
 */

/** CLI 提供方 */
export type CliProvider = 'claude' | 'codex'

/** 渲染进程 -> 主进程：启动一个 CLI 会话 */
export interface StartSessionPayload {
  provider: CliProvider
  /** 工作目录（项目根） */
  cwd: string
  /** 透传给 CLI 的额外参数 */
  args?: string[]
}

/** 主进程 -> 渲染进程：会话输出流的一个分片 */
export interface SessionChunk {
  sessionId: string
  stream: 'stdout' | 'stderr'
  data: string
}

/** 主进程 -> 渲染进程：会话结束 */
export interface SessionExit {
  sessionId: string
  code: number | null
  signal: string | null
}

/** 渲染进程 -> 主进程：向会话写入输入 */
export interface SessionInput {
  sessionId: string
  data: string
}

/** IPC 通道名 */
export const IpcChannels = {
  /** invoke: 启动会话，返回 sessionId */
  sessionStart: 'session:start',
  /** send: 向会话写入 */
  sessionWrite: 'session:write',
  /** invoke: 终止会话 */
  sessionKill: 'session:kill',
  /** on: 接收输出分片 */
  sessionChunk: 'session:chunk',
  /** on: 接收退出事件 */
  sessionExit: 'session:exit',
  /** invoke: 返回应用/环境信息 */
  appInfo: 'app:info'
} as const

export interface AppInfo {
  version: string
  platform: NodeJS.Platform
}
