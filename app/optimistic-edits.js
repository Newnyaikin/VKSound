(function (root) {
  "use strict";

  function moveBefore(keys, key, before) {
    const next = [...keys],
      from = next.indexOf(key);
    if (from < 0 || key === before) return next;
    next.splice(from, 1);
    const index = before === null ? next.length : next.indexOf(before);
    if (index < 0) return [...keys];
    next.splice(index, 0, key);
    return next;
  }

  function applyRemoteEdit(state, arg) {
    if (!state || !arg || typeof arg !== "object") return state;

    if (arg.type === "tracks" && Array.isArray(arg.keys)) {
      const selected = new Set(arg.keys);
      if (arg.op === "add") {
        const library = [...(state.library || [])];
        for (const key of selected)
          if (!library.includes(key)) library.push(key);
        return { ...state, library };
      }
      if (arg.op === "delete") {
        const library = (state.library || []).filter(
          (key) => !selected.has(key),
        );
        const libraryLinks = Object.fromEntries(
          Object.entries(state.libraryLinks || {}).filter(
            ([, linkedKey]) => !selected.has(linkedKey),
          ),
        );
        return { ...state, library, libraryLinks };
      }
      return state;
    }

    if (arg.type === "reorder") {
      const library = moveBefore(
        state.library || [],
        arg.key,
        arg.before ?? null,
      );
      return { ...state, library };
    }

    if (arg.type !== "listEdit") return state;
    const index = (state.vkLists || []).findIndex(
      (playlist) => playlist.id === arg.id,
    );
    if (index < 0) return state;

    const previous = state.vkLists[index],
      keys = [...(previous.keys || [])];
    let title = previous.title;
    if (arg.op === "add") {
      for (const key of arg.keys || [])
        if (!keys.includes(key)) keys.push(key);
    } else if (arg.op === "remove") {
      const selected = new Set(arg.keys || []);
      const next = keys.filter((key) => !selected.has(key));
      keys.splice(0, keys.length, ...next);
    } else if (arg.op === "clear") {
      keys.length = 0;
    } else if (arg.op === "replace") {
      if (!Array.isArray(arg.keys)) return state;
      keys.splice(0, keys.length, ...arg.keys);
      if (typeof arg.title === "string") title = arg.title;
    } else if (arg.op === "reorder") {
      const next = moveBefore(keys, arg.key, arg.before ?? null);
      keys.splice(0, keys.length, ...next);
    } else if (arg.op === "rename") {
      if (typeof arg.title === "string") title = arg.title;
    } else return state;

    const vkLists = [...state.vkLists];
    vkLists[index] = {
      ...previous,
      title,
      keys,
      total: keys.length,
    };
    return { ...state, vkLists };
  }

  const api = { applyRemoteEdit, moveBefore };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VKSoundOptimistic = api;
})(typeof window !== "undefined" ? window : globalThis);