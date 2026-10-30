"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { MixFeed } = require("../app/mix-feed.js");

test("VK Mix drag order survives continuation pages and rejects missing tracks", async () => {
  const feed = new MixFeed();
  await feed.load(async () => ({
    rows: ["a", "b", "c"].map((key) => ({ key })),
    more: true,
  }));

  assert.equal(feed.move("missing", "a"), false);
  assert.equal(feed.move("c", "missing"), false);
  const sharedKeys = feed.keys;
  assert.equal(feed.move("c", "a"), true);
  assert.strictEqual(feed.keys, sharedKeys);
  assert.deepEqual(feed.keys, ["c", "a", "b"]);

  await feed.load(async () => ({
    rows: ["c", "d"].map((key) => ({ key })),
    more: false,
  }));
  assert.deepEqual(feed.keys, ["c", "a", "b", "d"]);
});