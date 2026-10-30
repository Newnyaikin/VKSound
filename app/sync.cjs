'use strict';
const {AppError}=require('./model.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
// Finite collections are staged and committed only after a complete, stable scan.
async function allPages(page,{field='rows',valid=()=>true,progress=()=>{},delay=0,max=100000}={}){
 const result=[],seenPages=new Set();let offset=0,total=null;
 do{
  let p,items,keys,signature;
  for(let retry=0;;retry++){
   if(!valid())throw new AppError('CANCELLED','Синхронизация отменена.');
   p=await page(offset);items=p?.[field];
   if(!valid())throw new AppError('CANCELLED','Синхронизация отменена.');
   if(!Array.isArray(items)||!Number.isSafeInteger(p.total)||p.total<0||p.total>max||!Number.isSafeInteger(p.nextOffset)||p.nextOffset<offset||p.nextOffset>p.total)throw new AppError('PROTOCOL','Некорректная страница VK. Предыдущий список сохранён.');
   if(total!==null&&total!==p.total)throw new AppError('CHANGED','Список VK изменился во время загрузки. Повторите обновление.');total=p.total;
   if(p.nextOffset-offset!==items.length||(!items.length&&offset<total))throw new AppError('PROTOCOL','VK не вернул полную страницу. Предыдущий список сохранён.');
   keys=items.map(item=>item?.key||item?.id);
   if(keys.some(key=>typeof key!=='string'))throw new AppError('PROTOCOL','Некорректная запись на странице VK. Предыдущий список сохранён.');
   signature=JSON.stringify(keys);
   if(!seenPages.has(signature))break;
   if(retry>=2)throw new AppError('CHANGED','VK повторил страницу несколько раз. Предыдущий список сохранён; попробуйте обновить позже.');
   await sleep(350);
  }
  seenPages.add(signature);
  result.push(...items);
  offset=p.nextOffset;progress({loaded:offset,total});if(offset<total&&delay>0)await sleep(delay);
 }while(offset<total);
 return result;
}
async function syncLibrary(client,store,{valid=()=>true,progress=()=>{},delay=0}={}){
 const accountId=store.profile?.id;
 const rows=await allPages(offset=>client.library(offset),{valid,delay,progress:p=>progress({phase:'music',...p})});
 if(!valid())throw new AppError('CANCELLED','Синхронизация отменена.');
 await store.commitSync(rows,{accountId,library:rows.map(t=>t.key)});
 return {loaded:rows.length};
}
async function syncLists(client,store,{valid=()=>true,progress=()=>{},delay=0,catalogOnly=false,targetId=null}={}){
 const accountId=store.profile?.id;
 const lists=await allPages(offset=>client.playlists(offset),{field:'items',valid,delay,max:10000,progress:p=>progress({phase:'lists',...p})});
 const saved=store.snapshot().vkLists||[],complete=[],errors=[];const rows=[];
 for(let i=0;i<lists.length;i++){
  const p=lists[i];
  const old=saved.find(x=>x.id===p.id);if((catalogOnly&&!targetId)||(targetId&&p.id!==targetId)){complete.push({...p,keys:old?.keys||[],syncedAt:old?.syncedAt||null});continue;}
  try{const tracks=await allPages(offset=>client.playlistPage(p.id,offset),{valid,delay,progress:x=>progress({phase:'listTracks',title:p.title,index:i+1,lists:lists.length,...x})});
   rows.push(...tracks);complete.push({...p,total:tracks.length,keys:tracks.map(t=>t.key),syncedAt:new Date().toISOString()});
  }catch(e){if(['CANCELLED','AUTH','ACCOUNT_CHANGED','RATE','NETWORK'].includes(e.code))throw e;errors.push({id:p.id,title:p.title,message:e.message});const old=saved.find(x=>x.id===p.id);complete.push(old?{...p,keys:old.keys,syncedAt:old.syncedAt,total:old.total}:{...p,syncedAt:null});}
  if(i+1<lists.length&&delay>0)await sleep(delay);
 }
 if(!valid())throw new AppError('CANCELLED','Синхронизация отменена.');
 await store.commitSync(rows,{accountId,vkLists:complete});return {loaded:complete.length,errors};
}
module.exports={allPages,syncLibrary,syncLists};
