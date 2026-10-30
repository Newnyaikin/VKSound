'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const html=fs.readFileSync('app/index.html','utf8'),js=fs.readFileSync('app/renderer.js','utf8'),css=fs.readFileSync('app/style.css','utf8');
test('recommendations section and catalog reads are removed from UI',()=>{assert.ok(!html.includes('id="recommendationsPage"'));assert.ok(!js.includes("['recommendations','list'"));assert.ok(!js.includes("call('recommendations'"));});
test('mix has stable play control and no redundant track-list or refresh buttons',()=>{for(const id of ['mixPanel','mixLaunch','mixLaunchLabel','mixBannerStatus','mixClear'])assert.ok(html.includes('id="'+id+'"'));for(const id of ['mixOpen','mixRefresh'])assert.ok(!html.includes('id="'+id+'"'));});
test('legacy recommendation route redirects to the new home',()=>{assert.ok(js.includes("if(next==='recommendations')next='home'"));});
