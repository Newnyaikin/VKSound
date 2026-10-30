'use strict';
// Read-only VK discovery; all media references stay in the existing client.
const {createHash}=require('node:crypto');
const {AppError,text,coverPhoto,coverURL}=require('./model.cjs');
const catalog=require('./artist-catalog.cjs');
const RECOVERABLE=new Set(['API','METHOD','PROTOCOL','UNAVAILABLE']);
function recoverable(e){return RECOVERABLE.has(e.code);}
function artistLink(value){try{const u=new URL(value);if(u.protocol!=='https:'||!['vk.ru','vk.com','www.vk.ru','www.vk.com'].includes(u.hostname)||u.username||u.password)return null;const m=u.pathname.match(/^\/artist\/([a-zA-Z0-9_-]{1,100})\/?$/);return m?.[1]||null;}catch{return null;}}
const ID=/^[a-zA-Z0-9_-]{1,100}$/;
function artistId(v){const s=typeof v==='string'?v:(Number.isSafeInteger(v)?String(v):'');if(!ID.test(s))throw new AppError('INPUT','Неизвестный ID исполнителя.');return s;}
function page(r,count=100){const a=Array.isArray(r)?r:r?.items;if(!Array.isArray(a)||a.length>5000)throw new AppError('PROTOCOL','VK изменил формат списка.');return {items:a.slice(0,count),total:Number.isSafeInteger(r?.count)&&r.count>=0?r.count:a.length};}
function offsetOf(n=0){if(!Number.isSafeInteger(n)||n<0||n>100000)throw new AppError('INPUT','Некорректная страница.');return n;}
function normalizeLyrics(r){const raw=r?.lyrics,clean=v=>typeof v==='string'?v.split('\n').map(l=>text(l,800)):Array.isArray(v)?v.map(l=>text(typeof l==='string'?l:l?.text||l?.line,800)):[];let lines=Array.isArray(raw?.timestamps)?raw.timestamps.filter(l=>l&&!l.interlude).map(l=>text(l.line||l.text,800)):[];if(!lines.some(Boolean))lines=clean(raw?.text);if(!lines.some(Boolean))lines=clean(typeof raw==='string'?raw:r?.text);if(!lines.some(Boolean))lines=clean(raw?.lines||r?.lines);return {lines:lines.slice(0,1500),available:lines.some(Boolean)};}
class Discovery{
 constructor(client){this.client=client;this.epoch=client.epoch;this.friendRefs=new Map();this.nextAt=0;this.artistPages=new Map();this.artistNames=new Map();}
 check(){if(this.epoch!==this.client.epoch){this.friendRefs.clear();this.artistPages.clear();this.artistNames.clear();this.nextAt=0;this.epoch=this.client.epoch;}}
 async request(method,params){const epoch=this.client.epoch,now=this.client.now(),due=Math.max(now,this.nextAt);this.nextAt=due+340;if(due>now)await this.client.sleep(due-now);if(epoch!==this.client.epoch)throw new AppError('CANCELLED','Аккаунт изменился.');return this.client.call(method,params);}
 image(kind,id,raw){const key=kind+':'+createHash('sha256').update(String(id)).digest('hex').slice(0,24);const choose=(v,depth=0)=>{if(depth>3)return null;if(typeof v==='string')return coverURL(v);if(Array.isArray(v))return v.slice(0,50).sort((a,b)=>(b?.width||0)-(a?.width||0)).map(p=>choose(p,depth+1)).find(Boolean);return coverPhoto(v)||choose(v?.sizes,depth+1);};const url=choose(raw);if(url)this.client.setCover(key,url);return url?key:null;}
 rememberArtists(items){const out=[];for(const a of (items||[]).slice(0,24))try{const id=artistId(a.id),name=text(a.name,200);if(!name)continue;const row={id,name,coverKey:this.image('a',id,a.photo||a.image||a.thumb)};this.artistNames.set(id,row);if(!out.some(x=>x.id===id))out.push(row);}catch{}while(this.artistNames.size>200)this.artistNames.delete(this.artistNames.keys().next().value);return out;}
 async artistsForTrack(key,name){this.check();const c=this.client;let ref=c.refs.get(key);if(ref&&!ref.artists?.length){try{const raw=await this.request('audio.getById',{audios:c.audioParam(key),need_more:1});c.register(Array.isArray(raw)?raw:raw?.items||[]);ref=c.refs.get(key);}catch(e){if(!recoverable(e))throw e;}}
  if(ref?.artists?.length)return this.rememberArtists(ref.artists);
  if(typeof name!=='string'||!name.trim()||name.length>200)throw new AppError('INPUT','Не указан исполнитель.');
  try{const data=await this.request('catalog.getAudioSearch',{query:name.trim(),need_blocks:1}),artistBlocks=catalog.blocks(data).filter(b=>Array.isArray(b.links_ids)&&/исполнител|музыкант|artist|musician/i.test(b.title)),ids=new Set(artistBlocks.flatMap(b=>b.links_ids.map(String)));const links=catalog.list(data.links).filter(l=>ids.has(String(l.id))).map(l=>({id:artistLink(l.url),name:l.title,image:l.image})).filter(a=>a.id);const found=this.rememberArtists([...catalog.list(data.artists),...links]);if(found.length||Array.isArray(data?.catalog?.sections))return found;}catch(e){if(!recoverable(e))throw e;}
  const r=page(await this.request('audio.searchArtists',{q:name.trim(),count:8}),8);return this.rememberArtists(r.items);
 }
 async searchArtists(query){
  this.check();
  if(typeof query!=='string'||!query.trim()||query.length>200)throw new AppError('INPUT','Введите запрос до 200 символов.');
  const r=page(await this.request('audio.searchArtists',{q:query.trim(),count:8}),8);
  return {items:this.rememberArtists(r.items),total:r.total};
 }
 async artistAlbums(id,offset=0){
  this.check();id=artistId(id);offset=offsetOf(offset);const c=this.client;let state=this.artistPages.get(id);
  if(state?.legacy)throw new AppError('UNAVAILABLE','VK не предоставил каталог альбомов исполнителя.');
  if(!state){const raw=await this.request('catalog.getAudioArtist',{artist_id:id,url:'https://vk.ru/artist/'+id,need_blocks:1});state=catalog.readRoot(raw,id,this.artistNames.get(id),c,(...args)=>this.image(...args));this.artistPages.set(id,state);while(this.artistPages.size>24)this.artistPages.delete(this.artistPages.keys().next().value);}
  return catalog.takeAlbumsPage(state,offset,(...args)=>this.request(...args),c);
 }
 async artist(id,offset=0){
  this.check();id=artistId(id);offset=offsetOf(offset);const c=this.client;let state=this.artistPages.get(id);
  if(offset===0||!state){try{const raw=await this.request('catalog.getAudioArtist',{artist_id:id,url:'https://vk.ru/artist/'+id,need_blocks:1});state=catalog.readRoot(raw,id,this.artistNames.get(id),c,(...args)=>this.image(...args));this.artistPages.set(id,state);while(this.artistPages.size>24)this.artistPages.delete(this.artistPages.keys().next().value);}catch(e){if(!recoverable(e))throw e;state={legacy:true};this.artistPages.set(id,state);}}
  if(!state.legacy){
   const result=await catalog.takePage(state,offset,(...args)=>this.request(...args),c);if(offset!==0)return result;
   try{const albums=await this.artistAlbums(id,0);return {...result,albums:albums.items,albumsTotal:albums.total,albumsNextOffset:albums.nextOffset,albumsHasMore:albums.hasMore};}
   catch(e){if(e.code==='CANCELLED')throw e;const albums=result.albums||[];return {...result,albumsTotal:albums.length,albumsNextOffset:albums.length,albumsHasMore:!!state.albumCursor||state.albumKeys.length>albums.length,warning:result.warning||'VK не предоставил полный список альбомов.'};}
  }
  let raw,profileWarning='';try{raw=await this.request('audio.getArtistById',{artist_id:id,extended:1});}catch(e){if(!recoverable(e)||!this.artistNames.has(id))throw e;raw=this.artistNames.get(id);profileWarning='VK предоставил треки, но не сведения профиля.';}const a=Array.isArray(raw)?raw.find(a=>a&&String(a.id)===id):raw?.artist||raw;if(!a||String(a.id)!==id||typeof a.name!=='string')throw new AppError('PROTOCOL','VK не вернул профиль исполнителя.');
  const tracks=page(await this.request('audio.getAudiosByArtist',{artist_id:id,count:100,offset}));let albums={items:[],total:0,nextOffset:0,hasMore:false},warning=profileWarning;
  if(offset===0)try{albums=await this.artistAlbums(id,0);}catch(e){if(e.code==='CANCELLED')throw e;if(!recoverable(e))throw e;warning=warning||'VK не предоставил альбомы исполнителя.';}
  return {id,name:text(a.name,200),coverKey:this.image('a',id,a.avatar||a.photo||a.thumb),description:text(a.description||a.bio,1200),verified:a.is_verified===true,rows:c.register(tracks.items),total:tracks.total,nextOffset:offset+tracks.items.length,albums:albums.items,albumsTotal:albums.total,albumsNextOffset:albums.nextOffset,albumsHasMore:albums.hasMore,warning};
 }
 async friends(offset=0){this.check();offset=offsetOf(offset);const epoch=this.client.epoch,r=page(await this.request('friends.get',{count:100,offset,fields:'photo_100,photo_200,can_see_audio',order:'hints'}));if(epoch!==this.client.epoch)throw new AppError('CANCELLED','Аккаунт изменился.');const items=r.items.filter(u=>Number.isSafeInteger(u.id)&&u.id>0).map(u=>{const p={id:u.id,name:[text(u.first_name,100),text(u.last_name,100)].filter(Boolean).join(' '),canSeeAudio:u.can_see_audio!==false&&u.can_see_audio!==0,coverKey:this.image('f',u.id,{url:u.photo_200||u.photo_100})};this.friendRefs.set(p.id,p);return p;});return {items,total:r.total,nextOffset:offset+r.items.length};}
 async friend(id,offset=0){this.check();offset=offsetOf(offset);if(!Number.isSafeInteger(id)||!this.friendRefs.has(id))throw new AppError('INPUT','Сначала выберите друга из загруженного списка.');const friend=this.friendRefs.get(id);if(!friend.canSeeAudio)throw new AppError('ACCESS','Друг скрыл свою музыку.');const r=page(await this.request('audio.get',{owner_id:id,count:100,offset}));return {...friend,rows:this.client.register(r.items),total:r.total,nextOffset:offset+r.items.length,albums:[]};}
 async lyrics(key){if(!this.client.refs.has(key))throw new AppError('INPUT','Неизвестный трек.');return normalizeLyrics(await this.request('audio.getLyrics',{audio_id:key}));}
 async related(key,offset=0){offset=offsetOf(offset);if(!this.client.refs.has(key))throw new AppError('INPUT','Неизвестный трек.');const r=page(await this.request('audio.getRecommendations',{target_audio:key,count:20,offset}),20);return {rows:this.client.register(r.items),total:r.total,nextOffset:offset+r.items.length,more:r.items.length>0&&offset+r.items.length<r.total};}
}
module.exports={Discovery,artistId,artistLink,normalizeLyrics,page};
