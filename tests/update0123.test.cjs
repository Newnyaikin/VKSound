'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const read=path=>fs.readFile(path,'utf8');

test('sparse waveform samples keep a continuous placeholder waveform instead of isolated dots',()=>{
 const {bars}=require('../app/seekbar.js');
 const makeClassList=()=>{const values=new Set();return{toggle:(name,on)=>on?values.add(name):values.delete(name),contains:name=>values.has(name)};};
 const host={clientWidth:300,dataset:{},children:[],ownerDocument:{createElement:()=>({dataset:{},style:{},classList:makeClassList()})},replaceChildren(){this.children=[];},append(bar){this.children.push(bar);},querySelectorAll(){return this.children;}};
 const wrap={style:{setProperty(){},getPropertyValue(){return'0%';}},querySelector(){return host;}};host.parentElement=wrap;
 const peaks=Array(100).fill(null);peaks[12]=.2;peaks[68]=.55;bars(host,peaks);
 assert.equal(host.dataset.actual,'true');assert.equal(host.children.filter(bar=>bar.classList.contains('placeholder')).length,98);
 assert.ok(host.children.filter(bar=>bar.classList.contains('placeholder')).every(bar=>parseFloat(bar.style.height)>2));
});

test('seekbar shows a placeholder before peaks and reacts to live playback',async()=>{
 const [seek,css,features,wave]=await Promise.all(['app/seekbar.js','app/seekbar.css','app/features.js','app/waveform-player.js'].map(read));
 assert.match(seek,/function addPlaceholderBars\(host,\s*count\)/);
 assert.match(seek,/host\.dataset\.placeholder\s*=\s*"true"/);
 assert.match(css,/:hover[^{}]*\.seek-wave\[data-placeholder=true\]/);
 assert.match(features,/\$\(\'seekWrap\'\)\.onpointerenter=prepareWave/);
 assert.match(wave,/VKSoundSeek\.live\(/);
});

test('current-track gestures are guarded and queue cover follows the active list',async()=>{
 const [experience,renderer,player]=await Promise.all(['app/experience.js','app/renderer.js','app/player-view.js'].map(read));
 assert.match(experience,/wheelPull>=190/);
 assert.doesNotMatch(experience,/Чтобы закрыть окно прокруткой/);
 assert.doesNotMatch(experience,/is-pull-closing|is-pull-opening|closeDrag|distance>=120&&side<90|distance>=52&&side<90/);
 assert.doesNotMatch(experience,/footer\.addEventListener\('pointerdown'/);
 assert.match(experience,/footer\.addEventListener\('click'/);
 assert.match(renderer,/queueArtworkKey=coverOverride\|\|/);
 assert.match(renderer,/function updateQueueArtwork\(\)/);
 assert.match(renderer,/equalizerButton'\)\.onclick/);
 assert.match(renderer,/queueMicrotask\(\(\)=>drainRemoteListEdits\(\)\)/);assert.doesNotMatch(renderer,/setTimeout\(.*550\)/);assert.match(renderer,/op:'replace'/);assert.match(renderer,/route==='queue'\)return reorder\(state\.key,null,\{from:state\.index,target:Number\(row\.dataset\.queueIndex\),after\}\)/);
 assert.match(player,/fullCoverBackdrop/);
});

test('VK sync relies on the shared request gate instead of duplicate fixed waits',async()=>{
 const [sync,writes,client,safety]=await Promise.all(['app/sync.cjs','app/vk-writes.cjs','app/vk-client.cjs','tests/request-safety.test.cjs'].map(read));
 assert.match(sync,/delay=0/);assert.match(writes,/delay=0/);
 assert.match(client,/requestInterval=1100/);assert.match(safety,/spacing|interval|1100/);
});