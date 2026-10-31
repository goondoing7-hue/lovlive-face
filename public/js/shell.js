/* =====================================================================
   로그인(구글, 허용 2계정) · 서버 API · 구글 드라이브 · PDF
   ===================================================================== */
let CFG = {}, AUTH = { token: null, email: null, exp: 0 }, DRIVE = { token: null, exp: 0 };
function decodeJwt(t) { const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(decodeURIComponent(escape(atob(p)))); }
async function boot() {
  CFG = await (await fetch("/api/config")).json();
  if (CFG.devNoAuth) { AUTH.email = "dev(로컬)"; return init(); }
  const saved = JSON.parse(sessionStorage.getItem("lv_auth") || "null");
  if (saved && saved.exp * 1000 > Date.now() + 60000) { AUTH = saved; return init(); }
  showLogin();
}
function showLogin(msg) {
  let L = document.getElementById("login");
  if (!L) { L = document.createElement("div"); L.id = "login"; document.body.appendChild(L); }
  L.innerHTML = `<div class="lbox"><img src="${LOGO}" style="height:72px"><h1>페이스 분석결과지</h1><p>허용된 구글 계정으로 로그인해야 사용할 수 있습니다.<br>작업 중이던 내용은 브라우저에 저장되어 있습니다.</p><div id="gbtn"></div><p id="loginMsg" style="color:#c0392b">${msg ? esc(msg) : ""}</p></div>`;
  L.style.display = "flex";
  const go = () => { google.accounts.id.initialize({ client_id: CFG.clientId, callback: onCredential, auto_select: true }); google.accounts.id.renderButton(document.getElementById("gbtn"), { theme: "outline", size: "large", locale: "ko" }); google.accounts.id.prompt(); };
  if (window.google?.accounts?.id) go(); else { const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.onload = go; document.head.appendChild(s); }
}
function onCredential(r) {
  const p = decodeJwt(r.credential); const email = (p.email || "").toLowerCase();
  if (!CFG.allowed.includes(email)) { document.getElementById("loginMsg").textContent = `${email} 계정은 사용할 수 없습니다.`; return; }
  AUTH = { token: r.credential, email, exp: p.exp }; sessionStorage.setItem("lv_auth", JSON.stringify(AUTH));
  const L = document.getElementById("login"); if (L) L.style.display = "none";
  init();
}
function logout() { sessionStorage.removeItem("lv_auth"); try { google.accounts.id.disableAutoSelect(); } catch (e) {} location.reload(); }
async function apiPost(url, body) {
  if (!CFG.devNoAuth && AUTH.exp * 1000 < Date.now() + 30000) { showLogin("로그인 시간이 지났습니다. 다시 로그인한 뒤 버튼을 한 번 더 눌러 주세요."); throw new Error("다시 로그인이 필요합니다"); }
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (AUTH.token || "dev") }, body: JSON.stringify(body) });
  let j; try { j = await r.json(); } catch (e) { j = { error: r.status === 504 ? "시간 초과(504) — Vercel 함수 시간 제한을 확인해 주세요" : r.status === 413 ? "사진 용량이 너무 큽니다(413)" : "서버 응답 오류 " + r.status }; }
  if (r.status === 401) { showLogin(j.error); throw new Error(j.error); }
  if (!r.ok) throw new Error(j.error || "오류 " + r.status);
  return j;
}
function busy(msg) { let b = document.querySelector(".busy"); if (!msg) { b && b.remove(); return; } if (!b) { b = document.createElement("div"); b.className = "busy"; document.body.appendChild(b); } b.textContent = msg; }

/* ---------- PDF (A4, 8쪽) ---------- */
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function makePDF() {
  if (!window.html2canvas) await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js");
  if (!window.jspdf) await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js");
  const host = document.createElement("div"); host.style.cssText = "position:fixed;left:-10000px;top:0"; document.body.appendChild(host);
  const pdf = new jspdf.jsPDF({ unit: "mm", format: "a4" }); window.__pdfMode = true;
  for (let i = 0; i < PAGE_FUNCS.length; i++) {
    host.innerHTML = renderPage(st, i); await new Promise(r => setTimeout(r, 150));
    const cv = await html2canvas(host.firstElementChild, { scale: 2.2, backgroundColor: "#fff", useCORS: true });
    if (i) pdf.addPage("a4"); pdf.addImage(cv.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, 210, 297);
  }
  host.remove(); window.__pdfMode = false; return pdf.output("blob");
}
function dlBlob(name, blob) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

/* ---------- 구글 드라이브 (drive.file: 이 앱이 만든 파일만) ---------- */
function driveAuth() {
  return new Promise((res, rej) => {
    if (DRIVE.token && DRIVE.exp > Date.now() + 60000) return res(DRIVE.token);
    if (CFG.devNoAuth || !window.google?.accounts?.oauth2) return rej(new Error("드라이브는 배포 주소에서 로그인 후 사용할 수 있습니다"));
    const c = google.accounts.oauth2.initTokenClient({ client_id: CFG.clientId, scope: "https://www.googleapis.com/auth/drive.file", hint: AUTH.email,
      callback: r => { if (r.error) return rej(new Error(r.error)); DRIVE.token = r.access_token; DRIVE.exp = Date.now() + (r.expires_in - 60) * 1000; res(DRIVE.token); } });
    c.requestAccessToken({ prompt: DRIVE.token ? "" : "consent" });
  });
}
async function gd(url, opt = {}) { const t = await driveAuth(); const r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + t } }); if (!r.ok) throw new Error("드라이브 오류 " + r.status); return r; }
async function gdFolder(name, parent) {
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parent ? ` and '${parent}' in parents` : ""));
  const j = await (await gd(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)).json(); if (j.files?.length) return j.files[0].id;
  return (await (await gd("https://www.googleapis.com/drive/v3/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", ...(parent ? { parents: [parent] } : {}) }) })).json()).id;
}
async function gdUpload(name, data, parent, mime = "application/octet-stream") {
  const fd = new FormData(); fd.append("metadata", new Blob([JSON.stringify({ name, parents: [parent] })], { type: "application/json" }));
  fd.append("file", data instanceof Blob ? data : new Blob([data], { type: mime }));
  return (await gd("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", body: fd })).json();
}
async function driveSave() {
  busy("구글 드라이브에 저장 중…");
  try {
    const root = await gdFolder(CFG.driveFolder), sub = await gdFolder(fileBase(), root);
    await gdUpload(fileBase() + ".pdf", await makePDF(), sub, "application/pdf");
    await gdUpload("project.json", JSON.stringify(st), sub, "application/json");
    const b = d => fetch(d).then(r => r.blob());
    if (st.photos.frontOrig) await gdUpload("정면.jpg", await b(st.photos.frontOrig), sub);
    if (st.side.src) await gdUpload("측면.jpg", await b(st.side.src), sub);
    const imgs = [["헤어", st.texts.hair.items], ["안경", st.texts.glasses.items], ["귀걸이", st.texts.earrings.items]];
    for (const [n, arr] of imgs) for (let i = 0; i < arr.length; i++) if (arr[i].img) await gdUpload(`${n}${i + 1}.jpg`, await b(arr[i].img), sub);
    if (st.texts.makeup.fullImage) await gdUpload("메이크업가이드.jpg", await b(st.texts.makeup.fullImage), sub);
    toast(`드라이브에 저장했어요: ${CFG.driveFolder} / ${fileBase()}`);
  } catch (e) { toast("저장 실패: " + esc(e.message), 7000); }
  busy();
}
async function driveFolders() {
  const root = await gdFolder(CFG.driveFolder); const q = encodeURIComponent(`'${root}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  return (await (await gd(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=50&fields=files(id,name,modifiedTime)`)).json()).files || [];
}
async function driveProject(id) {
  const q = encodeURIComponent(`'${id}' in parents and name='project.json' and trashed=false`);
  const f = (await (await gd(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`)).json()).files?.[0]; if (!f) return null;
  return (await gd(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`)).json();
}
async function driveRecent() {
  const out = [];
  for (const f of (await driveFolders()).slice(0, 3)) { const p = await driveProject(f.id).catch(() => null); if (p?.texts) out.push({ p2: p.texts.p2, p3: p.texts.p3, side: { axes: p.side?.axes, title: p.side?.title, text: p.side?.text }, hair: { keywords: p.texts.hair.keywords, items: p.texts.hair.items.map(i => ({ name: i.name, desc: i.desc })) }, glasses: { formula: p.texts.glasses.formula, items: p.texts.glasses.items.map(i => ({ name: i.name, desc: i.desc })) } }); }
  return out;
}
