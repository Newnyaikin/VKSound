'use strict';
// Protocol reference: Nocturne src/vk/api.ts and src-tauri/src/vk.rs.
// Original VKSound implementation; token remains in the main-process web session.
const {AppError}=require('./model.cjs');
const METHOD='audio.getStreamMixAudios',VERSION='5.289';
async function readStreamMix(client,{reset=false}={}){
 const epoch=client.epoch,check=()=>{if(epoch!==client.epoch)throw new AppError('CANCELLED','Микс отменён.');};
 if(reset)client.mixAttempts=[];let backoffs=0;
 const note=(result,code=null)=>{client.mixAttempts.push({variant:'nocturne-web',version:VERSION,result,vkCode:Number.isSafeInteger(code)?code:null});client.mixAttempts=client.mixAttempts.slice(-8);};
 while(true){
  check();try{await client.connect();}catch(e){check();if(e.code==='AUTH')throw new AppError('MIX_UNAVAILABLE','VK не предоставил сеанс Микса. Вход для библиотеки не сброшен.');throw e;}
  check();const wait=340-(client.now()-(client.mixLastAt??-Infinity));if(wait>0)await client.sleep(wait);check();client.mixLastAt=client.now();
  let data;try{data=await client.json('https://api.vk.ru/method/'+METHOD+'?v='+VERSION+'&client_id=6287487',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',Origin:'https://vk.ru',Referer:'https://vk.ru/'},body:new URLSearchParams({mix_id:'common',count:'20',access_token:client.token}).toString()});}catch(e){check();note(e.code||'ERROR');if(e.code==='AUTH')throw new AppError('MIX_UNAVAILABLE','VK отклонил доступ к Миксу. Сеанс библиотеки сохранён.');throw e;}check();
  if(data.error){const code=Number(data.error.error_code);note('VK_ERROR',code);
   if([5,1116,1117].includes(code))throw new AppError('MIX_UNAVAILABLE','VK не принял сеанс Микса. Автоматический повтор входа отключён. Попробуйте позже.');
   if(code===10&&backoffs<1){backoffs++;await client.sleep(3000);check();continue;}
   const e=new AppError([6,9].includes(code)?'RATE':[15,18,200,201,203].includes(code)?'ACCESS':code===14?'MIX_UNAVAILABLE':'API','VK отклонил Микс (код '+(Number.isSafeInteger(code)?code:'неизвестен')+').');e.vkCode=Number.isSafeInteger(code)?code:null;throw e;
  }
  if(!Array.isArray(data.response)||data.response.length>500){note('PROTOCOL');throw new AppError('PROTOCOL','VK изменил формат Микса. Локальная библиотека вместо него не используется.');}
  const rows=client.register(data.response);client.mixTail=rows.at(-1)?.key||null;note('OK');return {rows,more:rows.length>0};
 }
}
module.exports={readStreamMix};
