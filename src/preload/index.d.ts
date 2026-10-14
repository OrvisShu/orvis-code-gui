import type { ElectronAPI } from '@electron-toolkit/preload'
import type { OrvisApi } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    orvis: OrvisApi
  }
}
