import { app, shell, BrowserWindow, ipcMain, globalShortcut } from 'electron'
import path, { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as fs from 'fs'
import DarnConfig from './models/darnConfig'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 500,
    height: 670,
    alwaysOnTop: true,
    darkTheme: true,
    fullscreenable: false,
    minHeight: 690,
    minWidth: 510,
    maxHeight: 900,
    maxWidth: 600,
    vibrancy: 'dark',
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      devTools: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  ipcMain.handle('darnConfigExists', async () => {
    return await DarnConfig.darnConfigExists(mainWindow)
  })

  ipcMain.handle(
    'darnStartDownloading',
    async (event, url: string, version: number, connectionTokenUrl: string) => {
      const state = await DarnConfig.darnConfigExists(mainWindow)
      if (!state.config) {
        const status = await DarnConfig.darnConfigBuild(mainWindow, version, connectionTokenUrl)
        if (!status) {
          mainWindow.webContents.send('darnError', 'Could not create a config file.')
          return
        }
      }
      mainWindow.webContents.send('darnConfigUpdateState')

      let PROGRAMFILES_FOLDER = process.env.ProgramFiles

      if (
        !PROGRAMFILES_FOLDER ||
        PROGRAMFILES_FOLDER.length == 0 ||
        PROGRAMFILES_FOLDER.length == undefined
      ) {
        mainWindow.webContents.send(
          'darnError',
          `Failed getting Program Files directory. Assuming C:\\Program Files.`
        )
        PROGRAMFILES_FOLDER = 'C:\\Program Files'
      }

      const SHELL_APP = path.join(PROGRAMFILES_FOLDER, 'com.darnsoft', 'shell')
      await fs.promises.mkdir(SHELL_APP, { recursive: true })
      const checksum = await DarnConfig.downloadAndUnzipFile(mainWindow, url, SHELL_APP)
      mainWindow.webContents.send('darnConfigUpdateState')
      return checksum
    }
  )
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.darnsoft')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  globalShortcut.register('Control+Shift+I', () => {
    // When the user presses Ctrl + Shift + I, this function will get called
    // You can modify this function to do other things, but if you just want
    // to disable the shortcut, you can just return false
    return false
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
