import { randomUUID } from 'node:crypto'
import type { IPty } from 'node-pty'
import * as pty from 'node-pty'
import type { BrowserWindow } from 'electron'
import { IpcChannels, type CliProvider, type StartSessionPayload } from '@shared/ipc'

/**
 * 负责生命周期：启动 CLI 子进程（通过 PTY 以支持交互式 TUI），
 * 把输出流式转发到渲染进程，并处理写入/终止。
 */
export class SessionManager {
  private sessions = new Map<string, IPty>()

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  private resolveCommand(provider: CliProvider): string {
    // 占位：实际应可配置路径 / 自动探测。
    return provider === 'claude' ? 'claude' : 'codex'
  }

  start(payload: StartSessionPayload): string {
    const sessionId = randomUUID()
    const command = this.resolveCommand(payload.provider)

    const child = pty.spawn(command, payload.args ?? [], {
      name: 'xterm-color',
      cols: 120,
      rows: 30,
      cwd: payload.cwd,
      env: process.env as Record<string, string>
    })

    child.onData((data) => {
      this.getWindow()?.webContents.send(IpcChannels.sessionChunk, {
        sessionId,
        stream: 'stdout',
        data
      })
    })

    child.onExit(({ exitCode, signal }) => {
      this.getWindow()?.webContents.send(IpcChannels.sessionExit, {
        sessionId,
        code: exitCode,
        signal: signal != null ? String(signal) : null
      })
      this.sessions.delete(sessionId)
    })

    this.sessions.set(sessionId, child)
    return sessionId
  }

  write(sessionId: string, data: string): void {
    this.sessions.get(sessionId)?.write(data)
  }

  kill(sessionId: string): void {
    this.sessions.get(sessionId)?.kill()
    this.sessions.delete(sessionId)
  }

  disposeAll(): void {
    for (const child of this.sessions.values()) child.kill()
    this.sessions.clear()
  }
}
