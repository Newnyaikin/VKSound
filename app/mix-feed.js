(function(root){'use strict';
// State for one feed request at a time. A failed read never means the stream ended.
class MixFeed{
 constructor(){this.generation=0;this.keys=[];this.more=true;this.error='';this.retryAt=0;this.job=null;}
 clear(){this.generation++;this.keys=[];this.more=true;this.error='';this.retryAt=0;this.job=null;}
 move(key,before){const from=this.keys.indexOf(key);if(from<0||key===before)return false;if(before!==null&&!this.keys.includes(before))return false;const [track]=this.keys.splice(from,1),index=before===null?this.keys.length:this.keys.indexOf(before);this.keys.splice(index,0,track);return true;}
 load(fetchPage,{reset=false,retry=false,now=Date.now,delay=ms=>new Promise(r=>setTimeout(r,ms)),onRows=()=>{}}={}){
  if(this.job)return this.job;if(reset)this.clear();if(!retry&&now()<this.retryAt)return Promise.resolve({fresh:[],deferred:true});if(!this.more&&!reset&&!retry)return Promise.resolve({fresh:[],ended:true});
  const generation=this.generation;this.error='';const job=Promise.resolve().then(async()=>{const fresh=[];try{for(let attempt=0;attempt<3;attempt++){const data=await fetchPage(reset&&attempt===0);if(generation!==this.generation)return {fresh:[],cancelled:true};if(!data||!Array.isArray(data.rows)||typeof data.more!=='boolean')throw Error('Некорректный ответ Микса.');const seen=new Set(this.keys),rows=data.rows.filter(r=>r&&typeof r.key==='string'&&!seen.has(r.key)&&seen.add(r.key));this.keys.push(...rows.map(r=>r.key));fresh.push(...rows);this.more=data.more;await onRows(rows);if(generation!==this.generation)return {fresh:[],cancelled:true};if(rows.length||!data.more){this.retryAt=0;return {fresh,more:this.more};}if(attempt<2)await delay(400);}
   // Advancing overlap pages are not an end-of-stream. Stop bounded probing, allow retry.
   this.error='VK повторил уже загруженные треки. Повторите загрузку продолжения.';this.retryAt=now()+5000;return {fresh,more:true,repeated:true};
  }catch(e){if(generation!==this.generation)return {fresh:[],cancelled:true};this.error=e.message||'Продолжение Микса не загрузилось.';this.retryAt=now()+5000;this.more=true;return {fresh,error:e};}finally{if(generation===this.generation)this.job=null;}});this.job=job;return job;
 }
}
const api={MixFeed};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VKSoundMix=api;
})(typeof window!=='undefined'?window:globalThis);
