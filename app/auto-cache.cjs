'use strict';
// One sequential, lazy queue shared by playback and newly added library tracks.
class AutoCache{
 constructor(cache,{settings,resolve,validAdded=()=>true,notify=()=>{},later=setTimeout,cancel=clearTimeout}){Object.assign(this,{cache,settings,resolve,validAdded,notify,later,cancel});this.pending=[];this.running=false;this.epoch=0;this.attempted=new Set();this.timer=null;}
 reset(){this.epoch++;this.pending=[];this.attempted.clear();this.cancel(this.timer);this.timer=null;}
 enabled(reason){return reason==='added'?this.settings().autoCacheAdded!==false:this.settings().autoCache===true;}
 enqueue(key,media){this.push(key,media,'playing');}
 enqueueAdded(keys){for(const key of keys)this.push(key,null,'added');}
 push(key,media,reason){if(!this.enabled(reason)||this.cache.url(key)||this.attempted.has(key)||this.pending.length>=128)return;this.attempted.add(key);while(this.attempted.size>512)this.attempted.delete(this.attempted.values().next().value);this.pending.push({key,media,reason,epoch:this.epoch});this.drain();}
 retry(){if(this.timer)return;this.timer=this.later(()=>{this.timer=null;this.drain();},500);this.timer?.unref?.();}
 async drain(){if(this.running)return;this.running=true;try{while(this.pending.length){if(this.suspended||this.cache.job){this.retry();break;}const item=this.pending.shift(),valid=()=>item.epoch===this.epoch&&this.enabled(item.reason)&&(item.reason!=='added'||this.validAdded(item.key));if(!valid()||this.cache.url(item.key))continue;
   try{const media=item.media||await this.resolve(item.key);if(!valid())continue;if(media.format!=='audio'){this.notify({key:item.key,state:'skipped',message:'HLS не кешируется. Доступны только прямые аудиофайлы.'});continue;}if(this.suspended||this.cache.job){this.pending.unshift({...item,media});this.retry();break;}
    this.notify({key:item.key,state:'saving',message:'Сохранение в кеш…'});await this.cache.save(item.key,media,this.settings().cacheMB);if(valid())this.notify({key:item.key,state:'saved',message:'Трек сохранён в кеш.'});
   }catch(e){if(item.epoch===this.epoch){this.notify({key:item.key,state:'error',message:e.message});if(['CACHE_LIMIT','AUTH','ACCOUNT_CHANGED','NETWORK','RATE'].includes(e.code)){this.pending=[];break;}}}
  }}finally{this.running=false;}}
}
module.exports={AutoCache};
