'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const read=path=>fs.readFile(path,'utf8');

test('Sidebar scrollbar reaches the outer sidebar edge',async()=>{
 const css=await read('app/update0120.css');
 assert.match(css,/\.sidebar>#sidebarScroll\{margin-right:calc\(-1 \* var\(--sidebar-scrollbar-inset\)\);padding-right:var\(--sidebar-scrollbar-inset\)\}/);
});

test('Full-player close button avoids the press-scale animation',async()=>{
 const css=await read('app/update0120.css');
 assert.match(css,/#fullPlayer #fullClose\{scale:1;transition:background-color/);
 assert.match(css,/#fullPlayer #fullClose:active:not\(:disabled\)\{scale:1\}/);
});

test('Player hit guards exclude only the controls themselves',async()=>{
 const js=await read('app/experience.js');
 assert.match(js,/node\.matches\('button,input,select,textarea,a,\[role="button"\]'\)/);
 assert.match(js,/x>=r\.left-1&&x<=r\.right\+1&&y>=r\.top-1&&y<=r\.bottom\+1/);
 assert.doesNotMatch(js,/\.transport-buttons,\.progress,\.player-right/);
});

test('Full-track backdrop matches the standard player blur and opacity',async()=>{
 const css=await read('app/update0120.css'),standard=await read('app/cover-backdrop.css');
 assert.match(css,/#fullCoverBackdrop\{[\s\S]*?opacity:\.26/);
 assert.match(css,/#fullCoverBackdrop \.cover-art\{filter:blur\(7px\) saturate\(\.8\);transform:scale\(1\.08\)\}/);
 assert.match(standard,/#playerCoverBackdrop \.cover-art\{filter:blur\(7px\) saturate\(\.8\);transform:scale\(1\.08\)\}/);
});

test('Logo waveform is symmetric and in-app marks use the current cover palette',async()=>{
 const svg=await read('assets/icon.svg'),html=await read('app/index.html'),css=await read('app/update0120.css'),mini=await read('app/mini.html'),miniCss=await read('app/mini-surface.css');
 const bars=[...svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="18" height="(\d+)" rx="9"\/>/g)].map(m=>({x:+m[1],y:+m[2],h:+m[3]}));
 assert.equal(bars.length,5);
 assert.deepEqual(bars.map(x=>x.h),[30,62,118,62,30]);
 assert.deepEqual(bars.map(x=>x.y+x.h/2),[128,128,128,128,128]);
 assert.equal(bars[0].x+bars[4].x,bars[1].x+bars[3].x);
 assert.match(html,/class="app-logo"/);
 assert.match(css,/var\(--cover-a,#13A9A3\)/);
 assert.match(css,/var\(--cover-b,#286FD5\)/);
 assert.match(mini,/class="app-logo"/);
 assert.match(miniCss,/\.brand \.logo-gradient-a\{stop-color:color-mix/);
});