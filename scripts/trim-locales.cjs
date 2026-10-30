'use strict';
// Conservative afterPack hook. Keep runtime, codecs, snapshots and licenses intact.
const fs=require('node:fs/promises');
const path=require('node:path');
const KEEP=new Set(['ru.pak','en-US.pak']);
async function trimLocales(root){
 const dir=path.join(root,'locales');
 let entries;try{entries=await fs.readdir(dir,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return {removed:0,bytes:0};throw e;}
 // Fail closed: do not prune a runtime with an unexpected locale layout.
 const names=new Set(entries.filter(e=>e.isFile()).map(e=>e.name));
 if(![...KEEP].every(n=>names.has(n)))throw Error('Electron locales missing ru.pak or en-US.pak; no files removed.');
 let removed=0,bytes=0;
 for(const e of entries){
  if(!e.isFile()||!e.name.endsWith('.pak')||KEEP.has(e.name))continue;
  const p=path.join(dir,e.name),s=await fs.lstat(p);
  if(!s.isFile()||s.isSymbolicLink())continue;
  await fs.unlink(p);removed++;bytes+=s.size;
 }
 return {removed,bytes};
}
module.exports=async context=>{
 if(context.electronPlatformName!=='win32')return;
 const r=await trimLocales(context.appOutDir);
 console.log('Volna: removed '+r.removed+' unused locale packs; saved '+(r.bytes/1048576).toFixed(2)+' MiB.');
};
module.exports.trimLocales=trimLocales;
