'use strict';
// Local gating only. Cookie values never leave the Electron main process.
function sessionReady(url,cookies){try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||!['vk.ru','vk.com','www.vk.ru','www.vk.com'].includes(u.hostname)||u.port&&u.port!=='443')return false;if(/^\/(?:login|join|restore|auth|oauth)(?:[/.]|$)/i.test(u.pathname))return false;return Array.isArray(cookies)&&cookies.some(c=>/^remix(?:sid|sid6|tsid)$/.test(c?.name||'')&&typeof c.value==='string'&&c.value.length>0&&c.value!=='DELETED'&&/^(?:\.)?vk\.(?:ru|com)$/.test(c.domain||''));}catch{return false;}}
class LoginProbe{
 constructor({now=Date.now,interval=30000,maxAttempts=3}={}){this.now=now;this.interval=interval;this.maxAttempts=maxAttempts;this.nextAt=0;this.begin();}
 begin(){this.attempts=0;this.paused=false;}
 reserve(url,cookies){if(this.paused||this.attempts>=this.maxAttempts||this.now()<this.nextAt||!sessionReady(url,cookies))return false;this.attempts++;this.nextAt=this.now()+this.interval;return true;}
 stop(){this.paused=true;}
 get exhausted(){return this.paused||this.attempts>=this.maxAttempts;}
}
module.exports={LoginProbe,sessionReady};
