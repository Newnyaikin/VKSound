'use strict';
// Read local files only. No registry requests and no execution of dependency code.
const fs=require('node:fs'),path=require('node:path');
function dependenciesReady(root=path.resolve(__dirname,'..')){
 try{
  const project=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  for(const [name,expected] of Object.entries({...project.dependencies,...project.devDependencies})){
   if(!/^\d+\.\d+\.\d+$/.test(expected))return false;
   const dir=path.join(root,'node_modules',name),installed=JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
   if(installed.version!==expected)return false;
  }
  if(!fs.statSync(path.join(root,'node_modules/hls.js/dist/hls.min.js')).size)return false;
  const electron=path.join(root,'node_modules/electron');
  if(!fs.statSync(path.join(electron,'install.js')).size)return false;
  for(const name of ['@electron/get','extract-zip'])require.resolve(name,{paths:[electron]});
  return true;
 }catch{return false;}
}
module.exports={dependenciesReady};
if(require.main===module){const ready=dependenciesReady();console.log(ready?'Local dependencies ready; npm install skipped.':'Dependencies missing or changed.');process.exitCode=ready?0:1;}
