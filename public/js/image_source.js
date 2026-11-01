/* Generated images belong to the customer photo used to make them.
   Fingerprints cover the entire source; snapshots keep only the short key. */
const ImageSource = (() => {
  const cache = new Map();
  function fingerprint(src) {
    if (!src) return "source:none";
    if (cache.has(src)) return cache.get(src);
    let a = 0x811c9dc5, b = 0x9e3779b9, c = 0x85ebca6b, d = 0xc2b2ae35;
    for (let i = 0; i < src.length; i++) {
      const ch = src.charCodeAt(i);
      a = Math.imul(a ^ ch, 0x01000193);
      b = Math.imul(b ^ ch, 0x27d4eb2d);
      c = Math.imul(c ^ ch, 0x165667b1);
      d = Math.imul(d ^ ch, 0x85ebca77);
    }
    const key = `source:v1:${src.length}:${[a, b, c, d].map(n => (n >>> 0).toString(16).padStart(8, "0")).join("")}`;
    if (cache.size >= 4) cache.delete(cache.keys().next().value);
    cache.set(src, key);
    return key;
  }
  function sourceKey(state, kind = "hair") {
    const src = kind === "earrings" ? state.ear?.src || state.side?.src : state.photos?.frontOrig || state.photos?.front;
    return fingerprint(src);
  }
  // Existing reports stay readable. Before a source changes, stamp legacy
  // images with the OLD source so they cannot become the new customer's image.
  function stampLegacySources(state) {
    for (const kind of ["hair", "glasses", "earrings"]) {
      const key = sourceKey(state, kind);
      for (const item of state.texts?.[kind]?.items || []) {
        if (item.img && !item.imgSourceKey) item.imgSourceKey = key;
        item.candSources = (item.cands || []).map((_, i) => item.candSources?.[i] || key);
      }
    }
    const makeup = state.texts?.makeup;
    if (!makeup) return;
    const key = sourceKey(state, "makeup");
    if (makeup.guideImg && !makeup.guideSourceKey) makeup.guideSourceKey = key;
    if (makeup.fullImage && !makeup.fullImageSourceKey) makeup.fullImageSourceKey = key;
    makeup.candSources = (makeup.cands || []).map((_, i) => makeup.candSources?.[i] || key);
    for (const candidate of makeup.guideCands || []) if (!candidate.sourceKey) candidate.sourceKey = key;
  }
  const matches = (state, kind, key) => !key || key === sourceKey(state, kind);
  const isCurrentImage = (state, kind, item) => !!item?.img && !(kind === "hair" && item.stale) && matches(state, kind, item.imgSourceKey);
  const isCurrentMakeup = state => !!state.texts?.makeup?.guideImg && matches(state, "makeup", state.texts.makeup.guideSourceKey);
  const isCurrentPoster = state => !!state.texts?.makeup?.fullImage && matches(state, "makeup", state.texts.makeup.fullImageSourceKey);
  return Object.freeze({ sourceKey, matches, stampLegacySources, isCurrentImage, isCurrentMakeup, isCurrentPoster });
})();
