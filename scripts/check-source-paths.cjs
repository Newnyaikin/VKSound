'use strict';
const fs=require('node:fs'),path=require('node:path');
function validName(name){return !!name&&!/[<>:"/\\|?*\x00-\x1f]/.test(name)&&!/[. ]$/.test(name)&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);}
function check(root){const errors=[],skip=new Set(['node_modules','.tools','.git','artifacts']);let count=0;function walk(dir){const seen=new Set();for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(e.name))continue;const rel=path.relative(root,path.join(dir,e.name));if(!validName(e.name))errors.push(rel);const folded=e.name.toLowerCase();if(seen.has(folded))errors.push(rel+' (case collision)');seen.add(folded);if(e.isDirectory())walk(path.join(dir,e.name));else if(e.isFile())count++;else errors.push(rel+' (unsupported entry)');}}walk(root);return {errors,count};}
if(require.main===module){const result=check(path.resolve(__dirname,'..'));if(result.errors.length){console.error('Windows-incompatible source paths:\n'+result.errors.join('\n'));process.exitCode=1;}else console.log('Windows source paths OK: '+result.count+' files.');}
module.exports={validName,check};
