'use strict';const test=require('node:test'),assert=require('node:assert/strict');const {MediaBridge}=require('../app/media.cjs');
const request=(url,headers={})=>new Request(url,{headers});
test('capability URL hides the signed source',()=>{const b=new MediaBridge(()=>{});const u=b.create('https://x.useraudio.net/a?secret','audio');assert.equal(u.includes('secret'),false);assert.match(u,/^volna-media:\/\/stream\/[a-f0-9]{48}\/0$/);});
test('expired and revoked URLs are not playable',async()=>{let now=0;const b=new MediaBridge(()=>{throw 0;},{now:()=>now});let u=b.create('https://x.useraudio.net/a','audio');b.clear();assert.equal((await b.handle(request(u))).status,404);u=b.create('https://x.useraudio.net/a','audio');now=7200001;assert.equal((await b.handle(request(u))).status,404);});
test('range headers and response code are preserved',async()=>{let range;const b=new MediaBridge(async(u,o)=>{range=o.headers.Range;return new Response('abc',{status:206,headers:{'Content-Type':'audio/mpeg','Content-Range':'bytes 0-2/3'}});});const r=await b.handle(request(b.create('https://x.useraudio.net/a','audio'),{Range:'bytes=0-2'}));assert.equal(r.status,206);assert.equal(range,'bytes=0-2');assert.equal(await r.text(),'abc');assert.equal(b.controllers.size,0);});
test('redirects to private or unrelated hosts are blocked',async()=>{let n=0;const b=new MediaBridge(async()=>{n++;return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/private'}});});const r=await b.handle(request(b.create('https://x.useraudio.net/a','audio')));assert.equal(r.status,502);assert.equal(n,1);});
test('HLS manifests replace all source URLs',async()=>{const b=new MediaBridge(async()=>new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nsub/list.m3u8?q=secret\n'));const r=await b.handle(request(b.create('https://x.useraudio.net/master.m3u8','hls')));const body=await r.text();assert.match(body,/volna-media:/);assert.equal(body.includes('secret'),false);assert.equal(body.includes('useraudio'),false);});
test('HLS segment paths resolve against the real manifest',()=>{const b=new MediaBridge(()=>{});b.create('https://x.useraudio.net/a/list.m3u8','hls');b.rewrite('#EXTM3U\n../segment.ts','https://x.useraudio.net/a/list.m3u8');assert.equal([...b.resources.values()][1].url,'https://x.useraudio.net/segment.ts');});
test('encrypted HLS and unrelated nested endpoints are rejected',()=>{const b=new MediaBridge(()=>{});assert.throws(()=>b.rewrite('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"\na.ts','https://x.useraudio.net/a.m3u8'));assert.throws(()=>b.rewrite('#EXTM3U\nhttps://evil.test/a.ts','https://x.useraudio.net/a.m3u8'));});
test('clearing a session aborts active streams',async()=>{let signal;const b=new MediaBridge(async(u,o)=>{signal=o.signal;return new Response('a');});const response=await b.handle(request(b.create('https://x.useraudio.net/a','audio')));b.clear();assert.equal(signal.aborted,true);await response.body.cancel();});
test('backend error details never enter the response body',async()=>{const b=new MediaBridge(()=>{throw Error('token=secret');});const r=await b.handle(request(b.create('https://x.useraudio.net/a','audio')));assert.equal(r.status,502);assert.equal(await r.text(),'');});

test('new CDN hosts are allowed across redirect and nested HLS resources',async()=>{
 const seen=[];
 const b=new MediaBridge(async(url)=>{
  seen.push(String(url));
  if(seen.length===1)return new Response(null,{status:302,headers:{Location:'https://sun.userapi.com/list.m3u8'}});
  return new Response('#EXTM3U\nhttps://audio.okcdn.ru/seg.ts?secret\n');
 });
 const r=await b.handle(request(b.create('https://psv.vkuseraudio.ru/list.m3u8','hls')));
 assert.equal(r.status,200);
 assert.equal(seen.length,2);
 const body=await r.text();assert.match(body,/volna-media:/);assert.equal(body.includes('secret'),false);
 assert.ok([...b.resources.values()].some(x=>x.url==='https://audio.okcdn.ru/seg.ts?secret'));
});
