'use strict';
const {allPages}=require('./sync.cjs'),{AppError}=require('./model.cjs');
async function readAlbum(client,store,track,{valid=()=>true,delay=350}={}){const accountId=store.profile?.id,meta=await client.albumForTrack(track);if(!valid())throw new AppError('CANCELLED','Аккаунт изменился.');const rows=await allPages(offset=>client.playlistPage(meta.id,offset),{valid,delay});if(!valid())throw new AppError('CANCELLED','Аккаунт изменился.');await store.remember(rows,{accountId});return {...meta,accountId,keys:rows.map(t=>t.key),total:rows.length,syncedAt:new Date().toISOString(),editable:false};}
module.exports={readAlbum};
