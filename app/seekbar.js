(function (root) {
  "use strict";

  function heightForLevel(value) {
    if (typeof value !== "number" || !Number.isFinite(value)) return 2;
    return Math.max(
      2,
      Math.min(100, Math.pow(Math.max(0, Number(value) || 0), 1.15) * 175),
    );
  }

  function reduce(peaks, count) {
    if (
      !Array.isArray(peaks) ||
      !Number.isInteger(count) ||
      count < 1 ||
      count > 100
    )
      return [];
    const out = [];
    for (let i = 0; i < count; i++) {
      const start = Math.floor((i * peaks.length) / count),
        end = Math.floor(((i + 1) * peaks.length) / count);
      let level = null;
      for (let j = start; j < end; j++)
        if (typeof peaks[j] === "number" && Number.isFinite(peaks[j]))
          level = Math.max(level ?? 0, peaks[j]);
      out.push(level);
    }
    return out;
  }

  const sources = new WeakMap();
  let observer;
  const placeholderHeights = [16, 25, 36, 21, 43, 28, 18, 32, 23, 39];

  function barCount(host) {
    return Math.min(100, Math.max(12, Math.floor((host.clientWidth || 300) / 3)));
  }

  function addPlaceholderBars(host, count) {
    host.dataset.placeholder = "true";
    for (let i = 0; i < count; i++) {
      const bar = host.ownerDocument.createElement("i");
      bar.className = "placeholder";
      bar.style.height = placeholderHeights[i % placeholderHeights.length] + "%";
      bar.dataset.baseHeight = bar.style.height;
      host.append(bar);
    }
  }

  function paintBars(host, source) {
    const count = barCount(host),
      actual = source.some(
        (value) => typeof value === "number" && Number.isFinite(value),
      );
    host.replaceChildren();
    host.dataset.actual = String(actual);
    host.dataset.placeholder = "false";

    if (!actual) {
      addPlaceholderBars(host, count);
    } else {
      for (const level of reduce(source, count)) {
        const bar = host.ownerDocument.createElement("i"),
          known = typeof level === "number" && Number.isFinite(level);
        bar.classList.toggle("unknown", !known);
        bar.classList.toggle("placeholder", !known);
        bar.style.height = known
          ? heightForLevel(level) + "%"
          : placeholderHeights[host.children.length % placeholderHeights.length] +
            "%";
        bar.dataset.baseHeight = bar.style.height;
        host.append(bar);
      }
    }
    const wrap = host.parentElement;
    if (wrap)
      progress(
        wrap,
        parseFloat(wrap.style.getPropertyValue("--seek-progress")) / 100,
      );
  }

  function bars(host, peaks) {
    if (!host) return;
    const source = Array.isArray(peaks) ? peaks.slice(0, 100) : [];
    sources.set(host, source);
    paintBars(host, source);
    if (typeof ResizeObserver !== "undefined") {
      observer ??= new ResizeObserver((entries) => {
        for (const { target } of entries)
          paintBars(target, sources.get(target) || []);
      });
      observer.observe(host);
    }
  }

  function progress(wrap, value) {
    if (!wrap) return;
    const amount = Math.max(0, Math.min(1, Number(value) || 0));
    wrap.style.setProperty("--seek-progress", amount * 100 + "%");
    const host = wrap.querySelector(".seek-wave"),
      items = host?.querySelectorAll("i") || [];
    for (let i = 0; i < items.length; i++)
      items[i].classList.toggle("played", i / items.length < amount);
  }

  function live(wrap, level, ratio) {
    if (!wrap) return;
    const host = wrap.querySelector(".seek-wave"),
      items = host?.querySelectorAll("i") || [];
    if (!items.length) return;
    const storedProgress =
      parseFloat(wrap.style.getPropertyValue("--seek-progress")) / 100,
      progressValue = Number.isFinite(ratio)
        ? Math.max(0, Math.min(1, ratio))
        : Number.isFinite(storedProgress)
          ? storedProgress
          : 0,
      index = Math.min(
        items.length - 1,
        Math.max(0, Math.floor(progressValue * items.length)),
      ),
      amplitude = Math.max(0, Math.min(1, Number(level) || 0));
    host.dataset.live = "true";
    for (let i = 0; i < items.length; i++) {
      const bar = items[i];
      bar.classList.toggle("live", i === index);
      if (i === index)
        bar.style.height =
          Math.max(parseFloat(bar.dataset.baseHeight) || 2, 8 + amplitude * 92) +
          "%";
      else bar.style.height = bar.dataset.baseHeight || "2%";
    }
  }

  function clearLive(wrap) {
    const host = wrap?.querySelector(".seek-wave");
    if (!host) return;
    host.dataset.live = "false";
    for (const bar of host.querySelectorAll("i.live")) {
      bar.classList.remove("live");
      bar.style.height = bar.dataset.baseHeight || "2%";
    }
  }

  const api = { bars, progress, live, clearLive, heightForLevel, reduce };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.VKSoundSeek = api;
})(typeof window !== "undefined" ? window : globalThis);