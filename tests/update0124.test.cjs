'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const read=path=>fs.readFile(path,'utf8');

test('current-track close gesture gives feedback without moving scroll content',async()=>{
 const [experience,css]=await Promise.all(['app/experience.js','app/update0124.css'].map(read));
 assert.match(experience,/wheelPull>=190/);
 assert.match(experience,/const showWheelFeedback=distance=>\{[^}]*setProperty\('--wheel-close-ratio'/);
 assert.doesNotMatch(experience,/setProperty\('--wheel-close-offset',Math\.min\(28/);
 assert.match(css,/#fullPlayer\.is-wheel-closing #fullClose \.icon/);
 assert.match(css,/full-player-header::after/);
});

test('VK My Music edits are optimistic and do not wait for a debounce',async()=>{
 const [renderer,player,experience]=await Promise.all(['app/renderer.js','app/player-view.js','app/experience.js'].map(read));
 const queue=renderer.slice(renderer.indexOf('function queueHeartWrite'),renderer.indexOf('function selectTrack'));
 assert.match(queue,/reapplyPendingHeartEdits\(\);reapplyPendingRemoteListEdits\(\);render\(\);drainHeartWrites\(\)/);
 assert.doesNotMatch(queue,/remoteBusy\|\|bulkBusy\|\|syncBusy/);
 assert.match(renderer,/function flushPendingHeartEdits\(\)/);
 assert.match(renderer,/await flushPendingHeartEdits\(\)/);
 assert.doesNotMatch(renderer,/heart\.disabled=.*remoteBusy.*syncBusy/);
 assert.doesNotMatch(renderer,/nowFavorite'\)\.disabled=.*remoteBusy.*syncBusy/);
 assert.doesNotMatch(player,/fullFavorite'\)\.disabled=.*remoteBusy.*syncBusy/);
 assert.match(experience,/heart\.disabled=status\.state!=='ready'/);
});

test('placeholder progress keeps the played waveform in the accent color',async()=>{
 const css=await read('app/seekbar.css');
 assert.match(css,/\.seek-wave i\.placeholder\.played\{opacity:1;background:var\(--accent\)\}/);
});
