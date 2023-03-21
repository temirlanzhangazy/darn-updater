/* eslint-disable prettier/prettier */
import { app, BrowserWindow, ipcMain, ipcRenderer } from 'electron'
import * as fs from 'fs'
import macaddress from 'macaddress'
import crypto from 'crypto'
import axios from 'axios'
import AdmZip from 'adm-zip'
import path from 'path'

class DarnConfigClass {
  async getSystemIp(): Promise<unknown> {
    const systemIp = await macaddress.all()
    return systemIp
  }
  async darnConfigExists(
    mainWindow: BrowserWindow
  ): Promise<{ config: boolean; app: number | null; token: string | null }> {
    const APPDATAFOLDER = app.getPath('appData'),
      CONFIG_FOLDER = `${APPDATAFOLDER}/com.darnsoft/darn_os/config/`,
      configJson = `${CONFIG_FOLDER}/config.json`
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

    const SHELL_FOLDER = path.join(PROGRAMFILES_FOLDER, 'com.darnsoft', 'shell', 'darn_os.exe')

    const response = {
      config: false,
      app: null,
      token: null
    }
    try {
      await fs.promises.access(configJson, fs.constants.R_OK | fs.constants.W_OK)
      response.config = true
      const data = await fs.promises.readFile(configJson, 'utf8')
      const parsedData = JSON.parse(data)
      response.app = parsedData.app.version
      response.token = parsedData.connection.token
    } catch (e) {
      response.config = false
    }
    try {
      await fs.promises.access(SHELL_FOLDER, fs.constants.R_OK | fs.constants.W_OK)
    } catch (e) {
      response.app = null
    }
    return response
  }
  async darnConfigBuild(
    mainWindow: BrowserWindow,
    version: number,
    connectionTokenUrl: string
  ): Promise<boolean> {
    const APPDATAFOLDER = app.getPath('appData'),
      CONFIG_FOLDER = `${APPDATAFOLDER}/com.darnsoft/darn_os/config/`,
      configJson = `${CONFIG_FOLDER}/config.json`

    try {
      await fs.promises.mkdir(CONFIG_FOLDER, { recursive: true })
    } catch (e) {
      mainWindow.webContents.send('darnError', `Could not create a directory ${CONFIG_FOLDER}.`)
      return false
    }
    let connectionToken = ''
    try {
      const data = await fs.promises.readFile(connectionTokenUrl, 'utf8'),
        tokenData = JSON.parse(data)
      connectionToken = tokenData.token
    } catch (e) {
      mainWindow.webContents.send(
        'darnError',
        `Token file is corrupted. Please, check ${connectionTokenUrl} and try again.`
      )
      return false
    }

    const systemIpList = (await this.getSystemIp()) as [],
      systemIp = systemIpList[Object.keys(systemIpList)[0]]

    const darnConfig = {
      app: {
        version
      },
      machine: {
        ipv6: systemIp.ipv6,
        mac: systemIp.mac,
        ipv4: systemIp.ipv4
      },
      connection: {
        token: connectionToken
      }
    }

    await fs.promises.writeFile(configJson, JSON.stringify(darnConfig))
    return true
  }
  async downloadAndUnzipFile(mainWindow: BrowserWindow, url, programDataPath): Promise<string> {
    try {
      // Download the zip file from the URL
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        onDownloadProgress: (event) => {
          const progress = (event.loaded / (event.total ?? 1)) * 100
          mainWindow.webContents.send('darnDownloadProgress', progress)

          console.log(`Download progress: ${progress}%`)
        }
      })

      // Create a new AdmZip object and load the zip data
      const zip = new AdmZip(response.data)

      // Extract the zip file to the ProgramData folder
      zip.extractAllTo(programDataPath, true)

      // Calculate the checksum of the unzipped files
      const checksum = crypto.createHash('sha256')
      zip.getEntries().forEach((entry) => {
        checksum.update(entry.getData())
      })

      // Return the checksum in hexadecimal format
      return checksum.digest('hex')
    } catch (error) {
      console.error(`Error downloading and unzipping file: ${error}`)
      mainWindow.webContents.send('darnError', `Could not download and unzip file. ${error}`)
      return ''
    }
  }
}

const DarnConfig = new DarnConfigClass()
export default DarnConfig
