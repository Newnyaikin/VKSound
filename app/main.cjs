'use strict';
const {app,BrowserWindow,ipcMain,session,protocol,net,dialog,globalShortcut,Tray,Menu,nativeImage,nativeTheme,powerMonitor,clipboard,screen,shell}=require('electron');
const path=require('node:path');
const fs=require('node:fs/promises');
const {spawn}=require('node:child_process');
const {dataFolders,openDataFolder}=require('./data-folders.cjs');
const {windowOptions,applyWindowTheme}=require('./window-theme.cjs');
const {migrateData}=require('./data-paths.cjs');
const {LoginProbe,sessionReady}=require('./login-probe.cjs');const loginProbe=new LoginProbe();
const {Discovery}=require('./discovery.cjs');const {Confirmations}=require('./confirmations.cjs');let discovery,confirmations;
const {trustedLogin,AppError,publicError}=require('./model.cjs');
const {LibraryStore,cleanSettings}=require('./store.cjs');const {OfflineCache}=require('./offline.cjs');
const {readAlbum}=require('./read-album.cjs');const {Recommendations}=require('./recommendations.cjs');const {readRecommendation}=require('./read-recommendation.cjs');let recommendations;
const {PlaybackSession}=require('./session-state.cjs');const {shareLink}=require('./share-links.cjs');let playbackSession;
const {parseVkLink}=require('./vk-links.cjs');
const {RecentTracks}=require('./recent.cjs');let recent,historyPlayback=null,lastHistorySequence=-1;
const {LocalFiles,LOCAL_KEY}=require('./local-files.cjs');const {showFullWindow}=require('./window-state.cjs');
const {trayImage}=require('./tray-icon.cjs');const {MiniPlayer,seekRequest,cleanState:cleanMiniState}=require('./mini-player.cjs');let miniPlayer,miniState=null;
const {VkWrites}=require('./vk-writes.cjs');const {CoverCache}=require('./covers.cjs');
const {syncLibrary,syncLists}=require('./sync.cjs');const {AutoCache}=require('./auto-cache.cjs');
const {VkClient}=require('./vk-client.cjs');const {MediaBridge}=require('./media.cjs');
const {GitHubUpdater}=require('./github-updater.cjs');const buildInfo=require('../package.json');
const githubUpdater=new GitHubUpdater({repository:buildInfo.repository,buildId:buildInfo.buildId,currentVersion:app.getVersion(),tempDir:app.getPath('temp')});
protocol.registerSchemesAsPrivileged(['volna-media','volna-offline','volna-local','sozvuk-cover'].map(scheme=>({scheme,privileges:{standard:true,secure:true,supportFetchAPI:true,corsEnabled:true,stream:true}})));
app.setName('VKSound');app.setPath('userData',path.join(app.getPath('appData'),'VKSound'));app.setAppUserModelId('io.volna.directgui');
let retainedTrayImage,lastCommandAt=0,lastCommandName;
let localFiles,covers,writeBusy=false,batchBusy=false,autoCache,activeMedia=null,syncJob=null,syncState={busy:false},cacheState={},store,cache,tray,settingsBusy=false,quitting=false,shortcutErrors=[],lastSavedVolume;
let main,loginWindow,vkSession,client,bridge,loginTimer,loginDeadline=0,checking=false,generation=0;
let pendingUpdatePath=null;
let status={state:'signedOut',profile:null,message:''};let cleanup=false,playSequence=0,restoring=false;
function dataEvent(type,data){if(main&&!main.isDestroyed())main.webContents.send('volna:data',{type,...data});}
const send=()=>{if(main&&!main.isDestroyed())main.webContents.send('volna:status',status);};
const set=s=>{if(s.state==='signedOut'||s.state==='clearing')recommendations?.reset();status={...status,...s};send();};
const closeLogin=()=>{clearInterval(loginTimer);loginTimer=null;if(loginWindow&&!loginWindow.isDestroyed()){const w=loginWindow;loginWindow=null;w.destroy();}};
const ownFrame=e=>main&&!main.isDestroyed()&&e.sender===main.webContents&&e.senderFrame?.processId===main.webContents.mainFrame.processId&&e.senderFrame?.routingId===main.webContents.mainFrame.routingId;
function bind(name,fn){ipcMain.handle('volna:'+name,async(e,arg)=>{if(!ownFrame(e))return {ok:false,error:{code:'IPC',message:'Недопустимый источник команды.'}};const invocationGeneration=generation;try{return {ok:true,data:await fn(arg)};}catch(error){const safe=publicError(error);if(invocationGeneration===generation&&['AUTH','ACCOUNT_CHANGED'].includes(safe.code)){generation++;syncState={busy:false};cacheState={};activeMedia=null;autoCache?.reset();playSequence++;client.reset({suspend:true});bridge.clear();set({state:'signedOut',profile:null,message:safe.message});}return {ok:false,error:safe};}});}
async function checkLogin(){
 if(checking||!loginWindow||status.state!=='signingIn')return;
 if(Date.now()>loginDeadline){cancelLogin('Время входа истекло. Можно попробовать снова.');return;}
 if(loginProbe.exhausted)return;
 checking=true;const mine=generation,w=loginWindow;
 try{
  const cookies=await vkSession.cookies.get({});
  if(mine!==generation||loginWindow!==w)return;
  if(!loginProbe.reserve(w.webContents.getURL(),cookies))return;
  await client.connect();const profile=await client.profile();
  if(mine!==generation||loginWindow!==w)return;closeLogin();await activateProfile(profile);
  if(mine===generation)set({state:'ready',profile,message:'Аккаунт подключён.'});
 }catch(error){if(mine!==generation)return;const safe=publicError(error);
  if(safe.code==='RATE'){loginProbe.stop();cancelLogin(safe.message+' Автоматическая проверка входа остановлена. Не повторяйте вход подряд.');}
  else if(loginProbe.exhausted)set({message:'Автопроверка входа остановлена после трёх попыток. Закройте окно и попробуйте позже.'});
  else if(['NETWORK','PROTOCOL','API'].includes(safe.code))set({message:safe.message});
 }finally{checking=false;}
}
function cancelLogin(message='Вход отменён.'){
 if(status.state!=='signingIn')return;generation++;syncState={busy:false};cacheState={};activeMedia=null;autoCache?.reset();client.reset({suspend:true});closeLogin();set({state:'signedOut',profile:null,message});
}
async function startLogin(){
 if(cleanup)throw new AppError('BUSY','Дождитесь завершения выхода.');client.gate.check();
 if(status.state==='signingIn'&&loginWindow){loginWindow.show();loginWindow.focus();return status;}
 generation++;syncState={busy:false};cacheState={};activeMedia=null;autoCache?.reset();restoring=false;playSequence++;client.reset({suspend:true});client.resume();bridge.clear();closeLogin();
 set({state:'signingIn',profile:null,message:'Войдите в официальном окне VK. Пароль и код вводятся только там.'});
 const w=new BrowserWindow({width:540,height:760,minWidth:420,minHeight:600,parent:main,show:false,title:'Вход в VK — VKSound',autoHideMenuBar:true,...windowOptions(),webPreferences:{session:vkSession,nodeIntegration:false,contextIsolation:true,sandbox:true,devTools:false}});
 loginWindow=w;applyWindowTheme(w,store.settings.theme,nativeTheme.shouldUseDarkColors);loginProbe.begin();loginDeadline=Date.now()+5*60000;
 const navigation=(event,url)=>{if(!trustedLogin(url))event.preventDefault();};
 w.webContents.on('will-navigate',navigation);w.webContents.on('will-redirect',navigation);
 w.webContents.setWindowOpenHandler(({url})=>{if(trustedLogin(url))w.loadURL(url).catch(()=>{});return {action:'deny'};});
 w.webContents.on('did-navigate',(_,url)=>{if(trustedLogin(url))w.setTitle('Вход в VK — '+new URL(url).origin+' — VKSound');});
 w.webContents.on('page-title-updated',e=>e.preventDefault());
 w.webContents.on('did-finish-load',()=>{if(loginWindow===w){w.show();checkLogin();}});
 w.on('closed',()=>{if(loginWindow===w){loginWindow=null;clearInterval(loginTimer);loginTimer=null;cancelLogin();}});
 w.once('ready-to-show',()=>w.show());
 loginTimer=setInterval(checkLogin,5000); // Checks local URL/cookies; network checks are gated separately.
 w.loadURL('https://vk.ru/').catch(()=>{if(loginWindow===w)set({message:'Не удалось открыть сайт VK. Проверьте интернет и попробуйте снова.'});});
 w.show();return status;
}
async function logout(){
 if(cleanup)throw new AppError('BUSY','Выход уже выполняется.');cleanup=true;generation++;syncState={busy:false};cacheState={};activeMedia=null;autoCache?.reset();restoring=false;playSequence++;closeLogin();client.reset({suspend:true});bridge.clear();set({state:'clearing',profile:null,message:'Очищаем локальный сеанс VK…'});
 try{await vkSession.clearStorageData();await vkSession.clearCache();await store.activate(null);await cache.activate(null);await covers.activate(null);set({state:'signedOut',profile:null,message:'Вы вышли из VK. Локальный сеанс очищен.'});return status;}
 catch{set({state:'signedOut',profile:null,message:'Не удалось полностью очистить сеанс. Повторите выход перед сменой аккаунта.'});throw new AppError('CLEANUP','Не удалось полностью очистить сеанс. Повторите выход.');}
 finally{cleanup=false;}
}
async function activateProfile(profile){recommendations?.reset();
 await store.activate(profile);await cache.activate(profile.id);await covers.activate(profile.id);client.restoreRefs(Object.values(store.data.rows));
}
function sendVisibility(){if(main&&!main.isDestroyed()&&!main.webContents.isDestroyed())main.webContents.send('volna:visibility',{visible:main.isVisible()&&!main.isMinimized(),miniVisible:!!miniPlayer?.window&&!miniPlayer.window.isDestroyed()&&miniPlayer.window.isVisible()});}
function showMain(){miniPlayer?.hide();showFullWindow(main);}
function command(name){const now=Date.now();if(name===lastCommandName&&now-lastCommandAt<180)return;lastCommandName=name;lastCommandAt=now;if(name==='show')showMain();else if(main&&!main.isDestroyed())main.webContents.send('volna:command',name);}
function configureShortcuts(settings){
 globalShortcut.unregisterAll();const errors=[];
 for(const [name,accelerator] of Object.entries(settings.hotkeys)){if(!accelerator)continue;try{if(!globalShortcut.register(accelerator,()=>command(name)))errors.push(name);}catch{errors.push(name);}}
 return errors;
}
function configureDesktop(settings){
 if(process.argv.includes('--smoke-test'))return;
 if(process.platform==='win32'&&app.isPackaged)app.setLoginItemSettings({openAtLogin:settings.autostart,path:process.execPath,args:[]});
 if(settings.tray&&!tray){retainedTrayImage=trayImage(nativeImage,path.join(__dirname,'../assets'));tray=new Tray(retainedTrayImage);tray.setToolTip('VKSound — музыкальный плеер');tray.setContextMenu(Menu.buildFromTemplate([{label:'Открыть VKSound',click:showMain},{label:'Показать / скрыть мини-плеер',click:()=>miniPlayer?.toggle(tray.getBounds())},{type:'separator'},{label:'Пауза / продолжить',click:()=>command('toggle')},{label:'Предыдущий трек',click:()=>command('prev')},{label:'Следующий трек',click:()=>command('next')},{type:'separator'},{label:'Выйти',click:()=>{quitting=true;app.quit();}}]));tray.on('click',()=>miniPlayer?.toggle(tray.getBounds()));tray.on('right-click',()=>miniPlayer?.hide());}
 if(!settings.tray&&tray){miniPlayer?.destroy();tray.destroy();tray=null;}
}
async function rememberPage(data,options){await store.remember(data.rows,options);return data;}
if(!app.requestSingleInstanceLock())app.exit(0);
app.on('second-instance',showMain);
function refreshTrayImage(){if(!tray||tray.isDestroyed())return;try{retainedTrayImage=trayImage(nativeImage,path.join(__dirname,'../assets'));tray.setImage(retainedTrayImage);}catch{}}
app.whenReady().then(async()=>{
 await migrateData(app.getPath('appData'));
 nativeTheme.on('updated',refreshTrayImage);powerMonitor.on('resume',refreshTrayImage);
 playbackSession=await new PlaybackSession(path.join(app.getPath('userData'),'playback-session.json')).init();
 recent=await new RecentTracks(path.join(app.getPath('userData'),'recent-tracks.json')).init();
 localFiles=new LocalFiles(path.join(app.getPath('userData'),'local-music'));await localFiles.activate();
 store=await new LibraryStore(path.join(app.getPath('userData'),'library')).init();cache=new OfflineCache(path.join(app.getPath('userData'),'audio-cache'),(u,o)=>net.fetch(u,o));await cache.activate(store.profile?.id);
 vkSession=session.fromPartition('persist:volna-direct-vk-v1');vkSession.setPermissionRequestHandler((_w,_p,cb)=>cb(false));vkSession.setPermissionCheckHandler(()=>false);vkSession.on('will-download',(e)=>e.preventDefault());
 client=new VkClient((url,options)=>vkSession.fetch(url,options),{stateFile:path.join(app.getPath('userData'),'vk-request-pause.json')});discovery=new Discovery(client);recommendations=new Recommendations(client);bridge=new MediaBridge((url,options)=>net.fetch(url,options));
 covers=new CoverCache(path.join(app.getPath('userData'),'cover-cache'),(u,o)=>net.fetch(u,o),key=>client.coverRefs.get(key));await covers.activate(store.profile?.id);
 main=new BrowserWindow({show:!process.argv.includes('--smoke-test'),width:1280,height:850,minWidth:760,minHeight:620,title:'VKSound',frame:false,icon:path.join(__dirname,'../assets',process.platform==='win32'?'icon.ico':'icon.png'),...windowOptions(),autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:true}});
 const applyDesktopTheme=()=>{const theme=store.settings.theme;nativeTheme.themeSource=theme==='system'?'system':theme==='light'?'light':'dark';applyWindowTheme(main,theme,nativeTheme.shouldUseDarkColors);applyWindowTheme(loginWindow,theme,nativeTheme.shouldUseDarkColors);if(miniState)miniPlayer?.publish({...miniState,theme:theme==='system'?(nativeTheme.shouldUseDarkColors?'dark':'light'):theme});};
 applyDesktopTheme();
 nativeTheme.on('updated',()=>{applyWindowTheme(main,store.settings.theme,nativeTheme.shouldUseDarkColors);applyWindowTheme(loginWindow,store.settings.theme,nativeTheme.shouldUseDarkColors);});
 confirmations=new Confirmations(data=>{if(main&&!main.isDestroyed()&&!main.webContents.isDestroyed())main.webContents.send('volna:confirm',data);});main.on('closed',()=>confirmations.cancel());for(const name of ['maximize','unmaximize'])main.on(name,()=>{if(main&&!main.isDestroyed()&&!main.webContents.isDestroyed())main.webContents.send('volna:window-state',{maximized:main.isMaximized()});});
 miniPlayer=new MiniPlayer({BrowserWindow,screen,preload:path.join(__dirname,'mini-preload.cjs'),html:path.join(__dirname,'mini.html'),onVisibility:()=>sendVisibility(),icon:path.join(__dirname,'../assets',process.platform==='win32'?'icon.ico':'icon.png')});
 const publishMini=arg=>{const key=typeof arg?.key==='string'?arg.key:'',row=store.data.rows[key]||localFiles.rows[key];miniState=cleanMiniState({...arg,canStart:store.data.library.some(k=>store.data.rows[k]&&store.data.rows[k].available!==false&&((status.state==='ready'&&net.isOnline())||!!cache.url(k)))},row?{[key]:row}:{},store.settings,covers.base(),client.coverRevision||0);miniPlayer.publish(miniState);return true;};publishMini({});
 ipcMain.handle('mini:state',e=>miniPlayer.owns(e)?{ok:true,data:miniPlayer.currentState()}:{ok:false,error:'Недопустимый источник команды'});
 ipcMain.handle('mini:command',(e,arg)=>{if(!miniPlayer.owns(e))return {ok:false,error:'Недопустимый источник команды'};const name=arg?.name;if(name==='expand'&&typeof arg.value==='boolean'){miniPlayer.setExpanded(arg.value);return {ok:true};}if(name==='seek'){const value=seekRequest(arg.value,miniState);if(!value)return {ok:false,error:'Перемотка недоступна'};if(main&&!main.isDestroyed())main.webContents.send('volna:seek',value);return {ok:true};}if(['toggle','next','prev'].includes(name)){command(name==='toggle'?'trayToggle':name);return {ok:true};}if(name==='pin'&&typeof arg.value==='boolean'){miniPlayer.setPinned(arg.value);return {ok:true};}if(name==='hide'){miniPlayer.hide();return {ok:true};}if(name==='open'){showMain();return {ok:true};}if(name==='volume'&&typeof arg.value==='number'&&Number.isFinite(arg.value)&&arg.value>=0&&arg.value<=100){if(main&&!main.isDestroyed())main.webContents.send('volna:volume',arg.value);return {ok:true};}return {ok:false,error:'Недопустимая команда'};});
 bind('playerState',publishMini);
 bind('confirmReply',arg=>confirmations.reply(arg?.id,arg?.accepted));
 bind('windowControl',arg=>{if(!main||main.isDestroyed())throw new AppError('CANCELLED','Окно уже закрыто.');if(arg?.action==='minimize')main.minimize();else if(arg?.action==='maximize'){main.isMaximized()?main.unmaximize():main.maximize();}else if(arg?.action==='close')main.close();else if(arg?.action!=='state')throw new AppError('INPUT','Неизвестная команда окна.');return {maximized:main.isMaximized()};});
 main.webContents.setWindowOpenHandler(()=>({action:'deny'}));main.webContents.on('will-navigate',e=>e.preventDefault());
 main.webContents.session.setPermissionRequestHandler((_w,_p,cb)=>cb(false));
 autoCache=new AutoCache(cache,{settings:()=>store.settings,resolve:async key=>{const epoch=generation;if(status.state!=='ready'||!net.isOnline())throw new AppError('NETWORK','Нет подключения к VK.');client.restoreRefs([store.data.rows[key]]);const media=await client.resolve(key);if(epoch!==generation)throw new AppError('CANCELLED','Аккаунт изменился.');return media;},validAdded:key=>store.data.library.includes(key),notify:data=>{cacheState=data;dataEvent('cache',{...data,cache:cache.info()});}});
 protocol.handle('volna-local',req=>localFiles.handle(req));
 protocol.handle('sozvuk-cover',req=>covers.handle(req));
 protocol.handle('volna-media',request=>bridge.handle(request));protocol.handle('volna-offline',request=>cache.handle(request));
 bind('state',()=>status);bind('login',startLogin);bind('cancelLogin',()=>{cancelLogin();return status;});bind('logout',logout);
 bind('library',async arg=>{if(status.state!=='ready')throw new AppError('AUTH','Сначала войдите через VK.');const accountId=store.profile?.id,offset=arg?.offset??0;return rememberPage(await client.library(offset),{accountId,library:true,reset:offset===0});});
 bind('play',async arg=>{const key=arg?.key;if(typeof key==='string'&&LOCAL_KEY.test(key)){const url=localFiles.url(key);if(!url)throw new AppError('INPUT','Локальный файл не найден.');activeMedia=null;playSequence++;historyPlayback={key,sequence:playSequence,epoch:generation,accountId:null};bridge.clear();return {url,format:'audio',offline:true};}if(typeof key!=='string'||!Object.hasOwn(store.data.rows,key))throw new AppError('INPUT','Композиция не найдена.');const mine=++playSequence,epoch=generation;activeMedia=null;historyPlayback=null;const local=cache.url(key);if(local){historyPlayback={key,sequence:mine,epoch,accountId:store.profile?.id};bridge.clear();return {url:local,format:'audio',offline:true};}if(status.state!=='ready'||!net.isOnline())throw new AppError('OFFLINE','Нет сети: доступны только скачанные треки.');client.restoreRefs([store.data.rows[key]]);const media=await client.resolve(key);if(mine!==playSequence||epoch!==generation)throw new AppError('CANCELLED','Выбран другой трек.');activeMedia={key,media,epoch:generation};historyPlayback={key,sequence:mine,epoch,accountId:store.profile?.id};return {url:bridge.create(media.url,media.format),format:media.format};});
 bind('openDataFolder',arg=>openDataFolder(arg?.kind,cache,localFiles,shell));
 bind('searchPlaylists',async arg=>{if(status.state!=='ready')throw new AppError('INPUT','Для поиска войдите в VK.');const epoch=generation,account=store.profile?.id;const data=await client.searchPlaylists(arg?.query,arg?.offset??0);if(epoch!==generation||account!==store.profile?.id)throw new AppError('CANCELLED','Аккаунт изменился.');return data;});
 bind('searchArtists',async arg=>{if(status.state!=='ready')throw new AppError('INPUT','Для поиска войдите в VK.');const epoch=generation,account=store.profile?.id;const data=await discovery.searchArtists(arg?.query);if(epoch!==generation||account!==store.profile?.id)throw new AppError('CANCELLED','Аккаунт изменился.');return data;});
 bind('search',async arg=>{if(status.state!=='ready')throw new AppError('INPUT','Для поиска войдите в VK.');const accountId=store.profile?.id;return rememberPage(await client.search(arg?.query,arg?.offset??0),{accountId});});
 bind('resolveLink',async arg=>{
  if(status.state!=='ready'||!net.isOnline())throw new AppError('OFFLINE','Для открытия ссылки войдите в VK и подключитесь к интернету.');
  const parsed=parseVkLink(arg?.input),accountId=store.profile?.id,epoch=generation;
  if(parsed.type==='artist')return {type:'artist',id:parsed.id};
  if(parsed.type==='track'){
   const row=await client.resolveTrackLink(arg.input);
   if(epoch!==generation||accountId!==store.profile?.id)throw new AppError('CANCELLED','Аккаунт изменился.');
   await store.remember([row],{accountId});
   return {type:'track',key:row.key};
  }
  const meta=await client.importList(arg.input);
  if(epoch!==generation||accountId!==store.profile?.id)throw new AppError('CANCELLED','Аккаунт изменился.');
  return {type:parsed.type==='album'||meta.kind==='album'?'album':'playlist',id:meta.id,title:meta.title,kind:meta.kind};
 });
 bind('playbackSession',async arg=>{const id=store.profile?.id||null;if(arg?.accountId!==id)throw new AppError('CANCELLED','Аккаунт изменился.');const rows={...store.data.rows,...localFiles.rows};if(arg.op==='get')return playbackSession.get(id,rows);if(arg.op==='save')return playbackSession.save(id,arg.state,rows);throw new AppError('INPUT','Некорректное действие с сессией.');});
 bind('copyLink',arg=>{const url=shareLink(arg,{rows:store.data.rows,lists:store.data.vkLists,playlistRefs:client.playlistRefs,trackRefs:client.refs,artists:discovery.artistNames});clipboard.writeText(url);return {copied:true};});
 bind('openVkMusic',async()=>{await shell.openExternal('https://vk.com/audio');return {opened:true};});
 bind('snapshot',()=>({...store.snapshot(),recent:recent.keys(store.profile?.id,{...store.data.rows,...localFiles.rows}),cache:cache.info(),shortcutErrors,sync:syncState,cacheState,coverBase:covers.base(),coverRevision:client.coverRevision||0,rows:{...store.data.rows,...localFiles.rows},localKeys:Object.keys(localFiles.rows),paths:dataFolders(cache,localFiles)}));
 bind('sync',async arg=>{
  if(status.state!=='ready')throw new AppError('INPUT','Для обновления подключите VK.');if(writeBusy)throw new AppError('BUSY','Дождитесь записи в VK.');if(syncJob)throw new AppError('BUSY','Обновление уже выполняется.');
  const epoch=generation,accountId=store.profile?.id,valid=()=>epoch===generation&&store.profile?.id===accountId&&status.state==='ready';
  const progress=data=>{if(valid()){syncState={busy:true,...data};dataEvent('sync',syncState);}};
  if(arg?.scope==='list'&&!store.data.vkLists.some(p=>p.id===arg.id))throw new AppError('INPUT','Список не найден.');const previousLibrary=new Set(store.data.library);const job=(async()=>{try{if(!['lists','list'].includes(arg?.scope)){await syncLibrary(client,store,{valid,progress});if(valid()&&previousLibrary.size)autoCache.enqueueAdded(store.data.library.filter(k=>!previousLibrary.has(k)));}const result=arg?.scope==='music'?{loaded:store.data.library.length,errors:[]}:await syncLists(client,store,{valid,progress,catalogOnly:arg?.scope!=='list',targetId:arg?.scope==='list'?arg.id:null});if(valid()){syncState={busy:false,phase:'done',errors:result.errors};dataEvent('sync',syncState);}return result;}
   catch(e){if(valid()){syncState={busy:false,phase:'error',message:publicError(e).message};dataEvent('sync',syncState);}throw e;}finally{if(syncJob===job)syncJob=null;}})();syncJob=job;return job;
 });
 bind('recommendations',async arg=>{if(status.state!=='ready')throw new AppError('INPUT','Для рекомендаций подключите VK.');const epoch=generation,accountId=store.profile?.id;const result=await recommendations.load({refresh:arg?.refresh===true});if(epoch!==generation||accountId!==store.profile?.id)throw new AppError('CANCELLED','Аккаунт изменился.');const rows=(result.trackGroups||[]).flatMap(g=>g.rows);if(rows.length)await store.remember(rows,{accountId});if(epoch!==generation||accountId!==store.profile?.id)throw new AppError('CANCELLED','Аккаунт изменился.');return result;});
 bind('recommendationTracks',async arg=>{if(status.state!=='ready')throw new AppError('INPUT','Подключите VK.');const epoch=generation,accountId=store.profile?.id;return readRecommendation(recommendations,client,store,arg?.id,{valid:()=>epoch===generation&&accountId===store.profile?.id});});
 const connected=()=>{if(status.state!=='ready'||!net.isOnline())throw new AppError('OFFLINE','Для этой страницы нужен интернет и вход в VK.');};
 bind('catalogAlbum',async arg=>{connected();if(typeof arg?.id!=='string'||!client.playlistRefs.has(arg.id))throw new AppError('INPUT','Выберите альбом исполнителя.');const accountId=store.profile?.id,epoch=generation;return readRecommendation({has:id=>client.playlistRefs.has(id)},client,store,arg.id,{valid:()=>accountId===store.profile?.id&&epoch===generation});});
 bind('artistLookup',async arg=>{connected();if(typeof arg?.key!=='string'||!store.data.rows[arg.key])throw new AppError('INPUT','Неизвестный трек.');client.restoreRefs([store.data.rows[arg.key]]);return discovery.artistsForTrack(arg.key,store.data.rows[arg.key].artist);});
 bind('artistAlbums',async arg=>{connected();const accountId=store.profile?.id,epoch=generation;const page=await discovery.artistAlbums(arg?.id,arg?.offset??0);if(epoch!==generation||accountId!==store.profile?.id)throw new AppError('CANCELLED','Аккаунт изменился.');return page;});
 for(const [name,read] of [['artistPage',arg=>discovery.artist(arg?.id,arg?.offset??0)],['friendMusic',arg=>discovery.friend(arg?.id,arg?.offset??0)],['trackMix',arg=>{if(typeof arg?.key!=='string'||!store.data.rows[arg.key])throw new AppError('INPUT','Неизвестный трек.');client.restoreRefs([store.data.rows[arg.key]]);return discovery.related(arg.key,arg?.offset??0);}]])bind(name,async arg=>{connected();const accountId=store.profile?.id;const data=await read(arg);return {...data,...await rememberPage(data,{accountId})};});
 bind('friends',arg=>{connected();return discovery.friends(arg?.offset??0);});
 bind('lyrics',arg=>{connected();if(typeof arg?.key!=='string'||!store.data.rows[arg.key])throw new AppError('INPUT','Неизвестный трек.');client.restoreRefs([store.data.rows[arg.key]]);return discovery.lyrics(arg.key);});
 bind('mixDiagnostics',()=>{clipboard.writeText(JSON.stringify({app:'VKSound',version:app.getVersion(),method:'audio.getStreamMixAudios',attempts:client.mixAttempts||[]},null,2));return true;});
 bind('mix',async arg=>{if(status.state!=='ready')throw new AppError('INPUT','Для микса подключите VK.');const accountId=store.profile?.id;return rememberPage(await client.mix(arg?.reset===true),{accountId});});
 bind('playing',async arg=>{if(!batchBusy&&activeMedia&&arg?.key===activeMedia.key&&activeMedia.epoch===generation&&status.state==='ready')autoCache.enqueue(activeMedia.key,activeMedia.media);const h=historyPlayback;if(h&&arg?.key===h.key&&h.sequence===playSequence&&h.epoch===generation&&h.sequence!==lastHistorySequence){lastHistorySequence=h.sequence;await recent.record(h.key,h.accountId);}return {recent:recent.keys(store.profile?.id,{...store.data.rows,...localFiles.rows})};});
 bind('libraryEdit',arg=>store.mutate(arg));
 bind('remoteEdit',async arg=>{
  if(arg?.accountId!==store.profile?.id)throw new AppError('CANCELLED','Аккаунт изменился.');
  if(status.state!=='ready')throw new AppError('INPUT','Подключите VK для изменения библиотеки.');
  if(writeBusy||syncJob)throw new AppError('BUSY','Дождитесь текущей синхронизации.');
  if(!arg||!['tracks','listEdit','create','deleteList','follow','reorder'].includes(arg.type))throw new AppError('INPUT','Некорректная операция.');
  const epoch=generation,accountId=store.profile?.id,valid=()=>epoch===generation&&store.profile?.id===accountId&&status.state==='ready';
  const keys=arg.keys;if(arg.type==='tracks'&&(!Array.isArray(keys)||keys.length<1||keys.length>100||keys.some(k=>typeof k!=='string'||!Object.hasOwn(store.data.rows,k))))throw new AppError('INPUT','Выберите от 1 до 100 известных треков.');
  writeBusy=true;
  try{
   if(arg.type==='deleteList'||(arg.type==='tracks'&&arg.op==='delete'&&!(arg.interaction==='heart'&&keys.length===1))){const result=await confirmations.ask({type:'warning',title:'Изменение VK',buttons:['Отмена','Удалить из VK'],cancelId:0,defaultId:0,message:arg.type==='deleteList'?'Удалить этот плейлист или альбом из вашей коллекции VK?':'Удалить выбранные треки из вашей музыки VK: '+keys.length+'?',detail:'Это изменение аккаунта VK, а не очистка кеша. Сохранённые аудиофайлы останутся на ПК. Оригиналы чужих списков не удаляются.'});if(!valid())throw new AppError('CANCELLED','Аккаунт изменился.');if(result.response!==1)return {cancelled:true};}
   client.restoreRefs(Object.values(store.data.rows));const service=new VkWrites(client,store,{valid,progress:data=>dataEvent('write',{busy:true,...data})});let result;
   dataEvent('write',{busy:true,message:'Изменение отправляется в VK…'});
   if(arg.type==='tracks')result=await service.tracks(arg.op,keys);
   if(arg.type==='listEdit')result=await service.editList(arg);
   if(arg.type==='create')result=await service.create(arg.title);
   if(arg.type==='deleteList')result=await service.deleteList(arg.id);
   if(arg.type==='follow')result=await service.follow(arg.input);
   if(arg.type==='reorder')result=await service.reorderLibrary(arg.key,arg.before);
   if(!valid())throw new AppError('CANCELLED','Аккаунт изменился.');if(arg.type==='tracks'&&arg.op==='add')autoCache.enqueueAdded((result?.items||[]).filter(i=>i.state==='done'&&i.libraryKey).map(i=>i.libraryKey));return result;
  }finally{writeBusy=false;if(valid())dataEvent('write',{busy:false});}
 });
 bind('albumTracks',async arg=>{if(status.state!=='ready'||typeof arg?.track!=='string'||!Object.hasOwn(store.data.rows,arg.track))throw new AppError('INPUT','Подключите VK и выберите трек.');const epoch=generation,accountId=store.profile?.id;client.restoreRefs([store.data.rows[arg.track]]);return readAlbum(client,store,arg.track,{valid:()=>epoch===generation&&store.profile?.id===accountId});});
 bind('inspectList',async arg=>{if(status.state!=='ready')throw new AppError('INPUT','Подключите VK.');const epoch=generation;let meta;if(arg?.track){if(!Object.hasOwn(store.data.rows,arg.track))throw new AppError('INPUT','Неизвестный трек.');client.restoreRefs([store.data.rows[arg.track]]);meta=await client.albumForTrack(arg.track);}else meta=await client.importList(arg?.input);if(epoch!==generation)throw new AppError('CANCELLED','Аккаунт изменился.');return {...meta,accountId:store.profile?.id};});
 bind('cacheBatch',async arg=>{
  if(arg?.accountId!==store.profile?.id)throw new AppError('CANCELLED','Аккаунт изменился.');
  if(batchBusy||cache.job)throw new AppError('BUSY','Дождитесь сохранения текущей композиции.');
  if(!['save','remove'].includes(arg?.op)||!Array.isArray(arg.keys)||!arg.keys.length||arg.keys.length>100||new Set(arg.keys).size!==arg.keys.length||arg.keys.some(k=>typeof k!=='string'||!Object.hasOwn(store.data.rows,k)&&!Object.hasOwn(localFiles.rows,k)))throw new AppError('INPUT','Выберите от 1 до 100 известных треков.');
  if(arg.op==='save'&&status.state!=='ready')throw new AppError('INPUT','Подключите VK для кеширования.');
  const epoch=generation,valid=()=>epoch===generation;batchBusy=true;autoCache.suspended=true;
  try{const answer=await confirmations.ask({type:'question',buttons:['Отмена',arg.op==='save'?'Сохранить в кеш':'Удалить копии'],defaultId:0,cancelId:0,title:'Кеш на этом ПК',message:(arg.op==='save'?'Сохранить выбранные треки в кеш: ':'Удалить выбранные копии с диска: ')+arg.keys.length+'?',detail:arg.op==='save'?'Только доступные прямые аудиофайлы. HLS не сохраняется. Сохраняйте только музыку, которую вправе копировать.':'Библиотека VK не изменится.'});if(!valid())throw new AppError('CANCELLED','Аккаунт изменился.');if(answer.response!==1)return {cancelled:true,cache:cache.info()};
   const items=[];for(let i=0;i<arg.keys.length;i++){if(!valid())throw new AppError('CANCELLED','Аккаунт изменился.');const key=arg.keys[i];dataEvent('batch',{busy:true,index:i+1,total:arg.keys.length});try{if(LOCAL_KEY.test(key)){if(arg.op==='remove')await localFiles.remove(key);}else if(arg.op==='remove')await cache.remove(key);else if(!cache.url(key)){client.restoreRefs([store.data.rows[key]]);const media=await client.resolve(key);if(!valid())throw new AppError('CANCELLED','Аккаунт изменился.');await cache.save(key,media,store.settings.cacheMB);}items.push({key,state:'done',message:arg.op==='save'?'Файл полностью сохранён.':'Копия удалена.'});}
    catch(e){if(e.code==='CANCELLED')throw e;items.push({key,state:'failed',message:publicError(e).message});if(['CACHE_LIMIT','AUTH','ACCOUNT_CHANGED','NETWORK','RATE'].includes(e.code)){for(const k of arg.keys.slice(i+1))items.push({key:k,state:'notSent',message:'Не выполнено после ошибки.'});break;}}}
   return {items,cache:cache.info()};
  }finally{batchBusy=false;autoCache.suspended=false;if(valid())dataEvent('batch',{busy:false,cache:cache.info()});}
 });

 bind('settings',async arg=>{
  if(settingsBusy)throw new AppError('BUSY','Настройки уже сохраняются.');settingsBusy=true;
  const old=store.settings;
  try{const next=cleanSettings(arg,old),errors=Object.hasOwn(arg,'hotkeys')?configureShortcuts(next):[];
   if(errors.length)throw new AppError('HOTKEY','Сочетание занято или недоступно: '+errors.join(', ')+'. Укажите другое сочетание.');
   if(['tray','autostart'].some(k=>Object.hasOwn(arg,k)))configureDesktop(next);await store.saveSettings(arg);applyDesktopTheme();shortcutErrors=[];return store.settings;
  }catch(e){configureShortcuts(old);try{configureDesktop(old);}catch{}throw e;}
  finally{settingsBusy=false;}
 });
 bind('checkUpdate',async()=>{
  if(!app.isPackaged||process.platform!=='win32')return {supported:false,available:false,currentVersion:app.getVersion(),message:'Обновление через GitHub доступно в установленной версии VKSound для Windows.'};
  return githubUpdater.check();
 });
 bind('downloadUpdate',async()=>{
  if(!app.isPackaged||process.platform!=='win32')throw new AppError('UPDATE','Обновление доступно только в установленной версии VKSound для Windows.');
  const update=await githubUpdater.download();
  if(pendingUpdatePath)await fs.rm(pendingUpdatePath,{force:true}).catch(()=>{});
  pendingUpdatePath=update.path;
  return {downloaded:true,currentVersion:update.currentVersion,latestVersion:update.latestVersion};
 });
 bind('installUpdate',async()=>{
  if(!app.isPackaged||process.platform!=='win32'||!pendingUpdatePath)throw new AppError('UPDATE','Сначала скачайте и проверьте установщик обновления.');
  const file=pendingUpdatePath;
  try{
   await fs.access(file);
   await new Promise((resolve,reject)=>{
    const child=spawn(file,[],{detached:true,stdio:'ignore',windowsHide:false});
    child.once('error',reject);
    child.once('spawn',()=>{child.removeListener('error',reject);child.once('error',()=>{});child.unref();resolve();});
   });
  }catch{throw new AppError('UPDATE','Не удалось запустить установщик. Файл обновления сохранён; повторите проверку позже.');}
  pendingUpdatePath=null;quitting=true;setTimeout(()=>app.quit(),250).unref();return {started:true};
 });
 bind('volume',async n=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>100)throw new AppError('INPUT','Некорректная громкость.');if(n!==lastSavedVolume){await store.saveSettings({volume:n});lastSavedVolume=n;}return true;});
 bind('cacheSave',async arg=>{
  if(batchBusy)throw new AppError('BUSY','Дождитесь группового сохранения.');
  const key=arg?.key;if(status.state!=='ready'||typeof key!=='string'||!Object.hasOwn(store.data.rows,key))throw new AppError('INPUT','Сначала подключите VK и выберите трек.');
  const epoch=generation;
  const answer=await confirmations.ask({type:'question',buttons:['Отмена','Сохранить'],defaultId:0,cancelId:0,title:'Офлайн-копия',message:'Сохранить доступный аудиофайл на этом компьютере?',detail:'Сохраняйте только музыку, которую вы вправе копировать. HLS, защищённые потоки и ограничения доступа не обходятся. Копия останется в кеше до удаления.'});
  if(answer.response!==1)return cache.info();if(epoch!==generation)throw new AppError('CANCELLED','Аккаунт изменился.');
  client.restoreRefs([store.data.rows[key]]);const media=await client.resolve(key);if(epoch!==generation)throw new AppError('CANCELLED','Аккаунт изменился.');return cache.save(key,media,store.settings.cacheMB);
 });
 bind('localDuration',arg=>localFiles.setDuration(arg?.key,arg?.duration));
 bind('importLocal',async()=>{const choice=await dialog.showOpenDialog(main,{title:'Добавить локальную музыку',properties:['openFile','multiSelections'],filters:[{name:'Аудиофайлы (до 100 МБ)',extensions:['mp3','m4a','aac','ogg','opus','flac','wav']}]});if(choice.canceled)return {cancelled:true};return localFiles.importFiles(choice.filePaths);});
 bind('cacheRemove',arg=>{if(batchBusy)throw new AppError('BUSY','Дождитесь групповой операции.');if(typeof arg?.key==='string'&&LOCAL_KEY.test(arg.key))return localFiles.remove(arg.key).then(()=>cache.info());return cache.remove(arg?.key);});
 bind('cacheClear',()=>{if(batchBusy)throw new AppError('BUSY','Дождитесь групповой операции.');return cache.clear();});
 bind('stop',()=>{historyPlayback=null;activeMedia=null;playSequence++;bridge.clear();return true;});
 bind('about',()=>({version:app.getVersion(),license:'GPL-3.0-only',name:'VKSound'}));
 await main.loadFile(path.join(__dirname,'index.html'));
 if(process.argv.includes('--smoke-test')){
  const result=await main.webContents.executeJavaScript('(async()=>({bridge:typeof window.volna?.login==="function",page:!!document.getElementById("login"),state:(await window.volna.state()).ok}))()');
  if(!result.bridge||!result.page||!result.state){app.exit(1);return;}
  app.exit(0);return;
 }
 if(!process.argv.includes('--smoke-test')){shortcutErrors=configureShortcuts(store.settings);configureDesktop(store.settings);}
 for(const event of ['show','hide','minimize','restore'])main.on(event,sendVisibility);sendVisibility();
 main.on('close',event=>{if(!quitting&&store.settings.tray&&tray){event.preventDefault();main.hide();}});
 main.on('closed',()=>{miniPlayer?.destroy();generation++;syncState={busy:false};cacheState={};activeMedia=null;autoCache?.reset();closeLogin();client.reset({suspend:true});bridge.clear();});
 // Restore only our dedicated VK profile, not a browser profile or an installed Wave profile.
 const mine=generation;restoring=true;set({state:'restoring',profile:null,message:'Проверяем сохранённый сеанс VK…'});
 try{const cookies=await vkSession.cookies.get({});if(mine!==generation||!restoring)return;if(!sessionReady('https://vk.ru/',cookies))throw new AppError('AUTH','Нет сохранённого сеанса VK.');const profile=await client.profile();if(mine===generation&&restoring){await activateProfile(profile);if(mine===generation&&restoring)set({state:'ready',profile,message:'Сеанс восстановлен.'});}}
 catch(error){if(mine===generation&&restoring){client.reset({suspend:true});set({state:'signedOut',profile:null,message:error?.code==='RATE'?error.message:''});}}
 finally{restoring=false;}
}).catch(error=>{dialog.showErrorBox('VKSound',error?.code==='MIGRATION'?error.message:'Не удалось запустить приложение. Проверьте целостность папки программы.');app.quit();});
app.on('before-quit',()=>{client?.reset({suspend:true});for(const c of covers?.controllers||[])c.abort();quitting=true;miniPlayer?.destroy();closeLogin();cache?.job?.bridge.clear();});
app.on('will-quit',()=>{globalShortcut.unregisterAll();miniPlayer?.destroy();tray?.destroy();});
app.on('window-all-closed',()=>app.quit());
