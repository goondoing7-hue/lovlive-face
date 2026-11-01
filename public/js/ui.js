/* =====================================================================
   편집 화면·상태 관리
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => new Date().toISOString().slice(0, 10);
let st = null;
let previewPage = 0;
const STEPS = [
  { n: 1, t: "사진·비율·AI 분석", page: 0 }, { n: 2, t: "정면 기준선", page: 2 }, { n: 3, t: "얼굴형·정면 문장", page: 1 },
  { n: 4, t: "측면 분석", page: 3 }, { n: 5, t: "헤어 BEST 3", page: 4 }, { n: 6, t: "맞춤 메이크업", page: 5 },
  { n: 7, t: "안경", page: 6 }, { n: 8, t: "귀걸이", page: 7 }, { n: 9, t: "미리보기·출력", page: -1 },
];

function newState() {
  const s = {
    version: 1, step: 1, edited: [], costs: [], locked: [],
    client: { name: "", date: today(), memo: "" },
    photos: { front: null, frontOrig: null },
    front: { w: 600, h: 800, pts: null, lines: defaultLines(600, 800), ratios: null, raw: null, frame: { zoom: 1, dx: 0, dy: 0 }, rot: 0, auto: false },
    type: { key: "round", auto: null, scores: {}, widths: null },
    side: { src: null, w: 0, h: 0, pts: [null, null, null], sel: [0, 0, 0, 0], axes: [], title: "", text: "", frame: { zoom: 1, dx: 0, dy: 0 } },
    ear: { src: null, w: 0, h: 0, lobe: null, zoom: 1 },
    texts: null, manual: {}, useManual: true,
    settings: loadSettings(),
  };
  s.front.ratios = computeRatios(s.front.lines, s.settings.calib);
  s.texts = generateTexts(s);
  Object.assign(s.side, generateSide(s.side.sel));
  return s;
}
function loadSettings() {
  try { const j = JSON.parse(localStorage.getItem("lovive_settings") || "null"); if (j) return deepMerge(clone(DEFAULT_SETTINGS), j); } catch (e) {}
  return clone(DEFAULT_SETTINGS);
}
function saveSettings() { try { localStorage.setItem("lovive_settings", JSON.stringify(st.settings)); } catch (e) {} }
function deepMerge(a, b) { for (const k in b) { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") deepMerge(a[k], b[k]); else a[k] = b[k]; } return a; }
const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
function setPath(o, p, v) { const ks = p.split("."); const last = ks.pop(); const t = ks.reduce((x, k) => x[k], o); t[last] = v; }
const isEdited = p => st.edited.includes(p);
function markEdited(p) { if (!st.edited.includes(p)) st.edited.push(p); }

/* ---- 문장 재생성 (사용자가 고친 칸은 유지) ---- */
const KEEP_KEYS = new Set(["img", "useUpload", "fullImage", "mode", "cands", "prompt", "ref", "candQ", "imgQ", "guideImg", "guideLm", "guideCands", "guideCandQ", "guideQ", "stale", "imgSourceKey", "candSources", "guideSourceKey", "fullImageSourceKey"]);
function regenerate(force = false, only = null) {
  const fresh = generateTexts(st);
  const walk = (dst, src, path) => {
    for (const k of Object.keys(src)) {
      const p = path ? path + "." + k : k;
      if (KEEP_KEYS.has(k)) continue;
      const sv = src[k];
      if (sv && typeof sv === "object" && !Array.isArray(sv)) { if (!dst[k] || typeof dst[k] !== "object") dst[k] = {}; walk(dst[k], sv, p); }
      else if (Array.isArray(sv) && sv.length && typeof sv[0] === "object") {
        if (!Array.isArray(dst[k])) dst[k] = [];
        sv.forEach((it, i) => { if (!dst[k][i]) dst[k][i] = {}; walk(dst[k][i], it, p + "." + i); });
      } else if (Array.isArray(sv)) {
        const old = Array.isArray(dst[k]) ? dst[k] : [];
        dst[k] = sv.map((v, i) => (!force && isEdited("texts." + p + "." + i) && old[i] != null) ? old[i] : v);
      } else if (force || !isEdited("texts." + p)) dst[k] = clone(sv);
    }
  };
  if (!st.texts) st.texts = fresh;
  for (const sec of Object.keys(fresh)) { if (only && !only.includes(sec)) continue; if (!st.texts[sec]) st.texts[sec] = {}; walk(st.texts[sec], fresh[sec], sec); }
  if (force) st.edited = st.edited.filter(p => !p.startsWith("texts.") || (only && !only.some(o => p.startsWith("texts." + o))));
  ["glasses", "earrings"].forEach(k => { if (st.texts[k].scaleAuto) syncAccessoryScales(k); });
}

/* ---- 측정값 갱신 ---- */
function updateRatios() {
  st.front.raw = computeRatios(st.front.lines, null);
  st.front.ratios = computeRatios(st.front.lines, st.settings.calib);
}

/* ================= 정면 사진 자동 분석 ================= */
async function analyzeFront(statusEl) {
  const say = (m, cls = "") => { if (statusEl) { statusEl.className = "status " + cls; statusEl.innerHTML = m; } };
  try {
    say("얼굴 인식 모듈을 불러오는 중… (처음 한 번은 10~20초 걸릴 수 있어요)");
    let src = st.photos.frontOrig;
    let d = await detectLandmarks(src);
    if (!d) throw new Error("사진에서 얼굴을 찾지 못했습니다");
    const ang = Math.atan2(d.pts[263][1] - d.pts[33][1], d.pts[263][0] - d.pts[33][0]) * 180 / Math.PI;
    st.front.rot = 0;
    if (Math.abs(ang) > 0.4) {
      say(`기울기 ${ang.toFixed(1)}° 보정 중…`);
      src = await rotateDataURL(src, -ang); st.front.rot = -ang;
      d = await detectLandmarks(src) || d;
    }
    st.photos.front = src; st.front.w = d.w; st.front.h = d.h; st.front.pts = d.pts;
    say("헤어라인 추정 중…");
    const hy = await estimateHairline(src, d.pts);
    st.front.lines = linesFromLandmarks(d.pts, hy);
    st.front.auto = true;
    updateRatios();
    const c = classifyFace(st.front.ratios.aspect, d.pts, st.settings.thresholds);
    st.type.auto = c.type; st.type.scores = c.scores; st.type.widths = c.widths;
    if (!isEdited("type.key")) st.type.key = c.type;
    regenerate(false);
    say(`✓ 자동 측정 완료 — 기울기 ${(-st.front.rot).toFixed(1)}° 보정. 얼굴형 제안(참고용): <b>${FACE_TYPES[c.type].ko}</b> → 3단계에서 최종 선택해 주세요. 다음은 '정면 측정'에서 선 위치 확인입니다.`, "ok");
    autosave();
    return true;
  } catch (e) {
    console.error(e);
    const img = await loadImage(st.photos.frontOrig);
    st.photos.front = st.photos.frontOrig; st.front.w = img.width; st.front.h = img.height; st.front.pts = null;
    st.front.lines = defaultLines(img.width, img.height); st.front.auto = false; updateRatios(); regenerate(false);
    say(`자동 인식 실패: ${esc(e.message)}<br>→ 수동 모드로 전환했습니다. '정면 측정'에서 선을 직접 끌어 맞춰 주세요. (메이크업 부위 사진은 자동 인식이 필요해요)`, "err");
    return false;
  }
}

/* ================= 화면 구성 ================= */
function renderNav() {
  const done = { 1: !!st.photos.front, 2: st.front.auto || isEdited("front.lines"), 3: true, 4: !!st.side.src, 5: st.texts.hair.items.some(i => i.img), 6: true, 7: true, 8: !!st.ear.src };
  $(".nav").innerHTML = STEPS.map(s => `<div class="step ${st.step === s.n ? "on" : ""}" data-step="${s.n}"><span class="n">${s.n}</span>${s.t}${done[s.n] && s.n < 9 ? '<span class="ok">●</span>' : ""}</div>`).join("") +
    `<div class="hint">· 모든 문장 칸은 직접 고칠 수 있어요. 고친 칸(주황 표시)은 자동 갱신에서 제외됩니다.<br>· 이 브라우저에는 자동 저장됩니다. 다른 PC·계정에서 이어서 작업하려면 상단 '임시저장'을 누르세요.<br>· 저장한 작업은 '저장소'에서 다시 열 수 있습니다.</div>`;
  $$(".nav .step").forEach(el => el.onclick = () => goStep(+el.dataset.step));
}
function goStep(n) {
  st.step = n; const s = STEPS.find(x => x.n === n); if (s.page >= 0) previewPage = s.page;
  renderNav(); renderEditor(); renderPreview(); $(".editor").scrollTop = 0;
  autosave({ quiet: true });
}
function field(path, label, opts = {}) {
  const v = getPath(st, path) ?? "";
  const ed = isEdited(path) ? " edited" : "";
  const rows = opts.rows || (String(v).split("\n").length + (String(v).length > 60 ? 1 : 0));
  if (opts.input) return `<label class="f">${label}</label><input type="text" class="${ed}" data-path="${path}" value="${esc(v)}">`;
  return `${label ? `<label class="f">${label}</label>` : ""}<textarea class="${ed}" data-path="${path}" rows="${Math.max(1, Math.min(6, rows))}">${esc(v)}</textarea>`;
}
function bindFields(root) {
  $$("[data-path]", root).forEach(el => {
    const ev = el.tagName === "SELECT" || el.type === "checkbox" || el.type === "range" ? "change" : "input";
    el.addEventListener(ev, () => {
      let val = el.type === "checkbox" ? el.checked : el.type === "range" || el.type === "number" ? +el.value : el.value;
      setPath(st, el.dataset.path, val);
      if (el.dataset.path.startsWith("texts.")) { markEdited(el.dataset.path); el.classList.add("edited"); }
      const scale = el.dataset.path.match(/^texts\.(glasses|earrings)\.(scales|scaleText)\.(\d+)$/);
      if (scale) { AccessoryScales.markManual(st.texts[scale[1]], +scale[3], scale[2] === "scales" ? "value" : "text"); syncAccessoryScales(scale[1]); st.texts[scale[1]].items.forEach((_, i) => markStale(scale[1], i)); }
      const accessory = el.dataset.path.match(/^texts\.(glasses|earrings)\.items\.\d+\.(shape|color|size)$/);
      if (accessory) { syncAccessoryScales(accessory[1]); markStale(accessory[1], +el.dataset.path.split(".")[3]); }
      if (st.analyzed) onManualChange(el);
      if (el.dataset.cb) CALLBACKS[el.dataset.cb]?.(el);
      schedulePreview(); autosave();
    });
    if (el.type === "range") el.addEventListener("input", () => { setPath(st, el.dataset.path, +el.value); schedulePreview(80); });
  });
}
const CALLBACKS = {};

function renderEditor() {
  const E = $(".editor");
  const fn = [null, viewBasic, viewFront, viewSummary, viewSide, viewHair, viewMakeup, viewGlasses, viewEarrings, viewOutput][st.step];
  E.innerHTML = fn();
  bindFields(E);
  (POST[st.step] || (() => {}))(E);
}
const POST = {};

/* ---------- 1. 기본 정보·사진 ---------- */
function upBox(id, title, src, hint) {
  return `<label class="up" id="${id}">${src ? `<img src="${BlobCache.get(src)}">` : `<div class="t">${title}</div><div class="mut">${hint}</div>`}<input type="file" accept="image/*"><div class="mut">${src ? "클릭해서 바꾸기" : "클릭 또는 끌어다 놓기"}</div></label>`;
}
const RATIO_IN = [["aspect", "얼굴 종횡비", "1:1.50"], ["thirds", "상:중:하", "1:1:0.8"], ["eyes", "눈 거리(눈 너비)", "1:1.0:1.0"], ["eyePos", "눈 위치", "1:0.9"], ["nosePos", "코 위치", "1:0.7"], ["mouthPos", "입 위치", "1:1.5"]];
function viewBasic() {
  const ready = st.photos.front && st.side.src && RATIO_IN.every(([k]) => st.manual[k]);
  return `<h2>1. 사진·비율·AI 분석</h2><p class="lead">정면·측면 사진과 비율 앱 측정값을 넣고 <b>AI 분석</b>을 누르면, 얼굴형·측면 판정과 8쪽의 모든 문장, 이미지 생성용 설명까지 한 번에 만들어집니다. 그다음 각 단계에서 GPT 이미지(헤어·메이크업·안경·귀걸이)를 만듭니다.</p>
  <div class="card"><h3>고객 정보</h3><div class="grid2"><div>${field("client.name", "고객 이름", { input: true })}</div><div><label class="f">진단일</label><input type="date" data-path="client.date" value="${esc(st.client.date)}"></div></div>
  ${field("client.memo", "상담 메모 (고민·선호 스타일 — AI가 반영)", { rows: 2 })}</div>
  <div class="card"><h3>사진</h3>
  <div class="grid3">${upBox("upFront", "정면 사진", st.photos.frontOrig, "정면·무표정·이마 노출")}${upBox("upSide", "측면 사진", st.side.src, "옆모습, 귀가 보이게")}${upBox("upEar", "귀 사진 (선택)", st.ear.src, "없으면 측면 사진의 귀를 사용")}</div>
  <div id="anaStatus" class="status" style="${st.photos.front ? "" : "display:none"}">${st.front.auto ? "✓ 정면 얼굴 인식 완료 (기준선 자동)" : st.photos.front ? "정면 기준선 수동 모드" : ""}</div></div>
  <div class="card"><h3>얼굴 비율 <span class="tag">비율 앱 측정값</span></h3><div class="row"><label class="btn sm">앱 캡처 올리기 (여러 장)<input type="file" id="shots" accept="image/*" multiple style="display:none"></label><span class="mut">캡처를 올리면 숫자를 자동으로 읽어 채웁니다</span></div>
  <div class="grid3" style="margin-top:6px">${RATIO_IN.map(([k, n, ex]) => `<div><label class="f">${n}</label><input type="text" data-man="${k}" value="${esc(st.manual[k] || "")}" placeholder="${ex}"></div>`).join("")}</div></div>
  <div class="card"><h3>AI 분석</h3>${[["정면 사진", st.photos.front], ["측면 사진", st.side.src], ["비율 6개", RATIO_IN.every(([k]) => st.manual[k])]].map(([t, ok]) => `<span style="margin-right:14px">${ok ? "✅" : "⬜"} ${t}</span>`).join("")}
  <label class="mut" style="display:block;margin-top:8px"><input type="checkbox" id="useRecent" checked> 드라이브에 저장된 최근 보고서 3건을 문체 참고로 함께 보내기</label>
  <div class="row" style="margin-top:10px"><button class="btn pri" id="runAna" ${ready ? "" : "disabled"}>✨ AI 분석 실행 (30~90초)</button>${st.analyzed ? `<span class="mut">다시 실행하면 문장이 새 결과로 바뀝니다 (이미지는 유지)</span>` : ""}</div></div>`;
}
POST[1] = E => {
  const hook = (id, fn) => { const box = $("#" + id, E); const inp = $("input", box);
    inp.onchange = async () => { if (inp.files[0]) await fn(inp.files[0]); };
    box.ondragover = e => { e.preventDefault(); box.style.background = "#f3ece5"; };
    box.ondragleave = () => box.style.background = "";
    box.ondrop = async e => { e.preventDefault(); box.style.background = ""; const f = e.dataTransfer.files[0]; if (f) await fn(f); };
  };
  hook("upFront", async f => {
    const targetState = st, src = await fileToDataURL(f, 1800), image = await loadImage(src);
    if (st !== targetState) return;
    ImageSource.stampLegacySources(st);
    st.photos.frontOrig = src; st.photos.front = src;
    Object.assign(st.front, { w: image.width, h: image.height, pts: null, lines: defaultLines(image.width, image.height), auto: false, rot: 0 });
    updateRatios(); st.edited = st.edited.filter(p => p !== "front.lines");
    renderEditor(); const s = $("#anaStatus"); s.style.display = "";
    await analyzeFront(s); renderNav(); renderPreview(); autosave();
    $("#upFront").innerHTML = `<img src="${BlobCache.get(st.photos.frontOrig)}"><input type="file" accept="image/*"><div class="mut">클릭해서 바꾸기</div>`; POST[1](E);
  });
  hook("upSide", async f => { const d = await fileToDataURL(f, 1600); const im = await loadImage(d); ImageSource.stampLegacySources(st); Object.assign(st.side, { src: d, w: im.width, h: im.height, pts: [null, null, null] }); renderEditor(); renderNav(); autosave(); });
  hook("upEar", async f => { const d = await fileToDataURL(f, 1600); const im = await loadImage(d); ImageSource.stampLegacySources(st); Object.assign(st.ear, { src: d, w: im.width, h: im.height, lobe: null }); renderEditor(); renderNav(); autosave(); });
  const se = $("#sideToEar", E); if (se) se.onclick = () => { ImageSource.stampLegacySources(st); Object.assign(st.ear, { src: st.side.src, w: st.side.w, h: st.side.h, lobe: null }); toast("측면 사진을 귀 사진으로 지정했어요. 8단계에서 귓불 위치를 찍어 주세요."); renderEditor(); renderNav(); };
  $$("[data-man]", E).forEach(inp => inp.oninput = () => { st.manual[inp.dataset.man] = inp.value.replace(/\s/g, ""); if (st.analyzed) queueRefresh(["ratios"], `${(RATIO_IN.find(r => r[0] === inp.dataset.man) || [])[1]} 비율을 ${st.manual[inp.dataset.man]}(으)로 직접 수정함`, 2500); regenerate(false); schedulePreview(); autosave(); const b = $("#runAna"); if (b) b.disabled = !(st.photos.front && st.side.src && RATIO_IN.every(([k]) => st.manual[k])); });
  $("#shots", E).onchange = async e => { const fs = [...e.target.files]; if (!fs.length) return; busy("캡처에서 비율을 읽는 중…");
    try { const imgs = await Promise.all(fs.map(f => fileToDataURL(f, 1100))); const r = await apiPost("/api/analyze", { task: "ratios", images: imgs });
      const map = { aspect: "aspect", thirds: "thirds", eyeDist: "eyes", eyePos: "eyePos", nosePos: "nosePos", mouthPos: "mouthPos" };
      for (const [k, v] of Object.entries(map)) if (r[k]) st.manual[v] = String(r[k]).replace(/\s/g, "");
      toast("비율을 채웠어요. 숫자를 한 번 확인해 주세요."); } catch (er) { toast("읽기 실패: " + esc(er.message), 6000); }
    busy(); regenerate(false); renderEditor(); renderPreview(); autosave(); };
  const run = $("#runAna", E); if (run) run.onclick = runAnalysis;
  const ra = $("#reanalyze", E); if (ra) ra.onclick = async () => { const s = $("#anaStatus"); s.style.display = ""; st.edited = st.edited.filter(p => p !== "front.lines"); await analyzeFront(s); renderNav(); renderPreview(); };
};

/* ---------- AI 분석 (서버: Claude 또는 GPT) ---------- */
function draftForAI() {
  const t = st.texts;
  return {
    faceTypeKey: st.type.key,
    p2: { chip1: t.p2.chip1, desc1: t.p2.desc1, details: t.p2.details, keyTitle: t.p2.keyTitle, keyText: t.p2.keyText },
    p3: { desc: t.p3.desc, title: t.p3.title, text: t.p3.text },
    side: { axes: st.side.axes.map(a => ({ title: a.title, text: a.text })), title: st.side.title, text: st.side.text },
    hair: { keywords: t.hair.keywords, desc: t.hair.desc, items: t.hair.items.map(x => ({ name: x.name, desc: x.desc, prompt: x.prompt || "", ref: x.ref || "" })), volume: t.hair.volume, avoid: t.hair.avoid, basic: t.hair.basic },
    makeup: { intro: t.makeup.intro, head: t.makeup.head, keyPoints: t.makeup.keyPoints, sections: Object.fromEntries(Object.entries(t.makeup.sections).map(([k, s]) => [k, { sub: s.sub, steps: s.steps, points: s.points }])) },
    glasses: { formula: t.glasses.formula, desc: t.glasses.desc, items: t.glasses.items.map(x => ({ name: x.name, desc: x.desc, shape: x.shape, color: x.color, prompt: x.prompt || "" })), scales: t.glasses.scales, scaleText: t.glasses.scaleText, checks: t.glasses.checks },
    earrings: { formula: t.earrings.formula, desc: t.earrings.desc, items: t.earrings.items.map(x => ({ name: x.name, desc: x.desc, shape: x.shape, color: x.color, prompt: x.prompt || "" })), scales: t.earrings.scales, scaleText: t.earrings.scaleText, checks: t.earrings.checks },
  };
}
async function runAnalysis() {
  if (st.analyzed && !confirm("AI 분석을 다시 실행할까요? 문장이 새 결과로 바뀝니다. (만든 이미지는 유지)")) return;
  busy("AI가 분석하고 있습니다… (30~90초)");
  try {
    let recent = []; if ($("#useRecent")?.checked && !CFG.devNoAuth) recent = await driveRecent().catch(() => []);
    const m = roundRatios(effRatios(st));
    const body = { task: "report", name: st.client.name, memo: st.client.memo,
      ratios: { aspect: fmtRatio("aspect", m), thirds: fmtRatio("thirds", m), eyes: fmtRatio("eyes", m), eyePos: fmtRatio("eyePos", m), nosePos: fmtRatio("nosePos", m), mouthPos: fmtRatio("mouthPos", m) },
      front: await toJpeg(st.photos.frontOrig || st.photos.front, 1024), side: st.side.src ? await toJpeg(st.side.src, 1024) : null,
      draft: draftForAI(), hairLib: HAIR_LIB.map(h => `${h.id}|${h.name}|${h.length}|${h.fromFace || "-"}`).join("\n"), recent };
    const j = await apiPost("/api/analyze", body);
    if (j.faceTypeKey && FACE_TYPES[j.faceTypeKey] && j.faceTypeKey !== st.type.key) { st.type.key = j.faceTypeKey; st.edited = []; regenerate(true); }
    st.edited = st.edited.filter(p => !p.startsWith("texts."));
    mergeAI(st, j);
    ["hair", "glasses", "earrings"].forEach(k => (j[k]?.items || []).forEach((x, i) => { const it = st.texts[k].items[i]; if (!it) return; ["prompt", "ref", "shape", "color"].forEach(f => { if (x[f] != null && x[f] !== "") it[f] = x[f]; }); }));
    if (j.makeupGuide) st.texts.makeupGuide = j.makeupGuide;
    const sp = j.sidePoints; if (sp && st.side.w) { const P = k => sp[k] ? [sp[k][0] * st.side.w, sp[k][1] * st.side.h] : null; st.side.pts = [P("noseTip"), P("lip"), P("chin")]; if (sp.ear) st.side.earPt = P("ear"); }
    st.analyzed = true; st.locked = []; markAllEdited(); busy(); toast("분석 완료! 이제 각 단계에서 확인하고 GPT 이미지를 만들어 주세요.", 5000); goStep(3); autosave();
  } catch (e) { busy(); toast("분석 실패: " + esc(e.message), 8000); }
}
/* AI가 쓴 문장은 이후 측정값 변경으로 덮어쓰지 않도록 표시 */
function markAllEdited() { const walk = (o, p) => { if (Array.isArray(o)) o.forEach((v, i) => walk(v, p + "." + i)); else if (o && typeof o === "object") Object.entries(o).forEach(([k, v]) => { if (!KEEP_KEYS.has(k)) walk(v, p + "." + k); }); else if (typeof o === "string") markEdited(p); }; walk(st.texts, "texts"); }

/* ---------- 수동 선택 → AI 자동 반영 ---------- */
const SCOPE_KEYS = { all: ["p2", "p3", "hair", "makeup", "makeupGuide", "glasses", "earrings"], ratios: ["p2", "p3", "makeup", "makeupGuide"], side: ["side"], hair: ["hair"], glasses: ["glasses"], earrings: ["earrings"], makeup: ["makeup", "makeupGuide"] };
let _rq = { scopes: new Set(), notes: [], t: null, running: false };
function lockSet() { return new Set(st.locked || []); }
function lock(p) { const s = lockSet(); s.add(p); st.locked = [...s]; }
function unlock(prefix) { st.locked = (st.locked || []).filter(p => !p.startsWith(prefix)); }
function markStale(kind, i) { const it = (kind === "hair" ? st.texts.hair : st.texts[kind]).items[i]; if (it && it.img) it.stale = true; }
/** 직접 입력(타이핑)은 잠금 → AI가 덮어쓰지 않음, 선택(셀렉트·슬라이더)은 AI 반영 대상 */
function onManualChange(el) {
  const p = el.dataset.path; if (!p.startsWith("texts.") && !p.startsWith("side.")) return;
  if (el.tagName === "TEXTAREA" || el.type === "text") { lock(p); return; }
  const m = p.match(/^texts\.(glasses|earrings)\.(items\.(\d+)\.(shape|color|size)|scales\.(\d+))$/);
  if (m) {
    const k = m[1], ko = k === "glasses" ? "안경" : "귀걸이";
    if (m[3] != null) { markStale(k, +m[3]); const prefix = `texts.${k}.items.${m[3]}`; unlock(prefix); ["shape", "color", "size"].forEach(f => lock(`${prefix}.${f}`)); const label = m[4] === "size" ? "크기" : m[4] === "shape" ? "모양" : "컬러"; const value = m[4] === "size" ? el.value : el.options[el.selectedIndex].text; queueRefresh([k], `${ko} 0${+m[3] + 1}의 ${label}을(를) '${value}'(으)로 직접 선택함 — 이름·설명·이미지 설명을 맞출 것`); }
    else { const axis = +m[5], L = (k === "glasses" ? GLASSES_SCALES : EARRING_SCALES)[axis], textPath = `texts.${k}.scaleText.${axis}`; const manualText = st.texts[k].manualScaleText?.[axis] || lockSet().has(textPath); if (manualText) lock(textPath); else unlock(textPath); queueRefresh([k], `${ko} DETAIL SCALE '${L[0]}'을(를) ${L[1]}(0)~${L[2]}(4) 중 ${el.value}(으)로 직접 조정함 — ${manualText ? "직접 작성한 설명은 유지할 것" : "해당 설명 문구를 맞출 것"}`, 1500); }
  }
}
function queueRefresh(scopes, note, delay = 1200) {
  if (st.settings.autoRefresh === false) { scopes.forEach(s => _rq.scopes.add(s)); _rq.notes.push(note); refreshBadge(); return; }
  scopes.forEach(s => _rq.scopes.add(s)); _rq.notes.push(note); refreshBadge("대기");
  clearTimeout(_rq.t); _rq.t = setTimeout(runRefresh, delay);
}
function refreshBadge(state) {
  let b = $("#rfBadge"); if (!b) return;
  const n = _rq.notes.length;
  b.style.display = state || n ? "" : "none";
  b.innerHTML = state === "대기" ? `✏️ 선택 변경 ${n}건 — 곧 AI가 반영합니다` : state === "run" ? "⏳ 선택 내용을 AI가 반영 중…" : state === "ok" ? "✓ 선택 내용 반영됨" : state === "err" ? "⚠ 반영 실패 — 눌러서 다시 시도" : n ? `✨ 선택 변경 ${n}건 → AI로 반영` : "";
  b.onclick = () => runRefresh();
  if (state === "ok") setTimeout(() => { if (!_rq.notes.length) b.style.display = "none"; }, 2500);
}
async function runRefresh() {
  if (_rq.running) { clearTimeout(_rq.t); _rq.t = setTimeout(runRefresh, 800); return; }
  if (!_rq.notes.length) return;
  const scopes = [..._rq.scopes], notes = _rq.notes.slice(); _rq.scopes.clear(); _rq.notes = []; _rq.running = true; refreshBadge("run");
  const keys = [...new Set(scopes.flatMap(s => SCOPE_KEYS[s] || []))];
  try {
    const m = roundRatios(effRatios(st));
    const j = await apiPost("/api/analyze", { task: "refresh", name: st.client.name, memo: st.client.memo, faceType: FACE_TYPES[st.type.key].ko, keys, notes,
      ratios: { aspect: fmtRatio("aspect", m), thirds: fmtRatio("thirds", m), eyes: fmtRatio("eyes", m), eyePos: fmtRatio("eyePos", m), nosePos: fmtRatio("nosePos", m), mouthPos: fmtRatio("mouthPos", m) },
      draft: { ...draftForAI(), makeupGuide: st.texts.makeupGuide || null } });
    applyRefresh(j, keys);
    refreshBadge("ok"); renderEditor(); renderPreview(); autosave();
  } catch (e) { scopes.forEach(s => _rq.scopes.add(s)); _rq.notes.unshift(...notes); refreshBadge("err"); toast("AI 반영 실패: " + esc(e.message), 6000); }
  _rq.running = false;
}
function applyRefresh(j, keys) {
  const locked = lockSet(); const saved = [...locked].map(p => [p, getPath(st, p)]);
  ["glasses", "earrings"].forEach(k => { if (st.texts[k]?.scales) saved.push([`texts.${k}.scales`, st.texts[k].scales.slice()]); });
  const part = {}; keys.forEach(k => { if (j[k] != null) part[k] = j[k]; });
  mergeAI(st, part);
  ["hair", "glasses", "earrings"].forEach(k => (part[k]?.items || []).forEach((x, i) => { const it = st.texts[k].items[i]; if (!it) return; ["prompt", "ref", "shape", "color"].forEach(f => { if (x[f] != null && x[f] !== "" && !locked.has(`texts.${k}.items.${i}.${f}`)) it[f] = x[f]; }); }));
  if (part.makeupGuide) st.texts.makeupGuide = part.makeupGuide;
  saved.forEach(([p, v]) => { if (v !== undefined) setPath(st, p, v); });
  ["glasses", "earrings"].forEach(k => { if (st.texts[k].scaleAuto) syncAccessoryScales(k); });
}

function syncAccessoryScales(kind) {
  const manualIndices = (st.edited || []).map(p => p.match(new RegExp(`^texts\\.${kind}\\.scales\\.(\\d+)$`))).filter(Boolean).map(m => +m[1]);
  const manualTextIndices = (st.locked || []).map(p => p.match(new RegExp(`^texts\\.${kind}\\.scaleText\\.(\\d+)$`))).filter(Boolean).map(m => +m[1]);
  const section = st.texts[kind]; section.scaleAuto = true;
  AccessoryScales.recompute(kind, section, FACE_TYPES[st.type.key][kind], { manualIndices, manualTextIndices });
  section.scales.forEach((value, i) => { const el = $(`[data-path="texts.${kind}.scales.${i}"]`); if (el) el.value = value; });
  section.scaleText.forEach((value, i) => { const el = $(`[data-path="texts.${kind}.scaleText.${i}"]`); if (el) el.value = value; });
}

/* ---------- 2. 정면 측정 ---------- */
let activeLine = null, showLm = false;
const METRIC_ROWS = [
  ["aspect", "얼굴 종횡비", "1 : 1.43", "aspect"], ["thirds", "상 : 중 : 하", "1 : 1 : 1", "thirdsM"], ["eyes", "눈 너비", "1 : 1 : 1", "eyeGap"],
  ["eyePos", "눈 위치", "1 : 1", "eyePos"], ["nosePos", "코 위치", "1 : 1", "nosePos"], ["mouthPos", "입 위치", "1 : 2", "mouthPos"],
];
function viewFront() {
  if (!st.photos.front) return `<h2>2. 정면 기준선</h2><div class="card">먼저 1단계에서 정면 사진을 넣어 주세요.</div>`;
  const W = st.front.w, H = st.front.h;
  return `<h2>2. 정면 기준선</h2><p class="lead">2·3쪽 사진 위에 그려지는 선입니다(비율 숫자는 1단계 입력값을 씁니다). 어긋난 선만 끌어서 맞추세요. 선을 클릭한 뒤 키보드 ↑↓←→로 1px씩(Shift: 5px) 미세 조정할 수 있습니다. 숫자는 실시간으로 바뀝니다.</p>
  <div class="medit"><div><div class="svgwrap"><svg id="fsvg" viewBox="0 0 ${W} ${H}"></svg></div>
    <div class="legend">${[...H_LINES, ...V_LINES].map(([k, n, c]) => `<span data-k="${k}"><i style="background:${c}"></i>${n}</span>`).join("")}</div>
    <div class="row" style="margin-top:8px"><label class="mut"><input type="checkbox" id="lmToggle" ${showLm ? "checked" : ""}> 인식된 얼굴 점 보기</label>
    <button class="btn sm" id="resetLines" ${st.front.pts ? "" : "disabled"}>자동 측정값으로 되돌리기</button>
    <label class="mut">수동 회전 <input type="number" id="rotIn" step="0.5" value="${(st.front.rot || 0).toFixed(1)}" style="width:70px">°</label><button class="btn sm" id="rotApply">회전 적용</button></div></div>
  <div><div class="card"><h3>측정 결과</h3><table class="mtable"><tr><th>항목</th><th>측정</th><th>기준</th><th title="수동으로 잰 값이 있으면 입력 → 보정 데이터로 저장">수동값</th></tr>
    ${METRIC_ROWS.map(([k, n, s]) => `<tr><td>${n}</td><td class="v" id="mv_${k}"></td><td class="mut">${s}</td><td><input type="text" data-man="${k}" value="${esc(st.manual[k] || "")}" placeholder="-"></td></tr>`).join("")}</table>
    <label class="mut" style="display:block;margin-top:8px"><input type="checkbox" id="useManual" ${st.useManual ? "checked" : ""}> 수동값을 입력한 항목은 보고서에 수동값으로 표기</label>
    <div id="mdesc" class="mut" style="margin-top:8px;line-height:1.6"></div>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="saveCalib">수동값을 보정 데이터로 저장</button><span class="mut" id="calibInfo"></span></div></div>
  <div class="card"><h3>보고서 사진 구도 <span class="tag">2·3쪽</span></h3>
    <label class="f">확대</label><input type="range" min="0.6" max="1.8" step="0.02" data-path="front.frame.zoom" value="${st.front.frame.zoom}">
    <label class="f">좌우 이동</label><input type="range" min="-0.5" max="0.5" step="0.01" data-path="front.frame.dx" value="${st.front.frame.dx}">
    <label class="f">상하 이동</label><input type="range" min="-0.5" max="0.5" step="0.01" data-path="front.frame.dy" value="${st.front.frame.dy}">
    <div class="row" style="margin-top:8px"><label class="mut"><input type="checkbox" data-path="settings.overlay.p3FaceEdges" ${st.settings.overlay.p3FaceEdges ? "checked" : ""}> 얼굴 외곽 세로선</label>
    <label class="mut"><input type="checkbox" data-path="settings.overlay.p3EyeLines" ${st.settings.overlay.p3EyeLines ? "checked" : ""}> 눈 안쪽 세로선</label>
    <label class="mut"><input type="checkbox" data-path="settings.overlay.p3EyeOuter" ${st.settings.overlay.p3EyeOuter ? "checked" : ""}> 눈 바깥 세로선</label></div></div></div></div>`;
}
function drawFrontSVG() {
  const svg = $("#fsvg"); if (!svg) return;
  const W = st.front.w, H = st.front.h, sw = Math.max(W, H) / 400;
  const { h, v } = st.front.lines;
  let s = `<image href="${BlobCache.get(st.photos.front)}" width="${W}" height="${H}"/>`;
  if (showLm && st.front.pts) s += `<g fill="#0f0" opacity=".7">${st.front.pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="${sw * 0.6}"/>`).join("")}</g>`;
  H_LINES.forEach(([k, n, c]) => { s += `<g class="lgrp ${activeLine === k ? "act" : ""}" data-k="${k}" data-t="h"><line class="hit" x1="0" x2="${W}" y1="${h[k]}" y2="${h[k]}" stroke-width="${sw * 8}"/><line class="vis" x1="0" x2="${W}" y1="${h[k]}" y2="${h[k]}" stroke="${c}" stroke-width="${sw * 1.1}"/><text x="${sw * 4}" y="${h[k] - sw * 2}" fill="${c}" font-size="${sw * 9}" stroke-width="${sw * 1.4}">${n}</text></g>`; });
  V_LINES.forEach(([k, n, c], i) => { s += `<g class="lgrp v ${activeLine === k ? "act" : ""}" data-k="${k}" data-t="v"><line class="hit" y1="0" y2="${H}" x1="${v[k]}" x2="${v[k]}" stroke-width="${sw * 8}"/><line class="vis" y1="0" y2="${H}" x1="${v[k]}" x2="${v[k]}" stroke="${c}" stroke-width="${sw * 1.1}" stroke-dasharray="${sw * 5} ${sw * 3}"/><text x="${v[k] + sw * 2}" y="${H - sw * (6 + (i % 3) * 11)}" fill="${c}" font-size="${sw * 8}" stroke-width="${sw * 1.4}">${n}</text></g>`; });
  svg.innerHTML = s;
}
function updateMetricTable() {
  const m = roundRatios(st.front.ratios), raw = st.front.raw ? roundRatios(st.front.raw) : m;
  METRIC_ROWS.forEach(([k]) => { const el = $("#mv_" + k); if (el) el.innerHTML = fmtRatio(k, m) + (JSON.stringify(m[k]) !== JSON.stringify(raw[k]) ? `<div class="mut">보정 전 ${fmtRatio(k, raw)}</div>` : ""); });
  const d = $("#mdesc"); if (d) { const t = generateTexts(st).p3.desc; d.innerHTML = METRIC_ROWS.map(([k, n]) => `<b>${n}</b> · ${esc(t[k])}`).join("<br>"); }
  const ci = $("#calibInfo"); if (ci) ci.textContent = `저장된 보정 데이터 ${getCalibSamples().length}건`;
}
function svgPoint(svg, e) { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); }
let _regenT = null;
function onLinesChanged() {
  updateRatios(); updateMetricTable(); markEdited("front.lines");
  clearTimeout(_regenT); _regenT = setTimeout(() => { regenerate(false); schedulePreview(); autosave(); }, 250);
}
POST[2] = E => {
  if (!st.photos.front) return;
  updateRatios(); drawFrontSVG(); updateMetricTable();
  const svg = $("#fsvg");
  let drag = null;
  svg.addEventListener("pointerdown", e => {
    const g = e.target.closest(".lgrp"); if (!g) return;
    drag = { k: g.dataset.k, t: g.dataset.t }; activeLine = drag.k; svg.setPointerCapture(e.pointerId);
    $$(".lgrp", svg).forEach(x => x.classList.toggle("act", x.dataset.k === activeLine)); e.preventDefault();
  });
  svg.addEventListener("pointermove", e => {
    if (!drag) return; const p = svgPoint(svg, e);
    if (drag.t === "h") st.front.lines.h[drag.k] = Math.max(0, Math.min(st.front.h, p.y)); else st.front.lines.v[drag.k] = Math.max(0, Math.min(st.front.w, p.x));
    moveLine(drag.k, drag.t); onLinesChanged();
  });
  svg.addEventListener("pointerup", () => { drag = null; });
  $("#lmToggle").onchange = e => { showLm = e.target.checked; drawFrontSVG(); };
  $$(".legend span", E).forEach(s => s.onclick = () => { activeLine = s.dataset.k; drawFrontSVG(); });
  const rl = $("#resetLines"); rl.onclick = async () => { const hy = await estimateHairline(st.photos.front, st.front.pts); st.front.lines = linesFromLandmarks(st.front.pts, hy); st.edited = st.edited.filter(p => p !== "front.lines"); updateRatios(); drawFrontSVG(); updateMetricTable(); regenerate(false); schedulePreview(); };
  $("#rotApply").onclick = async () => {
    const deg = +$("#rotIn").value || 0; st.photos.front = await rotateDataURL(st.photos.frontOrig, deg); st.front.rot = deg;
    const im = await loadImage(st.photos.front); st.front.w = im.width; st.front.h = im.height;
    try { const d = await detectLandmarks(st.photos.front); if (d) { st.front.pts = d.pts; st.front.lines = linesFromLandmarks(d.pts, await estimateHairline(st.photos.front, d.pts)); } else st.front.lines = defaultLines(im.width, im.height); }
    catch (e) { st.front.pts = null; st.front.lines = defaultLines(im.width, im.height); }
    updateRatios(); renderEditor(); regenerate(false); renderPreview();
  };
  $$("[data-man]", E).forEach(inp => inp.oninput = () => { st.manual[inp.dataset.man] = inp.value; if (st.useManual) { regenerate(false); schedulePreview(); autosave(); } });
  $("#useManual").onchange = e => { st.useManual = e.target.checked; regenerate(false); schedulePreview(); autosave(); };
  $("#saveCalib").onclick = () => { const n = addCalibSample(); toast(n ? `보정 데이터 ${n}개 항목을 저장했어요. 설정 > 측정 보정에서 계수를 다시 계산할 수 있습니다.` : "수동값을 입력해 주세요 (예: 1:1.38, 1:1.0:1.1)"); updateMetricTable(); };
};
function moveLine(k, t) {
  const g = $(`.lgrp[data-k="${k}"]`); if (!g) return; const val = st.front.lines[t][k];
  $$("line", g).forEach(l => { if (t === "h") { l.setAttribute("y1", val); l.setAttribute("y2", val); } else { l.setAttribute("x1", val); l.setAttribute("x2", val); } });
  const tx = $("text", g); if (t === "h") tx.setAttribute("y", val - Math.max(st.front.w, st.front.h) / 200); else tx.setAttribute("x", val + Math.max(st.front.w, st.front.h) / 200);
}
document.addEventListener("keydown", e => {
  if (st?.step !== 2 || !activeLine || ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
  const t = H_LINES.some(x => x[0] === activeLine) ? "h" : "v"; const d = e.shiftKey ? 5 : 1;
  const map = { ArrowUp: t === "h" ? -d : 0, ArrowDown: t === "h" ? d : 0, ArrowLeft: t === "v" ? -d : 0, ArrowRight: t === "v" ? d : 0 };
  if (!(e.key in map) || !map[e.key]) return; e.preventDefault();
  st.front.lines[t][activeLine] += map[e.key]; moveLine(activeLine, t); onLinesChanged();
});

/* ---- 측정 보정 데이터 ---- */
function parseRatioText(s) { const n = String(s).split(/[:：]/).map(x => parseFloat(x.trim())).filter(x => !isNaN(x)); return n.length ? n : null; }
function getCalibSamples() { try { return JSON.parse(localStorage.getItem("lovive_calib") || "[]"); } catch (e) { return []; } }
function addCalibSample() {
  const raw = st.front.raw; if (!raw) return 0; const smp = { date: today(), name: st.client.name };
  let n = 0;
  for (const [k] of METRIC_ROWS) {
    const v = parseRatioText(st.manual[k] || ""); if (!v) continue;
    if (k === "thirds" && v.length >= 3) { smp.thirdsM = [raw.thirds[1], v[1]]; smp.thirdsL = [raw.thirds[2], v[2]]; n++; }
    else if (k === "eyes" && v.length >= 3) { smp.eyeGap = [raw.eyes[1], v[1]]; smp.eyeR = [raw.eyes[2], v[2]]; n++; }
    else if (v.length >= 2) { smp[k] = [raw[k], v[v.length - 1]]; n++; }
  }
  if (n) { const all = getCalibSamples(); all.push(smp); localStorage.setItem("lovive_calib", JSON.stringify(all)); }
  return n;
}
function fitCalibration() {
  const all = [...BUILTIN_CALIB, ...getCalibSamples()]; const out = {}; const rep = [];
  for (const k of Object.keys(DEFAULT_SETTINGS.calib)) {
    const d = all.map(s => s[k]).filter(Boolean); if (!d.length) continue;
    const xs = d.map(p => p[0]), ys = d.map(p => p[1]); const n = d.length;
    const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    const diffs = ys.map((y, i) => y - xs[i]).sort((p, q) => p - q); let a = 1, b = diffs[Math.floor(n / 2)];
    if (n >= 30) { const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0), sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0); if (sxx > 1e-6) { a = Math.max(0.3, Math.min(1.7, sxy / sxx)); b = my - a * mx; } }
    out[k] = [+a.toFixed(3), +b.toFixed(3)]; rep.push(`${k}: n=${n}, a=${a.toFixed(2)}, b=${b.toFixed(3)}`);
  }
  return { calib: out, rep };
}

/* ---------- 3. 얼굴형·요약 ---------- */
function viewSummary() {
  const sc = st.type.scores || {}; const w = st.type.widths;
  return `<h2>3. 얼굴형·요약 문장</h2><p class="lead">자동 판정된 얼굴형을 확인하고, 2쪽(페이스 밸런스)·3쪽(정면 해석) 문장을 다듬습니다. 얼굴형을 바꾸면 헤어·메이크업·액세서리 추천도 함께 바뀝니다.</p>
  <div class="card"><h3>얼굴형 ${st.type.auto ? `<span class="tag">자동 제안(참고용): ${FACE_TYPES[st.type.auto].ko}</span>` : ""}</h3><p class="mut" style="margin:-4px 0 8px">윤곽의 곡선·각·광대 돌출은 사진 비율만으로 판단하기 어려워, 최종 얼굴형은 직접 골라 주세요. 고르면 문장 전체가 그 얼굴형 기준으로 바뀝니다.</p>
  <div class="chips" id="typeChips">${FACE_TYPE_KEYS.map(k => `<button data-k="${k}" class="${st.type.key === k ? "on" : ""}">${FACE_TYPES[k].ko}</button>`).join("")}</div>
  ${w ? `<div class="mut" style="margin-top:8px">판정 근거 · 종횡비 1:${r2(st.front.ratios.aspect)} · 이마/광대 ${w.fore.toFixed(2)} · 턱/광대 ${w.jaw.toFixed(2)} · 턱끝/광대 ${w.chin.toFixed(2)}</div>` : ""}
  <div class="row" style="margin-top:10px"><button class="btn sm" id="regenAll">이 얼굴형 기준으로 모든 문장 다시 만들기</button><span class="mut">직접 고친 문장도 덮어씁니다</span></div></div>
  <div class="card"><h3>2쪽 · 페이스 밸런스</h3><div class="grid2">
    <div>${field("texts.p2.chip1", "얼굴형 라벨 (예: LONG HEART SHAPE : 긴 하트형)", { input: true })}${field("texts.p2.desc1", "요약 2줄")}</div><div></div>
    ${(st.texts.p2.details || []).map((d, i) => `<div>${field(`texts.p2.details.${i}.part`, "부위 " + (i + 1), { input: true })}${field(`texts.p2.details.${i}.text`, "")}</div>`).join("")}</div>
    ${field("texts.p2.keyTitle", "STYLE KEY 제목", { input: true })}${field("texts.p2.keyText", "STYLE KEY 본문")}</div>
  <div class="card"><h3>3쪽 · 정면 비율 카드 설명</h3><div class="grid2">
    ${METRIC_ROWS.map(([k, n]) => `<div>${field("texts.p3.desc." + k, n + " — " + fmtRatio(k, roundRatios(effRatios(st))), { input: true })}</div>`).join("")}</div>
    ${field("texts.p3.title", "정면 해석 제목", { input: true })}${field("texts.p3.text", "정면 해석 본문")}</div>`;
}
POST[3] = E => {
  $$("#typeChips button", E).forEach(b => b.onclick = () => {
    if (b.dataset.k === st.type.key) return;
    if (st.edited.some(p => p.startsWith("texts.")) && !confirm("얼굴형을 바꾸면 직접 고친 문장도 새 얼굴형 기준으로 다시 만들어집니다. 계속할까요? (사진·업로드 이미지는 유지)")) return;
    st.type.key = b.dataset.k; markEdited("type.key"); if (st.analyzed) queueRefresh(["all"], `얼굴형을 '${FACE_TYPES[b.dataset.k].ko}'(으)로 직접 선택함`);
    st.edited = st.edited.filter(p => !p.startsWith("texts.")); regenerate(true); renderEditor(); renderPreview(); autosave();
    toast(`${FACE_TYPES[st.type.key].ko} 기준으로 문장을 새로 만들었어요.`);
  });
  $("#regenAll", E).onclick = () => { if (!confirm("직접 고친 문장을 포함해 모든 문장을 다시 만들까요? (사진·업로드 이미지는 유지)")) return; st.edited = st.edited.filter(p => !p.startsWith("texts.")); regenerate(true); renderEditor(); renderPreview(); };
};

/* ---------- 4. 측면 ---------- */
let sideActive = 0;
function viewSide() {
  const S = st.side;
  return `<h2>4. 측면 분석</h2><p class="lead">사진에서 ① 코끝 ② 입술 ③ 턱끝을 차례로 클릭하세요 (점은 끌어서 옮길 수 있어요). 4개 축은 선택지에서 고르고 문장을 다듬으면 됩니다.</p>
  ${S.src ? `<div class="medit"><div><div class="svgwrap pick"><svg id="ssvg" viewBox="0 0 ${S.w} ${S.h}"></svg></div>
    <div class="chips" style="margin-top:8px" id="sideBtns">${["① 코끝", "② 입술", "③ 턱끝"].map((t, i) => `<button data-i="${i}" class="${sideActive === i ? "on" : ""}">${t}${S.pts[i] ? " ✓" : ""}</button>`).join("")}<button id="sideClear">점 지우기</button></div></div>
    <div class="card"><h3>보고서 사진 구도 <span class="tag">4쪽</span></h3><label class="f">확대</label><input type="range" min="0.8" max="3" step="0.02" data-path="side.frame.zoom" value="${S.frame.zoom}">
    <label class="f">좌우 이동</label><input type="range" min="-0.5" max="0.5" step="0.01" data-path="side.frame.dx" value="${S.frame.dx}"><label class="f">상하 이동</label><input type="range" min="-0.5" max="0.5" step="0.01" data-path="side.frame.dy" value="${S.frame.dy}"></div></div>`
    : `<div class="card">1단계에서 측면 사진을 넣으면 점 찍기를 할 수 있어요. 사진 없이 문장만 작성해도 됩니다.</div>`}
  <div class="card"><h3>PROFILE 4 AXES</h3>${SIDE_AXES.map((a, i) => `<label class="f">${i + 1}. ${a.title}</label><select data-axis="${i}">${a.options.map((o, j) => `<option value="${j}" ${S.sel[i] === j ? "selected" : ""}>${esc(o.t.replace(/\n/g, " ").slice(0, 48))}…</option>`).join("")}</select>${field(`side.axes.${i}.text`, "")}`).join("")}</div>
  <div class="card"><h3>측면 해석</h3><button class="btn sm" id="sideRegen">선택지 기준으로 해석 다시 만들기</button>${field("side.title", "제목", { input: true })}${field("side.text", "본문")}</div>`;
}
function drawSideSVG() {
  const svg = $("#ssvg"); if (!svg) return; const S = st.side; const r = Math.max(S.w, S.h) / 120;
  svg.innerHTML = `<image href="${BlobCache.get(S.src)}" width="${S.w}" height="${S.h}"/>${overlaySide(st)}` +
    S.pts.map((p, i) => p ? `<circle class="spt" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${PINK}" fill-opacity=".5" stroke="#fff" stroke-width="${r / 4}" style="cursor:move"/>` : "").join("");
}
POST[4] = E => {
  $$("[data-axis]", E).forEach(s => s.onchange = () => { const i = +s.dataset.axis; st.side.sel[i] = +s.value; st.side.axes[i].text = SIDE_AXES[i].options[+s.value].t; const g = generateSide(st.side.sel); st.side.title = g.title; st.side.text = g.text; if (st.analyzed) queueRefresh(["side"], `측면 '${SIDE_AXES[i].title}'을(를) '${SIDE_AXES[i].options[+s.value].t.replace(/\n/g, " ")}'(으)로 직접 선택함`); renderEditor(); schedulePreview(); autosave(); });
  $("#sideRegen", E).onclick = () => { Object.assign(st.side, generateSide(st.side.sel)); renderEditor(); schedulePreview(); };
  if (!st.side.src) return;
  drawSideSVG(); const svg = $("#ssvg"); let drag = null;
  svg.addEventListener("pointerdown", e => {
    const c = e.target.closest(".spt"); const p = svgPoint(svg, e);
    if (c) { drag = +c.dataset.i; svg.setPointerCapture(e.pointerId); return; }
    st.side.pts[sideActive] = [p.x, p.y]; sideActive = Math.min(2, sideActive + 1); drawSideSVG(); schedulePreview(); autosave();
    $$("#sideBtns button[data-i]").forEach(b => { const i = +b.dataset.i; b.classList.toggle("on", i === sideActive); b.textContent = ["① 코끝", "② 입술", "③ 턱끝"][i] + (st.side.pts[i] ? " ✓" : ""); });
  });
  svg.addEventListener("pointermove", e => { if (drag == null) return; const p = svgPoint(svg, e); st.side.pts[drag] = [p.x, p.y]; drawSideSVG(); schedulePreview(150); });
  svg.addEventListener("pointerup", () => { if (drag != null) autosave(); drag = null; });
  $$("#sideBtns button[data-i]").forEach(b => b.onclick = () => { sideActive = +b.dataset.i; $$("#sideBtns button[data-i]").forEach(x => x.classList.toggle("on", x === b)); });
  $("#sideClear").onclick = () => { st.side.pts = [null, null, null]; sideActive = 0; renderEditor(); schedulePreview(); };
};

/* ---------- 이미지 슬롯 공통 ---------- */
function imgSlot(path, label) {
  const v = getPath(st, path);
  return `<div class="row" style="margin-top:6px"><label class="btn sm">${label}<input type="file" accept="image/*" data-img="${path}" style="display:none"></label>${v ? `<span class="mut">✓ 업로드됨</span><button class="btn sm ghost" data-imgdel="${path}">삭제</button>` : ""}</div>`;
}
function bindImgSlots(E) {
  $$("[data-img]", E).forEach(inp => inp.onchange = async () => {
    if (!inp.files[0]) return;
    const targetState = st, path = inp.dataset.img, kind = path.split(".")[1], sourceKey = ImageSource.sourceKey(targetState, kind);
    const image = await fileToDataURL(inp.files[0], 1400); if (st !== targetState) return;
    setPath(st, path, image);
    if (path.endsWith(".img")) { const item = getPath(st, path.slice(0, -4)); item.imgSourceKey = sourceKey; item.stale = false; item.useUpload = true; }
    else if (path === "texts.makeup.fullImage") st.texts.makeup.fullImageSourceKey = sourceKey;
    renderEditor(); renderPreview(); renderNav(); autosave();
  });
  $$("[data-imgdel]", E).forEach(b => b.onclick = () => { const path = b.dataset.imgdel; setPath(st, path, null); if (path.endsWith(".img")) { const item = getPath(st, path.slice(0, -4)); item.useUpload = false; delete item.imgSourceKey; } else if (path === "texts.makeup.fullImage") delete st.texts.makeup.fullImageSourceKey; renderEditor(); renderPreview(); autosave(); });
  $$("[data-prompt]", E).forEach(b => b.onclick = () => { const [kind, i] = b.dataset.prompt.split(":"); const item = kind === "hair" ? st.texts.hair.items[i] : kind === "glasses" ? st.texts.glasses.items[i] : st.texts.earrings.items[i]; copyText(imgPromptFor(kind, st, item)); toast("이미지 생성 프롬프트를 복사했어요. ChatGPT·Gemini 등에 고객 사진과 함께 붙여넣으세요."); });
}

/* ---------- AI 이미지 생성 블록 ---------- */
function aiBlock(kind, i) {
  const item = (kind === "hair" ? st.texts.hair : st.texts[kind]).items[i]; const cands = item.cands || [];
  return `<div class="aiblk">${item.stale && item.img ? `<div class="status err" style="margin:0 0 6px">선택이 바뀌었어요 — 이미지를 다시 생성하는 것을 권장합니다</div>` : ""}${field(`texts.${kind === "hair" ? "hair" : kind}.items.${i}.prompt`, "이미지 생성 설명 (AI가 작성, 수정 가능)", { rows: 2 })}${genButtons(`data-ai="${kind}:${i}"`, ImageSource.isCurrentImage(st, kind, item) && item.imgQ === "low", kind === "earrings" ? "pt" : "sq")}
    ${cands.length ? `<div class="thumbs" style="margin-top:8px">${cands.map((c, j) => `<div class="th"><div style="border:2px solid ${item.img === c ? "var(--br)" : "transparent"};position:relative"><img src="${BlobCache.get(c)}" data-pick="${kind}:${i}:${j}" style="cursor:pointer">${qTag((item.candQ || [])[j])}</div><button class="btn sm ghost" data-candel="${kind}:${i}:${j}">삭제</button></div>`).join("")}</div><div class="mut">썸네일을 클릭하면 보고서에 사용됩니다.</div>` : ""}</div>`;
}
let _aiConsent = false;
/* 비용(원, 대략): gpt-image-1.5 저품질/중간 — 정사각 / 세로 */
const PRICE_KRW = { sq: { low: 13, medium: 48 }, pt: { low: 18, medium: 70 } };
const qTag = q => q === "low" ? `<span style="position:absolute;left:3px;top:3px;background:#fff3bf;color:#7a5a00;font-size:10px;padding:1px 5px;border-radius:6px">시안</span>` : q ? `<span style="position:absolute;left:3px;top:3px;background:#e6fcf5;color:#087f5b;font-size:10px;padding:1px 5px;border-radius:6px">확정</span>` : "";
function genButtons(attr, canUpgrade, sz = "pt", n = 1) {
  const P = PRICE_KRW[sz];
  return `<div class="row" style="margin-top:6px;flex-wrap:wrap;gap:6px"><button class="btn sm" ${attr} data-mode="draft">🧪 시안 (저품질 · 약 ${P.low * n}원)</button><button class="btn sm pri" ${attr} data-mode="final">✨ 확정 (중간 품질 · 약 ${P.medium * n}원)</button>${canUpgrade ? `<button class="btn sm pri" ${attr} data-mode="upgrade">⬆ 고른 시안을 그대로 확정 (약 ${P.medium * n}원)</button>` : ""}</div><div class="mut">시안으로 여러 번 뽑아 보고, 마음에 드는 것을 골라 '그대로 확정'하면 비용이 가장 적게 듭니다.</div>`;
}
async function runAI(kind, i, btn, mode = "final") {
  if (!_aiConsent) { if (!confirm("고객 사진이 OpenAI(GPT 이미지)로 전송됩니다.\n고객에게 동의를 받으셨나요?")) return; _aiConsent = true; }
  const items = (kind === "hair" ? st.texts.hair : st.texts[kind]).items; const item = items[i];
  ImageSource.stampLegacySources(st);
  const base = mode === "upgrade" && ImageSource.isCurrentImage(st, kind, item) && item.imgQ === "low" ? item.img : null;
  if (mode === "upgrade" && !base) mode = "final";
  if (btn) { btn.disabled = true; btn.textContent = "생성 중… (20~60초)"; }
  const targetState = st, previousImage = item.img, requestedSource = ImageSource.sourceKey(st, kind);
  const designSignature = () => JSON.stringify({
    prompt: imgPromptFor(kind, targetState, item), ref: item.ref || "",
    source: kind === "earrings" ? targetState.ear.src || targetState.side.src : targetState.photos.frontOrig || targetState.photos.front,
    ear: kind === "earrings" ? { lobe: targetState.ear.lobe, sidePoint: targetState.side.earPt, zoom: targetState.ear.zoom, width: targetState.ear.w, height: targetState.ear.h } : null,
  });
  activeAIRequests++;
  try {
    const requestedDesign = designSignature();
    const r = await generateAIImage(kind, targetState, item, { mode: mode === "draft" ? "draft" : "final", base }); const img = await shrinkDataURL(r.image, 1100);
    if (st !== targetState || targetState.texts[kind].items[i] !== item) return;
    const changed = requestedSource !== ImageSource.sourceKey(targetState, kind) || requestedDesign !== designSignature() || item.img !== previousImage;
    const cq = (item.candQ || []).slice(-(item.cands || []).length); item.cands = [...(item.cands || []), img]; item.candQ = [...cq, r.quality]; item.candSources = [...(item.candSources || []), requestedSource];
    if (item.cands.length > 6) { item.cands = item.cands.slice(-6); item.candQ = item.candQ.slice(-6); item.candSources = item.candSources.slice(-6); }
    if (changed) { item.stale = true; toast("선택이 바뀌어 생성 결과는 후보에 보관했어요. 현재 사진은 유지합니다.", 5000); }
    else { item.stale = false; item.img = img; item.imgQ = r.quality; item.imgSourceKey = requestedSource; if (kind !== "hair") item.useUpload = true; }
    autosave(); renderPreview(); renderNav();
  } catch (e) { console.error(e); toast("AI 생성 실패: " + esc(e.message), 6000); }
  finally { activeAIRequests--; }
  if (st.step === (kind === "hair" ? 5 : kind === "glasses" ? 7 : 8)) renderEditor();
}
function bindAI(E) {
  $$("[data-ai]", E).forEach(b => b.onclick = () => { const [k, i] = b.dataset.ai.split(":"); runAI(k, +i, b, b.dataset.mode || "final"); });
  $$("[data-aiall]", E).forEach(b => b.onclick = async () => { const k = b.dataset.aiall, m = b.dataset.mode || "final"; b.disabled = true; b.textContent = "3개 생성 중…"; await Promise.all([0, 1, 2].map(i => runAI(k, i, null, m === "final" ? "upgrade" : m))); });
  $$("[data-pick]", E).forEach(im => im.onclick = () => { const [k, i, j] = im.dataset.pick.split(":"); const it = (k === "hair" ? st.texts.hair : st.texts[k]).items[+i]; const sourceKey = it.candSources?.[+j]; if (!ImageSource.matches(st, k, sourceKey)) { toast("이전 고객 사진으로 만든 후보예요. 현재 사진으로 다시 생성해 주세요.", 5000); return; } it.img = it.cands[+j]; it.imgQ = (it.candQ || [])[+j] || "medium"; it.imgSourceKey = sourceKey || ImageSource.sourceKey(st, k); it.stale = false; if (k !== "hair") it.useUpload = true; renderEditor(); renderPreview(); autosave(); });
  $$("[data-candel]", E).forEach(b => b.onclick = () => { const [k, i, j] = b.dataset.candel.split(":"); const it = (k === "hair" ? st.texts.hair : st.texts[k]).items[+i]; const c = it.cands[+j]; it.cands.splice(+j, 1); if (it.candQ) it.candQ.splice(+j, 1); if (it.candSources) it.candSources.splice(+j, 1); if (it.img === c) { it.img = null; delete it.imgSourceKey; if (k !== "hair") it.useUpload = false; } renderEditor(); renderPreview(); autosave(); });
}

/* ---------- 5. 헤어 ---------- */
function viewHair() {
  const t = st.texts.hair; const lib = FACE_TYPES[st.type.key].hair.items;
  const others = FACE_TYPE_KEYS.filter(k => k !== st.type.key).flatMap(k => FACE_TYPES[k].hair.items.map(x => ({ ...x, from: FACE_TYPES[k].ko })));
  return `<h2>5. 헤어 BEST 3</h2><p class="lead">고객 원본 얼굴은 유지하고 헤어스타일만 바꿉니다. 사진(${HAIR_LIB.length}장)에서 스타일을 고른 뒤 '시안' 또는 '확정'을 누르세요. 참고 사진은 머리 모양에만 사용됩니다.</p>
  <div class="card">${field("texts.hair.keywords", "키워드 (굵은 글씨)", { input: true })}${field("texts.hair.desc", "설명 2줄")}<div class="row" style="margin-top:8px"><button class="btn sm" data-aiall="hair" data-mode="draft">🧪 헤어 3개 시안 (약 ${PRICE_KRW.sq.low * 3}원)</button><button class="btn sm pri" data-aiall="hair" data-mode="final">✨ 헤어 3개 확정 (약 ${PRICE_KRW.sq.medium * 3}원)</button></div><div class="mut">'확정'은 시안을 고른 칸은 그 시안을 그대로 고화질로, 나머지는 새로 만듭니다.</div></div>
  ${t.items.map((it, i) => `<div class="card"><h3>BEST 0${i + 1}</h3><button type="button" class="btn hair-choice-launch" data-hairphotos="${i}">${it.ref && /^h\d+$/.test(it.ref) ? `<img src="hair/${it.ref}.jpg" alt="선택한 헤어 참고 사진">` : ""}<span><b>추천 후보를 사진으로 고르기</b><br><span class="mut">${it.ref ? esc((HAIR_LIB.find(h => h.id === it.ref) || {}).name || "선택한 사진 변경") : "사진을 선택하면 이름·설명·참고 사진이 함께 바뀝니다."}</span></span></button><details><summary>이름으로 후보 고르기</summary><select data-hairpick="${i}"><option value="">— 추천 후보에서 고르기 —</option><optgroup label="${FACE_TYPES[st.type.key].ko} 추천">${lib.map((x, j) => `<option value="a${j}">${esc(x.name.replace(/\n/g, " "))}</option>`).join("")}</optgroup><optgroup label="다른 얼굴형 후보">${others.map((x, j) => `<option value="b${j}">${esc(x.name.replace(/\n/g, " "))} (${x.from})</option>`).join("")}</optgroup></select></details>
    <div class="grid2"><div>${field(`texts.hair.items.${i}.name`, "스타일 이름")}</div><div>${field(`texts.hair.items.${i}.desc`, "설명")}</div></div>
    <details ${it.ref && !it.photoChoice ? "open" : ""}><summary>참고 헤어 사진 ${it.ref ? "— " + esc((HAIR_LIB.find(h => h.id === it.ref) || {}).name || it.ref) : "(선택)"}</summary><div class="hgal">${HAIR_LIB.map(h => `<div data-href="${i}:${h.id}" class="${it.ref === h.id ? "on" : ""}"><img src="hair/${h.id}.jpg" loading="lazy"><span>${esc(h.name)}</span></div>`).join("")}</div>${it.ref ? `<button class="btn sm ghost" data-hrefclr="${i}">참고 사진 해제</button>` : ""}</details>
    ${aiBlock("hair", i)}
    <div class="row">${imgSlot(`texts.hair.items.${i}.img`, "직접 업로드")}<button class="btn sm" data-prompt="hair:${i}">프롬프트 복사(수동 생성용)</button></div></div>`).join("")}
  <div class="card"><h3>VOLUME MAP</h3><div class="grid2">${t.volume.map((v, i) => `<div>${field(`texts.hair.volume.${i}.zone`, `구역 ${i + 1}`, { input: true })}${field(`texts.hair.volume.${i}.text`, "")}</div>`).join("")}</div>
  ${field("texts.hair.avoid", "AVOID (한 줄에 하나)", { rows: 5 })}${field("texts.hair.basic", "BASIC STYLE", { input: true })}</div>`;
  POST[5].others = others;
}
POST[5] = E => {
  bindImgSlots(E); bindAI(E);
  const lib = FACE_TYPES[st.type.key].hair.items, others = POST[5].others || [];
  $$("[data-hairphotos]", E).forEach(b => b.onclick = () => openHairPhotoPicker(+b.dataset.hairphotos, b));
  $$("[data-href]", E).forEach(d => d.onclick = () => { const [i, id] = d.dataset.href.split(":"); selectHairPhoto(+i, id); });
  $$("[data-hrefclr]", E).forEach(b => b.onclick = () => { const it = st.texts.hair.items[+b.dataset.hrefclr]; it.ref = ""; if (it.photoChoice) it.prompt = ""; delete it.photoChoice; markStale("hair", +b.dataset.hrefclr); renderEditor(); renderPreview(); autosave(); });
  $$("[data-hairpick]", E).forEach(s => s.onchange = () => { if (!s.value) return; const i = +s.dataset.hairpick; const x = s.value[0] === "a" ? lib[+s.value.slice(1)] : others[+s.value.slice(1)];
    Object.assign(st.texts.hair.items[i], { name: x.name, desc: x.desc, ref: "", prompt: "" }); delete st.texts.hair.items[i].photoChoice; markEdited(`texts.hair.items.${i}.name`); markEdited(`texts.hair.items.${i}.desc`); unlock(`texts.hair.items.${i}`); markStale("hair", i); if (st.analyzed) queueRefresh(["hair"], `헤어 BEST ${i + 1}을(를) '${x.name.replace(/\n/g, " ")}'(으)로 직접 선택함 (이 항목의 설명·이미지 설명을 이 스타일에 맞게 다시 쓸 것)`); renderEditor(); schedulePreview(); autosave(); });
};

function selectHairPhoto(index, id) {
  const photo = HAIR_LIB.find(x => x.id === id); if (!photo) return;
  const it = st.texts.hair.items[index];
  Object.assign(it, HairPicker.choose(photo, st.type.key), { photoChoice: id });
  unlock(`texts.hair.items.${index}`);
  ["name", "desc", "ref", "prompt"].forEach(k => markEdited(`texts.hair.items.${index}.${k}`));
  ["name", "ref", "prompt"].forEach(k => lock(`texts.hair.items.${index}.${k}`));
  if (st.analyzed) queueRefresh(["hair"], `헤어 BEST ${index + 1}을(를) 사진 '${photo.name}'에서 직접 선택함. 참고 사진과 스타일 이름은 유지하고 고객의 얼굴형에 맞춰 설명을 반영할 것`);
  markStale("hair", index); renderEditor(); renderPreview(); autosave();
}
function openHairPhotoPicker(index, trigger) {
  const m = document.createElement("div"); m.className = "modal hair-picker-modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-labelledby", "hairPickerTitle");
  m.innerHTML = `<div class="box"><div class="hair-picker-heading"><h2 id="hairPickerTitle">BEST 0${index + 1} · 사진으로 헤어 고르기</h2><button class="btn" data-hair-close>닫기</button></div><p class="mut">선택한 사진의 스타일 이름·설명·이미지 생성용 참고 사진을 함께 반영합니다. 고객 착용 사진은 선택 후 GPT로 생성해 주세요.</p><div class="hair-picker-toolbar"><input type="search" aria-label="헤어 사진 검색" placeholder="스타일·기장 검색 (예: 단발, 롱, 빌드펌)"><div class="hair-picker-tabs"><button class="btn sm" data-photo-filter="all" aria-pressed="true">전체 사진</button><button class="btn sm" data-photo-filter="face" aria-pressed="false">현재 얼굴형 자료</button></div></div><div class="hair-picker-count" role="status"></div><div class="hair-picker-grid"></div></div>`;
  document.body.appendChild(m); let onlyFace = false;
  const close = () => { m.remove(); if (trigger?.isConnected) trigger.focus(); else $(`[data-hairphotos="${index}"]`)?.focus(); };
  const render = () => {
    const list = HairPicker.candidates(st.type.key, HAIR_LIB, { query: $("input[type=search]", m).value, recommendedOnly: onlyFace });
    $(".hair-picker-count", m).textContent = HAIR_LIB.length ? `${list.length}장 · ${HairPicker.faceName(st.type.key)} 자료를 먼저 표시합니다.` : "참고 사진 목록을 불러오지 못했습니다. 닫은 뒤 다시 시도해 주세요.";
    $(".hair-picker-grid", m).innerHTML = HairPicker.renderCards(list, { selectedId: st.texts.hair.items[index].ref, faceKey: st.type.key });
    $$("[data-hair-photo]", m).forEach(b => b.onclick = () => { selectHairPhoto(index, b.dataset.hairPhoto); close(); });
  };
  $("[data-hair-close]", m).onclick = close;
  $("input[type=search]", m).oninput = render;
  $$("[data-photo-filter]", m).forEach(b => b.onclick = () => { onlyFace = b.dataset.photoFilter === "face"; $$("[data-photo-filter]", m).forEach(x => x.setAttribute("aria-pressed", String(x === b))); render(); });
  m.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); close(); return; }
    if (e.key === "Tab") { const focusable = $$("button:not(:disabled),input:not(:disabled)", m); const first = focusable[0], last = focusable.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }
  });
  render(); $("input[type=search]", m).focus();
}

/* ---------- 6. 메이크업 ---------- */
async function runMakeupGuide(btn, mode) {
  if (!_aiConsent) { if (!confirm("고객 사진이 OpenAI(GPT 이미지)로 전송됩니다.\n고객에게 동의를 받으셨나요?")) return; _aiConsent = true; }
  ImageSource.stampLegacySources(st);
  const t = st.texts.makeup; const base = mode === "upgrade" && ImageSource.isCurrentMakeup(st) && t.guideQ === "low" ? t.guideImg : null;
  btn.disabled = true; btn.textContent = "생성 중… (30초~1분)";
  const targetState = st, requestedSource = ImageSource.sourceKey(st, "makeup"), previousImage = t.guideImg;
  const requestedDesign = makeupFacePrompt(targetState); activeAIRequests++;
  try {
    const r = await generateAIImage("makeup", targetState, null, { mode: mode === "draft" ? "draft" : "final", base });
    const img = await shrinkDataURL(r.image, 1536);
    let lm = null; try { lm = await detectLandmarks(img); } catch (e) { console.warn(e); }
    if (st !== targetState || targetState.texts.makeup !== t) return;
    t.guideCands = [...(t.guideCands || []), { img, lm, q: r.quality, sourceKey: requestedSource }].slice(-6);
    const changed = requestedSource !== ImageSource.sourceKey(targetState, "makeup") || requestedDesign !== makeupFacePrompt(targetState) || previousImage !== t.guideImg;
    if (changed) toast("사진이나 선택이 바뀌어 생성 결과는 후보에 보관했어요. 현재 사진은 유지합니다.", 5000);
    else {
      t.guideImg = img; t.guideLm = lm; t.guideQ = r.quality; t.guideSourceKey = requestedSource; t.mode = "guide";
      if (!lm) toast("생성된 사진에서 얼굴을 찾지 못했어요. 다시 생성해 주세요.", 6000);
    }
    autosave(); renderPreview();
  } catch (e) { toast("생성 실패: " + esc(e.message), 7000); }
  finally { activeAIRequests--; }
  if (st.step === 6) renderEditor();
}
function viewMakeup() {
  const t = st.texts.makeup;
  const G = st.texts.makeupGuide;
  const mode = t.mode || "guide";
  return `<h2>6. 맞춤 메이크업</h2><p class="lead">고객 원본 얼굴을 기준으로 메이크업만 적용합니다. 얼굴형·이목구비·헤어와 표정은 유지하고, 부위 사진·번호·설명은 10개 부위에 맞춰 표시합니다.</p>
  ${mode === "guide" ? `<div class="card"><h3>GPT 메이크업 사진 (글씨 없음)</h3>
    ${genButtons(`data-mkg="1"`, ImageSource.isCurrentMakeup(st) && t.guideQ === "low", "pt")}
    ${t.guideImg && !t.guideLm ? `<div class="status err" style="margin-top:6px">생성된 사진에서 얼굴 인식이 안 돼서 원본 사진으로 표시 중이에요. 다시 생성해 주세요.</div>` : ""}
    ${(t.guideCands || []).length ? `<div class="thumbs" style="margin-top:8px">${t.guideCands.map((c, j) => `<div class="th"><div style="border:2px solid ${t.guideImg === c.img ? "var(--br)" : "transparent"};height:130px;position:relative"><img src="${BlobCache.get(c.img)}" data-mkgpick="${j}" style="cursor:pointer;object-fit:contain">${qTag(c.q)}</div></div>`).join("")}</div><div class="mut">썸네일을 누르면 그 사진으로 6쪽이 바뀝니다.</div>` : `<p class="mut" style="margin-top:6px">생성 전에는 원본 정면 사진으로 미리 보여 드려요.</p>`}</div>` : ""}
  <div class="card"><h3>6쪽에 들어갈 글 (AI 분석)</h3>${G ? `<p class="mut">핵심 포인트 ${G.core?.length || 0}개 · 표시 부위 ${guideSections(st).length}개. 일부 설명이 빠져도 나머지 부위는 기본 문장으로 채웁니다.</p>` : `<p class="mut">1단계 AI 분석을 먼저 실행하면 더 정확한 내용으로 만들어집니다. 기본 문장으로도 10개 부위가 표시됩니다.</p>`}
    ${G ? `${field("texts.makeupGuide.intro", "부제")}${field("texts.makeupGuide.overall", "전체적인 인상과 메이크업 방향", { rows: 3 })}<details><summary>AI 작성 내용 보기·수정</summary>${(Array.isArray(G.sections) ? G.sections : []).map((s, i) => `${field(`texts.makeupGuide.sections.${i}.title`, `${i + 1}. 제목`, { input: true })}${field(`texts.makeupGuide.sections.${i}.sub`, "부제", { input: true })}`).join("")}</details>` : ""}
    ${mode === "image" ? `<div class="row" style="margin-top:8px"><button class="btn sm pri" id="mkGen">✨ GPT 포스터 한 장 생성 (글씨 포함 · 고품질 약 280원)</button>` : `<div class="row" style="display:none">`}${t.fullImage ? `<span class="mut">✓ 생성됨 — 다시 누르면 새로 만듭니다</span>` : ""}</div>
    ${mode === "image" && (t.cands || []).length ? `<div class="thumbs" style="margin-top:8px">${t.cands.map((c, j) => `<div class="th"><div style="border:2px solid ${t.fullImage === c ? "var(--br)" : "transparent"};height:120px"><img src="${BlobCache.get(c)}" data-mkpick="${j}" style="cursor:pointer;object-fit:contain"></div></div>`).join("")}</div>` : ""}</div>
  ${!st.front.pts ? `<div class="status err">자동 얼굴 인식이 안 된 상태라 부위 사진을 만들 수 없어요. 문장만 작성하거나 아래에서 이미지로 대체하세요.</div>` : ""}
  <div class="card"><h3>페이지 방식</h3><div class="row" style="flex-wrap:wrap"><label><input type="radio" name="mkmode" value="guide" ${mode === "guide" ? "checked" : ""}> GPT 그림 + 프로그램 글씨 (추천)</label><label><input type="radio" name="mkmode" value="image" ${mode === "image" ? "checked" : ""}> GPT 포스터 한 장 (또는 직접 업로드)</label><label><input type="radio" name="mkmode" value="template" ${mode === "template" ? "checked" : ""}> 자동 템플릿</label></div>
    ${mode === "image" ? imgSlot("texts.makeup.fullImage", "직접 만든 이미지 업로드") : ""}</div><h3 style="margin:16px 0 8px">자동 템플릿용 문장</h3>
  <div class="card"><h3>상단</h3>${field("texts.makeup.title", "제목", { input: true })}${field("texts.makeup.head", "헤드 문구")}${field("texts.makeup.intro", "소개 문장")}
    <details><summary>핵심 포인트 8개</summary><div class="grid2">${t.keyPoints.map((x, i) => field(`texts.makeup.keyPoints.${i}`, `${i + 1}`, { input: true })).join("")}</div></details></div>
  ${MAKEUP_ORDER.map((k, n) => { const s = t.sections[k]; const lib = MAKEUP_LIB[k];
    return `<div class="card"><h3>${n + 1}. ${lib.title}</h3><label class="f">스타일</label><select data-mkvar="${k}">${Object.entries(lib.variants).map(([vk, v]) => `<option value="${vk}" ${s.variant === vk ? "selected" : ""}>${esc(v.sub)}</option>`).join("")}</select>
      ${field(`texts.makeup.sections.${k}.sub`, "부제", { input: true })}
      <div class="grid3">${s.steps.map((x, i) => `<div>${field(`texts.makeup.sections.${k}.steps.${i}`, `단계 ${i + 1}`)}</div>`).join("")}</div>
      <label class="f">메이크업 포인트</label><div class="grid2">${s.points.map((x, i) => field(`texts.makeup.sections.${k}.points.${i}`, "", { input: true })).join("")}</div></div>`; }).join("")}`;
}
POST[6] = E => {
  const g = $("#mkGen", E); if (g) g.onclick = async () => { if (!_aiConsent) { if (!confirm("고객 사진이 OpenAI(GPT 이미지)로 전송됩니다.\n고객에게 동의를 받으셨나요?")) return; _aiConsent = true; }
    ImageSource.stampLegacySources(st);
    g.disabled = true; g.textContent = "생성 중… (1~2분)";
    const targetState = st, t = targetState.texts.makeup, requestedSource = ImageSource.sourceKey(st, "makeup"), requestedDesign = makeupPrompt(st), previousImage = t.fullImage;
    activeAIRequests++;
    try {
      const r = await generateAIImage("makeupPoster", targetState, null, { mode: "final" }); const img = await shrinkDataURL(r.image, 1600);
      if (st !== targetState || targetState.texts.makeup !== t) return;
      t.cands = [...(t.cands || []), img].slice(-4); t.candSources = [...(t.candSources || []), requestedSource].slice(-4);
      const changed = requestedSource !== ImageSource.sourceKey(targetState, "makeup") || requestedDesign !== makeupPrompt(targetState) || previousImage !== t.fullImage;
      if (changed) toast("사진이나 선택이 바뀌어 생성 결과는 후보에 보관했어요. 현재 사진은 유지합니다.", 5000);
      else { t.fullImage = img; t.fullImageSourceKey = requestedSource; t.mode = "image"; }
      autosave(); renderPreview();
    } catch (e) { toast("생성 실패: " + esc(e.message), 7000); } finally { activeAIRequests--; }
    renderEditor();
  };
  $$("[data-mkg]", E).forEach(b => b.onclick = () => runMakeupGuide(b, b.dataset.mode));
  $$("[data-mkgpick]", E).forEach(im => im.onclick = () => { const t = st.texts.makeup; const c = t.guideCands[+im.dataset.mkgpick]; if (!ImageSource.matches(st, "makeup", c.sourceKey)) { toast("이전 고객 사진으로 만든 후보예요. 현재 사진으로 다시 생성해 주세요.", 5000); return; } t.guideImg = c.img; t.guideLm = c.lm; t.guideQ = c.q; t.guideSourceKey = c.sourceKey || ImageSource.sourceKey(st, "makeup"); renderEditor(); renderPreview(); autosave(); });
  $$("[data-mkpick]", E).forEach(im => im.onclick = () => { const t = st.texts.makeup, j = +im.dataset.mkpick, sourceKey = t.candSources?.[j]; if (!ImageSource.matches(st, "makeup", sourceKey)) { toast("이전 고객 사진으로 만든 후보예요. 현재 사진으로 다시 생성해 주세요.", 5000); return; } t.fullImage = t.cands[j]; t.fullImageSourceKey = sourceKey || ImageSource.sourceKey(st, "makeup"); t.mode = "image"; renderEditor(); renderPreview(); autosave(); });
  bindImgSlots(E);
  $$("[name=mkmode]", E).forEach(r => r.onchange = () => { st.texts.makeup.mode = r.value; renderEditor(); renderPreview(); autosave(); });
  $$("[data-mkvar]", E).forEach(s => s.onchange = () => { const k = s.dataset.mkvar; const v = MAKEUP_LIB[k].variants[s.value]; const sec = st.texts.makeup.sections[k];
    sec.variant = s.value; sec.sub = v.sub; sec.steps = v.steps.slice(); sec.points = v.points.slice(); unlock(`texts.makeup.sections.${k}`); if (st.analyzed) queueRefresh(["makeup"], `메이크업 '${MAKEUP_LIB[k].title}' 스타일을 '${v.sub}'(으)로 직접 선택함`); markEdited(`texts.makeup.sections.${k}.variant`); renderEditor(); schedulePreview(); autosave(); });
};

/* ---------- 7·8. 액세서리 ---------- */
function viewAcc(kind) {
  const key = kind === "g" ? "glasses" : "earrings"; const t = st.texts[key]; const L = kind === "g" ? GLASSES_SCALES : EARRING_SCALES;
  const shapes = kind === "g" ? GLASSES_SHAPES : EARRING_SHAPES; const lib = FACE_TYPES[st.type.key][key].items;
  const colors = kind === "g" ? ["silver", "gold", "rosegold", "gunmetal", "brown", "black", "clear", "tortoise"] : ["gold", "silver", "rosegold"];
  return `${kind === "e" ? earEditor() : ""}
  <div class="card">${field(`texts.${key}.formula`, "한 줄 공식", { input: true })}${field(`texts.${key}.desc`, "설명")}<div class="row" style="margin-top:8px"><button class="btn sm" data-aiall="${key}" data-mode="draft">🧪 3개 시안 (약 ${PRICE_KRW[key === "glasses" ? "sq" : "pt"].low * 3}원)</button><button class="btn sm pri" data-aiall="${key}" data-mode="final">✨ 3개 확정 (약 ${PRICE_KRW[key === "glasses" ? "sq" : "pt"].medium * 3}원)</button><span class="mut">없으면 자동 그림으로 표시됩니다</span></div></div>
  ${t.items.map((it, i) => `<div class="card"><h3>0${i + 1} <span class="tag">${it.useUpload && it.img ? "업로드 이미지 사용 중" : "자동 착용 시뮬레이션"}</span></h3>
    <select data-accpick="${key}:${i}"><option value="">— 추천 후보에서 고르기 —</option>${lib.map((x, j) => `<option value="${j}">${esc(x.name)}</option>`).join("")}</select>
    <div class="grid3"><div><label class="f">모양</label><select data-path="texts.${key}.items.${i}.shape">${Object.entries(shapes).map(([k, n]) => `<option value="${k}" ${it.shape === k ? "selected" : ""}>${n}</option>`).join("")}</select></div>
    <div><label class="f">컬러</label><select data-path="texts.${key}.items.${i}.color">${colors.map(c => `<option value="${c}" ${it.color === c ? "selected" : ""}>${METAL_COLORS[c][1]}</option>`).join("")}</select></div>
    <div><label class="f">크기 ${(it.size || 1).toFixed(2)}</label><input type="range" min="0.6" max="1.6" step="0.02" data-path="texts.${key}.items.${i}.size" value="${it.size || 1}"></div></div>
    <div class="grid2"><div>${field(`texts.${key}.items.${i}.name`, "이름", { input: true })}</div><div>${field(`texts.${key}.items.${i}.desc`, "설명")}</div></div>
    ${aiBlock(key, i)}
    <div class="row">${imgSlot(`texts.${key}.items.${i}.img`, "직접 업로드")}${it.img ? `<label class="mut"><input type="checkbox" data-path="texts.${key}.items.${i}.useUpload" ${it.useUpload ? "checked" : ""}> 사진(AI·업로드) 사용 — 끄면 자동 그림</label>` : ""}<button class="btn sm" data-prompt="${key}:${i}">프롬프트 복사(수동 생성용)</button></div></div>`).join("")}
  <div class="card"><h3>DETAIL SCALE</h3><p class="mut">선택한 3종의 모양·색·크기와 얼굴형을 종합해 반영합니다. 직접 조절한 값과 문구는 유지되며, 생성된 사진은 다시 생성해야 바뀝니다.</p><div class="grid2">${L.map((l, i) => `<div><label class="f">${i + 1}. ${l[0]} <span class="mut">(${l[1]} ← → ${l[2]})</span></label><input type="range" min="0" max="4" step="1" data-path="texts.${key}.scales.${i}" value="${t.scales[i]}">${field(`texts.${key}.scaleText.${i}`, "", { input: true })}</div>`).join("")}</div></div>
  <div class="card"><h3>SHOPPING CHECK</h3>${t.checks.map((c, i) => field(`texts.${key}.checks.${i}`, "", { input: true })).join("")}</div>`;
}
function viewGlasses() { return `<h2>7. 안경</h2><p class="lead">AI가 고른 안경 3종을 고객 사진에 GPT로 씌웁니다. 이미지가 없으면 자동 그림으로 표시됩니다.</p>${viewAcc("g")}`; }
function viewEarrings() { return `<h2>8. 귀걸이</h2><p class="lead">측면(또는 귀) 사진에서 귀 부분을 잘라 GPT로 귀걸이를 착용시킵니다. 아래 사진에서 <b>귓불을 한 번 클릭</b>해 위치를 맞춰 주세요(AI가 대략 잡아 둡니다).</p>${viewAcc("e")}`; }
function earEditor() {
  if (!st.ear.src && st.side.src) Object.assign(st.ear, { src: st.side.src, w: st.side.w, h: st.side.h, lobe: st.ear.lobe || st.side.earPt || null });
  const E = st.ear;
  if (!E.src) return `<div class="card">1단계에서 귀 사진(또는 측면 사진)을 넣으면 귀걸이 착용 시뮬레이션을 할 수 있어요.</div>`;
  return `<div class="card"><h3>귓불 위치 <span class="tag">${E.lobe ? "지정됨" : "클릭해서 지정"}</span></h3><div class="medit"><div class="svgwrap pick"><svg id="esvg" viewBox="0 0 ${E.w} ${E.h}"></svg></div>
    <div><label class="f">확대</label><input type="range" min="0.4" max="4" step="0.05" data-path="ear.zoom" value="${E.zoom}"><p class="mut">귓불(귀걸이가 꽂히는 지점)을 클릭하세요. 확대 값으로 보고서 속 귀 크기를 조절합니다.</p></div></div></div>`;
}
function drawEarSVG() {
  const svg = $("#esvg"); if (!svg) return; const E = st.ear; const r = Math.max(E.w, E.h) / 90;
  svg.innerHTML = `<image href="${BlobCache.get(E.src)}" width="${E.w}" height="${E.h}"/>` + (E.lobe ? `<circle cx="${E.lobe[0]}" cy="${E.lobe[1]}" r="${r}" fill="none" stroke="${PINK}" stroke-width="${r / 3}"/><circle cx="${E.lobe[0]}" cy="${E.lobe[1]}" r="${r / 4}" fill="${PINK}"/>` : "");
}
function postAcc(E, key) {
  bindImgSlots(E); bindAI(E);
  $$("[data-accpick]", E).forEach(s => s.onchange = () => { if (s.value === "") return; const [k, i] = s.dataset.accpick.split(":"); const x = FACE_TYPES[st.type.key][k].items[+s.value];
    Object.assign(st.texts[k].items[+i], { shape: x.shape, name: x.name, desc: x.desc }); ["shape", "name", "desc"].forEach(f => markEdited(`texts.${k}.items.${i}.${f}`)); unlock(`texts.${k}.items.${i}`); ["shape", "color", "size"].forEach(f => lock(`texts.${k}.items.${i}.${f}`)); markStale(k, +i); syncAccessoryScales(k); if (st.analyzed) queueRefresh([k], `${k === "glasses" ? "안경" : "귀걸이"} 0${+i + 1}을(를) '${x.name}'(으)로 직접 선택함`); renderEditor(); schedulePreview(); autosave(); });
  $$("select[data-path$='.shape'], select[data-path$='.color']", E).forEach(s => s.addEventListener("change", () => renderEditor()));
  $$("input[type=range][data-path$='.size']", E).forEach(s => s.addEventListener("input", () => { s.previousElementSibling.textContent = "크기 " + (+s.value).toFixed(2); }));
}
POST[7] = E => postAcc(E, "glasses");
POST[8] = E => {
  postAcc(E, "earrings"); if (!st.ear.src) return; drawEarSVG();
  $("#esvg").addEventListener("pointerdown", e => { const p = svgPoint($("#esvg"), e); st.ear.lobe = [p.x, p.y]; drawEarSVG(); schedulePreview(); autosave(); });
};

/* ---------- 9. 미리보기·출력 ---------- */
function viewOutput() {
  const T = st.texts; const checks = [[!!st.client.name, "고객 이름"], [st.analyzed, "AI 분석"], [T.hair.items.every(i => i.img), "헤어 이미지 3장"], [(T.makeup.mode || "guide") === "guide" ? !!(T.makeup.guideImg && T.makeup.guideLm) : (!!T.makeup.fullImage || T.makeup.mode === "template"), "메이크업 가이드"], [T.glasses.items.every(i => i.img && i.useUpload), "안경 이미지 3장"], [T.earrings.items.every(i => i.img && i.useUpload), "귀걸이 이미지 3장"]];
  return `<h2>9. 미리보기·출력</h2><p class="lead">오른쪽에서 8쪽 전체를 확인하세요.</p>
  <div class="card"><h3>완성 체크</h3>${checks.map(([ok, t]) => `<div style="font-size:13px;margin:4px 0">${ok ? "✅" : "⬜"} ${t}</div>`).join("")}
    ${(() => { const lows = [...["hair", "glasses", "earrings"].flatMap(k => T[k].items.map((it, i) => it.img && it.imgQ === "low" ? `${{ hair: "헤어", glasses: "안경", earrings: "귀걸이" }[k]} ${i + 1}` : null)), (T.makeup.mode || "guide") === "guide" && T.makeup.guideImg && T.makeup.guideQ === "low" ? "메이크업 사진" : null].filter(Boolean);
      return lows.length ? `<div class="status err" style="margin-top:8px">시안(저품질) 이미지가 들어가 있어요: ${lows.join(", ")} — 각 단계에서 '고른 시안을 그대로 확정'을 누르면 고화질로 바뀝니다.</div>` : ""; })()}</div>
  <div class="card"><h3>이번 보고서 이미지 비용</h3>${(() => { const c = costSummary(st); return c.n ? `<div style="font-size:13px">GPT 이미지 <b>${c.n}회</b> 생성 (시안 ${c.low} · 확정 ${c.medium}${c.high ? ` · 고품질 ${c.high}` : ""}) — 약 <b>${c.krw.toLocaleString()}원</b> <span class="mut">($${c.usd.toFixed(2)})</span></div><div class="mut">OpenAI가 알려 준 사용량 기준 추정치예요. 정확한 청구액은 OpenAI 결제 화면에서 확인하세요.</div>` : `<div class="mut">아직 생성한 이미지가 없어요.</div>`; })()}</div>
  <div class="card"><h3>출력</h3><div class="row"><button class="btn pri" id="doPdf">PDF 다운로드</button><button class="btn" id="doPrint">인쇄 / PDF로 저장</button></div></div>
  <div class="card"><h3>구글 드라이브</h3><p class="mut">'${esc(CFG.driveFolder || "")}' 폴더 안에 ${esc(fileBase())} 폴더를 만들고 PDF·작업파일·사진·AI 이미지를 저장합니다.</p>
    <div class="row"><button class="btn pri" id="dSave">드라이브에 저장</button><button class="btn" id="dList">드라이브에서 불러오기</button></div><div id="dl"></div></div>
  <div class="card"><h3>작업 파일</h3><div class="row"><button class="btn" id="doSave">작업 파일 내려받기 (.json)</button></div></div>`;
}
POST[9] = E => {
  $("#doPrint").onclick = doPrint; $("#doSave").onclick = saveProject; $("#dSave").onclick = driveSave;
  $("#doPdf").onclick = async () => { busy("PDF 만드는 중…"); try { dlBlob(fileBase() + ".pdf", await makePDF()); } catch (e) { toast("PDF 오류: " + esc(e.message)); } busy(); };
  $("#dList").onclick = async () => { try { const fs = await driveFolders(); $("#dl").innerHTML = fs.length ? fs.map(f => `<div class="row" style="margin-top:6px"><button class="btn sm" data-df="${f.id}">열기</button> ${esc(f.name)} <span class="mut">${f.modifiedTime.slice(0, 10)}</span></div>`).join("") : `<p class="mut">저장된 보고서가 없습니다</p>`;
    $$("[data-df]").forEach(b => b.onclick = async () => { if (!(await DraftUI.beforeSwitch())) return; busy("불러오는 중…"); try { const raw = await driveProject(b.dataset.df); if (raw) { const p = ProjectStore.sanitizeState(raw); st = deepMerge(newState(), p); delete st.projectLink; st.settings = loadSettings(); clearTimeout(_rq.t); _rq.scopes.clear(); _rq.notes = []; refreshBadge(); updateRatios(); goStep(3); DraftUI.loaded(); DraftUI.changed(); autosave({ quiet: true }); } } catch (e) { toast(esc(e.message)); } busy(); }); } catch (e) { toast(esc(e.message), 6000); } };
};
function openPasteModal() {
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="box"><h2>AI 답변 붙여넣기</h2><p class="mut">AI가 돌려준 JSON 답변 전체를 붙여넣으세요.</p><textarea id="aiTxt" rows="14"></textarea><div class="row" style="margin-top:10px;justify-content:flex-end"><button class="btn" id="aiCancel">취소</button><button class="btn pri" id="aiOk">반영하기</button></div></div>`;
  document.body.appendChild(m);
  $("#aiCancel", m).onclick = () => m.remove();
  $("#aiOk", m).onclick = () => { try { mergeAI(st, parseAIResponse($("#aiTxt", m).value)); m.remove(); toast("반영했어요."); renderEditor(); renderPreview(); autosave(); } catch (e) { alert("읽을 수 없는 답변입니다: " + e.message); } };
}

/* ================= 미리보기 ================= */
let _pvT = null;
function schedulePreview(ms = 220) { clearTimeout(_pvT); _pvT = setTimeout(renderPreview, ms); }
function renderPreview() {
  const P = $(".preview"); const sc = $(".pscroll", P);
  $(".ptabs", P).innerHTML = PAGE_NAMES.map((n, i) => `<button data-p="${i}" class="${st.step !== 9 && previewPage === i ? "on" : ""}">${i + 1} ${n}</button>`).join("") + `<button data-p="-1" class="${st.step === 9 ? "on" : ""}">전체</button>`;
  $$(".ptabs button", P).forEach(b => b.onclick = () => { const p = +b.dataset.p; if (p < 0) return goStep(9); const s = STEPS.find(x => x.page === p); goStep(s.n); });
  const avail = sc.clientWidth - 28; const s = Math.min(1, avail / 794);
  if (st.step === 9) {
    sc.innerHTML = `<div class="allpages">${PAGE_FUNCS.map((_, i) => `<div class="pshadow" style="width:${794 * s}px;height:${1123 * s}px"><div class="pscale" style="transform:scale(${s})">${renderPage(st, i)}</div></div>`).join("")}</div>`;
  } else {
    sc.innerHTML = `<div class="pshadow" style="width:${794 * s}px;height:${1123 * s}px"><div class="pscale" style="transform:scale(${s})">${renderPage(st, previewPage)}</div></div>`;
  }
}

/* ================= 저장·불러오기·출력 ================= */
function fileBase() { const d = (st.client.date || today()).replace(/-/g, "").slice(2); return `${d}_페이스_${st.client.name || "고객"}`; }
function download(name, text, type = "application/json") { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
function saveProject() { download(fileBase() + ".json", JSON.stringify(st)); toast("작업 파일을 저장했어요."); }
function loadProjectFile(file) {
  const r = new FileReader(); r.onload = () => { try { const j = ProjectStore.sanitizeState(JSON.parse(r.result)); const base = newState(); st = deepMerge(base, j); delete st.projectLink; st.settings = deepMerge(loadSettings(), j.settings || {}); clearTimeout(_rq.t); _rq.scopes.clear(); _rq.notes = []; refreshBadge(); updateRatios(); goStep(st.step || 9); DraftUI.loaded(); DraftUI.changed(); autosave({ quiet: true }); toast("작업 파일을 불러왔어요. 임시저장하면 공용 저장소에 새 작업으로 저장됩니다."); } catch (e) { alert("불러오기 실패: " + e.message); } };
  r.readAsText(file);
}
function doPrint() {
  const pa = $("#printArea"); pa.innerHTML = PAGE_FUNCS.map((_, i) => renderPage(st, i)).join("");
  const old = document.title; document.title = fileBase();
  setTimeout(() => { window.print(); document.title = old; }, 400);
}
function copyText(t) {
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).catch(() => fallbackCopy(t)); else fallbackCopy(t);
}
function fallbackCopy(t) { const ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); } catch (e) {} ta.remove(); }
function toast(m, ms = 3200) { const t = document.createElement("div"); t.className = "toast"; t.innerHTML = m; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }

/* 자동 저장 (IndexedDB) */
const DB = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open("lovive-face", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise(res => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = res; tx.onerror = res; }); },
  async get(k) { const db = await this.open(); return new Promise(res => { const r = db.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); },
};
let _asT = null;
function autosave({ quiet = false } = {}) { if (!quiet && typeof DraftUI !== "undefined") DraftUI.changed(); clearTimeout(_asT); _asT = setTimeout(() => { DB.set("current", JSON.stringify(st)).catch(() => {}); }, 800); }

/* ================= 설정 ================= */
function openSettings() {
  const S = st.settings; const m = document.createElement("div"); m.className = "modal";
  const calibRows = Object.keys(DEFAULT_SETTINGS.calib).map(k => `<tr><td>${k}</td><td><input type="number" step="0.01" data-s="calib.${k}.0" value="${S.calib[k][0]}"></td><td><input type="number" step="0.01" data-s="calib.${k}.1" value="${S.calib[k][1]}"></td></tr>`).join("");
  const th = S.thresholds;
  m.innerHTML = `<div class="box"><h2>설정</h2>
  <div class="card"><h3>수동 선택 반영</h3><label class="mut"><input type="checkbox" id="autoRf" ${st.settings.autoRefresh !== false ? "checked" : ""}> 얼굴형·측면·헤어·안경·귀걸이·메이크업·비율을 직접 바꾸면 관련 문장을 AI가 자동으로 다시 씁니다 (끄면 상단 버튼을 눌러 한 번에 반영)</label><p class="mut">직접 타이핑해서 고친 문장은 AI가 덮어쓰지 않습니다.</p></div>
  <div class="card"><h3>보고서</h3><label class="f">머리말 브랜드 문구</label><input type="text" data-s="brand" value="${esc(S.brand)}"></div>
  <div class="card"><h3>측정 보정 <span class="tag">보정값 = a × 자동값 + b</span></h3><p class="mut">기존 보고서 13건 + 2단계에서 저장한 수동값(현재 ${getCalibSamples().length}건)을 합쳐 계수를 계산합니다. 데이터가 쌓일수록 하영님 측정 기준에 가까워집니다.</p>
    <table class="mtable"><tr><th>항목</th><th>a</th><th>b</th></tr>${calibRows}</table>
    <div class="row" style="margin-top:8px"><button class="btn sm" id="fitCal">저장된 데이터로 계수 계산</button><button class="btn sm" id="resetCal">계수 초기화</button><button class="btn sm" id="expCal">보정 데이터 내보내기</button><label class="btn sm">보정 데이터 가져오기<input type="file" id="impCal" accept=".json" style="display:none"></label></div><div class="mut" id="calRep"></div></div>
  <div class="card"><h3>얼굴형 판정 기준</h3><div class="grid3">${Object.entries({ long: "긴형: 종횡비 ≥", roundMax: "둥근형: 종횡비 ≤", squareJaw: "사각형: 턱/광대 ≥", heartFore: "하트형: 이마/광대 ≥", heartJaw: "하트형: 턱/광대 ≤", hexFore: "육각형: 이마/광대 ≤", hexJaw: "육각형: 턱/광대 ≤" }).map(([k, n]) => `<div><label class="f">${n}</label><input type="number" step="0.01" data-s="thresholds.${k}" value="${th[k]}"></div>`).join("")}</div></div>
  <div class="row" style="justify-content:flex-end"><button class="btn pri" id="setOk">닫기</button></div></div>`;
  document.body.appendChild(m);
  $$("[data-s]", m).forEach(inp => inp.addEventListener("change", () => { const p = inp.dataset.s; const v = inp.type === "checkbox" ? inp.checked : inp.type === "number" ? +inp.value : inp.value; setPath(S, p, v); saveSettings(); updateRatios(); regenerate(false); schedulePreview(); }));
  $("#fitCal", m).onclick = () => { const r = fitCalibration(); Object.assign(S.calib, r.calib); saveSettings(); updateRatios(); regenerate(false); m.remove(); openSettings(); setTimeout(() => { const el = $("#calRep"); if (el) el.innerHTML = r.rep.join("<br>") || "저장된 데이터가 없습니다"; }, 50); };
  $("#resetCal", m).onclick = () => { S.calib = clone(DEFAULT_SETTINGS.calib); saveSettings(); updateRatios(); m.remove(); openSettings(); };
  $("#expCal", m).onclick = () => download("럽리브_측정보정데이터.json", JSON.stringify(getCalibSamples()));
  $("#impCal", m).onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const arr = JSON.parse(r.result); localStorage.setItem("lovive_calib", JSON.stringify([...getCalibSamples(), ...arr])); toast(`${arr.length}건을 가져왔어요.`); m.remove(); openSettings(); } catch (er) { alert(er.message); } }; r.readAsText(f); };
  $("#autoRf", m).onchange = e => { st.settings.autoRefresh = e.target.checked; saveSettings(); if (e.target.checked && _rq.notes.length) runRefresh(); };
  $("#setOk", m).onclick = () => { m.remove(); renderEditor(); renderPreview(); };
}

function openHelp() {
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="box"><h2>사용법</h2><div style="font-size:13.5px;line-height:1.75">
  <b>기본 흐름 (고객 1명당)</b><ol style="margin:4px 0 12px;padding-left:20px">
  <li><b>기본 정보·사진</b> — 이름 입력, 정면·측면·귀 사진 넣기. 정면을 넣으면 얼굴 기준점·헤어라인·기울기를 자동으로 잡습니다.</li>
  <li><b>정면 측정</b> — 색깔 선 8개(가로)·6개(세로)를 확인하고 어긋난 선만 끌어서 맞추기. 선 클릭 후 방향키로 1px 조정.</li>
  <li><b>얼굴형·요약</b> — 얼굴형을 직접 고르면 모든 추천 문장이 그 기준으로 바뀝니다. 문장은 자유롭게 수정.</li>
  <li><b>측면</b> — 코끝·입술·턱끝 3점 클릭, 4축 선택지 고르기.</li>
  <li><b>헤어</b> — 후보에서 3개 고르기 → '프롬프트 복사'로 AI 이미지 만들기 → 결과 업로드.</li>
  <li><b>메이크업</b> — 부위 사진과 가이드 선이 자동 생성. 섹션별 스타일만 고르고 문장 확인.</li>
  <li><b>안경·귀걸이</b> — 모양·컬러·크기를 고르면 착용 모습이 자동으로 그려집니다(귀는 귓불 클릭). 필요하면 AI 착용 사진 업로드.</li>
  <li><b>미리보기·출력</b> — 'PDF로 저장' → 인쇄 창에서 'PDF로 저장', 여백 없음, 배경 그래픽 켜기.</li></ol>
  <b>알아 두면 좋은 점</b><ul style="margin:4px 0 0;padding-left:20px">
  <li>직접 고친 칸은 주황색 표시가 되고, 측정값이 바뀌어도 자동으로 덮어쓰지 않습니다.</li>
  <li>작업은 이 브라우저에 자동 저장됩니다. 고객별로 '저장'을 눌러 .json 파일을 남겨 두면 나중에 '불러오기'로 이어서 고칠 수 있어요.</li>
  <li>2단계에서 직접 잰 수동값을 입력하고 '보정 데이터로 저장'을 쌓으면, 설정에서 자동 측정을 하영님 기준에 맞게 보정할 수 있습니다.</li>
  <li>얼굴 인식·글꼴은 인터넷에서 불러오므로 인터넷이 연결된 상태에서 사용하세요. 크롬 또는 엣지를 권장합니다.</li></ul></div>
  <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn pri" id="hOk">닫기</button></div></div>`;
  document.body.appendChild(m); $("#hOk", m).onclick = () => m.remove();
}

/* ================= 시작 ================= */
async function init() {
  if (window.__inited) return; window.__inited = true;
  document.body.innerHTML = `<div id="app"><div class="topbar"><img class="logo" src="${LOGO}" alt=""><div class="ttl">페이스 분석결과지<small>AI 분석 · GPT 이미지 · 8쪽</small></div>
    <button class="btn" id="tbNew">새 고객</button><button class="btn pri" id="tbDraftSave">임시저장</button><button class="btn" id="tbDraftLibrary">저장소</button><span class="mut" id="draftStatus" role="status"></span><label class="btn">파일 불러오기<input type="file" id="tbLoad" accept=".json" style="display:none"></label><button class="btn" id="tbSave">파일 내보내기</button>
    <button class="btn sm" id="rfBadge" style="display:none;background:#fff7e6;border-color:#f0c36d"></button><span class="mut" style="font-size:12px">${esc(AUTH.email || "")}</span><button class="btn" id="tbSet">설정</button><button class="btn" onclick="logout()">로그아웃</button></div>
    <div class="main"><div class="nav"></div><div class="editor"></div><div class="preview"><div class="ptabs"></div><div class="pscroll"></div></div></div></div><div id="printArea"></div>`;
  $("#tbNew").onclick = async () => { if (!(await DraftUI.beforeSwitch())) return; st = newState(); clearTimeout(_rq.t); _rq.scopes.clear(); _rq.notes = []; refreshBadge(); goStep(1); DraftUI.loaded(); autosave({ quiet: true }); };
  $("#tbLoad").onchange = async e => { const file = e.target.files[0]; e.target.value = ""; if (file && await DraftUI.beforeSwitch()) loadProjectFile(file); };
  $("#tbSave").onclick = saveProject; $("#tbSet").onclick = openSettings;
  window.addEventListener("resize", () => schedulePreview(100));
  st = newState();
  try { const saved = await DB.get("current"); if (saved) { const j = ProjectStore.sanitizeState(JSON.parse(saved)); st = deepMerge(newState(), j); st.settings = loadSettings(); updateRatios(); if (j.client?.name || j.photos?.front) toast(`이전 작업(${esc(j.client?.name || "이름 없음")})을 이어서 엽니다. 새로 시작하려면 '새 고객'을 누르세요.`, 4500); } } catch (e) { console.warn(e); }
  goStep(st.step || 1);
  DraftUI.init();
  if (document.fonts) document.fonts.ready.then(() => schedulePreview(50));
}
window.addEventListener("DOMContentLoaded", boot);
