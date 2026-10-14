import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IpcChannels, type AppInfo, type StartSessionPayload } from '@shared/ipc'
import { SessionManager } from './session-manager'

let mainWindow: BrowserWindow | null = null
const sessions = new SessionManager(() => mainWindow)

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle(IpcChannels.sessionStart, (_e, payload: StartSessionPayload) =>
    sessions.start(payload)
  )
  ipcMain.on(IpcChannels.sessionWrite, (_e, sessionId: string, data: string) =>
    sessions.write(sessionId, data)
  )
  ipcMain.handle(IpcChannels.sessionKill, (_e, sessionId: string) => sessions.kill(sessionId))
  ipcMain.handle(IpcChannels.appInfo, (): AppInfo => ({
    version: app.getVersion(),
    platform: process.platform
  }))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.orvis.code-gui')
  app.on('browser-window-created', (_, window) => optimizer.watchWindowShortcuts(window))

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => sessions.disposeAll())
