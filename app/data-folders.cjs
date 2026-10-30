'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),{AppError}=require('./model.cjs');
function dataFolders(cache,local){return {cache:path.resolve(cache.account?cache.dir():cache.root),cacheRoot:path.resolve(cache.root),local:path.resolve(local.dir())};}
async function openDataFolder(kind,cache,local,shell){if(!['cache','local'].includes(kind))throw new AppError('INPUT','Неизвестная папка данных.');const folder=dataFolders(cache,local)[kind];await fs.mkdir(folder,{recursive:true});const st=await fs.lstat(folder);if(!st.isDirectory()||st.isSymbolicLink())throw new AppError('PATH','Папка данных недоступна или является ссылкой.');const error=await shell.openPath(folder);if(error)throw new AppError('PATH','Не удалось открыть папку в проводнике. Проверьте доступ к каталогу.');return {opened:true,path:folder};}
module.exports={dataFolders,openDataFolder};
