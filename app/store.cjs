'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {AppError,text,COVER_KEY}=require('./model.cjs');
const KEY=/^-?[1-9]\d*_[1-9]\d*$/;
const HOME_SECTIONS=['mix','recent','library','myPlaylists','recommendationTracks','recommendationPlaylists','algorithmic'];
const DEFAULT_HOME_SECTIONS=HOME_SECTIONS.filter(id=>id!=='algorithmic');
const LEGACY_DEFAULT_HOME_SECTIONS=['mix','algorithmic','recommendationTracks','recommendationPlaylists','library','recent','localPlaylists','vkPlaylists'];
function expandHomeSections(items){if(!Array.isArray(items))return [...DEFAULT_HOME_SECTIONS];if(items.length===LEGACY_DEFAULT_HOME_SECTIONS.length&&items.every((id,i)=>id===LEGACY_DEFAULT_HOME_SECTIONS[i]))return [...DEFAULT_HOME_SECTIONS];const expanded=[];for(const id of items){if(id==='curated')expanded.push('algorithmic','recommendationTracks','recommendationPlaylists');else if(id==='localPlaylists'||id==='vkPlaylists')expanded.push('myPlaylists');else if(HOME_SECTIONS.includes(id))expanded.push(id);}return [...new Set(expanded)];}
const defaults=()=>({theme:'dark',accent:'blue',compact:false,sidebarWidth:0,sidebarVkLists:null,homeSections:[...DEFAULT_HOME_SECTIONS],coverColors:true,tray:true,autostart:false,autoCache:false,autoCacheAdded:true,cacheMB:1024,volume:50,equalizer:{enabled:false,preamp:-4,bands:Array(10).fill(0)},hotkeys:{toggle:'Ctrl+Alt+Space',next:'Ctrl+Alt+Right',prev:'Ctrl+Alt+Left',show:'Ctrl+Alt+L'}});
function cleanRow(r){if(!r||typeof r.key!=='string'||!KEY.test(r.key)||r.key.length>45)throw new AppError('INPUT','Некорректная композиция.');const [owner,id]=r.key.split('_').map(Number);if(!Number.isSafeInteger(owner)||!Number.isSafeInteger(id))throw new AppError('INPUT','Некорректная композиция.');return {key:r.key,title:text(r.title)||'Без названия',artist:text(r.artist)||'Неизвестный исполнитель',duration:Math.max(0,Math.min(86400,Number(r.duration)||0)),available:r.available!==false,coverKey:typeof r.coverKey==='string'&&COVER_KEY.test(r.coverKey)&&r.coverKey==='t:'+r.key?r.coverKey:null};}
function cleanSettings(input,old=defaults()){
 const s={...old,equalizer:structuredClone(old.equalizer||defaults().equalizer),hotkeys:{...old.hotkeys},homeSections:expandHomeSections(old.homeSections||defaults().homeSections)};
 if(!input||typeof input!=='object')throw new AppError('INPUT','Некорректные настройки.');
 for(const k of ['theme','accent'])if(Object.hasOwn(input,k)){const options=k==='theme'?['dark','light','glass','system']:['blue','violet','mint'];if(!options.includes(input[k]))throw new AppError('INPUT','Некорректное оформление.');s[k]=input[k];}
 for(const k of ['compact','tray','autostart','autoCache','autoCacheAdded','coverColors'])if(Object.hasOwn(input,k)){if(typeof input[k]!=='boolean')throw new AppError('INPUT','Некорректный переключатель.');s[k]=input[k];}
 for(const [k,min,max] of [['cacheMB',128,8192],['volume',0,100]])if(Object.hasOwn(input,k)){const n=Number(input[k]);if(!Number.isFinite(n)||n<min||n>max)throw new AppError('INPUT',k==='cacheMB'?'Лимит кеша: от 128 до 8192 МБ.':'Некорректная громкость.');s[k]=Math.round(n);}
 if(Object.hasOwn(input,'sidebarWidth')){const n=input.sidebarWidth;if(!Number.isInteger(n)||(n!==0&&(n<72||n>480)))throw new AppError('INPUT','Ширина панели: 72–480 пикселей.');s.sidebarWidth=n;}
 if(Object.hasOwn(input,'sidebarVkLists')){const a=input.sidebarVkLists;if(a!==null&&(!Array.isArray(a)||a.length>200||a.some(id=>typeof id!=='string'||!KEY.test(id))))throw new AppError('INPUT','Некорректный список плейлистов панели.');s.sidebarVkLists=a===null?null:[...new Set(a)];}
 if(Object.hasOwn(input,'homeSections')){const allowed=[...HOME_SECTIONS,'curated'],a=input.homeSections;if(!Array.isArray(a)||a.length>HOME_SECTIONS.length||a.some(id=>typeof id!=='string'||!allowed.includes(id)))throw new AppError('INPUT','Некорректный порядок разделов главной.');s.homeSections=expandHomeSections(a);}
 if(Object.hasOwn(input,'equalizer')){const e=input.equalizer;if(!e||typeof e.enabled!=='boolean'||!Number.isFinite(e.preamp)||e.preamp< -12||e.preamp>0||!Array.isArray(e.bands)||e.bands.length!==10||e.bands.some(n=>!Number.isFinite(n)||n< -12||n>12))throw new AppError('INPUT','Некорректный эквалайзер.');s.equalizer={enabled:e.enabled,preamp:e.preamp,bands:[...e.bands]};}
 if(Object.hasOwn(input,'hotkeys')){if(!input.hotkeys||typeof input.hotkeys!=='object')throw new AppError('INPUT','Некорректные горячие клавиши.');for(const k of Object.keys(s.hotkeys)){const v=input.hotkeys[k];if(typeof v!=='string'||v.length>80||!/^$|^(?:(?:Ctrl|Alt|Shift|Super)\+){1,3}(?:[A-Z0-9]|Space|Left|Right|Up|Down|Home|End|PageUp|PageDown|F(?:[1-9]|1[0-9]|2[0-4]))$/.test(v))throw new AppError('INPUT','Сочетание: Ctrl+Alt+Space, Ctrl+Alt+Right или Ctrl+Shift+K. Пустое поле отключает действие.');s.hotkeys[k]=v;}
 const filled=Object.values(s.hotkeys).filter(Boolean).map(v=>v.toLowerCase());if(new Set(filled).size!==filled.length)throw new AppError('INPUT','Одно сочетание нельзя назначить двум действиям.');}
 return s;
}
function cleanLinks(input,data,id){const library=new Set(data.library),out={};if(!input||typeof input!=='object')return out;for(const [from,to] of Object.entries(input).slice(0,100000))if(KEY.test(from)&&typeof to==='string'&&KEY.test(to)&&Object.hasOwn(data.rows,from)&&library.has(to)&&to.startsWith(id+'_'))out[from]=to;return out;}
const blank=()=>({rows:{},library:[],libraryLinks:{},pendingAdds:[],favorites:[],playlists:[],vkLists:[],syncedAt:null});
async function atomic(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';try{await fs.writeFile(tmp,JSON.stringify(data),{mode:0o600});await fs.rename(tmp,file);}finally{await fs.rm(tmp,{force:true}).catch(()=>{});}}
class LibraryStore{
 constructor(root){this.root=root;this.settings=defaults();this.profile=null;this.data=blank();this.serial=Promise.resolve();}
 async init(){try{const c=JSON.parse(await fs.readFile(path.join(this.root,'preferences.json'),'utf8'));this.settings=cleanSettings(c.settings);if(Number.isSafeInteger(c.profile?.id)&&c.profile.id>0)this.profile={id:c.profile.id,name:text(c.profile.name,200),avatarKey:c.profile.avatarKey==='u:'+c.profile.id+'_1'?c.profile.avatarKey:null};}catch(e){if(e.code!=='ENOENT'){this.warning='Настройки не удалось прочитать. Использованы значения по умолчанию.';}}if(this.profile)await this.readAccount();return this;}
 enqueue(fn){const job=this.serial.then(fn);this.serial=job.catch(()=>{});return job;}
 accountFile(){if(!this.profile)throw new AppError('AUTH','Подключите аккаунт VK.');return path.join(this.root,'accounts',this.profile.id+'.json');}
 async readAccount(){this.data=blank();try{const raw=JSON.parse(await fs.readFile(this.accountFile(),'utf8'));const rows={};for(const r of Object.values(raw.rows||{}).slice(0,100000)){try{const t=cleanRow(r);rows[t.key]=t;}catch{}}
 this.data.rows=rows;this.data.pendingAdds=(Array.isArray(raw.pendingAdds)?raw.pendingAdds:[]).filter(k=>typeof k==='string'&&KEY.test(k)&&Object.hasOwn(rows,k)).slice(0,1000);this.data.library=[...new Set((Array.isArray(raw.library)?raw.library:[]).filter(k=>typeof k==='string'&&Object.hasOwn(rows,k)))];this.data.favorites=[...new Set((Array.isArray(raw.favorites)?raw.favorites:[]).filter(k=>typeof k==='string'&&Object.hasOwn(rows,k)))].slice(0,100000);
 for(const p of (Array.isArray(raw.playlists)?raw.playlists:[]).slice(0,200)){if(typeof p.id!=='string'||!/^[a-f0-9-]{36}$/.test(p.id))continue;this.data.playlists.push({id:p.id,title:text(p.title,80)||'Плейлист',keys:[...new Set((Array.isArray(p.keys)?p.keys:[]).filter(k=>typeof k==='string'&&Object.hasOwn(rows,k)))].slice(0,10000)});}
 for(const p of (Array.isArray(raw.vkLists)?raw.vkLists:[]).slice(0,10000)){if(typeof p.id!=='string'||!KEY.test(p.id))continue;this.data.vkLists.push({id:p.id,title:text(p.title)||'Без названия',kind:p.kind==='album'?'album':'playlist',artist:text(p.artist),...(require('./experience-model.js').releaseDate(p)?{releaseDate:require('./experience-model.js').releaseDate(p)}:{}),coverKey:typeof p.coverKey==='string'&&p.coverKey==='p:'+p.id?p.coverKey:null,editable:p.editable===true,origin:typeof p.origin==='string'&&KEY.test(p.origin)?p.origin:null,total:Number.isSafeInteger(p.total)?p.total:0,keys:[...new Set((Array.isArray(p.keys)?p.keys:[]).filter(k=>Object.hasOwn(rows,k)))],syncedAt:typeof p.syncedAt==='string'?p.syncedAt:null});}this.data.libraryLinks=cleanLinks(raw.libraryLinks,this.data,this.profile.id);this.data.syncedAt=typeof raw.syncedAt==='string'?raw.syncedAt:null;
 }catch(e){if(e.code!=='ENOENT')this.warning='Сохранённую библиотеку не удалось прочитать. Исходный файл не удалён.';}}
 async activate(profile){return this.enqueue(async()=>{this.profile=profile?{id:profile.id,name:text(profile.name,200),avatarKey:profile.avatarKey==='u:'+profile.id+'_1'?profile.avatarKey:null}:null;await atomic(path.join(this.root,'preferences.json'),{settings:this.settings,profile:this.profile});if(profile)await this.readAccount();else this.data=blank();return this.snapshot();});}
 snapshot(){return structuredClone({profile:this.profile,settings:this.settings,...this.data,warning:this.warning||''});}
 async saveSettings(input){return this.enqueue(async()=>{const s=cleanSettings(input,this.settings);await atomic(path.join(this.root,'preferences.json'),{settings:s,profile:this.profile});this.settings=s;return s;});}
 async remember(rows,{accountId=this.profile?.id,library=false,reset=false}={}){return this.enqueue(async()=>{
  if(!this.profile||this.profile.id!==accountId)throw new AppError('CANCELLED','Аккаунт изменился.');
  const data=structuredClone(this.data);let size=Object.keys(data.rows).length;
  if(library&&reset)data.library=[];
  for(const raw of rows){const t=cleanRow(raw);if(data.rows[t.key]||size<100000){if(!data.rows[t.key])size++;data.rows[t.key]=t;if(library&&!data.library.includes(t.key))data.library.push(t.key);}else throw new AppError('LIMIT','Локальный каталог достиг лимита 100000 треков. Новые результаты не сохранены.');}
  await atomic(this.accountFile(),data);this.data=data;
 });}

 async commitSync(rows,{accountId,library,vkLists,libraryLinks,pendingAdds}={}){return this.enqueue(async()=>{
  if(!this.profile||this.profile.id!==accountId)throw new AppError('CANCELLED','Аккаунт изменился.');
  const d=structuredClone(this.data);for(const row of rows){const t=cleanRow(row);d.rows[t.key]=t;}
  if(Object.keys(d.rows).length>100000)throw new AppError('LIMIT','Каталог превышает 100000 треков. Предыдущий список сохранён.');
  if(library)d.library=[...new Set(library)];if(vkLists)d.vkLists=vkLists.map(p=>{if(typeof p.id!=='string'||!KEY.test(p.id))throw new AppError('INPUT','Некорректный список VK.');return {id:p.id,title:text(p.title)||'Без названия',kind:p.kind==='album'?'album':'playlist',artist:text(p.artist),...(require('./experience-model.js').releaseDate(p)?{releaseDate:require('./experience-model.js').releaseDate(p)}:{}),coverKey:typeof p.coverKey==='string'&&p.coverKey==='p:'+p.id?p.coverKey:null,editable:p.editable===true,origin:typeof p.origin==='string'&&KEY.test(p.origin)?p.origin:null,keys:[...new Set((Array.isArray(p.keys)?p.keys:[]).filter(k=>typeof k==='string'&&Object.hasOwn(d.rows,k)))],total:Number.isSafeInteger(p.total)&&p.total>=0?p.total:0,syncedAt:typeof p.syncedAt==='string'?p.syncedAt:null};});
  d.pendingAdds=[...new Set([...(d.pendingAdds||[]),...(pendingAdds||[])])].filter(k=>typeof k==='string'&&KEY.test(k)&&Object.hasOwn(d.rows,k)&&!d.library.includes(k)&&!libraryLinks?.[k]).slice(0,1000);d.libraryLinks=cleanLinks(libraryLinks||d.libraryLinks,d,accountId);d.syncedAt=new Date().toISOString();await atomic(this.accountFile(),d);this.data=d;return this.snapshot();
 });}
 async mutate(arg){return this.enqueue(async()=>{if(!this.profile)throw new AppError('AUTH','Сначала подключите аккаунт VK.');if(!arg||typeof arg!=='object')throw new AppError('INPUT','Некорректное действие.');const d=structuredClone(this.data);let p;
 switch(arg.op){
 case 'create':if(d.playlists.length>=200)throw new AppError('LIMIT','Не более 200 плейлистов.');{const title=text(arg.title,80).trim();if(!title)throw new AppError('INPUT','Введите название плейлиста.');d.playlists.push({id:randomUUID(),title,keys:[]});}break;
 case 'favorite':if(typeof arg.key!=='string'||!Object.hasOwn(d.rows,arg.key))throw new AppError('INPUT','Композиция не найдена.');if(d.favorites.includes(arg.key))d.favorites=d.favorites.filter(k=>k!==arg.key);else d.favorites.push(arg.key);break;
 case 'rename':case 'delete':case 'addMany':case 'add':case 'remove':case 'move':case 'reorder':case 'clear':
 p=d.playlists.find(p=>p.id===arg.id);if(!p)throw new AppError('INPUT','Плейлист не найден.');
 if(arg.op==='rename'){const title=text(arg.title,80).trim();if(!title)throw new AppError('INPUT','Введите название.');p.title=title;}
 if(arg.op==='delete')d.playlists=d.playlists.filter(x=>x.id!==arg.id);
 if(arg.op==='add'){if(typeof arg.key!=='string'||!Object.hasOwn(d.rows,arg.key))throw new AppError('INPUT','Композиция не найдена.');if(!p.keys.includes(arg.key)){if(p.keys.length>=10000)throw new AppError('LIMIT','Плейлист заполнен.');p.keys.push(arg.key);}}
 if(arg.op==='addMany'){if(!Array.isArray(arg.keys)||arg.keys.length<1||arg.keys.length>100||arg.keys.some(k=>typeof k!=='string'||!Object.hasOwn(d.rows,k)))throw new AppError('INPUT','Выберите до 100 известных треков.');const next=[...new Set([...p.keys,...arg.keys])];if(next.length>10000)throw new AppError('LIMIT','Плейлист заполнен.');p.keys=next;}
 if(arg.op==='clear'){if(!Array.isArray(arg.expected)||JSON.stringify(arg.expected)!==JSON.stringify(p.keys))throw new AppError('CHANGED','Плейлист изменился. Обновите перед очисткой.');p.keys=[];}
 if(arg.op==='remove')p.keys=p.keys.filter(k=>k!==arg.key);
 if(arg.op==='reorder'){if(!Array.isArray(arg.expected)||JSON.stringify(arg.expected)!==JSON.stringify(p.keys))throw new AppError('CHANGED','Порядок изменился. Повторите действие.');const i=p.keys.indexOf(arg.key);if(i<0||arg.before===arg.key)throw new AppError('INPUT','Некорректное перемещение.');p.keys.splice(i,1);const j=arg.before===null?p.keys.length:p.keys.indexOf(arg.before);if(j<0)throw new AppError('CHANGED','Трек назначения не найден.');p.keys.splice(j,0,arg.key);}
 if(arg.op==='move'){const i=p.keys.indexOf(arg.key),j=i+(arg.direction===-1?-1:1);if(i>=0&&j>=0&&j<p.keys.length)[p.keys[i],p.keys[j]]=[p.keys[j],p.keys[i]];}
 break;
 default:throw new AppError('INPUT','Неизвестное действие.');}
 await atomic(this.accountFile(),d);this.data=d;return this.snapshot();});}
}
module.exports={LibraryStore,cleanRow,cleanSettings,defaults,atomic,KEY};
