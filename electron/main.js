const { app, BrowserWindow } = require('electron')
const path = require('path')
const ipc = require('./ipc')
const wallpaper = require('./modules/wallpaper')
const network = require('./modules/network')
const bluetooth = require('./modules/bluetooth')

function createWindow() {
  const win = new BrowserWindow({
    fullscreen: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  win.loadURL('http://localhost:5173')
}

app.whenReady().then(() => {
  ipc.register(wallpaper, network, bluetooth)
  createWindow()
})