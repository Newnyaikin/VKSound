"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { applyRemoteEdit } = require("../app/optimistic-edits.js");

const state = () => ({
  library: ["a", "b", "c"],
  libraryLinks: { "foreign-a": "a" },
  vkLists: [
    {
      id: "7_9",
      title: "Playlist",
      keys: ["a", "b", "c"],
      total: 3,
      syncedAt: "unchanged",
    },
  ],
});

test("remote list edits update the client snapshot immutably", () => {
  const before = state();
  const next = applyRemoteEdit(before, {
    type: "listEdit",
    op: "remove",
    id: "7_9",
    keys: ["b"],
  });
  assert.deepEqual(next.vkLists[0].keys, ["a", "c"]);
  assert.equal(next.vkLists[0].total, 2);
  assert.deepEqual(before.vkLists[0].keys, ["a", "b", "c"]);
  assert.equal(next.vkLists[0].syncedAt, "unchanged");
});

test("playlist add, clear, rename, and reorder are projected locally", () => {
  const before = state();
  const added = applyRemoteEdit(before, {
    type: "listEdit",
    op: "add",
    id: "7_9",
    keys: ["d", "b"],
  });
  assert.deepEqual(added.vkLists[0].keys, ["a", "b", "c", "d"]);
  const reordered = applyRemoteEdit(added, {
    type: "listEdit",
    op: "reorder",
    id: "7_9",
    key: "c",
    before: "a",
  });
  assert.deepEqual(reordered.vkLists[0].keys, ["c", "a", "b", "d"]);
  const renamed = applyRemoteEdit(reordered, {
    type: "listEdit",
    op: "rename",
    id: "7_9",
    title: "Renamed",
  });
  assert.equal(renamed.vkLists[0].title, "Renamed");
  assert.deepEqual(
    applyRemoteEdit(renamed, {
      type: "listEdit",
      op: "clear",
      id: "7_9",
    }).vkLists[0].keys,
    [],
  );
});

test("a debounced replacement projects the final playlist composition", () => {
  const before = state();
  const changed = applyRemoteEdit(before, {
    type: "listEdit",
    op: "replace",
    id: "7_9",
    keys: ["a", "c"],
    title: "Final",
  });
  assert.deepEqual(changed.vkLists[0].keys, ["a", "c"]);
  assert.equal(changed.vkLists[0].title, "Final");
  assert.deepEqual(before.vkLists[0].keys, ["a", "b", "c"]);
});

test("library add/delete and reorder are optimistic and keep link state consistent", () => {
  const before = state();
  const added = applyRemoteEdit(before, {
    type: "tracks",
    op: "add",
    keys: ["d", "a"],
  });
  assert.deepEqual(added.library, ["a", "b", "c", "d"]);
  const reordered = applyRemoteEdit(added, {
    type: "reorder",
    key: "c",
    before: "a",
  });
  assert.deepEqual(reordered.library, ["c", "a", "b", "d"]);
  const deleted = applyRemoteEdit(reordered, {
    type: "tracks",
    op: "delete",
    keys: ["a"],
  });
  assert.deepEqual(deleted.library, ["c", "b", "d"]);
  assert.deepEqual(deleted.libraryLinks, {});
  assert.deepEqual(before.library, ["a", "b", "c"]);
});

test("unsupported or stale optimistic edits leave the state unchanged", () => {
  const before = state();
  assert.equal(applyRemoteEdit(before, { type: "listEdit", id: "missing" }), before);
  assert.equal(applyRemoteEdit(before, { type: "create" }), before);
});