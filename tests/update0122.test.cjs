'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises');
const read=path=>fs.readFile(path,'utf8');

test('author album Show All navigates to a full page and album rails load further pages',async()=>{
 const [experience,main,preload,html,css]=await Promise.all(['app/experience.js','app/main.cjs','app/preload.cjs','app/index.html','app/update0123.css'].map(read));
 assert.match(experience,/root\.dataset\.artistAlbums==='true'\)return showAllArtistAlbums\(root\)/);
 assert.match(experience,/go\('artist-albums:'\+id\)/);
 assert.match(experience,/while\(d\.albumsHasMore\)await loadMoreArtistAlbums\(d,\{rerender:false\}\)/);
 assert.match(experience,/maybeLoadArtistAlbums\(root\)/);assert.match(experience,/grid\.dataset\.artistId=d\.id/);
 assert.match(main,/bind\('artistAlbums'/);assert.match(preload,/artistAlbums/);assert.match(html,/artistAlbumsPage/);assert.match(css,/artist-albums-page-grid/);
});
