'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{createHash,randomBytes}=require('node:crypto'),{createReadStream}=require('node:fs'),{Readable}=require('node:stream');
const {MediaBridge}=require('./media.cjs'),{AppError}=require('./model.cjs'),{atomic,KEY}=require('./store.cjs');
const TYPES=new Set(['audio/mpeg','audio/mp3','audio/mp4','audio/aac','audio/ogg','audio/flac','audio/x-flac','audio/wav','audio/x-wav']);
const MP3_TYPES=new Set(['audio/mpeg','audio/mp3']);
const MAX_FILE=100*1024*1024;
class OfflineCache{
 constructor(root,fetch){this.root=root;this.fetch=fetch;this.account=null;this.items={};this.cap=randomBytes(24).toString('hex');this.job=null;}
 async activate(id){this.job?.bridge.clear();this.account=id||null;this.cap=randomBytes(24).toString('hex');this.items={};if(!id)return;const epoch=this.cap;try{const raw=JSON.parse(await fs.readFile(path.join(this.dir(),'index.json'),'utf8'));const items={};for(const [key,v] of Object.entries(raw).slice(0,20000)){if(!KEY.test(key)||!v||!/^[a-f0-9]{64}\.(?:bin|mp3)$/.test(v.file)||!TYPES.has(v.mime))continue;try{const st=await fs.stat(path.join(this.dir(),v.file));if(st.isFile()&&st.size>0&&st.size<=MAX_FILE)items[key]={file:v.file,mime:v.mime,bytes:st.size};}catch{}}if(epoch===this.cap)this.items=items;}catch{}}
 dir(){if(!Number.isSafeInteger(this.account)||this.account<=0)throw new AppError('INPUT','Нет активной библиотеки для офлайна.');return path.join(this.root,String(this.account));}
 info(){const list=Object.entries(this.items);return {keys:list.map(([k])=>k),bytes:list.reduce((n,[,v])=>n+v.bytes,0),busy:!!this.job};}
 async save(key,media,limitMB){
  if(!KEY.test(key))throw new AppError('INPUT','Некорректный трек.');if(this.items[key])return this.info();if(this.job)throw new AppError('BUSY','Уже сохраняется другая композиция. Дождитесь завершения.');
  if(media.format!=='audio')throw new AppError('OFFLINE_FORMAT','Офлайн-копия HLS пока не поддерживается. Доступно только сохранение прямого аудиофайла.');
  const dir=this.dir(),cap=this.cap,bridge=new MediaBridge(this.fetch),job={bridge};this.job=job;let temp,reader;
  const timeout=setTimeout(()=>bridge.clear(),180000);
  try{const url=bridge.create(media.url,'audio'),response=await bridge.handle(new Request(url));if(response.status!==200)throw new AppError('OFFLINE_DOWNLOAD','Не удалось получить полный аудиофайл. Повторите позже.');
   const mime=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
   if(!MP3_TYPES.has(mime)){await response.body?.cancel();throw new AppError('OFFLINE_FORMAT','Для сохранения нужен прямой MP3. Другие форматы не переименовываются в MP3; перекодирование и HLS не поддерживаются.');}
   const limit=Math.min(8192,Math.max(128,Number(limitMB)||1024))*1048576,used=this.info().bytes;
   if(used>=limit){await response.body?.cancel();throw new AppError('CACHE_LIMIT','Лимит кеша достигнут. Удалите копии или увеличьте лимит.');}
   const declared=Number(response.headers.get('Content-Length'));if(Number.isFinite(declared)&&(declared>MAX_FILE||used+declared>limit)){await response.body?.cancel();throw new AppError('CACHE_LIMIT','Файл больше 100 МБ или превышен лимит кеша. Копия не сохранена.');}
   await fs.mkdir(dir,{recursive:true});const filename=createHash('sha256').update(key).digest('hex')+'.mp3';temp=path.join(dir,filename+'.'+randomBytes(8).toString('hex')+'.tmp');
   const file=await fs.open(temp,'wx',0o600);let size=0,head=Buffer.alloc(0);
   try{reader=response.body.getReader();while(true){const {done,value}=await reader.read();if(cap!==this.cap)throw new AppError('CANCELLED','Сохранение отменено.');if(done)break;if(head.length<3)head=Buffer.concat([head,Buffer.from(value).subarray(0,3-head.length)]);size+=value.length;if(size>MAX_FILE||used+size>limit)throw new AppError('CACHE_LIMIT','Файл больше 100 МБ или превышен лимит кеша. Копия не сохранена.');await file.writeFile(value);}}
   finally{await file.close();}
   if(!(head.toString('ascii',0,3)==='ID3'||(head.length>=3&&head[0]===255&&(head[1]&224)===224&&(head[1]&6)===2&&(head[1]&24)!==8&&(head[2]&240)!==0&&(head[2]&240)!==240)))throw new AppError('OFFLINE_FORMAT','Файл не похож на MP3. Копия не сохранена.');if(declared>0&&size!==declared)throw new AppError('OFFLINE_DOWNLOAD','Сервер вернул неполный файл. Копия не сохранена.');if(!size)throw new AppError('OFFLINE_FORMAT','Пустой аудиофайл не сохранён.');if(cap!==this.cap)throw new AppError('CANCELLED','Сохранение отменено.');
   await fs.rename(temp,path.join(dir,filename));temp=null;
   const items={...this.items,[key]:{file:filename,mime,bytes:size}};await atomic(path.join(dir,'index.json'),items);if(cap!==this.cap)throw new AppError('CANCELLED','Сохранение отменено.');this.items=items;return this.info();
  }catch(e){if(e instanceof AppError)throw e;throw new AppError('OFFLINE_DOWNLOAD','Не удалось сохранить копию. Проверьте место на диске и подключение.');}
  finally{clearTimeout(timeout);try{await reader?.cancel();}catch{}bridge.clear();if(temp)await fs.rm(temp,{force:true}).catch(()=>{});if(this.job===job)this.job=null;}
 }
 url(key){if(typeof key!=='string'||!Object.hasOwn(this.items,key))return null;return 'volna-offline://cache/'+this.cap+'/'+encodeURIComponent(key);}
 async handle(request){
  const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store'};
  try{const u=new URL(request.url),parts=u.pathname.split('/').filter(Boolean);if(u.protocol!=='volna-offline:'||u.hostname!=='cache'||parts.length!==2||parts[0]!==this.cap||!['GET','HEAD'].includes(request.method))return new Response(null,{status:404,headers});const key=decodeURIComponent(parts[1]),item=Object.hasOwn(this.items,key)?this.items[key]:null;if(!item)return new Response(null,{status:404,headers});const filename=path.join(this.dir(),item.file),stat=await fs.stat(filename),size=stat.size;let start=0,end=size-1,status=200;
   headers['Content-Type']=item.mime;headers['Accept-Ranges']='bytes';
   const range=request.headers.get('Range');if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+size}});if(m[1]){start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}else start=Math.max(0,size-Number(m[2]));if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>end||start>=size)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+size}});status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+size;}
   headers['Content-Length']=String(end-start+1);return new Response(request.method==='HEAD'?null:Readable.toWeb(createReadStream(filename,{start,end})),{status,headers});
  }catch{return new Response(null,{status:404,headers});}
 }
 async remove(key){if(this.job)throw new AppError('BUSY','Дождитесь сохранения композиции.');const item=typeof key==='string'&&Object.hasOwn(this.items,key)?this.items[key]:null;if(!item)return this.info();const dir=this.dir(),cap=this.cap,items={...this.items};delete items[key];try{await fs.rm(path.join(dir,item.file),{force:true});if(cap!==this.cap)throw new AppError('CANCELLED','Аккаунт изменился.');await atomic(path.join(dir,'index.json'),items);if(cap!==this.cap)throw new AppError('CANCELLED','Аккаунт изменился.');this.items=items;return this.info();}catch(e){if(e instanceof AppError)throw e;throw new AppError('CACHE_WRITE','Не удалось удалить копию. Остановите её воспроизведение и повторите.');}}

 async clear(){if(this.job)throw new AppError('BUSY','Дождитесь сохранения композиции.');for(const key of Object.keys(this.items))await this.remove(key);return this.info();}
}
module.exports={OfflineCache};
