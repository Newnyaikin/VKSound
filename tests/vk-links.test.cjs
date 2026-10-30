'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseVkLink}=require('../app/vk-links.cjs');
const {VkClient}=require('../app/vk-client.cjs');

test('VK links resolve track, album, playlist, and artist identifiers',()=>{
 assert.deepEqual(parseVkLink('https://vk.com/audio-123_456'),{type:'track',id:'-123_456',accessKey:''});
 assert.deepEqual(parseVkLink('https://vk.ru/audio-123_456_secret123'),{type:'track',id:'-123_456',accessKey:'secret123'});
 assert.deepEqual(parseVkLink('https://vk.com/music/album/-12_34'),{type:'album',id:'-12_34',accessKey:''});
 assert.deepEqual(parseVkLink('https://vk.com/music/playlist/-12_34'),{type:'playlist',id:'-12_34',accessKey:''});
 assert.deepEqual(parseVkLink('https://vk.com/audio?z=audio_playlist-12_34_secret'),{type:'playlist',id:'-12_34',accessKey:'secret'});
 assert.deepEqual(parseVkLink('https://vk.com/artist/some-artist'),{type:'artist',id:'some-artist'});
});

test('VK link parser rejects unsafe or ambiguous URL forms',()=>{
 for(const input of ['http://vk.com/audio-1_2','https://vk.com.evil.test/audio-1_2','https://user@vk.com/audio-1_2','https://vk.com:444/audio-1_2','https://vk.com/audio-0_2','https://vk.com/audio-1_0','https://vk.com/video-1_2',''])assert.throws(()=>parseVkLink(input));
});


test('track URL resolves only the exact VK audio and returns public metadata',async()=>{
 const client=new VkClient(async()=>{throw Error('network should be stubbed');});let requested;
 client.call=async(method,params)=>{requested={method,params};return [{owner_id:-12,id:34,title:'Found track',artist:'Artist',duration:123,access_key:'SECRET',url:'https://audio.invalid/signed'}];};
 const row=await client.resolveTrackLink('https://vk.com/audio-12_34_SECRET');
 assert.deepEqual(requested,{method:'audio.getById',params:{audios:'-12_34_SECRET',need_more:1}});
 assert.equal(row.key,'-12_34');assert.equal(row.title,'Found track');assert.equal(row.available,true);
 assert.doesNotMatch(JSON.stringify(row),/SECRET|signed|access_key/);
});
