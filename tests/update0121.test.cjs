'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const read=path=>fs.readFile(path,'utf8');

test('share controls use icon-only links for tracks, albums and artists',async()=>{
 const [html,renderer,experience,features,enhancements,css]=await Promise.all(['app/index.html','app/renderer.js','app/experience.js','app/features.js','app/enhancements.js','app/update0121.css'].map(read));
 assert.match(html,/<symbol id="i-link"/);assert.match(html,/href="update0121.css"/);
 assert.match(renderer,/Скопировать ссылку на трек/);assert.match(experience,/copyObjectLink\('album',p\.id\)/);assert.match(experience,/detail-share copy-link-button/);assert.match(features,/Скопировать ссылку на альбом/);assert.match(enhancements,/Скопировать ссылку на исполнителя/);assert.match(css,/copy-link-button\{color:color-mix/);
});

test('pasted album URLs retain album identity and route directly to details',async()=>{
 const [main,renderer]=await Promise.all(['app/main.cjs','app/renderer.js'].map(read));
 assert.match(main,/parsed\.type==='album'\|\|meta\.kind==='album'\?'album':'playlist'/);
 assert.match(renderer,/resolved\.type==='album'\)\{return await openArtistAlbum\(resolved\.id\);\}/);
});

test('glass mini-player ignores cover palette and opens the app on a non-control double click',async()=>{
 const mini=await read('app/mini.js');
 assert.match(mini,/s\.theme==='glass'\?\[\]:s\.colors\|\|\[\]/);
 assert.match(mini,/addEventListener\('dblclick'/);assert.match(mini,/e\.target\.closest\('button,input,select,textarea,a,label,\[role=\"button\"\]'\)/);
});

test('full player artwork is softer than the previous 7px backdrop',async()=>{
 const css=await read('app/update0121.css');assert.match(css,/#fullCoverBackdrop \.cover-art\{filter:blur\(14px\)/);assert.match(css,/#fullCoverBackdrop\{opacity:\.22\}/);
});
