'use strict';
const LOGIN_HOSTS=new Set(['vk.ru','vk.com','id.vk.ru','id.vk.com','login.vk.ru','login.vk.com']);
function trustedLogin(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&LOGIN_HOSTS.has(u.hostname);}catch{return false;}}
// Explicit CDN list; suffix checks always require a dot boundary.
// Additional VK media hosts verified against Wave src/main/media-proxy.cjs.
const MEDIA_HOSTS=Object.freeze(['vkuseraudio.ru','vkuseraudio.net','vkuseraudio.com','userapi.com','okcdn.ru','vkuser.net','vk-cdn.net','useraudio.net','useraudio.com','mycdn.me','vk.com','vk.ru']);
function mediaURL(value){
 const fail=message=>{throw new AppError('STREAM_HOST',message);};
 if(typeof value!=='string'||value.length>16384||/[\u0000-\u0020\u007f]/.test(value))
  fail('VK выдал некорректный адрес аудио. Обновите библиотеку и повторите.');
 let u;try{u=new URL(value);}catch{fail('VK выдал некорректный адрес аудио. Обновите библиотеку и повторите.');}
 if(u.protocol!=='https:')fail('Адрес аудио VK использует неподдерживаемый протокол. Требуется HTTPS.');
 if(u.username||u.password||(u.port&&u.port!=='443'))
  fail('Адрес аудио VK содержит недопустимые параметры подключения.');
 if(!MEDIA_HOSTS.some(d=>u.hostname===d||u.hostname.endsWith('.'+d))){
  // Never expose the signed path, query, fragment, credentials or raw input.
  const host=/^[a-z0-9.-]{1,253}$/i.test(u.hostname)?u.hostname:'неизвестный';
  const label=host.length>72?host.slice(0,32)+'…'+host.slice(-32):host;
  fail('Аудиосервер пока не поддерживается: '+label+'. Сообщите только имя сервера, не полную ссылку.');
 }
 return u.href;
}
const COVER_KEY=/^(?:[tpu]:-?[1-9]\d*_[1-9]\d*|[af]:[a-f0-9]{24})$/;
function coverURL(value){try{if(typeof value!=='string'||value.length>16384||/[\u0000-\u0020\u007f]/.test(value))return null;const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(!u.port||u.port==='443')&&['userapi.com','vkuserphoto.ru','vkuserphoto.net','vkuserphoto.com','vk.com','vk.ru','vk-cdn.net'].some(d=>u.hostname===d||u.hostname.endsWith('.'+d))?u.href:null;}catch{return null;}}
function coverPhoto(p){if(!p||typeof p!=='object')return null;return coverURL(p.photo_600)||coverURL(p.photo_300)||coverURL(p.photo_270)||coverURL(p.photo_135)||coverURL(p.photo_68)||coverURL(p.url);}
class AppError extends Error{constructor(code,message){super(message);this.code=code;}}
function keyOf(a){const o=Number(a?.owner_id),i=Number(a?.id);return Number.isSafeInteger(o)&&o!==0&&Number.isSafeInteger(i)&&i>0?o+'_'+i:null;}
function text(v,max=300){return typeof v==='string'?v.replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max):'';}
function audioRow(a){const key=keyOf(a);if(!key)return null;return {key,title:text(a.title)||'Без названия',artist:text(a.artist)||'Неизвестный исполнитель',duration:Math.max(0,Math.min(86400,Number(a.duration)||0)),available:!a.is_deleted&&!a.is_blocked&&a.permissions?.play!==false&&a.permissions?.play!==0&&Number(a.duration)>0&&(!Object.hasOwn(a,'url')||!!a.url)};}
const publicError=e=>({code:e instanceof AppError?e.code:'INTERNAL',message:e instanceof AppError?e.message:'Не удалось выполнить действие. Повторите позже.'});
module.exports={trustedLogin,mediaURL,AppError,keyOf,text,audioRow,publicError,coverURL,coverPhoto,COVER_KEY};
