<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<!-- eslint-disable @typescript-eslint/no-explicit-any -->
<template>
  <div class="main-content">
    <img alt="Vue logo" src="./assets/darn-logo-white.svg" width="150" />
    <div class="sizedbox h-50"></div>
    <div class="inner-content">
      <div class="ic-row">
        <span>Текущая версия:</span>
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
        <el-tag v-if="ui_state.configFileStatus == UpdaterStatus.Loading" type="warning"
          >Загрузка...</el-tag
        >
        <el-tag v-else-if="ui_state.configFileStatus == UpdaterStatus.UpToDate" type="success"
          >В порядке</el-tag
        >
        <el-tag v-else-if="ui_state.configFileStatus == UpdaterStatus.ReadyToUpdate" type="danger"
          >Не установено</el-tag
        >
      </div>
      <div class="sizedbox"></div>
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
      <div v-if="ui_state.download.progress > 0" class="ic-col">
        <span>{{
          ui_state.download.progress >= 100 ? 'Установка завершена.' : 'Идет установка...'
        }}</span>
        <el-progress
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
        ui_state.keyPath == null
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
        ui_state.keyPath == null
      "
      :icon="FirstAidKit"
      text
      >Исправить</el-button
    >
  </div>
  <el-link class="politics">Политика конфиденциальности и публичная оферта</el-link>
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
  versionData: {
    version: [number, number]
    download_url: string
  }
  download: {
    progress: number
  }
}
const ui_state = ref<ui_state_interface>({
  status: UpdaterStatus.Loading,
  configFileStatus: UpdaterStatus.Loading,
  keyPath: '',
  versionData: {
    download_url: '',
    version: [0, 0]
  },
  download: {
    progress: 0
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
  const response: AxiosResponse = await window.api.getQuery(
    'https://auth.darn.webspark.kz/api/checkVersion.php',
    {}
  )
  if (!response.status) {
    ui_state.value.status = UpdaterStatus.NoInternetConnection
    return
  }
  ui_state.value.status = UpdaterStatus.Loading
  ui_state.value.versionData = {
    version: response.data.version,
    download_url: response.data.download_url
  }
  checkConfigFile()

  window.electron.ipcRenderer.on('darnConfigUpdateState', (_event) => {
    checkConfigFile()
  })
  window.electron.ipcRenderer.on('darnDownloadProgress', (_event, progress: number) => {
    console.log('darnDownloadProgress', progress)
    ui_state.value.download.progress = progress
  })
  window.electron.ipcRenderer.on('darnError', (_event, error: string) => {
    ElMessage.error(error)
  })

  //
  console.log(ui_state)
})

async function darnKeyInserted(file): Promise<void> {
  ui_state.value.keyPath = file.raw.path as string
  console.log(ui_state.value)
}

async function darnStartDownloading(): Promise<void> {
  const hash = await window.electron.ipcRenderer.invoke(
    'darnStartDownloading',
    ui_state.value.versionData.download_url,
    ui_state.value.versionData.version[1],
    ui_state.value.keyPath
  )
  console.log(hash)
}

async function checkConfigFile(): Promise<void> {
  const darnConfig = await window.electron.ipcRenderer.invoke('darnConfigExists')
  console.log('darnConfig', darnConfig)
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
    darnConfig.app >= ui_state.value.versionData.version[0] &&
    darnConfig.app <= ui_state.value.versionData.version[1]
  ) {
    ui_state.value.status = UpdaterStatus.UpToDate
  } else {
    ui_state.value.status = UpdaterStatus.ReadyToUpdate
  }
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
#app {
  font-family: Avenir, Helvetica, Arial, sans-serif;
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
</style>
