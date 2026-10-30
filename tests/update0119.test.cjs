'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const read=path=>fs.readFile(path,'utf8');

test('All non-album VK playlists and local playlists appear on the playlists page',async()=>{
 const e=await read('app/experience.js');
 assert.match(e,/filter\(p=>p\.kind!=='album'\)\.map\(p=>\[p,'remote'\]\)/);
 assert.match(e,/db\.playlists\.map\(p=>\[p,'local'\]\)/);
 assert.doesNotMatch(e,/filter\(p=>p\.kind!=='album'&&p\.editable\)/);
 assert.match(e,/route==='home'\|\|\(route==='search'/);
});

test('The “Собрано алгоритмами” bucket is omitted from every recommendation surface',async()=>{
 const e=await read('app/experience.js');
 assert.match(e,/isAlgorithmicBucket=.*startsWith\('собрано алгоритмами'\)/);
 assert.ok((e.match(/filter\([^)]*isAlgorithmicBucket/g)||[]).length>=4);
 assert.doesNotMatch(e,/if\(route==='playlists'\)renderEditorial\(\)/);
});

test('The main scroll anchor disappears while the current-track dialog is open',async()=>{
 const c=await read('app/update0118.css');
 assert.match(c,/body:has\(#fullPlayer\[open\]\) #mainScrollToTop\{display:none!important\}/);
});

test('The sticky player fits the viewport without horizontal scrolling',async()=>{
 const c=await read('app/update0118.css');
 assert.match(c,/\.full-sticky\{overflow:hidden!important;overflow-x:hidden!important/);
 assert.match(c,/min-width:0!important/);
 assert.match(c,/grid-template-columns:minmax\(0/);
});

test('Home settings use the requested defaults and one combined playlist option',async()=>{
 const r=await read('app/renderer.js'),s=await read('app/store.cjs'),e=await read('app/experience.js');
 assert.match(r,/const HOME_SECTION_OPTIONS=\[\['mix','VK Микс'\],\['recent','Недавно слушали'\],\['library','Мои треки'\],\['myPlaylists','Мои плейлисты'\],\['recommendationTracks'/);
 assert.match(r,/DEFAULT_HOME_SECTIONS=HOME_SECTION_IDS\.filter\(id=>id!=='algorithmic'\)/);
 assert.match(s,/const DEFAULT_HOME_SECTIONS=HOME_SECTIONS\.filter\(id=>id!=='algorithmic'\)/);
 assert.match(e,/homeSectionOrder\(\)\.includes\('myPlaylists'\)/);
 assert.match(e,/map\(p=>\(\{p,source:'remote'\}\)\).*map\(p=>\(\{p,source:'local'\}\)\)/);
});

test('Full-screen volume is inline and the close affordance points down',async()=>{
 const c=await read('app/update0118.css'),h=await read('app/index.html');
 assert.match(c,/\.full-volume-control\{[\s\S]*?border:0/);
 assert.match(c,/\.full-volume-control input\{[\s\S]*?height:4px/);
 assert.match(h,/id="fullClose"[^>]*aria-label="Скрыть экран трека"[^>]*>[\s\S]*?href="#i-collapse"/);
});

test('The full-player collapse affordance is centered and spans half the window',async()=>{
 const c=await read('app/update0119.css'),h=await read('app/index.html');
 assert.match(c,/#fullPlayer #fullClose\{[\s\S]*?left:50%;top:50%;transform:translate\(-50%,-50%\)/);
 assert.match(c,/width:50%/);
 assert.match(c,/#fullPlayer #fullClose \.icon\{width:46px;height:30px;stroke-width:2\.8\}/);
 assert.match(h,/#i-collapse/);
});

test('Taskbar and tray icons use transparent artwork and Windows ICO assets',async()=>{
 const m=await read('app/main.cjs'),svg=await read('assets/icon.svg'),tray=await read('app/tray-icon.cjs');
 assert.match(m,/process\.platform==='win32'\?'icon\.ico':'icon\.png'/);
 assert.match(tray,/platform==='win32'\?'tray\.ico':'tray\.png'/);
 assert.match(svg,/#13A9A3/);
 assert.match(tray,/tray\.ico/);
});

test('Window restoration preserves the reusable Mix panel and avoids redundant rerender',async()=>{
 const e=await read('app/experience.js');
 assert.match(e,/homeSections\?\.contains\(mixPanel\)&&mixAnchor\)mixAnchor\.append\(mixPanel\)/);
 assert.match(e,/try\{renderExperience\(\);\}catch\(error\)/);
 assert.doesNotMatch(e,/try\{render\(\);renderExperience\(\);\}/);
});
