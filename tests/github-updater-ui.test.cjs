'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const read=name=>fs.readFile(name,'utf8');

test('settings exposes a GitHub updater through the restricted IPC bridge',async()=>{
 const [html,renderer,main,preload]=await Promise.all(['app/index.html','app/renderer.js','app/main.cjs','app/preload.cjs'].map(read));
 assert.match(html,/id="updateApp"/);
 assert.match(html,/id="updateStatus"/);
 assert.match(renderer,/call\('checkUpdate'\)/);
 assert.match(renderer,/call\('downloadUpdate'\)/);
 assert.match(renderer,/call\('installUpdate'\)/);
 assert.match(main,/bind\('checkUpdate'/);
 assert.match(main,/bind\('downloadUpdate'/);
 assert.match(main,/bind\('installUpdate'/);
 for(const name of ['checkUpdate','downloadUpdate','installUpdate'])assert.match(preload,new RegExp("'"+name+"'"));
});

test('GitHub release publishes the checksum and build ID needed by the updater',async()=>{
 const workflow=await read('.github/workflows/build-windows.yml');
 assert.match(workflow,/sha256sum VKSound-Setup-latest\.exe/);
 assert.match(workflow,/VKSound-Setup-latest\.exe\.sha256/);
 assert.match(workflow,/VKSound build run: %s/);
 assert.match(workflow,/GITHUB_RUN_ID/);
 assert.match(workflow,/body_path: release-assets\/release-notes\.md/);
});