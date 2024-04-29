import { app, shell, BrowserWindow, ipcMain, globalShortcut } from "electron";
import path, { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import * as fs from "fs";
import DarnConfig from "./models/darnConfig";
import { autoUpdater, AppUpdater } from "electron-updater";

autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.autoDownload = true;

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 500,
    height: 750,
    alwaysOnTop: true,
    darkTheme: true,
    fullscreenable: false,
    minHeight: 750,
    minWidth: 510,
    maxHeight: 1000,
    maxWidth: 600,
    vibrancy: "dark",
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#121212",
      symbolColor: "#FD1D42",
      height: 30,
    },
    autoHideMenuBar: true,
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      // devTools: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();

    autoUpdater.checkForUpdatesAndNotify();
    autoUpdater.on("update-available", (info) => {
      mainWindow.webContents.send(
        "darnInfo",
        `Найдено обновление установщика. Ожидайте окончания обновления перед установкой Darn OS.`
      );
      mainWindow.webContents.send("darnUpdaterDownloadProgress", 0.1);
    });
    autoUpdater.on("download-progress", (info) => {
      mainWindow.webContents.send("darnUpdaterDownloadProgress", info.percent);
    });
    autoUpdater.on("update-downloaded", (info) => {
      mainWindow.webContents.send(
        "darnInfo",
        "Обновление успешно установлено. Перезапуск приложения..."
      );
      setTimeout(() => {
        autoUpdater.quitAndInstall();
      }, 2000);
    });
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  ipcMain.handle("darnConfigExists", async () => {
    return await DarnConfig.darnConfigExists(mainWindow);
  });

  ipcMain.handle("getAppVersion", async () => {
    return app.getVersion();
  });
  ipcMain.handle("openLink", (e, link: string) => {
    shell.openExternal(link);
  });
  ipcMain.handle(
    "darnStartDownloading",
    async (
      event,
      data: {
        url: string;
        service_url: string;
        helper_url: string;

        version: number;
        serviceVersion: number;
        helperVersion: number;

        connectionTokenUrl: string;
        isKeyUpdated: boolean;
      }
    ) => {
      let PROGRAMFILES_FOLDER = process.env.ProgramFiles;

      if (
        !PROGRAMFILES_FOLDER ||
        PROGRAMFILES_FOLDER.length == 0 ||
        PROGRAMFILES_FOLDER.length == undefined
      ) {
        mainWindow.webContents.send(
          "darnError",
          `Failed getting Program Files directory. Assuming C:\\Program Files.`
        );
        PROGRAMFILES_FOLDER = "C:\\Program Files";
      }

      const SHELL_APP = path.join(PROGRAMFILES_FOLDER, "com.darnsoft", "shell"),
        SERVICE_APP = path.join(PROGRAMFILES_FOLDER, "com.darnsoft", "service"),
        HELPER_APP = path.join(PROGRAMFILES_FOLDER, "com.darnsoft", "helper");
      try {
        await DarnConfig.killBusyProcesses();
        await fs.promises.mkdir(SHELL_APP, { recursive: true });
        await fs.promises.mkdir(SERVICE_APP, { recursive: true });
        await fs.promises.mkdir(HELPER_APP, { recursive: true });
        await DarnConfig.downloadAndUnzipFile(mainWindow, data.url, SHELL_APP);
        await DarnConfig.downloadAndUnzipFile(
          mainWindow,
          data.service_url,
          SERVICE_APP
        );
        await DarnConfig.downloadAndUnzipFile(
          mainWindow,
          data.helper_url,
          HELPER_APP
        );
        const status = await DarnConfig.darnConfigBuild(
          mainWindow,
          data.version,
          data.serviceVersion,
          data.helperVersion,
          data.connectionTokenUrl,
          data.isKeyUpdated
        );
        if (!status) {
          mainWindow.webContents.send(
            "darnError",
            "Could not create a config file."
          );
          return;
        }
      } catch (e) {
        if (e!.toString().includes("EPERM")) {
          mainWindow.webContents.send(
            "darnError",
            `Ошибка: Нет доступа к системным файлам. Запустите программу от имени администратора.`
          );
          return;
        }
        mainWindow.webContents.send("darnError", `${e}`);
        return;
      }
      const serviceState = await DarnConfig.installAndRunService(SERVICE_APP);
      if (!serviceState) {
        mainWindow.webContents.send("darnError", "Could not install service.");
        return;
      }
      const userState = await DarnConfig.addNewUser();
      if (!userState) {
        mainWindow.webContents.send("darnError", "Could not create new user.");
        return;
      }
      mainWindow.webContents.send(
        "darnSuccess",
        "Перезагрузите устройство для внесения изменений."
      );
      mainWindow.webContents.send("darnConfigUpdateState");
      return true;
    }
  );
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.darnsoft");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  globalShortcut.register("Control+Shift+I", () => {
    return false;
  });

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
