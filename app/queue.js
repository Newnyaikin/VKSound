(function (root) {
  "use strict";

  function shuffle(values, random = Math.random) {
    const result = [...new Set(values)];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function shuffleOccurrences(values, random = Math.random) {
    const result = [...values];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  class Queue {
    constructor() {
      this.keys = [];
      this.index = -1;
      this.repeat = "off";
      this.shuffled = false;
      this.shuffleSource = null;
    }

    get current() {
      return this.keys[this.index] || "";
    }

    set(keys, key) {
      this.keys = [...keys];
      this.index = this.keys.indexOf(key);
      if (this.index < 0 && this.keys.length) this.index = 0;
      this.shuffled = false;
      this.shuffleSource = null;
      return this.current;
    }

    add(key) {
      this.keys.push(key);
      if (this.shuffleSource) this.shuffleSource.push(key);
      if (this.index < 0) this.index = 0;
    }

    next(automatic = false) {
      if (!this.keys.length) return "";
      if (automatic && this.repeat === "one") return this.current;
      if (this.index + 1 < this.keys.length) this.index++;
      else if (this.repeat === "all") this.index = 0;
      else return "";
      return this.current;
    }

    prev() {
      if (!this.keys.length) return "";
      this.index = Math.max(0, this.index - 1);
      return this.current;
    }

    move(i, j) {
      if (
        !Number.isInteger(i) ||
        !Number.isInteger(j) ||
        i < 0 ||
        j < 0 ||
        i >= this.keys.length ||
        j >= this.keys.length
      )
        return;
      const selected = this.index;
      const [key] = this.keys.splice(i, 1);
      this.keys.splice(j, 0, key);
      if (selected === i) this.index = j;
      else if (i < selected && j >= selected) this.index--;
      else if (i > selected && j <= selected) this.index++;
    }

    remove(i) {
      if (i === this.index || i < 0 || i >= this.keys.length) return;
      const key = this.keys[i];
      if (this.shuffleSource) {
        const occurrence = this.keys
          .slice(0, i + 1)
          .filter((item) => item === key).length;
        let seen = 0;
        const sourceIndex = this.shuffleSource.findIndex(
          (item) => item === key && ++seen === occurrence,
        );
        if (sourceIndex >= 0) this.shuffleSource.splice(sourceIndex, 1);
      }
      this.keys.splice(i, 1);
      if (i < this.index) this.index--;
    }

    mix(random = Math.random) {
      if (this.shuffled && this.shuffleSource) {
        const current = this.current;
        this.keys = [...this.shuffleSource];
        this.index = current ? this.keys.indexOf(current) : -1;
        if (this.index < 0 && this.keys.length) this.index = 0;
        this.shuffleSource = null;
        this.shuffled = false;
        return false;
      }

      this.shuffleSource = [...this.keys];
      const current = this.current;
      const others = this.keys.filter((_key, index) => index !== this.index);
      this.keys = [
        ...(current ? [current] : []),
        ...shuffleOccurrences(others, random),
      ];
      this.index = this.keys.length ? 0 : -1;
      this.shuffled = this.keys.length > 1;
      if (!this.shuffled) this.shuffleSource = null;
      return this.shuffled;
    }
  }

  const api = { Queue, shuffle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LadoQueue = api;
})(typeof window !== "undefined" ? window : globalThis);