/* SPDX-License-Identifier: GPL-3.0-only
 * Adapted from Wave src/main/vk-http.cjs.
 * Copyright (C) 2026 arthurhoodwin and Wave contributors.
 * Modified 2026-10-25 by Volna contributors: read/write client with explicit user actions,
 * abort/epoch guards, verified explicit writes, no persistent token storage. See COPYRIGHT.
 */
'use strict';
const {AppError,keyOf,text,audioRow,mediaURL,coverPhoto}=require('./model.cjs');
const {readStreamMix}=require('./stream-mix.cjs');
const {RequestGate}=require('./request-gate.cjs');
const {parseVkLink}=require('./vk-links.cjs');
const CLIENT='6287487',VERSION='5.269';
const WRITES=new Set(['audio.add','audio.delete','audio.restore','audio.reorder','audio.createPlaylist','audio.editPlaylist','audio.deletePlaylist','audio.followPlaylist']);
const METHODS=new Set([...WRITES,'users.get','audio.get','audio.getById','audio.search','audio.searchPlaylists','audio.getPlaylists','audio.getPlaylistById','audio.getStreamMixAudios','catalog.getAudio','catalog.getSection','catalog.getAudioArtist','catalog.getAudioSearch','catalog.getBlockItems','friends.get','audio.getArtistById','audio.searchArtists','audio.getAudiosByArtist','audio.getLyrics','audio.getRecommendations']);
class VkClient{
 constructor(fetch,{now=Date.now,timeout=20000,sleep=ms=>new Promise(r=>setTimeout(r,ms)),requestInterval=1100,tokenInterval=30000,stateFile=null}={}){this.gate=new RequestGate({now,sleep,interval:requestInterval,stateFile});this.tokenInterval=tokenInterval;this.tokenNextAt=0;this.authRefreshNextAt=0;this.authRefreshPending=null;this.suspended=false;this.readJobs=new Map();this.mediaCache=new Map();this.fetch=fetch;this.sleep=sleep;this.mixJob=null;this.mixLastAt=-Infinity;this.mixAttempts=[];this.now=now;this.timeout=timeout;this.controllers=new Set();this.epoch=0;this.refs=new Map();this.playlistRefs=new Map();this.mixTail=null;this.coverRefs=new Map();this.token=null;this.userId=null;this.expires=0;this.pending=null;}
 resume(){this.suspended=false;}
 reset({suspend=false}={}){this.suspended=suspend;this.gate.cancel();this.readJobs.clear();this.mediaCache.clear();this.epoch++;for(const c of this.controllers)c.abort();this.controllers.clear();this.token=null;this.userId=null;this.expires=0;this.refs.clear();this.playlistRefs.clear();this.mixTail=null;this.mixJob=null;this.mixLastAt=-Infinity;this.mixAttempts=[];this.coverRefs.clear();this.pending=null;this.authRefreshPending=null;}
 async json(url,options={}){
  if(this.suspended)throw new AppError('CANCELLED','Сеанс закрыт.');
  const epoch=this.epoch;return this.gate.run(()=>{if(epoch!==this.epoch||this.suspended)throw new AppError('CANCELLED','Сеанс закрыт.');return this.fetchJson(url,options);});
 }
 async fetchJson(url,options={}){
  const epoch=this.epoch,c=new AbortController(),timer=setTimeout(()=>c.abort(),this.timeout);this.controllers.add(c);
  try{const response=await this.fetch(url,{...options,credentials:'include',redirect:'error',signal:c.signal});if(epoch!==this.epoch)throw new AppError('CANCELLED','Запрос отменён.');if(response.status===429){this.gate.pause(6,response.headers?.get?.('retry-after'));throw this.gate.rate();}if(!response.ok)throw new AppError([401,403].includes(response.status)?'AUTH':'NETWORK','Нет доступа к VK. Проверьте подключение или войдите снова.');const body=await response.text();if(epoch!==this.epoch)throw new AppError('CANCELLED','Запрос отменён.');if(body.length>8*1024*1024)throw new AppError('PROTOCOL','VK вернул слишком большой ответ.');let parsed;try{parsed=JSON.parse(body);}catch{throw new AppError('PROTOCOL','Формат ответа VK изменился.');}const code=Number(parsed.error?.error_code??parsed.error?.code??parsed.error_code??parsed.data?.error?.error_code);if(code===6||code===9){this.gate.pause(code);throw this.gate.rate();}return parsed;}
  catch(e){if(epoch!==this.epoch)throw new AppError('CANCELLED','Запрос отменён.');if(e instanceof AppError)throw e;throw new AppError('NETWORK','VK не отвечает. Проверьте подключение и повторите позже.');}
  finally{clearTimeout(timer);this.controllers.delete(c);}
 }
 async connect({force=false}={}){
  if(this.suspended)throw new AppError('CANCELLED','Сеанс закрыт.');this.gate.check();
  if(!force&&this.token&&this.expires>this.now()+60000)return this.userId;
  if(this.pending)return this.pending;
  if(this.now()<this.tokenNextAt)throw new AppError('RATE','Повторное получение сеанса VK отложено. Подождите перед новым входом.');
  this.tokenNextAt=this.now()+this.tokenInterval;
  const epoch=this.epoch;
  const pending=(async()=>{const body=new URLSearchParams({version:'1',app_id:CLIENT,access_token:''});
   const data=await this.json('https://login.vk.ru/?act=web_token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:'https://vk.ru',Referer:'https://vk.ru/'},body:body.toString()});
   if(epoch!==this.epoch)throw new AppError('CANCELLED','Вход отменён.');
   const code=Number(data.error?.error_code??data.error?.code??data.error_code??data.data?.error?.error_code);if(code===6||code===9)throw new AppError('RATE','VK ограничил попытки входа. Попробуйте позже.');
   const id=Number(data.data?.user_id),token=data.data?.access_token,expires=Number(data.data?.expires)*1000;
   if(data.type!=='okay'||!Number.isSafeInteger(id)||id<=0||typeof token!=='string'||!token||!Number.isFinite(expires)||expires<=this.now())throw new AppError('AUTH','Войдите в аккаунт в официальном окне VK.');
   if(this.userId&&this.userId!==id){this.reset();throw new AppError('ACCOUNT_CHANGED','Аккаунт изменился. Выйдите и подключите его заново.');}
   this.token=token;this.userId=id;this.expires=expires;return id;
  })();this.pending=pending;
  try{return await pending;}finally{if(this.pending===pending)this.pending=null;}
 }
 async refreshRejectedToken(){
  if(this.authRefreshPending)return this.authRefreshPending;
  const now=this.now(),expectedUser=this.userId,epoch=this.epoch;
  if(now<this.authRefreshNextAt)throw new AppError('AUTH','VK отклонил сеанс. Подключитесь к VK снова.');
  this.authRefreshNextAt=now+this.tokenInterval;this.token=null;this.expires=0;this.tokenNextAt=Math.min(this.tokenNextAt,now);
  const pending=(async()=>{const id=await this.connect({force:true});if(epoch!==this.epoch)throw new AppError('CANCELLED','Вход отменён.');if(expectedUser&&id!==expectedUser){this.reset();throw new AppError('ACCOUNT_CHANGED','Аккаунт изменился. Выйдите и подключите его заново.');}return id;})();
  this.authRefreshPending=pending;
  try{return await pending;}finally{if(this.authRefreshPending===pending)this.authRefreshPending=null;}
 }
 call(method,params={},options={}){
  if(WRITES.has(method)){this.mediaCache.clear();return this.performCall(method,params,options);}
  const key=JSON.stringify([this.epoch,method,Object.entries(params).sort(([a],[b])=>a.localeCompare(b))]);
  if(this.readJobs.has(key))return this.readJobs.get(key);
  const job=this.performCall(method,params,options).finally(()=>{if(this.readJobs.get(key)===job)this.readJobs.delete(key);});this.readJobs.set(key,job);return job;
 }
 async performCall(method,params={},options={},authRetried=false){
  if(!METHODS.has(method))throw new AppError('METHOD','Операция не разрешена.');const epoch=this.epoch,write=WRITES.has(method);
  await this.connect();if(epoch!==this.epoch)throw new AppError('CANCELLED','Аккаунт изменился.');
   const requestToken=this.token;
   let data;try{data=await this.json('https://web.api.vk.ru/method/'+method+'?v='+VERSION+'&client_id='+CLIENT,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:'Bearer '+this.token,Origin:'https://vk.ru',Referer:'https://vk.ru/'},body:new URLSearchParams(Object.fromEntries(Object.entries(params).map(([k,v])=>[k,String(v)]))).toString()});}catch(e){if(write&&['NETWORK','PROTOCOL','AUTH'].includes(e.code))throw new AppError('UNCERTAIN','Ответ на запись в VK не получен. Изменение могло сохраниться. Обновите список перед повтором.');throw e;}
   if(epoch!==this.epoch)throw new AppError('CANCELLED','Запрос отменён.');
   if(data.error){const code=Number(data.error.error_code);if(code===5){if(!write&&!authRetried){if(requestToken===this.token)await this.refreshRejectedToken();return this.performCall(method,params,options,true);}throw new AppError('AUTH','Сеанс VK истёк или отклонён. Войдите через VK ещё раз.');}if(code===6||code===9)throw new AppError('RATE','VK ограничил запросы. Попробуйте позже.');if([15,18,200,201,203].includes(code))throw new AppError('ACCESS','VK не предоставил доступ к этой музыке.');if(code===14)throw new AppError('AUTH','VK требует дополнительную проверку. Откройте вход снова.');const e=new AppError('API','VK отклонил '+method+' (код '+(Number.isSafeInteger(code)?code:'неизвестен')+').');e.vkCode=Number.isSafeInteger(code)?code:null;throw e;}
   if(!Object.hasOwn(data,'response'))throw new AppError(write?'UNCERTAIN':'PROTOCOL','VK вернул неполный ответ. Обновите список перед повтором.');if(write&&(data.response===0||data.response===false||data.response===null))throw new AppError('REJECTED','VK не подтвердил изменение.');return data.response;
 }
 async profile(){const id=await this.connect();const result=await this.call('users.get',{user_ids:id,fields:'photo_100,photo_200'});const u=Array.isArray(result)?result[0]:null;if(!u||Number(u.id)!==id)throw new AppError('PROTOCOL','Не удалось проверить аккаунт VK.');const avatarKey='u:'+id+'_1',photo=coverPhoto({url:u.photo_200||u.photo_100});if(photo)this.coverRefs.set(avatarKey,photo);return {id,avatarKey:photo?avatarKey:null,name:[text(u.first_name,100),text(u.last_name,100)].filter(Boolean).join(' ')||'Аккаунт VK'};}
 async library(offset=0){if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new AppError('INPUT','Некорректная страница библиотеки.');const id=await this.connect();const r=await this.call('audio.get',{owner_id:id,count:1000,offset});if(!Array.isArray(r?.items)||!Number.isSafeInteger(r.count)||r.count<0)throw new AppError('PROTOCOL','Не удалось прочитать библиотеку VK.');if(!r.items.length&&offset<r.count)throw new AppError('PROTOCOL','VK не вернул продолжение библиотеки.');const items=r.items.slice(0,1000);for(const a of items){const key=keyOf(a);if(key)this.refs.set(key,{owner:Number(a.owner_id),id:Number(a.id),accessKey:typeof a.access_key==='string'?a.access_key:''});}return {rows:this.register(items),total:r.count,nextOffset:offset+items.length};}
 async search(query,offset=0){
  if(typeof query!=='string'||!query.trim()||query.length>200||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new AppError('INPUT','Введите запрос до 200 символов.');
  const r=await this.call('audio.search',{q:query.trim(),count:100,offset,auto_complete:1,sort:2});
  if(!Array.isArray(r?.items)||!Number.isSafeInteger(r.count)||r.count<0)throw new AppError('PROTOCOL','VK не вернул результаты поиска.');
  const items=r.items.slice(0,100);if(!items.length&&offset<r.count)throw new AppError('PROTOCOL','VK не вернул продолжение поиска.');
  for(const a of items){const key=keyOf(a);if(key)this.refs.set(key,{owner:Number(a.owner_id),id:Number(a.id),accessKey:typeof a.access_key==='string'?a.access_key:''});}
  return {rows:this.register(items),total:r.count,nextOffset:offset+items.length};
 }
 setCover(key,url){if(this.coverRefs.get(key)!==url){this.coverRefs.set(key,url);this.coverRevision=(this.coverRevision||0)+1;}}

 register(items){return items.map(a=>{const key=keyOf(a);if(!key)return null;this.refs.set(key,{owner:Number(a.owner_id),id:Number(a.id),accessKey:typeof a.access_key==='string'?a.access_key:'',album:a.album||this.refs.get(key)?.album,artists:([...(a.main_artists||[]),...(a.featured_artists||[])].length?[...(a.main_artists||[]),...(a.featured_artists||[])]:this.refs.get(key)?.artists||[]).slice(0,8).filter(a=>a&&typeof a.name==='string'&&(typeof a.id==='string'||Number.isSafeInteger(a.id))&&/^[a-zA-Z0-9_-]{1,100}$/.test(String(a.id))).map(a=>({id:String(a.id),name:text(a.name,200)}))});const row=audioRow(a);const url=coverPhoto(a.thumb)||coverPhoto(a.album?.thumb);if(url){this.setCover('t:'+key,url);row.coverKey='t:'+key;}return row;}).filter(Boolean);}
 async searchPlaylists(query,offset=0){
  if(typeof query!=='string'||!query.trim()||query.length>200||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new AppError('INPUT','Введите запрос до 200 символов.');
  const r=await this.call('audio.searchPlaylists',{q:query.trim(),count:20,offset,filters:'all'});
  if(!Array.isArray(r?.items)||!Number.isSafeInteger(r.count)||r.count<0)throw new AppError('PROTOCOL','VK не вернул плейлисты поиска.');
  const raw=r.items.slice(0,20);if(!raw.length&&offset<r.count)throw new AppError('PROTOCOL','VK не вернул продолжение поиска плейлистов.');
  const items=raw.map(p=>this.playlistRow(p));if(items.some(p=>!p))throw new AppError('PROTOCOL','Не удалось прочитать плейлист поиска.');
  return {items,total:r.count,nextOffset:offset+raw.length};
 }
 async playlists(offset=0){
  if(!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new AppError('INPUT','Некорректная страница.');
  const owner=await this.connect(),r=await this.call('audio.getPlaylists',{owner_id:owner,count:100,offset});
  if(!Array.isArray(r?.items)||!Number.isSafeInteger(r.count)||r.count<0)throw new AppError('PROTOCOL','VK не вернул список плейлистов и альбомов.');
  const items=r.items.map(p=>this.playlistRow(p));if(items.some(p=>!p))throw new AppError('PROTOCOL','Не удалось прочитать плейлист VK.');
  return {items,total:r.count,nextOffset:offset+r.items.length};
 }
 playlistRow(p){const key=keyOf(p);if(!key)return null;this.playlistRefs.set(key,{owner:Number(p.owner_id),id:Number(p.id),accessKey:typeof p.access_key==='string'?p.access_key:(this.playlistRefs.get(key)?.accessKey||''),source:p});const image=coverPhoto(p.photo)||coverPhoto(p.thumbs?.[0]);if(image)this.setCover('p:'+key,image);return {id:key,title:text(p.title)||'Без названия',...(require('./experience-model.js').releaseDate(p)?{releaseDate:require('./experience-model.js').releaseDate(p)}:{}),kind:p.type===1||p.is_album===true||p.is_album===1?'album':'playlist',artist:text((p.main_artists||[]).map(a=>a.name).join(', ')||p.owner_name||''),coverKey:image?'p:'+key:null,editable:p.permissions?.edit===true&&Number(p.owner_id)===this.userId&&p.type!==1&&!p.is_album,origin:keyOf(p.original)||keyOf(p.original_playlist),total:Number.isSafeInteger(p.count)&&p.count>=0?p.count:0,keys:[]};}
 async playlistMeta(key){const ref=this.playlistRefs.get(key);if(!ref)throw new AppError('INPUT','Сначала обновите список VK.');const p=await this.call('audio.getPlaylistById',{owner_id:ref.owner,playlist_id:ref.id,access_key:ref.accessKey});if(keyOf(p)!==key)throw new AppError('PROTOCOL','VK вернул другой плейлист.');return this.playlistRow(p);}
 async importList(input){let key,accessKey='';if(typeof input!=='string'||input.length>4096)throw new AppError('INPUT','Введите ссылку VK или owner_id_playlist_id.');
 if(/^-?[1-9]\d*_[1-9]\d*$/.test(input))key=input;else{const parsed=parseVkLink(input);if(!['playlist','album'].includes(parsed.type))throw new AppError('INPUT','Нужна ссылка VK на плейлист или альбом.');key=parsed.id;accessKey=parsed.accessKey;}
 const [owner,id]=key.split('_').map(Number);if(!Number.isSafeInteger(owner)||!Number.isSafeInteger(id))throw new AppError('INPUT','Некорректный ID.');if(accessKey||!this.playlistRefs.has(key))this.playlistRefs.set(key,{owner,id,accessKey});return this.playlistMeta(key);
 }
 async resolveTrackLink(input){
  const parsed=parseVkLink(input);if(parsed.type!=='track')throw new AppError('INPUT','Нужна ссылка VK на трек.');
  const [owner,id]=parsed.id.split('_'),audioId=owner+'_'+id+(parsed.accessKey?'_'+parsed.accessKey:'');
  const raw=await this.call('audio.getById',{audios:audioId,need_more:1}),items=Array.isArray(raw)?raw:raw?.items;
  if(!Array.isArray(items))throw new AppError('PROTOCOL','VK не вернул трек по ссылке.');
  const item=items.find(row=>keyOf(row)===parsed.id);if(!item)throw new AppError('UNAVAILABLE','VK не нашёл этот трек или не предоставил к нему доступ.');
  const row=this.register([item])[0];if(!row)throw new AppError('PROTOCOL','Не удалось прочитать трек по ссылке.');return row;
 }
 async albumForTrack(key){let ref=this.refs.get(key);if(!ref)throw new AppError('INPUT','Трек не найден.');if(!ref.album){const r=await this.call('audio.getById',{audios:this.audioParam(key),need_more:1});this.register(Array.isArray(r)?r:r?.items||[]);ref=this.refs.get(key);}if(!keyOf(ref?.album))throw new AppError('UNAVAILABLE','VK не указал альбом этого трека.');this.playlistRow(ref.album);return this.playlistMeta(keyOf(ref.album));}
 audioParam(key){const r=this.refs.get(key);if(!r)throw new AppError('INPUT','Сначала обновите трек.');return r.owner+'_'+r.id+(r.accessKey?'_'+r.accessKey:'');}
 async playlistPage(key,offset=0){
  const ref=this.playlistRefs.get(key);if(!ref||!Number.isSafeInteger(offset)||offset<0||offset>100000)throw new AppError('INPUT','Плейлист не найден в VK.');
  const r=await this.call('audio.get',{owner_id:ref.owner,album_id:ref.id,access_key:ref.accessKey,count:1000,offset});
  if(!Array.isArray(r?.items)||!Number.isSafeInteger(r.count)||r.count<0)throw new AppError('PROTOCOL','Не удалось прочитать треки плейлиста VK.');
  return {rows:this.register(r.items),total:r.count,nextOffset:offset+r.items.length};
 }
 mix(reset=false){if(this.mixJob)return this.mixJob;const job=readStreamMix(this,{reset}).finally(()=>{if(this.mixJob===job)this.mixJob=null;});this.mixJob=job;return job;}
 restoreRefs(rows){for(const r of rows){if(typeof r?.key!=='string')continue;const [owner,id]=r.key.split('_').map(Number);if(keyOf({owner_id:owner,id})===r.key&&!this.refs.has(r.key))this.refs.set(r.key,{owner,id,accessKey:''});}}
 async resolve(key){const cached=this.mediaCache.get(key);if(cached&&cached.until>this.now())return {...cached.value};const epoch=this.epoch;const value=await this.resolveFresh(key);if(epoch!==this.epoch)throw new AppError('CANCELLED','Сеанс закрыт.');if(this.mediaCache.size>=100)this.mediaCache.delete(this.mediaCache.keys().next().value);this.mediaCache.set(key,{value,until:this.now()+60000});return {...value};}
 async resolveFresh(key){const ref=this.refs.get(key);if(!ref)throw new AppError('INPUT','Выберите композицию из загруженной библиотеки.');const param=ref.owner+'_'+ref.id+(ref.accessKey?'_'+ref.accessKey:'');const r=await this.call('audio.getById',{audios:param,need_more:1});const a=(Array.isArray(r)?r:r?.items)?.find(a=>keyOf(a)===key);if(!a||!audioRow(a)?.available||!a.url)throw new AppError('UNAVAILABLE','Эта запись недоступна вашему аккаунту.');return {url:mediaURL(a.url),format:new URL(a.url).pathname.toLowerCase().endsWith('.m3u8')?'hls':'audio'};}
}
module.exports={VkClient};
