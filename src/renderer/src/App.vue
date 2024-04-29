<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<template>
  <div class="main-content">
    <img alt="Vue logo" src="./assets/darn-logo-white.svg" width="150" draggable="false"/>
    <div class="sizedbox h-50"></div>
    <div class="inner-content">
      <div class="ic-row">
        <span>Версия установщика:</span>
        <el-tag type="info">{{ ui_state.versionData.updaterVersion ?? 'Загрузка...' }}</el-tag>
      </div>
      <div class="ic-row">
        <span>Версия DARN OS:</span>
        <el-tag v-if="ui_state.status == UpdaterStatus.Loading" type="warning">Загрузка...</el-tag>
        <el-tag v-else-if="ui_state.status == UpdaterStatus.UpToDate" type="success"
          >Последняя версия</el-tag
        >
        <el-tag v-else-if="ui_state.status == UpdaterStatus.ReadyToUpdate" type="warning"
          >Доступно обновление</el-tag
        >
        <el-tag v-else-if="ui_state.status == UpdaterStatus.NotInstalled" type="danger"
          >Не установено</el-tag
        >
      </div>
      <div class="ic-row">
        <span>Файлы конфигураций:</span>
        <el-tag v-if="ui_state.errors" type="danger"
          >Ошибки</el-tag
        >
        <el-tag v-if="ui_state.configFileStatus == UpdaterStatus.Loading" type="warning"
          >Загрузка...</el-tag
        >
        <el-tag v-else-if="ui_state.configFileStatus == UpdaterStatus.UpToDate && !ui_state.errors" type="success"
          >В порядке</el-tag
        >
        <el-tag v-else-if="ui_state.configFileStatus == UpdaterStatus.ReadyToUpdate" type="danger"
        >Не установено</el-tag
        >
      </div>
      <div class="sizedbox"></div>
      <span v-if="ui_state.errors" class="darn-warning">Произошла ошибка во время установки DARN. <br/>Убедитесь что Вы запустили установщик от имени администратора, <br/>или обратитесь в службу поддержки.</span>
      <el-upload drag :auto-upload="false" :limit="1" accept=".darnkey" @change="darnKeyInserted">
        <template v-if="!ui_state.keyPath">
          <el-icon class="el-icon--upload"><UploadFilled /></el-icon>
          <div class="el-upload__text">
            Перетащите цифровой сертификат сюда или <em>нажмите чтобы загрузить</em>
          </div>
        </template>
        <template v-else>
          <el-icon class="el-icon--upload" style="color: var(--el-color-primary)"
            ><CircleCheckFilled
          /></el-icon>
          <div class="el-upload__text">
            Цифровой сертификат загружен. <em>Нажмите чтобы заменить</em>
          </div>
        </template>

        <template #tip>
          <div class="el-upload__tip">файл .darnkey</div>
        </template>
      </el-upload>
      <div v-if="ui_state.download.progress > 0 && !ui_state.errors" class="ic-col">
        <span>{{
          ui_state.download.progress >= 100 ? 'Установка завершена.' : 'Идет установка...'
        }}</span>
        
        <el-progress
          v-if="ui_state.download.updaterUpdateProgress != null"
          type="circle"
          :percentage="ui_state.download.updaterUpdateProgress.toFixed()"
          :status="ui_state.download.updaterUpdateProgress >= 100 ? 'success' : ''"
        />
        <el-progress
          v-else
          type="circle"
          :percentage="ui_state.download.progress.toFixed()"
          :status="ui_state.download.progress >= 100 ? 'success' : ''"
        />
      </div>
    </div>
    <div class="sizedbox"></div>
    <el-button
      @click="darnStartDownloading"
      :disabled="
        (ui_state.status != UpdaterStatus.ReadyToUpdate &&
          ui_state.status != UpdaterStatus.NotInstalled) ||
        ui_state.keyPath == '' ||
        ui_state.keyPath == null || ui_state.download.updaterUpdateProgress != null
      "
      :icon="UploadFilled"
      >Установить</el-button
    >
    <el-button
      @click="darnStartDownloading"
      :disabled="
        (ui_state.status != UpdaterStatus.ReadyToUpdate &&
          ui_state.status != UpdaterStatus.UpToDate) ||
        ui_state.keyPath == '' ||
        ui_state.keyPath == null || ui_state.download.updaterUpdateProgress != null
      "
      :icon="FirstAidKit"
      text
      >Исправить</el-button
    >
  </div>
  <el-link class="politics" @click="openPolicies">Политика конфиденциальности и публичная оферта</el-link>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { UploadFilled, FirstAidKit, CircleCheckFilled } from '@element-plus/icons-vue'
enum UpdaterStatus {
  Loading,
  NoInternetConnection,
  ReadyToUpdate,
  UpToDate,
  NotInstalled
}
interface ui_state_interface {
  status: UpdaterStatus
  configFileStatus: UpdaterStatus
  keyPath: string
  updatedKey: boolean
  versionData: {
    version: [number, number]
    serviceVersion: number,
    helperVersion: number,
    updaterVersion: String | null,
    download_url: string,
    service_download_url: string,
    helper_download_url: string,
  }
  errors: boolean,
  download: {
    progress: number,
    updaterUpdateProgress: number | null,
  }
}
const ui_state = ref<ui_state_interface>({
  status: UpdaterStatus.Loading,
  configFileStatus: UpdaterStatus.Loading,
  keyPath: '',
  errors: false,
  updatedKey: false,
  versionData: {
    version: [0, 0],
    serviceVersion: 0,
    helperVersion: 0,
    updaterVersion: null,
    download_url: '',
    service_download_url: '',
    helper_download_url: '',
  },
  download: {
    progress: 0,
    updaterUpdateProgress: null,
  }
})
class AxiosResponse {
  status: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(status: boolean, data: any) {
    this.status = status
    this.data = data
  }
}
onMounted(async () => {
  ui_state.value.versionData.updaterVersion = await window.electron.ipcRenderer.invoke('getAppVersion');
  const response: AxiosResponse = await window.api.getQuery(
    'https://auth.darn.webspark.kz/api/checkVersion.php',
    {}
  )
  if (!response.status) {
    ui_state.value.status = UpdaterStatus.NoInternetConnection
    return
  }
  ui_state.value.status = UpdaterStatus.Loading
  ui_state.value.versionData.version = response.data.version;
  ui_state.value.versionData.serviceVersion = response.data.serviceVersion;
  ui_state.value.versionData.helperVersion = response.data.helperVersion;
  ui_state.value.versionData.download_url = response.data.download_url;
  ui_state.value.versionData.service_download_url = response.data.service_download_url;
  ui_state.value.versionData.helper_download_url = response.data.helper_download_url;
  
  checkConfigFile()

  window.electron.ipcRenderer.on('darnConfigUpdateState', (_event) => {
    checkConfigFile()
  })
  window.electron.ipcRenderer.on('darnDownloadProgress', (_event, progress: number) => {
    console.log('darnDownloadProgress', progress)
    ui_state.value.download.progress = progress
  })
  window.electron.ipcRenderer.on('darnError', (_event, error: string) => {
    ElMessage({
      type: 'error',
      duration: 15000,
      showClose: true,
      message: error,
    });
    ui_state.value.errors = true;
  })
  window.electron.ipcRenderer.on('darnSuccess', (_event, error: string) => {
    ElMessage({
      type: 'success',
      duration: 15000,
      showClose: true,
      message: error,
    });
  })
  window.electron.ipcRenderer.on('darnInfo', (_event, info: string) => {
    ElMessage({
      type: 'info',
      duration: 15000,
      showClose: true,
      message: info,
    });
  })
  window.electron.ipcRenderer.on('darnUpdaterDownloadProgress', (_event, percent) => {
    ui_state.value.download.updaterUpdateProgress = percent;
  })
  

  //
  console.log(ui_state)
})

async function darnKeyInserted(file): Promise<void> {
  ui_state.value.keyPath = file.raw.path as string
  ui_state.value.updatedKey = true;
  console.log(ui_state.value)
}

async function darnStartDownloading(): Promise<void> {
  if (ui_state.value.download.updaterUpdateProgress != null) return;
  await window.electron.ipcRenderer.invoke(
    'darnStartDownloading',
    {
      url: ui_state.value.versionData.download_url,
      service_url: ui_state.value.versionData.service_download_url,
      helper_url: ui_state.value.versionData.helper_download_url,

      version: ui_state.value.versionData.version[1],
      serviceVersion: ui_state.value.versionData.serviceVersion,
      helperVersion: ui_state.value.versionData.helperVersion,

      connectionTokenUrl: ui_state.value.keyPath,
      isKeyUpdated: ui_state.value.updatedKey,
    }
  )
}

async function checkConfigFile(): Promise<void> {
  const darnConfig = await window.electron.ipcRenderer.invoke('darnConfigExists')
  console.log('darnConfig', darnConfig, ui_state.value.versionData.version)
  ui_state.value.keyPath = darnConfig?.token
  if (darnConfig.config) {
    ui_state.value.configFileStatus = UpdaterStatus.UpToDate
  } else {
    ui_state.value.configFileStatus = UpdaterStatus.ReadyToUpdate
  }
  if (!darnConfig.app) {
    ui_state.value.status = UpdaterStatus.NotInstalled
    return
  }
  if (
    (darnConfig.app >= ui_state.value.versionData.version[0] &&
    darnConfig.app <= ui_state.value.versionData.version[1]) && 
    (darnConfig.serviceVersion >= ui_state.value.versionData.serviceVersion) &&
    (darnConfig.helperVersion >= ui_state.value.versionData.helperVersion)
  ) {
    ui_state.value.status = UpdaterStatus.UpToDate
  } else {
    ui_state.value.status = UpdaterStatus.ReadyToUpdate
  }
}
function openPolicies() {
  window.electron.ipcRenderer.invoke('openLink', 'https://darnsoft.com/policies');
}
</script>

<style>
html,
body {
  margin: 0;
  overflow: hidden;

  display: flex;
  justify-content: center;
}
* {
  font-family: Avenir, Helvetica, Arial, sans-serif;
}
#app {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-align: center;
  max-width: 700px;
  height: 100vh;
  width: 100vw;
}
.el-button + .el-button {
  margin: 10px 0 0 0 !important;
}

fieldset {
  margin: 2rem;
  padding: 1rem;
}
h2 {
  font-weight: 500;
}
</style>

<style scoped>
.main-content {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.sizedbox {
  width: 100%;
  height: 20px;
}
.sizedbox.h-50 {
  height: 50px;
}
.ic-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 5px;
}
.ic-row span {
  width: 200px;
  text-align: left;
}
.ic-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.politics {
  position: absolute;
  bottom: 10px;
  left: 50%;
  width: max-content;
  text-align: center;
  display: flex;
  transform: translateX(-50%);
}
.darn-warning {
  display: block;
  font-size: 13px;
  padding-bottom: 20px;
  color: var(--el-color-danger);
}
</style>
