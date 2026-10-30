'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
const {AppError}=require('./model.cjs');
async function exists(p){try{return await fs.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}}
// Same-volume renames, never copy audio, merge folders, follow links or overwrite files.
async function migrateData(appData){const root=path.join(appData,'VKSound'),legacy=path.join(appData,'VolnaDirectGUI-0.5');await fs.mkdir(root,{recursive:true});const routes=[['lado-library','library'],['lado-cache','audio-cache'],['local-music','local-music'],['cover-cache','cover-cache'],['recent-tracks.json','recent-tracks.json']];const plan=[];
 for(const [oldName,newName] of routes){const old=path.join(legacy,oldName),currentOld=path.join(root,oldName),dest=path.join(root,newName);const candidates=[...new Set([old,currentOld])].filter(p=>p!==dest);for(const src of candidates){const stat=await exists(src);if(!stat)continue;if(stat.isSymbolicLink())throw new AppError('MIGRATION','Перенос данных остановлен: папка содержит ссылку. Старые файлы не изменены.');if(await exists(dest)||plan.some(p=>p.dest===dest))throw new AppError('MIGRATION','Есть две папки данных VKSound. Ничего не перезаписано. Закройте старый плеер и сохраните резервную копию папок VKSound и VolnaDirectGUI-0.5 в AppData перед ручным объединением.');plan.push({src,dest});}}
 const moved=[];try{for(const item of plan){await fs.rename(item.src,item.dest);moved.push(item);}}catch(e){for(const item of [...moved].reverse())try{await fs.rename(item.dest,item.src);}catch{}throw new AppError('MIGRATION','Не удалось перенести данные в AppData\\VKSound. Закройте старую версию плеера и повторите запуск. Существующие файлы не удалялись.');}return {root,moved:moved.length};}
module.exports={migrateData};
