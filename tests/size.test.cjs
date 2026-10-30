'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {trimLocales}=require('../scripts/trim-locales.cjs');
async function fixture(t){const d=await fs.mkdtemp(path.join(os.tmpdir(),'volna-size-'));t.after(()=>fs.rm(d,{recursive:true,force:true}));await fs.mkdir(path.join(d,'locales'));return d;}
test('size optimization removes only unused regular locale packs',async t=>{
 const d=await fixture(t),loc=path.join(d,'locales');
 for(const n of ['ru.pak','en-US.pak','de.pak','fr.pak','LICENSE.txt'])await fs.writeFile(path.join(loc,n),'123');
 await fs.writeFile(path.join(d,'ffmpeg.dll'),'codec');
 await fs.mkdir(path.join(loc,'folder.pak'));
 assert.deepEqual(await trimLocales(d),{removed:2,bytes:6});
 assert.deepEqual((await fs.readdir(loc)).sort(),['LICENSE.txt','en-US.pak','folder.pak','ru.pak']);
 assert.equal(await fs.readFile(path.join(d,'ffmpeg.dll'),'utf8'),'codec');
 assert.deepEqual(await trimLocales(d),{removed:0,bytes:0});
});
test('unexpected layout is left intact',async t=>{const d=await fixture(t);await fs.writeFile(path.join(d,'locales','de.pak'),'x');await assert.rejects(trimLocales(d),/no files removed/);assert.equal(await fs.readFile(path.join(d,'locales','de.pak'),'utf8'),'x');});
test('absent locales directory is a no-op',async t=>{const d=await fixture(t);await fs.rmdir(path.join(d,'locales'));assert.deepEqual(await trimLocales(d),{removed:0,bytes:0});});
test('lightweight packager retains locale pruning without heavy builder',()=>{const c=require('../package.json');assert.equal(c.devDependencies['electron-builder'],undefined);assert.equal(c.scripts['build:app'],'node scripts/build-app.cjs');});
