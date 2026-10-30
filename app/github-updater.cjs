'use strict';

const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {Readable,Transform}=require('node:stream');
const {pipeline}=require('node:stream/promises');
const {createWriteStream}=require('node:fs');
const {AppError}=require('./model.cjs');

const INSTALLER='VKSound-Setup-latest.exe';
const CHECKSUM=INSTALLER+'.sha256';
const MAX_INSTALLER_BYTES=250*1024*1024;
const API='https://api.github.com';
const CDN_HOSTS=new Set(['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com','objects-origin.githubusercontent.com']);
const runIdFrom=body=>String(body||'').match(/VKSound build run:\s*(\d{1,30})/i)?.[1]||'';
const versionFrom=body=>String(body||'').match(/VKSound version:\s*(\d+\.\d+\.\d+)/i)?.[1]||'';
function compareVersion(a,b){
 const parse=v=>/^\d+\.\d+\.\d+$/.test(String(v||''))?String(v).split('.').map(Number):null;
 const x=parse(a),y=parse(b);if(!x||!y)return 0;
 for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i]?1:-1;
 return 0;
}
async function readSmallText(response,max){
 const length=Number(response.headers?.get?.('content-length'));
 if(Number.isFinite(length)&&length>max)throw new AppError('UPDATE','Контрольная сумма установщика слишком велика.');
 const reader=response.body?.getReader();if(!reader)throw new AppError('UPDATE','GitHub не передал контрольную сумму установщика.');
 const chunks=[];let bytes=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>max){await reader.cancel();throw new AppError('UPDATE','Контрольная сумма установщика слишком велика.');}chunks.push(Buffer.from(value));}
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 return Buffer.concat(chunks).toString('utf8');
}

class GitHubUpdater{
 constructor({repository='',buildId='',currentVersion='0.0.0',tempDir=process.env.TEMP||'/tmp',fetchImpl=globalThis.fetch}={}){
  this.repository=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)?repository:'';
  this.buildId=/^\d{1,30}$/.test(String(buildId))?String(buildId):'';
  this.currentVersion=String(currentVersion);
  this.tempDir=tempDir;
  this.fetch=fetchImpl;
 }
 supported(){return !!this.repository&&typeof this.fetch==='function';}
 apiUrl(){return API+'/repos/'+this.repository+'/releases/tags/latest';}
 async request(url,{binary=false,timeout=15000}={}){
  let response;
  try{
   response=await this.fetch(url,{headers:binary?{'User-Agent':'VKSound-Updater'}:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'VKSound-Updater'},signal:AbortSignal.timeout(timeout)});
  }catch{throw new AppError('UPDATE','Не удалось подключиться к GitHub. Проверьте интернет и повторите попытку.');}
  if(!response?.ok)throw new AppError('UPDATE',response?.status===404?'В GitHub пока нет опубликованного обновления.':'GitHub не смог проверить обновление. Повторите позже.');
  return response;
 }
 async getRelease(){
  const response=await this.request(this.apiUrl());
  let release;
  try{release=await response.json();}catch{throw new AppError('UPDATE','GitHub вернул некорректные данные релиза.');}
  if(release?.tag_name!=='latest'||release.draft||release.prerelease||!Array.isArray(release.assets))throw new AppError('UPDATE','В GitHub не найден опубликованный стабильный релиз VKSound.');
  const installer=release.assets.find(a=>a?.name===INSTALLER),checksum=release.assets.find(a=>a?.name===CHECKSUM);
  if(!installer||!checksum)throw new AppError('UPDATE','В релизе GitHub нет установщика или контрольной суммы.');
  return {release,installer,checksum,remoteBuildId:runIdFrom(release.body),latestVersion:versionFrom(release.body)};
 }
 isAvailable(remoteBuildId,latestVersion){
  if(remoteBuildId&&this.buildId)return BigInt(remoteBuildId)>BigInt(this.buildId);
  if(remoteBuildId)return true;
  return compareVersion(latestVersion,this.currentVersion)>0;
 }
 async check(){
  if(!this.supported())return {supported:false,available:false,currentVersion:this.currentVersion,message:'Для этой сборки не настроен GitHub-репозиторий обновлений.'};
  const {release,remoteBuildId,latestVersion}=await this.getRelease();
  const available=this.isAvailable(remoteBuildId,latestVersion);
  return {supported:true,available,currentVersion:this.currentVersion,latestVersion:latestVersion||this.currentVersion,buildId:remoteBuildId,message:available?'':'У вас установлена актуальная версия.'};
 }
 async download(){
  if(!this.supported())throw new AppError('UPDATE','Для этой сборки не настроен GitHub-репозиторий обновлений.');
  const info=await this.getRelease();
  if(!this.isAvailable(info.remoteBuildId,info.latestVersion))throw new AppError('UPDATE','Обновление не найдено: установлена актуальная версия.');
  const expectedUrl=(asset,name)=>{
   let url;
   try{url=new URL(asset.browser_download_url||'');}catch{throw new AppError('UPDATE','Ссылка на файл обновления не прошла проверку.');}
   const expectedPath='/'+this.repository+'/releases/download/latest/'+name;
   if(url.protocol!=='https:'||url.hostname!=='github.com'||url.username||url.password||url.pathname!==expectedPath||url.hash)throw new AppError('UPDATE','Ссылка на файл обновления не прошла проверку.');
   return url.href;
  };
  const installerUrl=expectedUrl(info.installer,INSTALLER),checksumUrl=expectedUrl(info.checksum,CHECKSUM);
  if(!Number.isSafeInteger(info.checksum.size)||info.checksum.size<1||info.checksum.size>512)throw new AppError('UPDATE','Размер контрольной суммы GitHub не прошёл проверку.');
  if(!Number.isSafeInteger(info.installer.size)||info.installer.size<1||info.installer.size>MAX_INSTALLER_BYTES)throw new AppError('UPDATE','Размер установщика GitHub не прошёл проверку.');
  const checksumResponse=await this.request(checksumUrl,{binary:true,timeout:30000});
  let checksumText='';
  try{checksumText=await readSmallText(checksumResponse,512);}catch(error){if(error instanceof AppError)throw error;throw new AppError('UPDATE','Не удалось получить контрольную сумму установщика.');}
  if(checksumText.length>512)throw new AppError('UPDATE','Некорректная контрольная сумма установщика.');
  const expectedHash=checksumText.trim().match(/^([a-f0-9]{64})(?:\s+\*?VKSound-Setup-latest\.exe)?$/i)?.[1]?.toLowerCase();
  if(!expectedHash)throw new AppError('UPDATE','Контрольная сумма установщика GitHub имеет неверный формат.');
  const response=await this.request(installerUrl,{binary:true,timeout:120000});
  if(response.url){
   let final;
   try{final=new URL(response.url);}catch{throw new AppError('UPDATE','Источник загрузки установщика не прошёл проверку.');}
   if(final.protocol!=='https:'||!CDN_HOSTS.has(final.hostname))throw new AppError('UPDATE','Источник загрузки установщика не прошёл проверку.');
  }
  if(!response.body)throw new AppError('UPDATE','GitHub не передал файл установщика.');
  const directory=path.join(this.tempDir,'VKSound-updates');
  await fs.mkdir(directory,{recursive:true});
  const nonce=crypto.randomBytes(12).toString('hex');
  const partial=path.join(directory,'VKSound-'+nonce+'.part');
  const target=path.join(directory,'VKSound-'+nonce+'.exe');
  const hash=crypto.createHash('sha256');let bytes=0;
  const meter=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>MAX_INSTALLER_BYTES){callback(new Error('Installer exceeds size limit'));return;}hash.update(chunk);callback(null,chunk);}});
  try{
   await pipeline(Readable.fromWeb(response.body),meter,createWriteStream(partial,{flags:'wx'}));
   if(bytes!==info.installer.size)throw new AppError('UPDATE','Размер загруженного установщика не совпал с релизом.');
   if(hash.digest('hex')!==expectedHash)throw new AppError('UPDATE','Контрольная сумма не совпала. Установщик не будет запущен.');
   await fs.rename(partial,target);
  }catch(error){
   await fs.rm(partial,{force:true}).catch(()=>{});
   await fs.rm(target,{force:true}).catch(()=>{});
   if(error instanceof AppError)throw error;
   throw new AppError('UPDATE','Не удалось загрузить установщик с GitHub. Проверьте подключение и повторите попытку.');
  }
  return {path:target,currentVersion:this.currentVersion,latestVersion:info.latestVersion||this.currentVersion,buildId:info.remoteBuildId};
 }
}

module.exports={GitHubUpdater,compareVersion,runIdFrom,versionFrom,INSTALLER,CHECKSUM};