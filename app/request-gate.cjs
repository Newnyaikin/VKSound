'use strict';
const {AppError}=require('./model.cjs');
// One gate for web_token and both API hosts. Limits are a conservative local
// policy, NOT a promise about VK quotas. Neither logout nor reconnect clears it.
class RequestGate {
 constructor({now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms)),interval=1100,maxQueue=64,stateFile=null}={}){
  this.now=now;this.sleep=sleep;this.interval=interval;this.maxQueue=maxQueue;
  this.nextAt=0;this.blockedUntil=0;this.queue=[];this.running=false;this.generation=0;this.cancelActive=null;this.stateFile=stateFile;
  if(stateFile)try{const saved=JSON.parse(require('node:fs').readFileSync(stateFile,'utf8'));if(saved.version===1&&Number.isFinite(saved.until)&&saved.until>now()&&saved.until<now()+365*86400000)this.blockedUntil=saved.until;}catch{}
 }
 cancelled(){return new AppError('CANCELLED','Запрос отменён.');}
 rate(){const seconds=Math.max(1,Math.ceil((this.blockedUntil-this.now())/1000));return new AppError('RATE','Запросы к VK приостановлены. Повторите вручную не раньше чем через '+Math.ceil(seconds/60)+' мин.');}
 check(){if(this.now()<this.blockedUntil)throw this.rate();}
 pause(code,retryAfter){
  const fallback=code===9?30*60*1000:5*60*1000;
  let server=Number(retryAfter)*1000;
  if(!Number.isFinite(server)&&retryAfter)server=Date.parse(retryAfter)-this.now();
  this.blockedUntil=Math.max(this.blockedUntil,this.now()+Math.max(fallback,Number.isFinite(server)?server:0));
  if(this.stateFile)try{const fs=require('node:fs'),path=require('node:path');fs.mkdirSync(path.dirname(this.stateFile),{recursive:true});const temp=this.stateFile+'.tmp';fs.writeFileSync(temp,JSON.stringify({version:1,until:this.blockedUntil}),{mode:0o600});fs.renameSync(temp,this.stateFile);}catch{}
 }
 cancel(){this.generation++;for(const item of this.queue.splice(0))item.reject(this.cancelled());this.cancelActive?.();}
 run(task){
  try{this.check();}catch(e){return Promise.reject(e);}
  if(this.queue.length>=this.maxQueue)return Promise.reject(new AppError('BUSY','Слишком много ожидающих запросов. Дождитесь завершения текущих операций.'));
  const job=new Promise((resolve,reject)=>{this.queue.push({task,resolve,reject,generation:this.generation});});this.pump();return job;
 }
 async pump(){
  if(this.running)return;this.running=true;
  try{while(this.queue.length){const item=this.queue.shift();let cancel;
   const stop=new Promise((_,reject)=>{cancel=()=>reject(this.cancelled());});this.cancelActive=cancel;
   try{
    this.check();if(item.generation!==this.generation)throw this.cancelled();
    const wait=this.nextAt-this.now();if(wait>0)await Promise.race([this.sleep(wait),stop]);
    this.check();if(item.generation!==this.generation)throw this.cancelled();
    this.nextAt=this.now()+this.interval;
    const result=await Promise.race([item.task(),stop]);
    if(item.generation!==this.generation)throw this.cancelled();item.resolve(result);
   }catch(e){item.reject(e);}finally{this.cancelActive=null;}
  }}finally{this.running=false;}
 }
}
module.exports={RequestGate};
