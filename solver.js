
class Solver {
	
	constructor() {
		const win = new BrowserWindow({
		    	width: 800,
		    	height: 600,
		    	webPreferences: {
		    	nodeIntegration: true
		    }
		});
	  
		win.loadFile('task.html');
	}

}

// ipcRenderer.on('solver-msg', (event, arg) => {
//     console.log(arg);
// });

exports.Solver = Solver;