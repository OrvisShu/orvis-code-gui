import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IpcChannels,
  type AppInfo,
  type SessionChunk,
  type SessionExit,
  type StartSessionPayload
} from '@shared/ipc'

/** 暴露给渲染进程的受控 API（走 contextBridge，渲染进程无 Node 权限） */
const api = {
  startSession: (payload: StartSessionPayload): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.sessionStart, payload),

  writeSession: (sessionId: string, data: string): void =>
    ipcRenderer.send(IpcChannels.sessionWrite, sessionId, data),

  killSession: (sessionId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.sessionKill, sessionId),

  getAppInfo: (): Promise<AppInfo> => ipcRenderer.invoke(IpcChannels.appInfo),

  onSessionChunk: (cb: (chunk: SessionChunk) => void): (() => void) => {
    const listener = (_e: unknown, chunk: SessionChunk): void => cb(chunk)
    ipcRenderer.on(IpcChannels.sessionChunk, listener)
    return () => ipcRenderer.removeListener(IpcChannels.sessionChunk, listener)
  },

  onSessionExit: (cb: (exit: SessionExit) => void): (() => void) => {
    const listener = (_e: unknown, exit: SessionExit): void => cb(exit)
    ipcRenderer.on(IpcChannels.sessionExit, listener)
    return () => ipcRenderer.removeListener(IpcChannels.sessionExit, listener)
  }
}

export type OrvisApi = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('orvis', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (无 contextIsolation 时的回退)
  window.electron = electronAPI
  // @ts-ignore
  window.orvis = api
}
