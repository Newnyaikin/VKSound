'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {GitHubUpdater,compareVersion,runIdFrom,versionFrom}=require('../app/github-updater.cjs');

const repo='owner/vksound';
const installerName='VKSound-Setup-latest.exe';
const checksumName=installerName+'.sha256';
const asset=(name,size)=>({name,size,browser_download_url:`https://github.com/${repo}/releases/download/latest/${name}`});
function release(runId='200',body=`VKSound build run: ${runId}`,installerSize=8){
 return {tag_name:'latest',draft:false,prerelease:false,body,assets:[asset(installerName,installerSize),asset(checksumName,85)]};
}
function response(body,status=200,url=''){
 return new Response(body,{status,headers:{'content-type':'application/octet-stream'}});
}

test('release metadata and semantic versions are parsed safely',()=>{
 assert.equal(runIdFrom('Latest build\nVKSound build run: 12345'),'12345');
 assert.equal(versionFrom('VKSound version: 1.2.3'),'1.2.3');
 assert.equal(compareVersion('1.10.0','1.9.9'),1);
 assert.equal(compareVersion('1.0.0','1.0.0'),0);
 assert.equal(compareVersion('bad','1.0.0'),0);
});

test('update check compares the latest GitHub workflow run with the installed build',async()=>{
 const current=new GitHubUpdater({repository:repo,buildId:'100',currentVersion:'1.0.0',fetchImpl:async()=>response(JSON.stringify(release('200')))});
 assert.equal((await current.check()).available,true);
 const latest=new GitHubUpdater({repository:repo,buildId:'200',currentVersion:'1.0.0',fetchImpl:async()=>response(JSON.stringify(release('200')))});
 assert.equal((await latest.check()).available,false);
 const unconfigured=new GitHubUpdater({currentVersion:'1.0.0'});
 assert.equal((await unconfigured.check()).supported,false);
});

test('update download verifies GitHub checksum before exposing the installer',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vksound-update-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const bytes=Buffer.from('signed installer fixture');
 const digest=crypto.createHash('sha256').update(bytes).digest('hex');
 const data=release('200',`VKSound build run: 200`,bytes.length);
 data.assets[1].size=Buffer.byteLength(`${digest}  ${installerName}\n`);
 const fetchImpl=async url=>{
  if(url.endsWith('/releases/tags/latest'))return response(JSON.stringify(data));
  if(url.endsWith(checksumName))return response(`${digest}  ${installerName}\n`);
  if(url.endsWith(installerName))return response(bytes);
  return response('',404);
 };
 const updater=new GitHubUpdater({repository:repo,buildId:'100',currentVersion:'1.0.0',tempDir:directory,fetchImpl});
 const result=await updater.download();
 assert.equal(result.latestVersion,'1.0.0');
 assert.deepEqual(await fs.readFile(result.path),bytes);
});

test('a checksum mismatch prevents any installer from being left behind',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vksound-update-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const bytes=Buffer.from('installer');
 const data=release('200','VKSound build run: 200',bytes.length);
 const digest=crypto.createHash('sha256').update('different bytes').digest('hex');
 data.assets[1].size=Buffer.byteLength(`${digest}  ${installerName}\n`);
 const fetchImpl=async url=>url.endsWith('/releases/tags/latest')?response(JSON.stringify(data)):url.endsWith(checksumName)?response(`${digest}  ${installerName}\n`):response(bytes);
 const updater=new GitHubUpdater({repository:repo,buildId:'100',currentVersion:'1.0.0',tempDir:directory,fetchImpl});
 await assert.rejects(updater.download(),{code:'UPDATE'});
 const files=await fs.readdir(path.join(directory,'VKSound-updates')).catch(()=>[]);
 assert.deepEqual(files,[]);
});

test('release assets outside the configured GitHub repository are rejected',async()=>{
 const data=release('200','VKSound build run: 200',8);
 data.assets[0].browser_download_url='https://example.com/installer.exe';
 const updater=new GitHubUpdater({repository:repo,buildId:'100',currentVersion:'1.0.0',fetchImpl:async()=>response(JSON.stringify(data))});
 await assert.rejects(updater.download(),{code:'UPDATE'});
});