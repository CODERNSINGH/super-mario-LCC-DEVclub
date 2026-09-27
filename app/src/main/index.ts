import { app, BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { nativeImage } from 'electron'
import { registerIpc } from './ipc'
import { loadEnv } from './env'
import { startServer, stopServer } from './server'
import { killAllTerminals } from './terminal'

function createWindow(): void {
  const win = new BrowserWindow({
    title: 'Sakai IDE',
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#0b0b0c',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 14 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Pop-and-zoom entrance: appears small then scales to full size.
  win.once('ready-to-show', () => {
    win.show()
    win.webContents.send('window:entrance')
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

loadEnv()

app.whenReady().then(async () => {
  // Packaged builds take the icon from build/icon.icns; in dev, set the Dock icon explicitly.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(nativeImage.createFromPath(join(__dirname, '../../build/icon.png')))
  registerIpc()
  await startServer()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('before-quit', () => { stopServer(); killAllTerminals() })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
