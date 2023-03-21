/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import axios from 'axios'
class AxiosResponse {
  status: boolean
  data: any
  constructor(status: boolean, data: any) {
    this.status = status
    this.data = data
  }
}

// Custom APIs for renderer
const api = {
  AxiosResponse,
  getQuery: async (url: string, params: any) => {
    const response = await axios.get(url, {
      params
    })
    return new AxiosResponse(response.status == 200, response.data)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
