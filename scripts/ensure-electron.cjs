'use strict';
/* Build-time runtime repair only. Does not touch a VK/browser profile. */
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
function inspectRuntime(directory,expected){
 try{
  const installed=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8')).version;
  if(installed!==expected)return {ok:false,reason:'Electron npm package version does not match package.json'};
  const dist=path.join(directory,'dist');
  for(const name of ['electron.exe','icudtl.dat','resources/default_app.asar','LICENSE','LICENSES.chromium.html','version']){
   const file=path.join(dist,name);if(!fs.statSync(file).isFile()||fs.statSync(file).size===0)return {ok:false,reason:'Missing/empty Electron runtime file: '+name};
  }
  const version=fs.readFileSync(path.join(dist,'version'),'utf8').trim().replace(/^v/,'');
  if(version!==expected)return {ok:false,reason:'Electron binary version marker does not match'};
  if(fs.readFileSync(path.join(directory,'path.txt'),'utf8').trim()!=='electron.exe')return {ok:false,reason:'Electron path.txt is missing or incorrect'};
  const fd=fs.openSync(path.join(dist,'electron.exe'),'r');const signature=Buffer.alloc(2);
  try{fs.readSync(fd,signature,0,2,0);}finally{fs.closeSync(fd);}
  if(signature.toString('ascii')!=='MZ')return {ok:false,reason:'Electron executable is not a Windows PE file'};
  return {ok:true,dist,executable:path.join(dist,'electron.exe')};
 }catch{return {ok:false,reason:'Electron runtime directory is missing or incomplete'};}
}
function childEnvironment(env){
 const result={...env};
 const removed=new Set(['electron_skip_binary_download','electron_override_dist_path','electron_run_as_node','npm_config_ignore_scripts']);
 for(const key of Object.keys(result))if(removed.has(key.toLowerCase()))delete result[key];
 result.npm_config_platform='win32';result.npm_config_arch='x64';
 return result;
}
function ensureElectron({root=path.resolve(__dirname,'..'),platform=process.platform,arch=process.arch,env=process.env,spawn=spawnSync,log=console.log}={}){
 if(platform!=='win32'||arch!=='x64')throw Error('Build requires Windows x64 with Node.js x64.');
 const project=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const expected=project.devDependencies?.electron;
 if(typeof expected!=='string'||!/^\d+\.\d+\.\d+$/.test(expected))throw Error('Pin an exact Electron version in package.json.');
 const directory=path.join(root,'node_modules','electron');
 const installer=path.join(directory,'install.js');
 let runtime=inspectRuntime(directory,expected);const clean=childEnvironment(env);
 if(!runtime.ok){
  log('Electron runtime is not ready: '+runtime.reason);
  if(!fs.existsSync(installer))throw Error('Electron npm package is missing. Run Build-App.cmd so npm can install dependencies.');
  // Electron install.js normally checks only a version marker/path.txt. Clear the
  // broken distribution so it cannot mistake a partial extraction for success.
  fs.rmSync(path.join(directory,'dist'),{recursive:true,force:true});
  fs.rmSync(path.join(directory,'path.txt'),{force:true});
  log('Downloading/extracting the Electron binary with its official npm install.js. This may take several minutes.');
  const result=spawn(process.execPath,[installer],{cwd:root,env:clean,stdio:'inherit',timeout:15*60*1000});
  if(result.error)throw Error('Electron download could not finish: '+result.error.message);
  if(result.status!==0)throw Error('Electron binary download failed. Check network/proxy/antivirus messages above. Exit code: '+result.status);
  runtime=inspectRuntime(directory,expected);
  if(!runtime.ok)throw Error('Electron download ended but runtime is still incomplete: '+runtime.reason+'. Check antivirus quarantine and network restrictions.');
 }
 const probe=spawn(runtime.executable,['--version'],{cwd:root,env:clean,encoding:'utf8',stdio:'pipe',timeout:30000,windowsHide:true});
 if(probe.error||probe.status!==0)throw Error('Electron binary exists but cannot start. Check Windows compatibility and antivirus; no protection should be disabled.');
 if(String(probe.stdout||'').trim().replace(/^v/,'')!==expected)throw Error('Electron executable reports an unexpected version. Rebuild in a clean source folder.');
 log('Electron '+expected+' x64 is ready.');
 return {...runtime,env:clean};
}
module.exports={inspectRuntime,childEnvironment,ensureElectron};
if(require.main===module){try{ensureElectron();}catch(error){console.error(error.message);process.exitCode=1;}}
