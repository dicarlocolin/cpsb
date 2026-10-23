const {app,BrowserWindow,dialog,net}=require('electron');
const path=require('node:path');
const {startServer}=require('./server.cjs');
let service, window, quitting=false;
if(!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  app.whenReady().then(async()=>{
    service=await startServer({port:47831,publicDir:path.join(__dirname,'../public'),dataDir:app.getPath('userData'),fetchJSON:async url=>{
      const response=await net.fetch(url,{cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error(`Public scoreboard returned ${response.status}`);
      return response.json();
    }});
    function openWindow(){
      window=new BrowserWindow({width:1440,height:1000,minWidth:700,minHeight:600,title:'CyPat Scoreboard',backgroundColor:'#131517',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
      window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      window.webContents.on('will-navigate',(event,url)=>{if(new URL(url).origin!==service.url)event.preventDefault();});
      window.loadURL(service.url);
      window.on('closed',()=>{window=null;});
    }
    openWindow();app.on('activate',()=>{if(!window)openWindow();});
  }).catch(error=>{dialog.showErrorBox('Unable to start CyPat Scoreboard',error.message);app.quit();});
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',event=>{if(service&&!quitting){event.preventDefault();quitting=true;service.close().finally(()=>app.quit());}});
}
