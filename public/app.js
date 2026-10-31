/* =====================================================================
   럽리브 페이스 분석결과지 — 앱 (로그인·입력·AI 분석·편집·출력·드라이브)
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clone = o => JSON.parse(JSON.stringify(o));
const today = () => new Date().toISOString().slice(0, 10);
let CFG = {}, AUTH = { token: null, email: null, exp: 0 }, DRIVE = { token: null, exp: 0, client: null };
let LIB = [], st = null, step = 1, pvPage = 0;
const STEPS = [[1, "사진·비율 입력", 0], [2, "AI 분석", 1], [3, "얼굴형·측면 (2쪽)", 1], [4, "비율 해석 (3·4쪽)", 2], [5, "안경·귀걸이", 3], [6, "메이크업 (5쪽)", 4], [7, "헤어 (6쪽)", 5], [8, "저장·출력", -1]];
const RATIO_FIELDS = [["thirds", "얼굴 세로 비율", "1:1:1"], ["aspect", "얼굴 종횡비", "1:1.46"], ["eyePos", "눈 위치", "1:1"], ["eyeDist", "눈 거리", "1:1:1"], ["nosePos", "코 위치", "1:1"], ["mouthPos", "입 위치", "1:2"]];

function newState() {
  return { v: 1, name: "", callName: "", date: today(), memo: "",
    front: { src: null, pts: null, lines: null, metrics: null, zoom: 1, dx: 0, dy: 0 }, side: { src: null, points: null, zoom: 1, dx: 0, dy: 0 },
    ratios: { thirds: "", aspect: "", eyePos: "", eyeDist: "", nosePos: "", mouthPos: "" }, grades: {}, shots: [],
    ai: null, mk: { zoom: 1 }, hairCircle: [true, true, true], img: { front: null, side: null, makeup: null, hair: [] } };
}
function toast(m, ms = 3500) { const t = document.createElement("div"); t.className = "toast"; t.innerHTML = m; document.body.appendChild(t); setTimeout(() => t.remove(), ms); }
function busy(msg) { let b = $(".busy"); if (!msg) { b && b.remove(); return; } if (!b) { b = document.createElement("div"); b.className = "busy"; document.body.appendChild(b); } b.textContent = msg; }

/* ================= 로그인 (구글, 허용 계정 2개) ================= */
function decodeJwt(t) { const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(p)))); }
async function boot() {
  CFG = await (await fetch("/api/config")).json();
  LIB = await (await fetch("hair/library.json")).json();
  if (CFG.devNoAuth) { AUTH.email = "dev(로컬 테스트)"; return startApp(); }
  const saved = JSON.parse(sessionStorage.getItem("lv_auth") || "null");
  if (saved && saved.exp * 1000 > Date.now() + 60000) { AUTH = saved; return startApp(); }
  showLogin();
}
function showLogin(msg) {
  $("#login").style.display = "flex"; $("#app").style.display = "none";
  if (msg) $("#loginMsg").textContent = msg;
  const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
  s.onload = () => {
    google.accounts.id.initialize({ client_id: CFG.clientId, callback: onCredential, auto_select: true });
    google.accounts.id.renderButton($("#gbtn"), { theme: "outline", size: "large", text: "signin_with", locale: "ko" });
    google.accounts.id.prompt();
  };
  if (!window.google?.accounts) document.head.appendChild(s); else s.onload();
}
function onCredential(r) {
  const p = decodeJwt(r.credential); const email = (p.email || "").toLowerCase();
  if (!CFG.allowed.includes(email)) { $("#loginMsg").textContent = `${email} 계정은 사용할 수 없습니다. 허용된 계정으로 로그인해 주세요.`; return; }
  AUTH = { token: r.credential, email, exp: p.exp }; sessionStorage.setItem("lv_auth", JSON.stringify(AUTH)); startApp();
}
function logout() { sessionStorage.removeItem("lv_auth"); AUTH = { token: null }; try { google.accounts.id.disableAutoSelect(); } catch (e) {} location.reload(); }
async function api(body) {
  if (!CFG.devNoAuth && AUTH.exp * 1000 < Date.now() + 30000) { showLogin("로그인 시간이 지나 다시 로그인이 필요합니다. 작업 내용은 저장되어 있어요."); throw new Error("다시 로그인해 주세요"); }
  const r = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (AUTH.token || "dev") }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "서버 응답 오류" }));
  if (r.status === 401) { showLogin(j.error); throw new Error(j.error); }
  if (!r.ok) throw new Error(j.error || "오류 " + r.status);
  return j;
}

/* ================= 시작 ================= */
async function startApp() {
  $("#login").style.display = "none"; $("#app").style.display = "grid";
  $("#who").textContent = AUTH.email + (CFG.mock ? " · 예시응답 모드" : "");
  st = (await DB.get("current").then(s => s && JSON.parse(s)).catch(() => null)) || newState();
  goStep(st.ai ? 3 : 1);
  if (st.name) toast(`이전 작업(${st.name})을 이어서 엽니다. 새로 시작하려면 '새 고객'.`);
}
function goStep(n) { step = n; const s = STEPS.find(x => x[0] === n); if (s[2] >= 0) pvPage = s[2]; renderNav(); renderEd(); renderPreview(); $(".ed").scrollTop = 0; }
function renderNav() { $(".nav").innerHTML = STEPS.map(([n, t]) => `<div class="s ${n === step ? "on" : ""}" data-n="${n}"><span class="n">${n}</span>${t}</div>`).join(""); $$(".nav .s").forEach(e => e.onclick = () => goStep(+e.dataset.n)); }
const get = (o, p) => p.split(".").reduce((x, k) => x?.[k], o);
function set(o, p, v) { const ks = p.split("."); const l = ks.pop(); const t = ks.reduce((x, k) => (x[k] ??= {}), o); t[l] = v; }
function fld(path, label, rows = 0) { const v = get(st, path) ?? ""; return `${label ? `<label class="f">${label}</label>` : ""}${rows ? `<textarea data-p="${path}" rows="${rows}">${esc(v)}</textarea>` : `<input type="text" data-p="${path}" value="${esc(v)}">`}`; }
function bind(E) {
  $$("[data-p]", E).forEach(el => el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => { set(st, el.dataset.p, el.type === "range" ? +el.value : el.value); onChange(el.dataset.p); }));
}
let _t = null;
function onChange(path) {
  if (path === "name" && !st.callNameEdited) { st.callName = st.name.length >= 3 ? st.name.slice(1) : st.name; const c = $("[data-p=callName]"); if (c) c.value = st.callName; }
  if (path === "callName") st.callNameEdited = true;
  clearTimeout(_t); _t = setTimeout(async () => {
    if (/^(front\.(zoom|dx|dy))/.test(path)) st.img.front = await makeFrontOverlay(st);
    if (/^side\.(zoom|dx|dy)/.test(path)) st.img.side = await makeSideOverlay(st);
    if (/^mk\./.test(path) || /^ai\.makeup\.annotations/.test(path)) st.img.makeup = await makeMakeupAnnot(st);
    renderPreview(); save();
  }, 250);
}
function renderEd() { const E = $(".ed"); E.innerHTML = [null, vInput, vAnalyze, vP2, vRatio, vAcc, vMakeup, vHair, vOut][step](); bind(E); (POST[step] || (() => {}))(E); }
const POST = {};

/* ---------- 1. 사진·비율 ---------- */
function upBox(id, title, src) { return `<label class="up" id="${id}">${src ? `<img src="${src}">` : `<b>${title}</b><span class="mut">클릭 또는 끌어다 놓기</span>`}<input type="file" accept="image/*"></label>`; }
function vInput() {
  return `<h2>1. 사진·비율 입력</h2><p class="lead">정면·측면 사진과 비율 앱 측정값을 넣으세요. 비율은 앱 화면을 캡처해 올리면 자동으로 읽어 줍니다.</p>
  <div class="card"><div class="g3"><div>${fld("name", "고객 이름")}</div><div>${fld("callName", "부르는 이름 (보고서 문장용, 예: 보라)")}</div><div><label class="f">진단일</label><input type="date" data-p="date" value="${esc(st.date)}"></div></div>${fld("memo", "상담 메모 (고민·선호 — AI가 참고)", 2)}</div>
  <div class="card"><h3>사진 2장</h3><div class="g2">${upBox("upF", "정면 사진", st.front.src)}${upBox("upS", "측면 사진", st.side.src)}</div><div id="fstat" class="status" style="${st.front.src ? "" : "display:none"}">${st.front.pts ? "✓ 정면 얼굴 인식 완료" : st.front.src ? "얼굴 인식 전" : ""}</div></div>
  <div class="card"><h3>얼굴 비율 (별도 앱 측정값)</h3><div class="row"><label class="btn sm">앱 캡처 올리기 (여러 장)<input type="file" id="shots" accept="image/*" multiple style="display:none"></label><span class="mut">${st.shots.length ? st.shots.length + "장 올림" : "6개 화면 캡처를 한 번에 올리면 숫자를 읽어 채웁니다"}</span></div>
  <div class="g3" style="margin-top:6px">${RATIO_FIELDS.map(([k, n, ex]) => `<div><label class="f">${n} ${st.grades?.[k] ? `<b style="color:#a64ca6">${st.grades[k]}</b>` : ""}</label><input type="text" data-p="ratios.${k}" value="${esc(st.ratios[k])}" placeholder="${ex}"></div>`).join("")}</div></div>
  <div class="row"><button class="btn pri" onclick="goStep(2)">다음: AI 분석 →</button></div>`;
}
POST[1] = E => {
  const hook = (id, fn) => { const b = $("#" + id, E), i = $("input", b); i.onchange = () => i.files[0] && fn(i.files[0]); b.ondragover = e => e.preventDefault(); b.ondrop = e => { e.preventDefault(); e.dataTransfer.files[0] && fn(e.dataTransfer.files[0]); }; };
  hook("upF", async f => { st.front.src = await fileToDataURL(f, 1600); st.front.pts = null; renderEd(); const s = $("#fstat"); s.style.display = ""; s.textContent = "정면 얼굴 인식 중… (처음엔 10~20초)";
    try { const a = await analyzeFrontPhoto(st.front.src); if (a) { Object.assign(st.front, { pts: a.pts, lines: a.lines, metrics: a.metrics }); s.className = "status ok"; s.textContent = "✓ 정면 얼굴 인식 완료 — 측정선·메이크업 그림이 자동으로 만들어집니다"; } else { s.className = "status err"; s.textContent = "얼굴을 찾지 못했습니다. 정면 사진을 다시 확인해 주세요."; } }
    catch (e) { s.className = "status err"; s.textContent = "얼굴 인식 오류: " + e.message; }
    st.img.front = await makeFrontOverlay(st); st.img.makeup = await makeMakeupAnnot(st); renderPreview(); save(); });
  hook("upS", async f => { st.side.src = await fileToDataURL(f, 1600); st.img.side = await makeSideOverlay(st); renderEd(); renderPreview(); save(); });
  $("#shots", E).onchange = async e => { const fs = [...e.target.files]; if (!fs.length) return; busy("캡처에서 비율을 읽는 중…");
    try { st.shots = await Promise.all(fs.map(f => fileToDataURL(f, 1100))); const r = await api({ task: "ratios", images: st.shots });
      for (const [k] of RATIO_FIELDS) if (r[k]) st.ratios[k] = String(r[k]).replace(/\s/g, "").replace(/:/g, " : "); st.grades = r.grades || {}; toast("비율을 채웠어요. 숫자를 한 번 확인해 주세요."); }
    catch (er) { toast("읽기 실패: " + er.message, 6000); } busy(); renderEd(); save(); };
};

/* ---------- 2. AI 분석 ---------- */
function vAnalyze() {
  const ready = st.front.src && st.side.src && RATIO_FIELDS.every(([k]) => st.ratios[k]);
  return `<h2>2. AI 분석</h2><p class="lead">사진 2장과 비율을 바탕으로 얼굴형·측면 판정, 비율 해석, 안경·귀걸이·메이크업·헤어를 한 번에 작성합니다. 하영님의 기존 보고서와 분석 초안을 참고해 같은 문체로 씁니다. (약 30~60초)</p>
  <div class="card">${[["정면 사진", st.front.src], ["측면 사진", st.side.src], ["정면 얼굴 인식", st.front.pts], ["비율 6개", RATIO_FIELDS.every(([k]) => st.ratios[k])]].map(([t, ok]) => `<div style="margin:3px 0">${ok ? "✅" : "⬜"} ${t}</div>`).join("")}
  <label class="mut" style="display:block;margin-top:10px"><input type="checkbox" id="useRecent" checked> 드라이브에 저장된 최근 보고서 3건도 문체 참고로 보내기</label>
  <div class="row" style="margin-top:12px"><button class="btn pri" id="run" ${ready ? "" : "disabled"}>✨ AI 분석 실행</button>${st.ai ? `<span class="mut">다시 실행하면 지금 편집한 내용이 새 결과로 바뀝니다</span>` : ""}</div></div>`;
}
POST[2] = E => { const b = $("#run", E); if (b) b.onclick = runAnalysis; };
async function runAnalysis() {
  if (st.ai && !confirm("AI 분석을 다시 실행할까요? 편집한 문장이 새 결과로 바뀝니다.")) return;
  busy("AI가 분석 중입니다… (30~60초)");
  try {
    let recent = [];
    if ($("#useRecent")?.checked && DRIVE.token) recent = await driveRecentExamples().catch(() => []);
    const body = { task: "report", name: st.name, callName: st.callName, memo: st.memo, ratios: st.ratios, faceMetrics: st.front.metrics,
      front: await resizeDataURL(st.front.src, 1024), side: await resizeDataURL(st.side.src, 1024), recentExamples: recent };
    const r = await api(body);
    r.makeup = r.makeup || {}; r.makeup.annotations = mergeAnnot(r.makeup.annotations || []);
    st.ai = r; st.side.points = r.sidePoints || st.side.points;
    await regenAll(); busy(); toast("분석 완료! 각 단계에서 확인·수정해 주세요."); goStep(3); save();
  } catch (e) { busy(); toast("분석 실패: " + esc(e.message), 7000); }
}
function mergeAnnot(list) { const m = Object.fromEntries(list.map(a => [a.key, a])); return Object.keys(MK_KEYS).map(k => ({ key: k, on: !!m[k]?.on, label: m[k]?.label || MK_KEYS[k], shape: m[k]?.shape || (k === "blush" ? "horizontal" : undefined) })); }
async function regenAll() {
  st.img.front = await makeFrontOverlay(st); st.img.side = await makeSideOverlay(st); st.img.makeup = await makeMakeupAnnot(st);
  st.img.hair = await Promise.all((st.ai?.hair?.best || []).slice(0, 3).map((b, i) => { const h = LIB.find(x => x.id === b.id); return h ? makeHairImage(h, st.hairCircle[i] !== false) : null; }));
  renderPreview();
}

/* ---------- 3. 얼굴형·측면 ---------- */
function vP2() {
  if (!st.ai) return needAI();
  const a = st.ai;
  return `<h2>3. 얼굴형·측면 (2쪽)</h2><p class="lead">AI 판정을 확인하고 필요하면 바꾸세요. 측면 사진의 점을 끌면 측정선이 다시 그려집니다.</p>
  <div class="card"><h3>얼굴형 <span class="mut">(최대 2개)</span></h3><div class="chips" id="ft">${FACE_TYPES.map(t => `<button data-v="${t}" class="${(a.faceType || []).includes(t) ? "on" : ""}">${t}</button>`).join("")}</div>${a.faceReason ? `<p class="mut">AI 근거: ${esc(a.faceReason)}</p>` : ""}</div>
  <div class="card"><h3>측면</h3>${Object.entries(SIDE_OPTS).map(([k, [h, opts]]) => `<label class="f">${h}</label><div class="chips" data-side="${k}">${opts.map(o => `<button data-v="${o}" class="${a.side?.[k] === o ? "on" : ""}">${o}</button>`).join("")}</div>`).join("")}${fld("ai.sideSummary", "파란 글씨 요약", 3)}</div>
  <div class="card"><h3>측면 측정점</h3><div class="svgwrap"><svg id="sideSvg"></svg></div><p class="mut">점: 헤어라인·미간·코끝·코밑·입술·턱끝·귀 — 끌어서 위치를 맞추세요.</p>
    <div class="g3">${["zoom", "dx", "dy"].map((k, i) => `<div><label class="f">${["확대", "좌우", "상하"][i]}</label><input type="range" data-p="side.${k}" min="${k === "zoom" ? 0.6 : -0.4}" max="${k === "zoom" ? 1.6 : 0.4}" step="0.01" value="${st.side[k]}"></div>`).join("")}</div></div>
  <div class="card"><h3>정면 사진 구도</h3><div class="g3">${["zoom", "dx", "dy"].map((k, i) => `<div><label class="f">${["확대", "좌우", "상하"][i]}</label><input type="range" data-p="front.${k}" min="${k === "zoom" ? 0.6 : -0.4}" max="${k === "zoom" ? 1.6 : 0.4}" step="0.01" value="${st.front[k]}"></div>`).join("")}</div></div>`;
}
const SP_LABEL = { hairline: "헤어라인", glabella: "미간", noseTip: "코끝", subnasale: "코밑", stomion: "입술", chin: "턱끝", ear: "귀" };
POST[3] = E => {
  if (!st.ai) return;
  $$("#ft button", E).forEach(b => b.onclick = () => { let f = st.ai.faceType || []; f = f.includes(b.dataset.v) ? f.filter(x => x !== b.dataset.v) : [...f, b.dataset.v].slice(-2); st.ai.faceType = f; renderEd(); renderPreview(); save(); });
  $$("[data-side]", E).forEach(g => $$("button", g).forEach(b => b.onclick = () => { st.ai.side = st.ai.side || {}; st.ai.side[g.dataset.side] = b.dataset.v; renderEd(); renderPreview(); save(); }));
  drawSideEditor();
};
async function drawSideEditor() {
  const svg = $("#sideSvg"); if (!svg || !st.side.src) return; const img = await loadImage(st.side.src); const W = img.width, H = img.height, r = Math.max(W, H) / 110;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const pts = st.side.points || {};
  const def = { hairline: [.55, .36], glabella: [.44, .46], noseTip: [.40, .56], subnasale: [.43, .585], stomion: [.44, .62], chin: [.47, .69], ear: [.66, .53] };
  const P = k => (pts[k] || def[k]);
  svg.innerHTML = `<image href="${st.side.src}" width="${W}" height="${H}"/>` + Object.keys(def).map(k => `<g class="sp" data-k="${k}" style="cursor:move"><circle cx="${P(k)[0] * W}" cy="${P(k)[1] * H}" r="${r}" fill="#e0607e" fill-opacity=".7" stroke="#fff" stroke-width="${r / 4}"/><text x="${P(k)[0] * W + r * 1.4}" y="${P(k)[1] * H + r / 2}" fill="#fff" font-size="${r * 2.2}" font-weight="700" style="paint-order:stroke" stroke="#000" stroke-width="${r / 3}">${SP_LABEL[k]}</text></g>`).join("");
  let drag = null;
  svg.onpointerdown = e => { const g = e.target.closest(".sp"); if (!g) return; drag = g.dataset.k; svg.setPointerCapture(e.pointerId); };
  svg.onpointermove = e => { if (!drag) return; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    st.side.points = { ...def, ...(st.side.points || {}), [drag]: [q.x / W, q.y / H] }; const g = $(`.sp[data-k=${drag}]`, svg); $("circle", g).setAttribute("cx", q.x); $("circle", g).setAttribute("cy", q.y); $("text", g).setAttribute("x", q.x + r * 1.4); $("text", g).setAttribute("y", q.y + r / 2); };
  svg.onpointerup = async () => { if (!drag) return; drag = null; st.img.side = await makeSideOverlay(st); renderPreview(); save(); };
}
function needAI() { return `<div class="card">먼저 2단계에서 AI 분석을 실행해 주세요. <button class="btn sm" onclick="goStep(2)">AI 분석으로</button></div>`; }

/* ---------- 4. 비율 해석 ---------- */
function vRatio() {
  if (!st.ai) return needAI();
  const R = st.ratios;
  return `<h2>4. 비율 해석 (3·4쪽)</h2><p class="lead">앱 측정값을 근거로 AI가 쓴 해석입니다. 표 칸 크기에 맞게 3~5문장이 적당합니다.</p>
  <div class="card">${fld("ai.ratioText.thirds", `얼굴 전체 세로 비율 — ${esc(R.thirds)}`, 5)}${fld("ai.ratioText.aspect", `종횡비 — ${esc(R.aspect)}`, 4)}</div>
  <div class="card">${fld("ai.ratioText.eyePos", `눈 위치 — ${esc(R.eyePos)}`, 4)}${fld("ai.ratioText.eyeDist", `눈 거리 — ${esc(R.eyeDist)}`, 4)}</div>
  <div class="card">${fld("ai.ratioText.noseMouth", `코 위치 ${esc(R.nosePos)} · 입 위치 ${esc(R.mouthPos)} (한 칸)`, 8)}<p class="mut">비율 숫자를 고치려면 1단계에서 수정하세요.</p></div>`;
}

/* ---------- 5. 안경·귀걸이 ---------- */
function vAcc() {
  if (!st.ai) return needAI();
  const gs = st.ai.glasses || [], es = (st.ai.earrings || []).map(x => x.join(","));
  return `<h2>5. 안경·귀걸이 (4쪽)</h2><p class="lead">AI 추천에 체크되어 있습니다. 눌러서 추가·해제하세요.</p>
  <div class="card"><h3>추천 안경테</h3><div class="chips" id="gl">${GLASSES.map(([n]) => `<button data-v="${n}" class="${gs.includes(n) ? "on" : ""}">${n}</button>`).join("")}</div></div>
  <div class="card"><h3>추천 귀걸이 (크기 × 길이)</h3><table style="border-collapse:collapse">${["long", "medium", "short"].map(L => `<tr><td class="mut" style="padding:4px 8px">${{ long: "길이 김", medium: "중간", short: "짧음" }[L]}</td>${SIZES.map(S => `<td style="padding:3px"><button class="btn sm ${es.includes(S + "," + L) ? "pri" : ""}" data-ec="${S},${L}" style="width:110px">${{ small: "작음", medium: "중간", large: "큼" }[S]} · ${{ long: "김", medium: "중간", short: "짧음" }[L]}</button></td>`).join("")}</tr>`).join("")}<tr><td></td><td class="mut" colspan="3" style="text-align:center">크기 →</td></tr></table></div>`;
}
POST[5] = E => {
  if (!st.ai) return;
  $$("#gl button", E).forEach(b => b.onclick = () => { const g = st.ai.glasses || []; st.ai.glasses = g.includes(b.dataset.v) ? g.filter(x => x !== b.dataset.v) : [...g, b.dataset.v]; renderEd(); renderPreview(); save(); });
  $$("[data-ec]", E).forEach(b => b.onclick = () => { const k = b.dataset.ec; const cur = (st.ai.earrings || []).map(x => x.join(",")); st.ai.earrings = (cur.includes(k) ? cur.filter(x => x !== k) : [...cur, k]).map(x => x.split(",")); renderEd(); renderPreview(); save(); });
};

/* ---------- 6. 메이크업 ---------- */
function vMakeup() {
  if (!st.ai) return needAI();
  const an = st.ai.makeup.annotations; const s = st.ai.makeup.strategy || [];
  return `<h2>6. 메이크업 (5쪽)</h2><p class="lead">정면 사진에 하이라이터·쉐딩·블러셔 등 표시가 자동으로 그려집니다. 항목을 켜고 끄거나 손글씨 문구를 바꿀 수 있어요.</p>
  <div class="card"><h3>사진 표시 항목</h3><table style="width:100%;font-size:13px">${an.map((a, i) => `<tr><td style="width:24px"><input type="checkbox" data-an="${i}" ${a.on ? "checked" : ""}></td><td style="width:140px">${MK_KEYS[a.key]}</td><td><input type="text" data-p="ai.makeup.annotations.${i}.label" value="${esc(a.label)}"></td>${a.key === "blush" ? `<td><select data-p="ai.makeup.annotations.${i}.shape">${[["horizontal", "가로형"], ["diagonal", "사선형"], ["apple", "앞볼 원형"]].map(([v, n]) => `<option value="${v}" ${a.shape === v ? "selected" : ""}>${n}</option>`).join("")}</select></td>` : "<td></td>"}</tr>`).join("")}</table>
  <label class="f">사진 확대</label><input type="range" data-p="mk.zoom" min="0.7" max="1.4" step="0.01" value="${st.mk.zoom}"></div>
  <div class="card"><h3>메이크업 전략</h3>${s.map((x, i) => `${fld(`ai.makeup.strategy.${i}.title`, `${i + 1}. 제목`)}${fld(`ai.makeup.strategy.${i}.text`, "", 3)}`).join("")}</div>`;
}
POST[6] = E => { $$("[data-an]", E).forEach(c => c.onchange = async () => { st.ai.makeup.annotations[+c.dataset.an].on = c.checked; st.img.makeup = await makeMakeupAnnot(st); renderPreview(); save(); }); };

/* ---------- 7. 헤어 ---------- */
let hairSlot = 0, hairFilter = "all";
function vHair() {
  if (!st.ai) return needAI();
  const h = st.ai.hair; h.best = h.best || [];
  while (h.best.length < 3) h.best.push({ id: LIB[0].id, title: LIB[0].name, style: "", point: "" });
  const ft = (st.ai.faceType || [])[0];
  const list = LIB.filter(x => hairFilter === "all" || (hairFilter === "face" ? x.fromFace === ft : x.length === hairFilter));
  return `<h2>7. 헤어스타일링 (6쪽)</h2><p class="lead">사진은 기존 보고서에서 쓰신 헤어 사진 라이브러리(${LIB.length}장)에서 고릅니다. 얼굴은 회색 원으로 자동 가려집니다.</p>
  <div class="card">${fld("ai.hair.subtitle", "키워드 (제목 옆)")}${fld("ai.hair.caution", "**주의 (피할 스타일)")}</div>
  <div class="card"><div class="chips">${[0, 1, 2].map(i => `<button data-slot="${i}" class="${hairSlot === i ? "on" : ""}">Best ${i + 1}</button>`).join("")}</div>
    ${fld(`ai.hair.best.${hairSlot}.title`, "스타일 이름")}${fld(`ai.hair.best.${hairSlot}.style`, "스타일:", 2)}${fld(`ai.hair.best.${hairSlot}.point`, "포인트:", 3)}
    <label class="mut"><input type="checkbox" id="hc" ${st.hairCircle[hairSlot] !== false ? "checked" : ""}> 얼굴 회색 원으로 가리기</label>
    <label class="f">사진 고르기 — 현재: ${esc(LIB.find(x => x.id === h.best[hairSlot].id)?.name || "")}</label>
    <div class="chips" style="margin-bottom:6px">${[["all", "전체"], ["face", `${ft || "얼굴형"} 사례`], ["short", "단발"], ["medium", "중단발"], ["long", "롱"], ["updo", "묶음"]].map(([v, n]) => `<button data-hf="${v}" class="${hairFilter === v ? "on" : ""}">${n}</button>`).join("")}</div>
    <div class="hgal">${list.map(x => `<div data-hid="${x.id}" class="${h.best[hairSlot].id === x.id ? "on" : ""}"><img src="hair/${x.id}.jpg" loading="lazy"><span>${esc(x.name)}</span></div>`).join("")}</div></div>`;
}
POST[7] = E => {
  if (!st.ai) return;
  $$("[data-slot]", E).forEach(b => b.onclick = () => { hairSlot = +b.dataset.slot; renderEd(); });
  $$("[data-hf]", E).forEach(b => b.onclick = () => { hairFilter = b.dataset.hf; renderEd(); });
  $$("[data-hid]", E).forEach(d => d.onclick = async () => { const x = LIB.find(l => l.id === d.dataset.hid); const b = st.ai.hair.best[hairSlot]; const keepTitle = b.title && b.id !== x.id && !confirm("스타일 이름도 사진 이름으로 바꿀까요?"); b.id = x.id; if (!keepTitle) b.title = x.name;
    st.img.hair[hairSlot] = await makeHairImage(x, st.hairCircle[hairSlot] !== false); renderEd(); renderPreview(); save(); });
  $("#hc", E).onchange = async e => { st.hairCircle[hairSlot] = e.target.checked; const x = LIB.find(l => l.id === st.ai.hair.best[hairSlot].id); st.img.hair[hairSlot] = await makeHairImage(x, e.target.checked); renderPreview(); save(); };
};

/* ---------- 8. 저장·출력 ---------- */
function fileBase() { return `${(st.date || today()).replace(/-/g, "").slice(2)}_페이스_${st.name || "고객"}`; }
function vOut() {
  return `<h2>8. 저장·출력</h2><p class="lead">오른쪽에서 6쪽 전체를 확인하세요.</p>
  <div class="card"><h3>출력</h3><div class="row"><button class="btn pri" id="pdf">PDF 다운로드</button><button class="btn" id="prt">인쇄 / PDF로 저장</button></div></div>
  <div class="card"><h3>구글 드라이브</h3><p class="mut">'${esc(CFG.driveFolder)}' 폴더 안에 ${esc(fileBase())} 폴더를 만들고 PDF·작업파일(JSON)·사진을 저장합니다. 다음 분석 때 문체 참고자료로도 쓰입니다.</p>
    <div class="row"><button class="btn pri" id="dsave">드라이브에 저장</button><button class="btn" id="dlist">드라이브에서 불러오기</button></div><div id="dl"></div></div>
  <div class="card"><h3>작업 파일</h3><div class="row"><button class="btn" id="jsave">작업 파일 내려받기 (.json)</button><label class="btn">작업 파일 열기<input type="file" id="jload" accept=".json" style="display:none"></label><button class="btn" id="newc">새 고객</button></div></div>`;
}
POST[8] = E => {
  $("#pdf", E).onclick = async () => { busy("PDF 만드는 중…"); try { const b = await makePDF(); dl(fileBase() + ".pdf", b); } catch (e) { toast("PDF 오류: " + e.message); } busy(); };
  $("#prt", E).onclick = () => { $("#printArea").innerHTML = PAGES.map((_, i) => renderPage(st, i)).join(""); const o = document.title; document.title = fileBase(); setTimeout(() => { print(); document.title = o; }, 400); };
  $("#dsave", E).onclick = driveSave; $("#dlist", E).onclick = driveList;
  $("#jsave", E).onclick = () => dl(fileBase() + ".json", new Blob([JSON.stringify(st)], { type: "application/json" }));
  $("#jload", E).onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { st = Object.assign(newState(), JSON.parse(r.result)); goStep(3); save(); }; r.readAsText(f); };
  $("#newc", E).onclick = () => { if (confirm("새 고객 작업을 시작할까요? (지금 작업은 드라이브나 파일로 저장해 두세요)")) { st = newState(); goStep(1); save(); } };
};
function dl(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function makePDF() {
  if (!window.html2canvas) await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
  if (!window.jspdf) await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  const host = document.createElement("div"); host.style.cssText = "position:fixed;left:-10000px;top:0"; document.body.appendChild(host);
  const pdf = new jspdf.jsPDF({ unit: "mm", format: [182, 257] });
  for (let i = 0; i < PAGES.length; i++) {
    host.innerHTML = renderPage(st, i); await new Promise(r => setTimeout(r, 120));
    const cv = await html2canvas(host.firstElementChild, { scale: 2.4, backgroundColor: "#fff", useCORS: true });
    if (i) pdf.addPage([182, 257]); pdf.addImage(cv.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 182, 257);
  }
  host.remove(); return pdf.output("blob");
}

/* ================= 구글 드라이브 ================= */
function driveAuth() {
  return new Promise((res, rej) => {
    if (DRIVE.token && DRIVE.exp > Date.now() + 60000) return res(DRIVE.token);
    if (CFG.devNoAuth || !window.google?.accounts?.oauth2) return rej(new Error("드라이브는 실제 배포 환경에서 구글 로그인 후 사용할 수 있습니다"));
    DRIVE.client = google.accounts.oauth2.initTokenClient({ client_id: CFG.clientId, scope: "https://www.googleapis.com/auth/drive.file", hint: AUTH.email,
      callback: r => { if (r.error) return rej(new Error(r.error)); DRIVE.token = r.access_token; DRIVE.exp = Date.now() + (r.expires_in - 60) * 1000; res(DRIVE.token); } });
    DRIVE.client.requestAccessToken({ prompt: DRIVE.token ? "" : "consent" });
  });
}
async function gd(url, opt = {}) { const t = await driveAuth(); const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + t } }); if (!r.ok) throw new Error("드라이브 오류 " + r.status + " " + (await r.text()).slice(0, 120)); return r; }
async function gdFolder(name, parent) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parent ? ` and '${parent}' in parents` : ""));
  const j = await (await gd(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`)).json();
  if (j.files?.length) return j.files[0].id;
  const r = await gd("https://www.googleapis.com/drive/v3/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }) });
  return (await r.json()).id;
}
async function gdUpload(name, mime, data, parent) {
  const meta = new Blob([JSON.stringify({ name, parents: [parent] })], { type: "application/json" });
  const fd = new FormData(); fd.append("metadata", meta); fd.append("file", data instanceof Blob ? data : new Blob([data], { type: mime }));
  return (await gd("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", body: fd })).json();
}
const b64Blob = d => fetch(d).then(r => r.blob());
async function driveSave() {
  busy("드라이브에 저장 중…");
  try {
    const root = await gdFolder(CFG.driveFolder); const sub = await gdFolder(fileBase(), root);
    const pdf = await makePDF();
    await gdUpload(fileBase() + ".pdf", "application/pdf", pdf, sub);
    await gdUpload("project.json", "application/json", JSON.stringify(st), sub);
    if (st.front.src) await gdUpload("정면.jpg", "image/jpeg", await b64Blob(st.front.src), sub);
    if (st.side.src) await gdUpload("측면.jpg", "image/jpeg", await b64Blob(st.side.src), sub);
    toast("드라이브에 저장했어요: " + CFG.driveFolder + " / " + fileBase());
  } catch (e) { toast("저장 실패: " + esc(e.message), 7000); }
  busy();
}
async function driveFolders() {
  const root = await gdFolder(CFG.driveFolder);
  const q = encodeURIComponent(`'${root}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  return (await (await gd(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=50&fields=files(id,name,modifiedTime)`)).json()).files || [];
}
async function driveProject(folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and name='project.json' and trashed=false`);
  const f = (await (await gd(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)).json()).files?.[0]; if (!f) return null;
  return (await gd(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
}
async function driveList() {
  try { const fs = await driveFolders(); $("#dl").innerHTML = fs.length ? fs.map(f => `<div class="row" style="margin-top:6px"><button class="btn sm" data-df="${f.id}">열기</button> ${esc(f.name)} <span class="mut">${f.modifiedTime.slice(0, 10)}</span></div>`).join("") : `<p class="mut">저장된 보고서가 없습니다</p>`;
    $$("[data-df]").forEach(b => b.onclick = async () => { busy("불러오는 중…"); try { const p = await driveProject(b.dataset.df); if (p) { st = Object.assign(newState(), p); goStep(3); save(); } } catch (e) { toast(e.message); } busy(); }); }
  catch (e) { toast(esc(e.message), 6000); }
}
async function driveRecentExamples() {
  const fs = (await driveFolders()).slice(0, 3); const out = [];
  for (const f of fs) { const p = await driveProject(f.id).catch(() => null); if (p?.ai) out.push({ 얼굴형: p.ai.faceType, 비율: p.ratios, 해석: p.ai.ratioText, 측면요약: p.ai.sideSummary, 메이크업: p.ai.makeup?.strategy, 헤어: p.ai.hair }); }
  return out;
}

/* ================= 미리보기 · 자동저장 ================= */
let _pv = null;
function renderPreview() { clearTimeout(_pv); _pv = setTimeout(_renderPreview, 60); }
function _renderPreview() {
  const P = $(".pv"); if (!P || !st) return; const sc = $(".pscroll", P);
  $(".ptabs", P).innerHTML = PAGE_NAMES.map((n, i) => `<button data-p="${i}" class="${step !== 8 && pvPage === i ? "on" : ""}">${i + 1} ${n}</button>`).join("") + `<button data-p="-1" class="${step === 8 ? "on" : ""}">전체</button>`;
  $$(".ptabs button", P).forEach(b => b.onclick = () => { const p = +b.dataset.p; if (p < 0) return goStep(8); pvPage = p; const s = STEPS.find(x => x[2] === p); if (s && step === 8) step = s[0]; renderNav(); _renderPreview(); });
  const s = Math.min(1, (sc.clientWidth - 28) / 688);
  const one = i => `<div class="pwrap" style="width:${688 * s}px;height:${971 * s}px"><div style="transform:scale(${s});transform-origin:0 0">${renderPage(st, i)}</div></div>`;
  sc.innerHTML = step === 8 ? PAGES.map((_, i) => one(i)).join("") : one(pvPage);
}
const DB = {
  open() { return new Promise((res, rej) => { const r = indexedDB.open("lovlive-fa", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async set(k, v) { const db = await this.open(); return new Promise(r => { const tx = db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = r; tx.onerror = r; }); },
  async get(k) { const db = await this.open(); return new Promise(r => { const q = db.transaction("kv").objectStore("kv").get(k); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); },
};
let _sv = null; function save() { clearTimeout(_sv); _sv = setTimeout(() => DB.set("current", JSON.stringify(st)).catch(() => {}), 700); }
window.addEventListener("resize", () => renderPreview());
window.addEventListener("DOMContentLoaded", boot);
