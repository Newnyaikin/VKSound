'use strict';
const fs=require('node:fs/promises'),{atomic,KEY}=require('./store.cjs'),{LOCAL_KEY}=require('./local-files.cjs'),{AppError}=require('./model.cjs');
function clean(input,rows){if(!input||!Array.isArray(input.keys))return null;const keys=input.keys.slice(0,100000).filter(k=>typeof k==='string'&&(KEY.test(k)||LOCAL_KEY.test(k))&&Object.hasOwn(rows,k));if(!keys.length)return null;const key=keys.includes(input.key)?input.key:keys[0];return {keys,key,position:typeof input.position==='number'&&Number.isFinite(input.position)?Math.max(0,Math.min(86400,input.position)):0,repeat:['off','all','one'].includes(input.repeat)?input.repeat:'off'};}
class PlaybackSession{
 constructor(file){this.file=file;this.entries={};this.serial=Promise.resolve();}
 async init(){try{const data=JSON.parse(await fs.readFile(this.file,'utf8'));if(data&&typeof data==='object'&&!Array.isArray(data))this.entries=data;}catch{}return this;}
 scope(id){if(id===null)return 'local';if(!Number.isSafeInteger(id)||id<1)throw new AppError('INPUT','Некорректный аккаунт сессии.');return String(id);}
 get(id,rows){return clean(this.entries[this.scope(id)],rows);}
 save(id,input,rows){const scope=this.scope(id),data=clean(input,rows);const job=this.serial.then(async()=>{const next={...this.entries};if(data)next[scope]=data;else delete next[scope];const keys=Object.keys(next);for(const k of keys.slice(0,Math.max(0,keys.length-12)))delete next[k];await atomic(this.file,next);this.entries=next;return true;});this.serial=job.catch(()=>{});return job;}
}
module.exports={PlaybackSession,clean};
