/* eslint-disable @typescript-eslint/no-explicit-any */
import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getQuery: (url: string, params: any) => AxiosResponse
    }
  }
}
