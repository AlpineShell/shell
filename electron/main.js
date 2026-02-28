const { app, BrowserWindow } = require('electron')
const path = require('path')
const windows = require('./windows')

function createWindow() {
  const win = new BrowserWindow({
    fullscreen: true,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  })
  win.loadURL('http://localhost:5173')
}

app.whenReady().then(() => {
  windows.registerAll()
  createWindow()
})