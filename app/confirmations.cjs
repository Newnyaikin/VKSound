'use strict';
const {randomBytes}=require('node:crypto');
class Confirmations{
 constructor(send,{timeout=90000,set=setTimeout,clear=clearTimeout}={}){this.send=send;this.timeout=timeout;this.set=set;this.clear=clear;this.pending=new Map();}
 ask(options){if(this.pending.size)return Promise.resolve({response:0});const id=randomBytes(16).toString('hex');return new Promise(resolve=>{const finish=value=>{const p=this.pending.get(id);if(!p)return;this.clear(p.timer);this.pending.delete(id);resolve({response:value?1:0});};const timer=this.set(()=>finish(false),this.timeout);this.pending.set(id,{finish,timer});try{this.send({id,title:options.title||'Подтверждение',message:options.message||'',detail:options.detail||'',confirm:options.buttons?.[1]||'Подтвердить'});}catch{finish(false);}});}
 reply(id,accepted){if(typeof id!=='string'||typeof accepted!=='boolean')return false;const p=this.pending.get(id);if(!p)return false;p.finish(accepted);return true;}
 cancel(){for(const p of [...this.pending.values()])p.finish(false);}
}
module.exports={Confirmations};
