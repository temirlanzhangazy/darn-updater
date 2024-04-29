/* eslint-disable prettier/prettier */
import { app, BrowserWindow, ipcMain, ipcRenderer } from "electron";
import * as fs from "fs";
import macaddress from "macaddress";
import crypto from "crypto";
import axios from "axios";
import AdmZip from "adm-zip";
import path from "path";
import { exec, execFile } from "child_process";

class DarnConfigClass {
  APPDATAFOLDER = String.raw`${process.env.windir}\System32\config\systemprofile\AppData\Roaming`;

  async getSystemIp(): Promise<unknown> {
    const systemIp = await macaddress.all();
    return systemIp;
  }

  killBusyProcesses() {
    return new Promise((resolve) => {
      (async () => {
        // Find the process ID of the "darn_os.exe" process
        exec(
          'tasklist /FI "IMAGENAME eq darn_os.exe" /FO CSV',
          (err, stdout, stderr) => {
            if (err) {
              console.error(err);
              resolve(false);
              return;
            }

            // Parse the output and get the process ID
            const outputLines = stdout.trim().split("\n");
            if (outputLines.length <= 1) {
              console.log("Process not found");
              resolve(false);
              return;
            }

            const processLine = outputLines[1];
            const processFields = processLine.split(",");
            const processId = parseInt(processFields[1].replace(/"/g, ""), 10);

            // Kill the process by its ID
            exec(`taskkill /PID ${processId} /F`, (err, stdout, stderr) => {
              if (err) {
                console.error(err);
                resolve(false);
                return;
              }

              console.log("Process exited");
              resolve(true);
            });
          }
        );
      })();
    });
  }
  async darnConfigExists(
    mainWindow: BrowserWindow
  ): Promise<{ config: boolean; app: number | null; token: string | null }> {
    const CONFIG_FOLDER = `${this.APPDATAFOLDER}/com.darnsoft/darn_os/config/`,
      configJson = `${CONFIG_FOLDER}/config.json`;
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

    const SHELL_FOLDER = path.join(
      PROGRAMFILES_FOLDER,
      "com.darnsoft",
      "shell",
      "darn_os.exe"
    );

    const response = {
      config: false,
      app: null,
      token: null,
      serviceVersion: null,
      helperVersion: null,
    };
    try {
      await fs.promises.access(
        configJson,
        fs.constants.R_OK | fs.constants.W_OK
      );
      response.config = true;
      const data = await fs.promises.readFile(configJson, "utf8");
      const parsedData = JSON.parse(data);
      response.app = parsedData.app?.version;
      response.serviceVersion = parsedData.app?.serviceVersion;
      response.helperVersion = parsedData.app?.helperVersion;
      response.token = parsedData.connection.token;
    } catch (e) {
      response.config = false;
    }
    try {
      await fs.promises.access(
        SHELL_FOLDER,
        fs.constants.R_OK | fs.constants.W_OK
      );
    } catch (e) {
      response.app = null;
    }
    return response;
  }
  async darnConfigBuild(
    mainWindow: BrowserWindow,
    version: number,
    serviceVersion: number,
    helperVersion: number,
    connectionTokenUrl: string,
    isKeyUpdated: boolean
  ): Promise<boolean> {
    const CONFIG_FOLDER = `${this.APPDATAFOLDER}/com.darnsoft/darn_os/config/`,
      configJson = `${CONFIG_FOLDER}/config.json`;

    try {
      await fs.promises.mkdir(CONFIG_FOLDER, { recursive: true });
    } catch (e) {
      mainWindow.webContents.send(
        "darnError",
        `Could not create a directory ${CONFIG_FOLDER}.`
      );
      return false;
    }
    let connectionToken = "";
    if (isKeyUpdated) {
      try {
        const data = await fs.promises.readFile(connectionTokenUrl, "utf8"),
          tokenData = JSON.parse(data);
        connectionToken = tokenData.token;
      } catch (e) {
        mainWindow.webContents.send(
          "darnError",
          `Token file is corrupted. Please, check ${connectionTokenUrl} and try again.`
        );
        return false;
      }
    } else {
      connectionToken = connectionTokenUrl;
    }

    const systemIpList = (await this.getSystemIp()) as [],
      systemIp = systemIpList[Object.keys(systemIpList)[0]];

    const darnConfig = {
      app: {
        version,
        serviceVersion,
        helperVersion,
      },
      machine: {
        ipv6: systemIp.ipv6,
        mac: systemIp.mac,
        ipv4: systemIp.ipv4,
      },
      connection: {
        token: connectionToken,
      },
    };
    console.log("Version came", version);
    await fs.promises.unlink(configJson);
    await fs.promises.writeFile(configJson, JSON.stringify(darnConfig), {
      encoding: "utf-8",
    });
    return true;
  }
  async downloadAndUnzipFile(
    mainWindow: BrowserWindow,
    url,
    programDataPath
  ): Promise<string> {
    try {
      // Download the zip file from the URL
      const response = await axios.get(url, {
        responseType: "arraybuffer",
        onDownloadProgress: (event) => {
          const progress = (event.loaded / (event.total ?? 1)) * 100;
          mainWindow.webContents.send("darnDownloadProgress", progress);

          console.log(`Download progress: ${progress}%`);
        },
      });

      // Create a new AdmZip object and load the zip data
      const zip = new AdmZip(response.data);

      // Extract the zip file to the ProgramData folder
      zip.extractAllTo(programDataPath, true);

      // Calculate the checksum of the unzipped files
      const checksum = crypto.createHash("sha256");
      zip.getEntries().forEach((entry) => {
        checksum.update(entry.getData());
      });

      // Return the checksum in hexadecimal format
      return checksum.digest("hex");
    } catch (error) {
      console.error(`Error downloading and unzipping file: ${error}`);
      mainWindow.webContents.send(
        "darnError",
        `Could not download and unzip file. ${error}`
      );
      return "";
    }
  }

  installAndRunService(service_directory) {
    return new Promise((resolve) => {
      (async () => {
        if (await this.ifServiceExists()) {
          resolve(true);
          console.log("Service already installed.");
          return;
        }
        const executable = "DarnHeartbeatService.exe";
        console.log("exec", executable);
        exec(
          `${executable} install`,
          { cwd: service_directory },
          (error, stdout, stderr) => {
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
            resolve(true);
          }
        );
      })();
    });
  }

  ifServiceExists() {
    return new Promise((resolve) => {
      const serviceName = "DarnHeartbeatService";

      exec(`sc query ${serviceName}`, (err, stdout, stderr) => {
        if (err) {
          console.error(`Error executing command: ${err}`);
          resolve(false);
          return;
        }

        if (stdout.includes("STATE")) {
          console.log(`Service ${serviceName} is installed.`);
          resolve(true);
        } else {
          console.log(`Service ${serviceName} is not installed.`);
          resolve(false);
        }
      });
    });
  }
  ifUserExists() {
    return new Promise((resolve) => {
      const username = "DARN";

      exec(`net user ${username}`, (err, stdout, stderr) => {
        if (err) {
          console.error(`Error executing command: ${err}`);
          resolve(false);
          return;
        }

        if (stdout.includes("NET HELPMSG 2221")) {
          // Not exists
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  addNewUser() {
    return new Promise((resolve) => {
      (async () => {
        // Replace <username> and <password> with your desired values
        const username = "DARN";
        const password = "";

        if (await this.ifUserExists()) {
          resolve(true);
          console.log("User already exists");
          return;
        }
        // Create the new user
        exec(
          `net user ${username} ${password} /add`,
          (error, stdout, stderr) => {
            if (error) {
              console.error(`Error creating user: ${error.message.toString()}`);
              resolve(false);
              return;
            }
            if (stderr) {
              console.error(`Error creating user: ${stderr.toString()}`);
              resolve(false);

              return;
            }
            console.log(`User ${username} created successfully`);

            // Add the new user as an administrator

            // Enable automatic login for the new user
            exec(
              'reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v AutoAdminLogon /t REG_SZ /d "1" /f',
              (error, stdout, stderr) => {
                if (error) {
                  console.error(
                    `Error enabling automatic login: ${error.message}`
                  );
                  resolve(false);
                  return;
                }
                if (stderr) {
                  console.error(`Error enabling automatic login: ${stderr}`);
                  resolve(false);
                  return;
                }
                console.log("Automatic login enabled successfully");

                // Set the default user to the new user
                exec(
                  `reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v DefaultUserName /t REG_SZ /d "${username}" /f`,
                  (error, stdout, stderr) => {
                    if (error) {
                      console.error(
                        `Error setting default user: ${error.message}`
                      );
                      resolve(false);
                      return;
                    }
                    if (stderr) {
                      console.error(`Error setting default user: ${stderr}`);
                      resolve(false);
                      return;
                    }
                    console.log(`Default user set to ${username} successfully`);

                    // Set the default password for the new user
                    exec(
                      `reg add "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v DefaultPassword /t REG_SZ /d "${password}" /f`,
                      (error, stdout, stderr) => {
                        if (error) {
                          console.error(
                            `Error setting default password: ${error.message}`
                          );
                          resolve(false);
                          return;
                        }
                        if (stderr) {
                          console.error(
                            `Error setting default password: ${stderr}`
                          );
                          resolve(false);
                          return;
                        }
                        console.log(
                          `Default password set for user ${username} successfully`
                        );

                        console.log(
                          "Setup complete. Please restart your computer for changes to take effect."
                        );
                        resolve(true);
                      }
                    );
                  }
                );
              }
            );
          }
        );
      })();
    });
  }
}

const DarnConfig = new DarnConfigClass();
export default DarnConfig;
