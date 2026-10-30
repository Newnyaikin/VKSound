'use strict';

const {AppError}=require('./model.cjs');

const HOSTS=new Set(['vk.com','www.vk.com','m.vk.com','vk.ru','www.vk.ru','m.vk.ru']);
const OWNER=String.raw`(-?[1-9]\d*)`,OBJECT=String.raw`([1-9]\d*)`,ACCESS=String.raw`(?:_([a-zA-Z0-9]+))?`;
function safeId(owner,id){
 const a=Number(owner),b=Number(id);
 if(!Number.isSafeInteger(a)||a===0||!Number.isSafeInteger(b)||b<=0)throw new AppError('INPUT','Некорректный ID в ссылке VK.');
 return a+'_'+b;
}
function parseVkLink(input){
 if(typeof input!=='string'||!input.trim()||input.length>4096)throw new AppError('INPUT','Вставьте HTTPS-ссылку VK на трек, альбом, плейлист или исполнителя.');
 let url;try{url=new URL(input.trim());}catch{throw new AppError('INPUT','Некорректная ссылка VK.');}
 if(url.protocol!=='https:'||!HOSTS.has(url.hostname.toLowerCase())||url.username||url.password||url.port)throw new AppError('INPUT','Нужна HTTPS-ссылка с официального домена VK.');
 const source=url.pathname+' '+(url.searchParams.get('z')||'');
 let match=source.match(new RegExp(String.raw`(?:^|[/])audio${OWNER}_${OBJECT}${ACCESS}(?:$|[/\s?&#])`));
 if(match)return {type:'track',id:safeId(match[1],match[2]),accessKey:match[3]||''};
 match=source.match(new RegExp(String.raw`(?:^|[/])music/album/${OWNER}_${OBJECT}${ACCESS}(?:$|[/\s?&#])`));
 if(match)return {type:'album',id:safeId(match[1],match[2]),accessKey:match[3]||''};
 match=source.match(new RegExp(String.raw`(?:audio_playlist|music/playlist/|playlist/)${OWNER}_${OBJECT}${ACCESS}(?:$|[/\s?&#])`));
 if(match)return {type:'playlist',id:safeId(match[1],match[2]),accessKey:match[3]||''};
 match=url.pathname.match(/^\/artist\/([a-zA-Z0-9_-]{1,100})\/?$/);
 if(match)return {type:'artist',id:match[1]};
 throw new AppError('INPUT','В этой ссылке нет поддерживаемого трека, альбома, плейлиста или исполнителя VK.');
}

module.exports={parseVkLink};