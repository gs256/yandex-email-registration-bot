const { app, BrowserWindow } = require('electron')
const { ipcMain } = require('electron');

				
function createWindow () {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true
      }
    });

    win.loadFile('index.html');
    win.webContents.openDevTools();

    ipcMain.on('solver-msg', (event, arg) => {
        win.webContents.send('solver-msg', arg);
    }); 

    ipcMain.on('main-msg', (event, arg) => {
        win.webContents.send('main-msg', arg);
    });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
})
 
