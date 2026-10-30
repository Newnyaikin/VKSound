'use strict';
// Windows folder packaging using the official verified Electron distribution.
// The app executable receives the project icon before the NSIS installer stage.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {ensureElectron}=require('./ensure-electron.cjs');
const {trimLocales}=require('./trim-locales.cjs');
async function applyExeIcon(executable,icon){
 const {rcedit}=await import('rcedit');
 await rcedit(executable,{icon});
}
function digest(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function files(root,base=root){return fs.readdirSync(root,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{const p=path.join(root,e.name);if(e.isSymbolicLink())throw Error('Unexpected symbolic link: '+p);return e.isDirectory()?files(p,base):[{relative:path.relative(base,p),source:p}];});}
function sourceFiles(root){const out=[];for(const dir of ['app','assets'])for(const f of files(path.join(root,dir)))out.push({...f,relative:path.join(dir,f.relative)});for(const name of ['LICENSE','COPYRIGHT','THIRD-PARTY.txt'])out.push({relative:name,source:path.join(root,name)});for(const name of ['dist/hls.min.js','LICENSE'])out.push({relative:path.join('node_modules/hls.js',name),source:path.join(root,'node_modules/hls.js',name)});return out;}
function copy(src,dst){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst,fs.constants.COPYFILE_FICLONE);}
function outputReady(out,manifest){try{const marker=JSON.parse(fs.readFileSync(path.join(out,'.vksound-build.json'),'utf8'));if(marker.manifest!==manifest)return false;const m=JSON.parse(manifest);for(const f of m.project){const p=path.join(out,'resources/app',f.relative);if(digest(p)!==f.sha256)return false;}if(digest(path.join(out,'resources/app/package.json'))!==m.packageHash)return false;for(const f of m.runtime){const p=path.join(out,f.relative),stat=fs.statSync(p);if(!stat.isFile()||(f.relative==='VKSound.exe'?stat.size!==marker.exeBytes:stat.size!==f.bytes))return false;}return true;}catch{return false;}}
async function build({root=path.resolve(__dirname,'..'),ensure=ensureElectron,env=process.env,log=console.log,editIcon=applyExeIcon}={}){
 const runtime=ensure({root,env,log});
 const meta=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
 const repository=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(String(env.GITHUB_REPOSITORY||''))?String(env.GITHUB_REPOSITORY):'';const buildId=/^\d{1,30}$/.test(String(env.GITHUB_RUN_ID||''))?String(env.GITHUB_RUN_ID):'';const packageText=JSON.stringify({name:meta.name,version:meta.version,main:meta.main,author:meta.author,license:meta.license,repository,buildId,private:true},null,2)+'\n';
 const sources=sourceFiles(root),rt=files(runtime.dist).filter(f=>f.relative!==path.join('resources','default_app.asar')&&!(f.relative.startsWith('locales'+path.sep)&&!['ru.pak','en-US.pak'].includes(path.basename(f.relative))));
 // Paths and sizes also detect an incomplete previous folder without hashing Chromium.
 const manifest=JSON.stringify({format:2,electron:meta.devDependencies.electron,rcedit:meta.devDependencies.rcedit,exeIcon:digest(path.join(root,'assets','icon.ico')),packageHash:crypto.createHash('sha256').update(packageText).digest('hex'),project:sources.map(f=>({relative:f.relative,sha256:digest(f.source)})),runtime:rt.map(f=>({relative:f.relative==='electron.exe'?'VKSound.exe':f.relative,bytes:fs.statSync(f.source).size}))});
 const parent=path.join(root,'artifacts'),out=path.join(parent,'win-unpacked');
 if(outputReady(out,manifest)){log('Application files unchanged; existing win-unpacked is ready.');return {out,reused:true};}
 fs.mkdirSync(parent,{recursive:true});const stage=fs.mkdtempSync(path.join(parent,'.vksound-stage-')),backup=path.join(parent,'.vksound-previous-'+process.pid);let moved=false;
 try{
  log('Copying official Electron runtime locally (no download, no compilation)...');
  // Copy only the selected files: do not copy dozens of locales just to delete them.
  for(const f of rt)copy(f.source,path.join(stage,f.relative));
  fs.renameSync(path.join(stage,'electron.exe'),path.join(stage,'VKSound.exe'));
  await editIcon(path.join(stage,'VKSound.exe'),path.join(root,'assets','icon.ico'));
  fs.rmSync(path.join(stage,'resources/default_app.asar'),{force:true});
  const app=path.join(stage,'resources/app');fs.mkdirSync(app,{recursive:true});
  for(const f of sources)copy(f.source,path.join(app,f.relative));
  fs.writeFileSync(path.join(app,'package.json'),packageText);
  await trimLocales(stage);
  for(const name of ['LICENSE','COPYRIGHT','THIRD-PARTY.txt'])copy(path.join(root,name),path.join(stage,name==='LICENSE'?'VKSOUND-LICENSE.txt':name));
  copy(path.join(root,'node_modules/hls.js/LICENSE'),path.join(stage,'HLS-LICENSE.txt'));
  fs.writeFileSync(path.join(stage,'.vksound-build.json'),JSON.stringify({manifest,exeBytes:fs.statSync(path.join(stage,'VKSound.exe')).size}));
  if(!outputReady(stage,manifest))throw Error('Packaged folder did not pass integrity checks.');
  if(fs.existsSync(out)){fs.renameSync(out,backup);moved=true;}
  try{fs.renameSync(stage,out);}catch(e){if(moved){fs.renameSync(backup,out);moved=false;}throw e;}
  if(moved){try{fs.rmSync(backup,{recursive:true,force:true});}catch{log('Old build retained at '+backup);}}
  log('Ready: '+out);return {out,reused:false};
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
module.exports={build,outputReady,sourceFiles};
if(require.main===module)build().catch(error=>{console.error(error.message);process.exitCode=1;});
