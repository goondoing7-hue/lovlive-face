/* =====================================================================
   얼굴 인식(MediaPipe) + 2쪽 측정선 이미지 + 5쪽 메이크업 주석 이미지 자동 생성
   ===================================================================== */
const FM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/";
let _fm = null, _fmResolve = null;
function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
async function fileToDataURL(file, max = 1600) {
  const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  return resizeDataURL(src, max);
}
async function resizeDataURL(src, max = 1024, q = 0.9) {
  const img = await loadImage(src); const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}
function ensureFaceMesh() {
  if (_fm) return Promise.resolve(_fm);
  return new Promise((res, rej) => {
    const go = () => { try {
      _fm = new FaceMesh({ locateFile: f => FM_BASE + f });
      _fm.setOptions({ staticImageMode: true, maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.4 });
      _fm.onResults(r => { if (_fmResolve) { const f = _fmResolve; _fmResolve = null; f(r); } }); res(_fm);
    } catch (e) { rej(e); } };
    if (window.FaceMesh) return go();
    const s = document.createElement("script"); s.src = FM_BASE + "face_mesh.js"; s.crossOrigin = "anonymous";
    s.onload = go; s.onerror = () => rej(new Error("얼굴 인식 모듈을 불러오지 못했습니다")); document.head.appendChild(s);
  });
}
async function detectLandmarks(src) {
  const fm = await ensureFaceMesh(); const img = await loadImage(src);
  const r = await Promise.race([new Promise(res => { _fmResolve = res; try { fm.reset && fm.reset(); } catch (e) {} fm.send({ image: img }); }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("얼굴 인식 시간 초과")), 30000))]);
  const lm = r.multiFaceLandmarks && r.multiFaceLandmarks[0]; if (!lm) return null;
  return { w: img.width, h: img.height, pts: lm.map(p => [p.x * img.width, p.y * img.height]) };
}
async function estimateHairline(src, pts) {
  const img = await loadImage(src); const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const cx = Math.round((pts[107][0] + pts[336][0]) / 2), eyeW = Math.abs(pts[263][0] - pts[33][0]), band = Math.max(3, Math.round(eyeW * 0.06));
  const y0 = Math.round(pts[151][1]);
  const sample = y => { const d = g.getImageData(cx - band, y - 1, band * 2, 3).data; let r = 0, gg = 0, b = 0, n = d.length / 4; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } return [r / n, gg / n, b / n]; };
  const skin = sample(y0), L = v => (v[0] + v[1] + v[2]) / 3, need = Math.max(3, Math.round(eyeW * 0.02)); let run = 0;
  for (let y = y0; y > 2; y--) { const px = sample(y); if (Math.hypot(px[0] - skin[0], px[1] - skin[1], px[2] - skin[2]) > 50 && L(px) < L(skin) * 0.75) { if (++run >= need) return y + run; } else run = 0; }
  return pts[10][1] - (pts[152][1] - pts[10][1]) * 0.12;
}
/** 정면 분석: 랜드마크 + 기준선 + 윤곽 수치 */
async function analyzeFrontPhoto(src) {
  const d = await detectLandmarks(src); if (!d) return null;
  const p = d.pts, hair = await estimateHairline(src, p);
  const avgY = ids => ids.reduce((s, i) => s + p[i][1], 0) / ids.length;
  const lines = { hair, brow: avgY([46, 53, 52, 65, 55, 276, 283, 282, 295, 285]), sn: p[2][1], stom: (p[13][1] + p[14][1]) / 2, chin: p[152][1], faceL: p[234][0], faceR: p[454][0] };
  const dx = (a, b) => Math.hypot(p[a][0] - p[b][0], p[a][1] - p[b][1]); const cheek = dx(234, 454);
  const metrics = { 이마폭_광대폭: +(dx(54, 284) / cheek).toFixed(2), 턱각폭_광대폭: +(dx(172, 397) / cheek).toFixed(2), 턱끝폭_광대폭: +(dx(176, 400) / cheek).toFixed(2), 세로_가로: +((lines.chin - lines.hair) / cheek).toFixed(2) };
  return { w: d.w, h: d.h, pts: p, lines, metrics };
}

/* ---------- 공통 캔버스 유틸 ---------- */
function makeCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
function drawCover(g, img, box, W, H) { g.fillStyle = "#eee"; g.fillRect(0, 0, W, H); g.drawImage(img, box[0], box[1], box[2], box[3], 0, 0, W, H); }
function arrowHead(g, x, y, ang, L) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - L * Math.cos(ang - 0.45), y - L * Math.sin(ang - 0.45)); g.moveTo(x, y); g.lineTo(x - L * Math.cos(ang + 0.45), y - L * Math.sin(ang + 0.45)); g.stroke(); }

/* ---------- 2쪽: 정면 측정선 이미지 (979×1124) ---------- */
async function makeFrontOverlay(st) {
  const F = st.front; if (!F.src) return null;
  const img = await loadImage(F.src); const W = 980, H = 1124;
  const L = F.lines || { hair: img.height * .2, brow: img.height * .38, sn: img.height * .56, stom: img.height * .62, chin: img.height * .75, faceL: img.width * .25, faceR: img.width * .75 };
  const fh = L.chin - L.hair, bh = fh / 0.66 * (F.zoom || 1), bw = bh * W / H;
  const cx = (L.faceL + L.faceR) / 2 + (F.dx || 0) * bw, top = L.hair - 0.17 * bh + (F.dy || 0) * bh;
  const box = [cx - bw / 2, top, bw, bh]; const s = W / bw; const X = x => (x - box[0]) * s, Y = y => (y - box[1]) * s;
  const c = makeCanvas(W, H), g = c.getContext("2d"); drawCover(g, img, box, W, H);
  g.strokeStyle = "rgba(70,70,70,.85)"; g.lineWidth = 3;
  for (const k of ["hair", "brow", "sn", "chin"]) { g.beginPath(); g.moveTo(0, Y(L[k])); g.lineTo(W, Y(L[k])); g.stroke(); }
  const ocx = X((L.faceL + L.faceR) / 2), rx = (L.faceR - L.faceL) / 2 * 1.03 * s, oy0 = Y(L.hair) + 12, oy1 = Y(L.chin);
  g.strokeStyle = "#111"; g.lineWidth = 7; g.beginPath(); g.ellipse(ocx, (oy0 + oy1) / 2, rx, (oy1 - oy0) / 2, 0, 0, Math.PI * 2); g.stroke();
  const iy0 = Y(L.brow) - (oy1 - oy0) * 0.1, iy1 = Y(L.stom) + (oy1 - oy0) * 0.08;
  g.lineWidth = 3.5; g.setLineDash([9, 8]); g.beginPath(); g.ellipse(ocx, (iy0 + iy1) / 2, rx * 0.6, (iy1 - iy0) / 2, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  return c.toDataURL("image/jpeg", 0.9);
}

/* ---------- 2쪽: 측면 측정선 이미지 (1000×1097) ---------- */
async function makeSideOverlay(st) {
  const S = st.side; if (!S.src) return null;
  const img = await loadImage(S.src); const W = 1000, H = 1097;
  const P = {}; const sp = S.points || {};
  const def = { hairline: [.55, .36], glabella: [.44, .46], noseTip: [.40, .56], subnasale: [.43, .585], stomion: [.44, .62], chin: [.47, .69], ear: [.66, .53] };
  for (const k in def) { const v = sp[k] || def[k]; P[k] = [v[0] * img.width, v[1] * img.height]; }
  const fh = P.chin[1] - P.hairline[1], bh = fh / 0.6 * (S.zoom || 1), bw = bh * W / H;
  const cx = (P.noseTip[0] + P.ear[0]) / 2 + (S.dx || 0) * bw, top = P.hairline[1] - 0.22 * bh + (S.dy || 0) * bh;
  const box = [cx - bw / 2, top, bw, bh]; const s = W / bw; const X = x => (x - box[0]) * s, Y = y => (y - box[1]) * s;
  const c = makeCanvas(W, H), g = c.getContext("2d"); drawCover(g, img, box, W, H);
  const xs = Math.min(X(P.noseTip[0]), X(P.chin[0])) - 60, xe = X(P.ear[0]) + 140;
  const lv = ["hairline", "glabella", "subnasale", "stomion", "chin"];
  g.strokeStyle = "rgba(40,40,40,.85)"; g.lineWidth = 2.6;
  const x0 = Math.min(xs, xe), x1 = Math.max(xs, xe);
  for (const k of lv) { g.beginPath(); g.moveTo(x0, Y(P[k][1])); g.lineTo(x1, Y(P[k][1])); g.stroke(); }
  const ax = (X(P.glabella[0]) + X(P.ear[0])) / 2;
  for (const [a, b] of [["hairline", "glabella"], ["glabella", "subnasale"], ["subnasale", "chin"]]) {
    const y0 = Y(P[a][1]) + 4, y1 = Y(P[b][1]) - 4; g.beginPath(); g.moveTo(ax, y0); g.lineTo(ax, y1); g.stroke();
    arrowHead(g, ax, y0, -Math.PI / 2, 16); arrowHead(g, ax, y1, Math.PI / 2, 16);
  }
  const n = [X(P.noseTip[0]), Y(P.noseTip[1])], ch = [X(P.chin[0]), Y(P.chin[1])], dxv = ch[0] - n[0], dyv = ch[1] - n[1];
  g.lineWidth = 2.2; g.beginPath(); g.moveTo(n[0] - dxv * 0.7, n[1] - dyv * 0.7); g.lineTo(ch[0] + dxv * 0.6, ch[1] + dyv * 0.6); g.stroke();
  return c.toDataURL("image/jpeg", 0.9);
}

/* ---------- 5쪽: 메이크업 주석 이미지 (1315×1405) ---------- */
const MK_KEYS = {
  forehead_hl: "이마 하이라이터", brow: "눈썹 디자인", temple_shade: "관자 쉐딩", nose_shade: "콧대 옆 쉐딩", nose_hl: "콧등 하이라이터", under_eye: "눈 밑 삼각존·애교살",
  blush: "블러셔", concealer: "콧볼 주변 컨실러", lip_peak_hl: "입술산 위 하이라이터", lip_line: "입술산 강조", jaw_shade: "턱선 쉐딩", chin_shade: "턱끝 쉐딩", chin_hl: "턱끝 하이라이터",
};
async function makeMakeupAnnot(st) {
  const F = st.front; if (!F.src) return null;
  const img = await loadImage(F.src); const W = 1315, H = 1405;
  const c = makeCanvas(W, H), g = c.getContext("2d");
  if (!F.pts) { const s = Math.min(W / img.width, H / img.height); g.fillStyle = "#eee"; g.fillRect(0, 0, W, H); g.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s); return c.toDataURL("image/jpeg", 0.9); }
  const p = i => F.pts[i], L = F.lines;
  const fw = L.faceR - L.faceL, fh = L.chin - L.hair, ew = Math.abs(p(133)[0] - p(33)[0]);
  const bw = fw * 1.8 / (st.mk.zoom || 1), bh = bw * H / W, cx = (L.faceL + L.faceR) / 2, top = L.hair - fh * 0.3;
  const box = [cx - bw / 2, L.hair - fh * 0.22, bw, bh]; drawCover(g, img, box, W, H);
  const s = W / bw; g.save(); g.setTransform(s, 0, 0, s, -box[0] * s, -box[1] * s);
  const lw = 1 / s; // 1 캔버스 px
  await document.fonts.load(`${Math.round(ew * 0.33 * s)}px "Nanum Pen Script"`).catch(() => {});
  const fontPx = ew * 0.4;
  const on = {}; (st.ai?.makeup?.annotations || []).forEach(a => { on[a.key] = a; });
  const A = k => on[k] && on[k].on;
  const lab = k => (on[k] && on[k].label) || MK_KEYS[k];
  const PINK = "rgba(238,180,198,.55)", PINK_L = "rgba(255,255,255,.8)", BROWN = "rgba(120,78,58,.5)", BROWN_L = "rgba(70,40,25,.75)", WHITE = "rgba(255,255,255,.45)";
  function hatchShape(path, fill, line, ang = -35, gap = ew * 0.07) {
    g.save(); path(); g.fillStyle = fill; g.fill(); g.clip();
    g.strokeStyle = line; g.lineWidth = 2.2 * lw; const R = ew * 3, a = ang * Math.PI / 180;
    g.beginPath(); const bb = path.bb; const ccx = bb[0], ccy = bb[1];
    for (let t = -R; t < R; t += gap) { g.moveTo(ccx + t * Math.cos(a + Math.PI / 2) - R * Math.cos(a), ccy + t * Math.sin(a + Math.PI / 2) - R * Math.sin(a)); g.lineTo(ccx + t * Math.cos(a + Math.PI / 2) + R * Math.cos(a), ccy + t * Math.sin(a + Math.PI / 2) + R * Math.sin(a)); }
    g.stroke(); g.restore(); path(); g.strokeStyle = line; g.lineWidth = 2.4 * lw; g.stroke();
  }
  const ell = (x, y, rx, ry, rot = 0) => { const f = () => { g.beginPath(); g.ellipse(x, y, rx, ry, rot * Math.PI / 180, 0, Math.PI * 2); }; f.bb = [x, y]; return f; };
  const poly = pts => { const f = () => { g.beginPath(); pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); }; f.bb = [pts.reduce((s, q) => s + q[0], 0) / pts.length, pts.reduce((s, q) => s + q[1], 0) / pts.length]; return f; };
  const labels = [];
  const label = (text, at, to, rot = 0) => labels.push({ text, at, to, rot });

  if (A("forehead_hl")) { const c0 = [p(151)[0], (p(151)[1] + p(9)[1]) / 2 - ew * 0.15]; hatchShape(ell(c0[0], c0[1], ew * 0.85, ew * 0.2), PINK, PINK_L, -30); label(lab("forehead_hl"), [c0[0] - ew * 0.95, c0[1] - ew * 0.45], [c0[0] - ew * 0.15, c0[1] - ew * 0.22]); }
  if (A("brow")) {
    for (const [up, lo] of [[[70, 63, 105, 66, 107], [46, 53, 52, 65, 55]], [[300, 293, 334, 296, 336], [276, 283, 282, 295, 285]]]) {
      const pts = [...up.map(i => [p(i)[0], p(i)[1] - ew * 0.04]), ...lo.slice().reverse().map(i => [p(i)[0], p(i)[1] + ew * 0.02])];
      hatchShape(poly(pts), WHITE, "rgba(255,255,255,.85)", 20, ew * 0.06);
    }
    const tgt = [p(334)[0], p(334)[1] - ew * 0.05]; label(lab("brow"), [tgt[0] + ew * 0.1, tgt[1] - ew * 0.75], [tgt[0] + ew * 0.05, tgt[1] - ew * 0.1], 8);
  }
  if (A("temple_shade")) {
    for (const [i, j, d] of [[127, 54, -1], [356, 284, 1]]) { const c0 = [(p(i)[0] + p(j)[0]) / 2, (p(i)[1] + p(j)[1]) / 2 + ew * 0.15]; hatchShape(ell(c0[0], c0[1], ew * 0.14, ew * 0.42, d * 15), BROWN, BROWN_L, 40); label(lab("temple_shade"), [c0[0] + d * ew * 0.6, c0[1] + ew * 0.05], [c0[0] + d * ew * 0.12, c0[1]]); }
  }
  if (A("nose_shade")) {
    g.strokeStyle = BROWN_L; g.lineWidth = 3 * lw;
    for (const [a, b, c2] of [[55, 193, 129], [285, 417, 358]]) { g.beginPath(); g.moveTo(p(a)[0], p(a)[1]); g.quadraticCurveTo(p(b)[0], p(b)[1] + ew * 0.3, p(c2)[0], p(c2)[1] - ew * 0.15); g.stroke(); }
    label(lab("nose_shade"), [p(55)[0] - ew * 0.6, p(195)[1] - ew * 0.05], [p(193)[0] - ew * 0.05, p(195)[1] - ew * 0.15]);
  }
  if (A("nose_hl")) { const c0 = [p(6)[0], (p(6)[1] + p(195)[1]) / 2]; hatchShape(ell(c0[0], c0[1], ew * 0.08, ew * 0.33), PINK, PINK_L, -20, ew * 0.05); label(lab("nose_hl"), [c0[0] + ew * 0.55, c0[1] + ew * 0.1], [c0[0] + ew * 0.1, c0[1]]); }
  if (A("under_eye")) { for (const [i, j, k] of [[145, 133, 118], [374, 362, 347]]) hatchShape(poly([[p(i)[0], p(i)[1] + ew * 0.08], [p(j)[0], p(j)[1] + ew * 0.1], [p(k)[0], p(k)[1] + ew * 0.05]]), PINK, PINK_L, -30, ew * 0.05); label(lab("under_eye"), [p(347)[0] + ew * 0.5, p(347)[1] - ew * 0.1], [p(347)[0], p(347)[1]]); }
  if (A("blush")) {
    const shp = (on.blush && on.blush.shape) || "horizontal";
    for (const [i, d] of [[50, -1], [280, 1]]) { const c0 = [p(i)[0] + d * ew * 0.1, p(i)[1] - ew * 0.05];
      const e = shp === "apple" ? ell(c0[0], c0[1], ew * 0.32, ew * 0.3) : shp === "diagonal" ? ell(c0[0], c0[1], ew * 0.5, ew * 0.19, d * -20) : ell(c0[0], c0[1], ew * 0.52, ew * 0.18);
      hatchShape(e, PINK, PINK_L, -40); }
    label(lab("blush"), [p(280)[0] + ew * 0.55, p(280)[1] + ew * 0.35], [p(280)[0] + ew * 0.3, p(280)[1] + ew * 0.08]);
  }
  if (A("concealer")) {
    g.strokeStyle = "rgba(205,215,110,.95)"; g.lineWidth = 3 * lw; g.setLineDash([ew * 0.03, ew * 0.025]);
    for (const ids of [[64, 98, 97, 2], [294, 327, 326, 2]]) { g.beginPath(); ids.forEach((i, n) => { const q = [p(i)[0], p(i)[1] + ew * 0.05]; n ? g.lineTo(q[0], q[1]) : g.moveTo(q[0] + (i === 64 ? -ew * 0.05 : i === 294 ? ew * 0.05 : 0), q[1] - ew * 0.12); }); g.stroke(); }
    g.setLineDash([]); label(lab("concealer"), [p(294)[0] + ew * 0.45, p(294)[1] + ew * 0.15], [p(294)[0] + ew * 0.08, p(294)[1]]);
  }
  if (A("lip_peak_hl")) { const c0 = [p(0)[0], p(0)[1] - ew * 0.1]; hatchShape(ell(c0[0], c0[1], ew * 0.16, ew * 0.07), PINK, PINK_L, -30, ew * 0.04); label(lab("lip_peak_hl"), [p(61)[0] - ew * 0.75, p(0)[1] - ew * 0.2], [c0[0] - ew * 0.17, c0[1]]); }
  if (A("lip_line")) { g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = 3 * lw; g.beginPath(); [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291].forEach((i, n) => { const q = [p(i)[0], p(i)[1] - ew * 0.04]; n ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); label(lab("lip_line"), [p(291)[0] + ew * 0.35, p(17)[1] + ew * 0.4], [p(267)[0] + ew * 0.05, p(267)[1] - ew * 0.02]); }
  if (A("jaw_shade")) { for (const [i, d] of [[172, -1], [397, 1]]) { const c0 = [p(i)[0] - d * ew * 0.02, p(i)[1] + ew * 0.1]; hatchShape(ell(c0[0], c0[1], ew * 0.22, ew * 0.5, d * -25), BROWN, BROWN_L, 35); label(lab("jaw_shade"), [c0[0] + d * ew * 0.62, c0[1] - ew * 0.15], [c0[0] + d * ew * 0.22, c0[1] - ew * 0.05]); } }
  if (A("chin_shade")) { const c0 = [p(152)[0], p(152)[1] + ew * 0.02]; hatchShape(ell(c0[0], c0[1], ew * 0.42, ew * 0.11), BROWN, BROWN_L, 30); label(lab("chin_shade"), [c0[0] + ew * 0.85, c0[1] + ew * 0.3], [c0[0] + ew * 0.35, c0[1] + ew * 0.05]); }
  if (A("chin_hl")) { const c0 = [p(152)[0], p(152)[1] - ew * 0.18]; hatchShape(ell(c0[0], c0[1], ew * 0.18, ew * 0.08), PINK, PINK_L, -30, ew * 0.04); label(lab("chin_hl"), [c0[0] - ew * 0.75, c0[1] + ew * 0.25], [c0[0] - ew * 0.15, c0[1]]); }

  // 손글씨 라벨 + 곡선 화살표
  g.font = `${fontPx}px "Nanum Pen Script", "Gaegu", cursive`; g.textBaseline = "middle";
  for (const l of labels) {
    const [x, y] = l.at, [tx, ty] = l.to; const tw = g.measureText(l.text).width;
    const sx = x < tx ? x + tw * 0.5 : x - tw * 0.5; const sy = y + (ty > y ? fontPx * 0.45 : -fontPx * 0.45);
    g.strokeStyle = "rgba(20,20,20,.9)"; g.lineWidth = 2.4 * lw; g.beginPath(); g.moveTo(sx, sy);
    const mx = (sx + tx) / 2 + (ty - sy) * 0.25, my = (sy + ty) / 2 - (tx - sx) * 0.25; g.quadraticCurveTo(mx, my, tx, ty); g.stroke();
    arrowHead(g, tx, ty, Math.atan2(ty - my, tx - mx), ew * 0.09);
    g.save(); g.translate(x, y); if (l.rot && Math.abs(l.rot) <= 30) g.rotate(l.rot * Math.PI / 180);
    g.lineWidth = 6 * lw; g.strokeStyle = "rgba(255,255,255,.75)"; g.lineJoin = "round"; g.textAlign = "center"; g.strokeText(l.text, 0, 0);
    g.fillStyle = "#1a1a1a"; g.fillText(l.text, 0, 0); g.restore();
  }
  g.restore();
  return c.toDataURL("image/jpeg", 0.9);
}

/* 헤어 사진 + 회색 얼굴 가림 원 */
async function makeHairImage(h, circleOn = true) {
  const img = await loadImage("hair/" + h.id + ".jpg"); const W = 370, H = 460;
  const c = makeCanvas(W, H), g = c.getContext("2d"); const s = Math.max(W / img.width, H / img.height);
  const dw = img.width * s, dh = img.height * s, ox = (W - dw) / 2, oy = Math.min(0, (H - dh) * 0.2);
  g.drawImage(img, ox, oy, dw, dh);
  if (circleOn && h.circle) { const [cx, cy, r] = h.circle; g.fillStyle = "#c8c8c8"; g.beginPath(); g.arc(ox + cx * dw, oy + cy * dh, r * dw * 0.62, 0, Math.PI * 2); g.fill(); }
  return c.toDataURL("image/jpeg", 0.9);
}
