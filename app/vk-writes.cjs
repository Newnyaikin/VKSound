'use strict';
const {AppError,keyOf,text}=require('./model.cjs');const {allPages}=require('./sync.cjs');
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function moveBefore(keys,key,before){const a=[...keys],i=a.indexOf(key);if(i<0||key===before)throw new AppError('INPUT','Некорректное перемещение.');a.splice(i,1);const j=before===null?a.length:a.indexOf(before);if(j<0)throw new AppError('CHANGED','Трек назначения не найден.');a.splice(j,0,key);return a;}
function addedId(value){
 if(typeof value==='number'||(typeof value==='string'&&/^\d+$/.test(value))){const n=Number(value);return Number.isSafeInteger(n)&&n>0?n:null;}
 if(Array.isArray(value)&&value.length===1)return addedId(value[0]);
 if(value&&typeof value==='object'&&Array.isArray(value.items)&&value.items.length===1){const a=value.items[0];if(a&&Object.hasOwn(a,'new_audio_id'))return addedId(a.new_audio_id);}
 if(value&&typeof value==='object')for(const k of ['audio_id','id','audio','item']){if(Object.hasOwn(value,k)){const n=addedId(value[k]);if(n)return n;}}
 return null;
}
class VkWrites{
 constructor(client,store,{valid=()=>true,delay=0,progress=()=>{}}={}){this.client=client;this.store=store;this.id=store.profile?.id;this.valid=()=>valid()&&store.profile?.id===this.id&&client.userId===this.id;this.delay=delay;this.progress=progress;}
 check(){if(!this.valid())throw new AppError('CANCELLED','Аккаунт изменился. Обновите список.');}
 async library(){this.check();return allPages(offset=>this.client.library(offset),{valid:this.valid,delay:this.delay});}
 async lists(){this.check();return allPages(offset=>this.client.playlists(offset),{field:'items',valid:this.valid,delay:this.delay,max:10000});}
 async list(key){this.check();const meta=await this.client.playlistMeta(key);this.check();const rows=await allPages(offset=>this.client.playlistPage(key,offset),{valid:this.valid,delay:this.delay});return {...meta,keys:rows.map(t=>t.key),total:rows.length,rows,syncedAt:new Date().toISOString()};}
 async afterWrite(fn){try{return await fn();}catch(e){if(e.code==='CANCELLED')throw e;throw new AppError('UNCERTAIN','Запрос в VK отправлен, но подтверждение не получено. Обновите коллекцию перед повтором.');}}
 async saveLibrary(rows,libraryLinks,pendingAdds){this.check();return this.store.commitSync(rows,{accountId:this.id,library:rows.map(t=>t.key),libraryLinks,pendingAdds});}
 async saveList(p){this.check();const {rows,...meta}=p;return this.store.commitSync(rows,{accountId:this.id,vkLists:[...this.store.data.vkLists.filter(x=>x.id!==p.id),meta]});}
 requireOwn(meta){const ref=this.client.playlistRefs.get(meta.id);if(!ref||ref.owner!==this.id||!meta.editable||meta.kind==='album')throw new AppError('ACCESS','Редактировать состав и порядок можно только в собственном плейлисте с разрешением VK.');return ref;}
 async tracks(op,keys){if(!['add','delete'].includes(op)||!Array.isArray(keys)||!keys.length||keys.length>100||new Set(keys).size!==keys.length)throw new AppError('INPUT','Выберите от 1 до 100 разных треков.');
  const before=await this.library(),known=new Set(before.map(t=>t.key)),items=[];const expected=new Map();let halted=false;
  for(let i=0;i<keys.length;i++){const key=keys[i];this.check();const ref=this.client.refs.get(key);if(!ref)throw new AppError('INPUT','Сначала обновите выбранные треки.');
   if(halted){items.push({key,state:'notSent',message:'Не отправлено после ошибки предыдущего запроса.'});continue;}
   if(op==='add'&&(this.store.data.pendingAdds||[]).includes(key)){items.push({key,state:'accepted',message:'Добавление уже принято VK. Обновите «Мою музыку»; повторный запрос не отправлен.'});continue;}
   if(op==='add'&&known.has(key)){items.push({key,state:'unchanged',message:'Уже в моей музыке.'});continue;}
   if(op==='delete'&&(!known.has(key)||ref.owner!==this.id)){items.push({key,state:'failed',message:'Нет точной собственной записи в библиотеке VK.'});continue;}
   this.progress({index:i+1,total:keys.length,key});
   try{this.check();const method=op==='delete'?'audio.delete':ref.owner===this.id?'audio.restore':'audio.add';const result=await this.client.call(method,{owner_id:ref.owner,audio_id:ref.id,...(ref.accessKey?{access_key:ref.accessKey}:{})});this.check();if(op==='add'){const id=addedId(result);if(method==='audio.restore')expected.set(key,key);else if(id){const owner=result?.items?.[0]?.new_owner_id;if(owner!==undefined&&Number(owner)!==this.id)throw new AppError('UNCERTAIN','VK вернул запись другого владельца. Обновите библиотеку.');expected.set(key,this.id+'_'+id);}}else expected.set(key,key);items.push({key,state:'pending',message:'Запрос принят, проверяем список VK.'});}
   catch(e){items.push({key,state:e.code==='UNCERTAIN'?'unconfirmed':'failed',message:e.message});halted=true;}
   if(i+1<keys.length&&this.delay>0)await new Promise(r=>setTimeout(r,this.delay));
  }
  try{const after=await this.library();const now=new Set(after.map(t=>t.key));for(const item of items)if(item.state==='pending'){if(op==='add'&&!expected.has(item.key)){item.state='accepted';item.message='VK принял добавление; библиотека перечитана. Личный ID не выдан: удаление доступно из «Моей музыки». Повторный запрос не отправляется.';continue;}const okay=op==='add'?now.has(expected.get(item.key)):!now.has(item.key);if(okay&&op==='add')item.libraryKey=expected.get(item.key);item.state=okay?'done':'unconfirmed';item.message=okay?'Подтверждено повторным чтением VK.':'VK не подтвердил изменение в актуальном списке.';}const links={...(this.store.data.libraryLinks||{})};for(const item of items)if(item.state==='done'&&item.libraryKey)links[item.key]=item.libraryKey;await this.saveLibrary(after,links,items.filter(x=>x.state==='accepted').map(x=>x.key));}
  catch(e){for(const item of items)if(['pending','done','accepted'].includes(item.state)){item.state='unconfirmed';item.message='Запись могла сохраниться; перечитать VK не удалось. Обновите список.';}}
  return {items};
 }
 async editList(arg){if(['add','remove'].includes(arg.op)&&(!Array.isArray(arg.keys)||!arg.keys.length||arg.keys.length>100||new Set(arg.keys).size!==arg.keys.length||arg.keys.some(k=>!this.client.refs.has(k))))throw new AppError('INPUT','Выберите от 1 до 100 известных треков.');if(arg.op==='replace'&&(!Array.isArray(arg.keys)||arg.keys.length>1000||new Set(arg.keys).size!==arg.keys.length||arg.keys.some(k=>typeof k!=='string'||!this.client.refs.has(k))))throw new AppError('INPUT','Состав плейлиста не прошёл проверку.');const old=this.store.data.vkLists.find(p=>p.id===arg.id);if(!old||!old.syncedAt)throw new AppError('INPUT','Сначала полностью обновите плейлист.');const fresh=await this.list(arg.id),ref=this.requireOwn(fresh);
  if(!same(fresh.keys,old.keys)||fresh.title!==old.title)throw new AppError('CHANGED','Плейлист изменился в VK. Обновите его перед редактированием.');
  let keys=[...fresh.keys],title=fresh.title;
  if(arg.op==='rename'){title=text(arg.title,80).trim();if(!title)throw new AppError('INPUT','Введите название.');}
  else if(arg.op==='add'){for(const key of arg.keys||[]){if(!this.client.refs.has(key))throw new AppError('INPUT','Трек не найден.');if(!keys.includes(key))keys.push(key);}}
  else if(arg.op==='remove'){const selected=new Set(arg.keys||[]);if([...selected].some(k=>!keys.includes(k)))throw new AppError('CHANGED','Выбранные треки отсутствуют в плейлисте.');keys=keys.filter(k=>!selected.has(k));}
  else if(arg.op==='clear')keys=[];
  else if(arg.op==='replace'){keys=[...arg.keys];title=text(arg.title,80).trim();if(!title)throw new AppError('INPUT','Введите название.');}
  else if(arg.op==='reorder')keys=moveBefore(keys,arg.key,arg.before);
  else throw new AppError('INPUT','Неизвестное изменение плейлиста.');
  if(keys.length>1000)throw new AppError('LIMIT','Безопасная запись состава ограничена 1000 треками. Плейлист не изменён.');
  const source=this.client.playlistRefs.get(arg.id)?.source||{};this.check();
  await this.client.call('audio.editPlaylist',{owner_id:ref.owner,playlist_id:ref.id,title,description:typeof source.description==='string'?source.description:'',...(source.no_discover===undefined?{}:{no_discover:+!!source.no_discover}),audio_ids:keys.map(k=>this.client.audioParam(k)).join(',')});
  this.check();let after;try{after=await this.list(arg.id);await this.saveList(after);}catch(e){throw new AppError('UNCERTAIN','Изменение отправлено, но результат VK не удалось прочитать. Обновите плейлист перед повтором.');}
  if(after.title!==title||!same(after.keys,keys))throw new AppError('UNCERTAIN','VK вернул другой состав или порядок. Показан актуальный список; проверьте его.');return {id:after.id,verified:true};
 }
 async create(title){title=text(title,80).trim();if(!title)throw new AppError('INPUT','Введите название.');this.check();const r=await this.client.call('audio.createPlaylist',{owner_id:this.id,title});this.check();if(!keyOf(r))throw new AppError('UNCERTAIN','VK не вернул созданный плейлист. Обновите список перед повтором.');this.client.playlistRow(r);const p=await this.afterWrite(()=>this.list(keyOf(r)));if(p.title!==title)throw new AppError('UNCERTAIN','VK не подтвердил название плейлиста.');await this.saveList(p);return {id:p.id,verified:true};}
 async deleteList(id){const lists=await this.lists(),p=lists.find(x=>x.id===id);if(!p)throw new AppError('CHANGED','Плейлист уже отсутствует. Обновите коллекцию.');const ref=this.client.playlistRefs.get(id);if(ref.owner!==this.id)throw new AppError('ACCESS','VK не предоставил личный ID сохранённого списка. Оригинал чужого альбома или плейлиста не удаляется; уберите его на сайте VK и обновите коллекцию.');
  this.check();await this.client.call('audio.deletePlaylist',{owner_id:this.id,playlist_id:ref.id});this.check();const after=await this.afterWrite(()=>this.lists());if(after.some(x=>x.id===id))throw new AppError('UNCERTAIN','VK ещё возвращает удалённый список. Обновите коллекцию.');await this.store.commitSync([],{accountId:this.id,vkLists:this.store.data.vkLists.filter(p=>p.id!==id)});return {verified:true};
 }
 async follow(input){const p=await this.client.importList(input);this.check();await this.client.call('audio.followPlaylist',{owner_id:this.client.playlistRefs.get(p.id).owner,playlist_id:this.client.playlistRefs.get(p.id).id,...(this.client.playlistRefs.get(p.id).accessKey?{access_key:this.client.playlistRefs.get(p.id).accessKey}:{})});this.check();const after=await this.afterWrite(()=>this.lists()),found=after.find(x=>x.id===p.id||x.origin===p.id);if(!found)throw new AppError('UNCERTAIN','Запрос сохранения отправлен, но VK не подтвердил список в коллекции. Обновите её перед повтором.');const full=await this.afterWrite(()=>this.list(found.id));await this.saveList(full);return {id:found.id,verified:true};}
 async reorderLibrary(key,before){const rows=await this.library(),keys=rows.map(t=>t.key);if(!same(keys,this.store.data.library))throw new AppError('CHANGED','Библиотека изменилась в VK. Обновите её.');const expected=moveBefore(keys,key,before);const ref=this.client.refs.get(key),target=this.client.refs.get(before);if(ref?.owner!==this.id||(before!==null&&target?.owner!==this.id))throw new AppError('ACCESS','VK не предоставил личные ID для изменения порядка.');const i=expected.indexOf(key),afterRef=i>0?this.client.refs.get(expected[i-1]):null;
  if(before===null&&afterRef?.owner!==this.id)throw new AppError('ACCESS','Не удалось определить конечную позицию.');this.check();await this.client.call('audio.reorder',{owner_id:this.id,audio_id:ref.id,...(before===null?{after:afterRef.id}:{before:target.id})});this.check();let actual;try{actual=await this.library();await this.saveLibrary(actual);}catch{throw new AppError('UNCERTAIN','Порядок отправлен, но не проверен. Обновите библиотеку.');}if(!same(actual.map(t=>t.key),expected))throw new AppError('UNCERTAIN','VK не подтвердил порядок. Показан актуальный список.');return {verified:true};
 }
}
module.exports={VkWrites,moveBefore,addedId};
