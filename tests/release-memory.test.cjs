"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const renderer = fs.readFileSync("app/renderer.js", "utf8");
const experience = fs.readFileSync("app/experience.js", "utf8");
const miniSurface = fs.readFileSync("app/mini-surface.css", "utf8");
const mini = fs.readFileSync("app/mini.js", "utf8");
const packageInfo = require("../package.json");

test("release metadata is public and set to the requested major version", () => {
  assert.equal(packageInfo.version, "1.0.1");
  assert.equal(packageInfo.private, false);
});

test("track list avoids duplicate full-library arrays during filtering and sorting", () => {
  assert.match(renderer, /function visibleRows\(\)\{const rows=\[\];for\(const key of sourceKeys\(\)\)/);
  assert.match(renderer, /rows\.sort\(\(a,b\)=>/);
  assert.doesNotMatch(renderer, /rows\.slice\(0,renderLimit\)/);
  assert.doesNotMatch(renderer, /const keys=rows\.filter\(canPlay\)\.map/);
  assert.match(renderer, /activateTrack\(t\.key,visibleRows\(\)\.filter\(canPlay\)\.map\(track=>track\.key\)\)/);
});

test("playlist, editable VK playlist, queue and VK Mix support drag reordering", () => {
  assert.match(renderer, /route==='queue'\|\|route\.startsWith\('pl:'\)/);
  assert.match(renderer, /route==='mix'&&status\.state==='ready'&&!mixBusy&&mixed\.length>1/);
  assert.match(renderer, /route\.startsWith\('vk:'\)&&currentPlaylist\(\)\?\.editable/);
  assert.match(renderer, /if\(route==='mix'\)\{if\(!mixFeed\.move\(key,before\)\)return;mixed=mixFeed\.keys;renderTracks\(\);return;\}/);
});

test("current playlist rows drag from any point without a drag handle", () => {
  assert.match(experience, /row\.draggable=true/);
  assert.match(experience, /row\.ondragstart=e=>\{experience\.queueDrag=/);
  assert.doesNotMatch(experience, /full-queue-grip|drag-handle/);
  assert.match(experience, /row\.ondrop=action\(e=>\{e\.preventDefault\(\);e\.stopPropagation\(\);const target=fullQueueDropState\(\)/);
  assert.match(experience, /function moveFullQueueItem\(from,target,after\)/);
  assert.match(experience, /appendTrackFromFullQueueDrag\(target\.state,rowIndex\+\(after\?1:0\)\)/);
  assert.match(renderer, /row\.draggable=draggable/);
  assert.match(renderer, /draggable=allowed\|\|route!=='queue'/);
  assert.match(renderer, /if\(!canReorder\(\)&&route==='queue'\)/);
  assert.match(experience, /attachDrag\(row,t,\{lyrics:false\}\)/);
  assert.doesNotMatch(renderer, /Перетащить трек|drag-handle/);
  assert.match(renderer, /\$\('queueCardSlot'\)\.ondrop=action/);
});

test("liquid-glass mini-player keeps a dark translucent surface", () => {
  assert.match(miniSurface, /html\[data-theme=glass\]\[data-material=acrylic\].*rgba\(9,12,18,\.76\)/);
  assert.match(miniSurface, /--text:#f1f3f7/);
  assert.match(mini, /s\.theme==='glass'&&s\.material!=='acrylic'&&s\.material!=='vibrancy'\?'dark':s\.theme/);
});