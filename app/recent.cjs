'use strict';
const fs=require('node:fs/promises'),{atomic,KEY}=require('./store.cjs'),{LOCAL_KEY}=require('./local-files.cjs');
const valid=e=>e&&typeof e.key==='string'&&Number.isSafeInteger(e.at)&&e.at>0&&(LOCAL_KEY.test(e.key)?e.accountId===null:KEY.test(e.key)&&Number.isSafeInteger(e.accountId)&&e.accountId>0);
function clean(entries){const out=[],seen=new Set(),counts=new Map();for(const e of (Array.isArray(entries)?entries:[]).slice(0,10000).filter(valid).sort((a,b)=>b.at-a.at)){const scope=e.accountId===null?'local':String(e.accountId),id=scope+':'+e.key;if(seen.has(id)||(counts.get(scope)||0)>=200)continue;seen.add(id);counts.set(scope,(counts.get(scope)||0)+1);out.push({key:e.key,accountId:e.accountId,at:e.at});if(out.length>=2000)break;}return out;}
class RecentTracks{
 constructor(file,{now=Date.now}={}){this.file=file;this.now=now;this.entries=[];this.serial=Promise.resolve();}
 async init(){try{this.entries=clean(JSON.parse(await fs.readFile(this.file,'utf8')));}catch{}return this;}
 keys(accountId,rows){return this.entries.filter(e=>(e.accountId===null||e.accountId===accountId)&&Object.hasOwn(rows,e.key)).slice(0,200).map(e=>e.key);}
 record(key,accountId){const scope=LOCAL_KEY.test(key)?null:accountId;const entry={key,accountId:scope,at:this.now()};if(!valid(entry))return Promise.resolve(false);const job=this.serial.then(async()=>{const next=clean([entry,...this.entries.filter(e=>!(e.key===key&&e.accountId===scope))]);await atomic(this.file,next);this.entries=next;return true;});this.serial=job.catch(()=>{});return job;}
}
module.exports={RecentTracks,clean};
