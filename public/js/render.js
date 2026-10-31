/* =====================================================================
   보고서 렌더링 (A4 794×1123px, 최근 양식 재현)
   ===================================================================== */
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl = s => esc(s).replace(/\n/g, "<br>");

/* ---- blob URL 캐시: 큰 dataURL을 여러 번 DOM에 넣지 않기 위해 ---- */
const BlobCache = {
  map: {},
  get(dataURL) {
    if (!dataURL) return "";
    if (window.__pdfMode) return dataURL;
    const key = dataURL.length + ":" + dataURL.slice(-64);
    if (this.map[key]) return this.map[key];
    const [head, b64] = dataURL.split(",");
    const mime = (head.match(/data:(.*?);/) || [, "image/jpeg"])[1];
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return (this.map[key] = URL.createObjectURL(new Blob([arr], { type: mime })));
  },
};

/* ---- 기하 유틸 ---- */
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const mid = (a, b) => lerp(a, b, 0.5);
function smoothPath(points, closed = false) {
  if (points.length < 2) return "";
  const p = closed ? [points[points.length - 1], ...points, points[0], points[1]] : [points[0], ...points, points[points.length - 1]];
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 1; i < p.length - 2; i++) {
    const [p0, p1, p2, p3] = [p[i - 1], p[i], p[i + 1], p[i + 2]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d + (closed ? "Z" : "");
}
function boxAround(pts, padX, padY) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0;
  return [x0 - w * padX, y0 - h * padY, w * (1 + 2 * padX), h * (1 + 2 * padY)];
}
function fitBox(box, aspect) { // aspect = w/h; expand to aspect around center
  let [x, y, w, h] = box; const cx = x + w / 2, cy = y + h / 2;
  if (w / h > aspect) h = w / aspect; else w = h * aspect;
  return [cx - w / 2, cy - h / 2, w, h];
}
const vb = b => b.map(v => v.toFixed(1)).join(" ");
function clampBox(box, W, H) {
  let [x, y, w, h] = box; const s = Math.min(1, W / w, H / h);
  if (s < 1) { const cx = x + w / 2, cy = y + h / 2; w *= s; h *= s; x = cx - w / 2; y = cy - h / 2; }
  x = Math.max(0, Math.min(W - w, x)); y = Math.max(0, Math.min(H - h, y));
  return [x, y, w, h];
}
function photoSVG(src, W, H, box, overlay = "", extra = "", clamp = true) {
  if (!src) return `<div class="ph-empty">사진 없음</div>`;
  if (clamp && W && H) box = clampBox(box, W, H);
  return `<svg class="ph" viewBox="${vb(box)}" preserveAspectRatio="xMidYMid slice" ${extra}><rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#eee"/><image href="${BlobCache.get(src)}" x="0" y="0" width="${W}" height="${H}"/>${overlay}</svg>`;
}

/* ---- 정면 사진 프레이밍 ---- */
function frontFrame(st, aspect) {
  const { h, v } = st.front.lines; const fr = st.front.frame || { zoom: 1, dx: 0, dy: 0 };
  const fh = h.chin - h.hair, fw = v.faceR - v.faceL;
  const H = fh / 0.78 / fr.zoom, W = H * aspect;
  const cx = (v.faceL + v.faceR) / 2 + fr.dx * fw, top = h.hair - 0.16 * H + fr.dy * fh;
  return [cx - W / 2, top, W, H];
}
function overlayP2(st) {
  const { h, v } = st.front.lines; const fw = v.faceR - v.faceL, fh = h.chin - h.hair;
  const sw = fw * 0.0125, cx = (v.faceL + v.faceR) / 2, cy = (h.hair + h.chin) / 2, rx = fw / 2, ry = fh / 2;
  const iTop = h.hair + 0.19 * fh, iBot = h.hair + 0.88 * fh, irx = rx * 0.66;
  const eyeY = (h.upLid + h.lowLid) / 2;
  const half = y => rx * Math.sqrt(Math.max(0, 1 - ((y - cy) / ry) ** 2));
  const hl = y => `<line x1="${cx - half(y)}" y1="${y}" x2="${cx + half(y)}" y2="${y}"/>`;
  return `<g fill="none" stroke="#111">
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" stroke-width="${sw}"/>
    <ellipse cx="${cx}" cy="${(iTop + iBot) / 2}" rx="${irx}" ry="${(iBot - iTop) / 2}" stroke-dasharray="${sw * 2.6} ${sw * 1.6}" stroke-width="${sw * 0.75}"/>
    <g stroke-width="${sw * 0.6}"><line x1="${cx}" y1="${h.hair}" x2="${cx}" y2="${h.chin}"/>${hl(eyeY)}${hl(h.sn)}</g></g>`;
}
function overlayP3(st) {
  const { h, v } = st.front.lines; const fw = v.faceR - v.faceL; const o = st.settings.overlay;
  const sw = fw * 0.008, x0 = v.faceL - fw * 0.12, x1 = v.faceR + fw * 0.17;
  const hs = ["hair", "brow", "sn", "chin"].map(k => `<line x1="${x0}" y1="${h[k]}" x2="${x1}" y2="${h[k]}"/>`).join("");
  const vk = [...(o.p3FaceEdges ? ["faceL", "faceR"] : []), ...(o.p3EyeLines ? ["eRi", "eLi"] : []), ...(o.p3EyeOuter ? ["eRo", "eLo"] : [])];
  const vs = vk.map(k => `<line x1="${v[k]}" y1="${h.hair}" x2="${v[k]}" y2="${h.chin}"/>`).join("");
  return `<g stroke="#3d2b1f" stroke-width="${sw}">${hs}</g><g stroke="#fff" stroke-width="${sw * 0.9}">${vs}</g>`;
}

/* ---- 공통 페이지 머리말 ---- */
function head(eyebrow, title, sub) {
  return `<div class="hd"><div class="eyebrow">${esc(eyebrow)}</div><div class="title">${esc(title)}</div>${sub ? `<div class="sub">${nl(sub)}</div>` : ""}</div>`;
}

/* ================= p1 표지 ================= */
function pageCover(st) {
  return `<section class="page p1"><div class="cv-name">${esc(st.client.name || "고객")}님</div>
  <div class="cv-box"><div class="cv-face">FACE</div><div class="cv-ko">페이스 분석결과지</div><div class="cv-ana">ANALYSIS</div></div>
  <img class="cv-logo" src="${LOGO}" alt=""></section>`;
}

/* ================= p2 한눈에 보는 페이스 밸런스 ================= */
function pageBalance(st) {
  const t = st.texts.p2; const F = st.photos.front;
  const box = frontFrame(st, 353 / 437);
  const det = (t.details || []).map(d => `<div class="dpart"><b>${esc(d.part)}</b><div>${nl(d.text)}</div></div>`).join("");
  return `<section class="page p2">${head(st.settings.brand, "한 눈에 보는 나의 페이스 밸런스", "얼굴형 이름보다 '어떤 비율이 함께 존재하는지'와 그래서 '무엇을 하면 되는지'를 먼저 보여줍니다.")}
  <div class="p2-photo">${photoSVG(F, st.front.w, st.front.h, box, overlayP2(st))}</div>
  <div class="p2-right"><div class="chip">${esc(t.chip1)}</div><div class="cdesc">${nl(t.desc1)}</div><div class="dbox">${det}</div></div>
  <div class="p2-key"><div class="lab">STYLE KEY</div><div class="ktitle">${esc(t.keyTitle)}</div><div class="ktext">${nl(t.keyText)}</div></div></section>`;
}

/* ================= p3 정면 비율 분석 ================= */
function pageFront(st) {
  const t = st.texts.p3; const m = roundRatios(effRatios(st)); const F = st.photos.front;
  const box = frontFrame(st, 353 / 448);
  const rows = [
    ["aspect", "얼굴종횡비", "1 : 1.43"], ["thirds", "상 : 중 : 하", "1 : 1 : 1"], ["eyes", "눈 너비", "1 : 1 : 1"],
    ["eyePos", "눈 위치", "1 : 1"], ["nosePos", "코 위치", "1 : 1"], ["mouthPos", "입 위치", "1 : 2"],
  ].map(([k, lab, std]) => `<div class="mcard"><div class="mlab">${lab}</div><div class="mrow"><span class="mval">${fmtRatio(k, m)}</span><span class="mstd">기준 ${std}</span></div><div class="mdesc">${esc(t.desc[k])}</div></div>`).join("");
  return `<section class="page p3">${head("FRONT BALANCE", "정면 비율 분석", "종횡비와 상·중·하안부, 눈·코·입의 위치를 한 화면에서 연결해 해석합니다.")}
  <div class="p3-photo">${photoSVG(F, st.front.w, st.front.h, box, overlayP3(st))}</div>
  <div class="p3-cards">${rows}</div>
  <div class="ibox"><div class="ilab">정면 해석</div><div class="ititle">${esc(t.title)}</div><div class="itext">${nl(t.text)}</div></div></section>`;
}

/* ================= p4 측면 비율 분석 ================= */
function sideFrame(st) {
  const S = st.side; const fr = S.frame || { zoom: 1, dx: 0, dy: 0 };
  const W = S.w, H = S.h; const asp = 334 / 454;
  let h = H / fr.zoom, w = h * asp; if (w > W / fr.zoom) { w = W / fr.zoom; h = w / asp; }
  const ok = (S.pts || []).filter(Boolean);
  const bx = ok.length ? ok.reduce((s, p) => s + p[0], 0) / ok.length + w * 0.22 : W / 2, by = ok.length ? ok.reduce((s, p) => s + p[1], 0) / ok.length - h * 0.08 : H / 2;
  const cx = bx + fr.dx * W, cy = by + fr.dy * H;
  return [cx - w / 2, cy - h / 2, w, h];
}
function overlaySide(st) {
  const P = st.side.pts || []; const n = P[0], c = P[2]; if (!n || !c) return "";
  const sz = Math.max(st.side.w, st.side.h) * 0.0045, dx = c[0] - n[0], dy = c[1] - n[1];
  return `<line x1="${n[0] - dx * 0.35}" y1="${n[1] - dy * 0.35}" x2="${c[0] + dx * 0.12}" y2="${c[1] + dy * 0.12}" stroke="#e03131" stroke-width="${sz}" stroke-linecap="round"/>`;
}
function pageSide(st) {
  const S = st.side;
  const axes = S.axes.map((a, i) => `<div class="axcard"><div class="axt">${i + 1}. ${esc(a.title)}</div><div class="axd">${nl(a.text)}</div></div>`).join("");
  return `<section class="page p4">${head("SIDE PROFILE", "측면 비율 분석", "E-line은 참고선으로만 사용하고, 입술·턱·하안부의 관계를 함께 봅니다.")}
  <div class="p4-photo">${S.src ? photoSVG(S.src, S.w, S.h, sideFrame(st), overlaySide(st)) : `<div class="ph-empty">측면 사진</div>`}</div>
  <div class="p4-right"><div class="axlab">PROFILE 4 AXES</div>${axes}</div>
  <div class="ibox"><div class="ilab">측면 해석</div><div class="ititle">${esc(S.title)}</div><div class="itext">${nl(S.text)}</div></div></section>`;
}

/* ================= p5 헤어 BEST 3 ================= */
function pageHair(st) {
  const t = st.texts.hair; const F = st.photos.front;
  const cards = t.items.map(it => {
    const img = it.img ? `<img src="${BlobCache.get(it.img)}" alt="">` : (F ? `<div class="ph-wrap ph-ghost">${photoSVG(F, st.front.w, st.front.h, frontFrame(st, 259 / 293))}<span>AI 헤어 이미지 생성 전</span></div>` : `<div class="ph-empty">헤어 이미지</div>`);
    return `<div class="hcard"><div class="himg">${img}</div><div class="hname">${nl(it.name)}</div><div class="hdesc">${nl(it.desc)}</div></div>`;
  }).join("");
  const vol = t.volume.map(v => `<div class="vcol"><div class="vz">${esc(v.zone)}</div><div class="vt">${nl(v.text)}</div></div>`).join("");
  return `<section class="page p5">${head("HAIR DESIGN", "헤어 BEST 3", "")}
  <div class="hkw">${esc(t.keywords || t.subtitle || "")}</div><div class="hdesc0">${nl(t.desc || "")}</div>
  <div class="hrow">${cards}</div>
  <div class="vmap"><div class="vlab">VOLUME MAP</div><div class="vgrid">${vol}</div></div>
  <div class="ibox avoid"><div class="ilab">AVOID</div><div class="atext">${nl(t.avoid)}</div><div class="ilab b2">BASIC STYLE</div><div class="atext">${esc(t.basic || "")}</div></div></section>`;
}

/* ================= p6 맞춤 메이크업 ================= */
const PINK = "#e0607e";
function mkCtx(st) {
  const P = st.front.pts; if (!P) return null;
  const p = i => P[i];
  const ew = Math.abs(p(133)[0] - p(33)[0]), fw = Math.abs(p(454)[0] - p(234)[0]);
  return { p, ew, fw, F: st.photos.front, W: st.front.w, H: st.front.h, sw: ew * 0.035 };
}
const dash = (c, sw) => `fill="none" stroke="${c}" stroke-width="${sw}" stroke-dasharray="${sw * 3} ${sw * 2}" stroke-linecap="round"`;
function arrow(a, b, sw, color = PINK) {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = sw * 4;
  const h1 = [b[0] - L * Math.cos(ang - 0.5), b[1] - L * Math.sin(ang - 0.5)], h2 = [b[0] - L * Math.cos(ang + 0.5), b[1] - L * Math.sin(ang + 0.5)];
  return `<g stroke="${color}" stroke-width="${sw}" fill="none" stroke-linecap="round"><line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/><polyline points="${h1.join(",")} ${b.join(",")} ${h2.join(",")}"/></g>`;
}
function makeupHeaderPhoto(st) {
  const c = mkCtx(st); const F = st.photos.front; if (!F) return `<div class="ph-empty">사진</div>`;
  const { h, v } = st.front.lines; const fh = h.chin - h.hair;
  const box = fitBox([v.faceL - (v.faceR - v.faceL) * 0.6, h.hair - fh * 0.1, (v.faceR - v.faceL) * 2.2, fh * 1.25], 220 / 210);
  if (!c) return photoSVG(F, st.front.w, st.front.h, box);
  const { p, ew } = c; const fs = ew * 0.24;
  const labels = [[1, "눈썹", p(105), 1], [2, "아이메이크업", p(159), 1], [3, "코", p(4), 1], [5, "입술", p(291), 1], [7, "피부 표현", p(425), 1], [4, "블러셔", p(50), -1], [6, "윤곽 쉐딩", p(172), -1]];
  const gap = fs * 2.1;
  [1, -1].forEach(d => { const L = labels.filter(l => l[3] === d).sort((a, b) => a[2][1] - b[2][1]); let last = -1e9; L.forEach(l => { l[4] = Math.max(l[2][1], last + gap); last = l[4]; }); });
  const ov = labels.map(([n, t, q, d, ty]) => {
    const tx = d > 0 ? v.faceR + ew * 0.15 : v.faceL - ew * 0.15;
    const w = fs * (t.length * 0.95 + 2.2), x = d > 0 ? tx : tx - w;
    return `<polyline points="${q[0]},${q[1]} ${(q[0] + tx) / 2},${ty} ${tx},${ty}" fill="none" stroke="${PINK}" stroke-width="${ew * 0.02}"/><circle cx="${q[0]}" cy="${q[1]}" r="${ew * 0.04}" fill="${PINK}"/>
      <rect x="${x}" y="${ty - fs * 0.85}" width="${w}" height="${fs * 1.7}" rx="${fs * 0.85}" fill="#fff" stroke="${PINK}" stroke-width="${ew * 0.02}"/>
      <text x="${x + fs * 0.6}" y="${ty + fs * 0.35}" font-size="${fs}" fill="${PINK}" font-weight="700">${n}</text><text x="${x + fs * 1.5}" y="${ty + fs * 0.35}" font-size="${fs}" fill="#333">${t}</text>`;
  }).join("");
  return photoSVG(F, st.front.w, st.front.h, box, ov, "", false);
}
function pageMakeup(st) {
  const t = st.texts.makeup;
  if (t.mode !== "template" && t.mode !== "image") return pageMakeupGuide(st);
  if (t.mode !== "template") return t.fullImage ? `<section class="page p6 full"><img src="${BlobCache.get(t.fullImage)}" alt=""></section>` : `<section class="page p6"><div class="ph-empty" style="position:absolute;inset:40px">메이크업 가이드 — 6단계에서 GPT로 생성하거나 템플릿 방식을 고르세요</div></section>`;
  const F = st.photos.front;
  const sec = (k, n, compact) => {
    const s = t.sections[k]; const crops = makeupCrops(st, k, s.variant);
    const imgs = s.steps.map((cap, i) => {
      const cr = crops && crops[i];
      const im = cr ? photoSVG(F, st.front.w, st.front.h, cr.box, cr.ov) : `<div class="ph-empty sm">사진</div>`;
      return `<div class="mstep"><div class="mimg">${im}</div><div class="mcap"><b>${["①", "②", "③"][i]}</b>${nl(cap)}</div></div>`;
    }).join("");
    return `<div class="msec ${compact ? "compact" : ""}"><div class="mhead"><span class="mnum">${n}</span><span class="mtit">${esc(s.title)}</span><span class="msub">${esc(s.sub)}</span></div>
      <div class="mbody"><div class="msteps">${imgs}</div><div class="mpts"><div class="mplab">메이크업 포인트</div><ul>${s.points.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div></div>`;
  };
  const kp = t.keyPoints.map((x, i) => `<li><b>${i + 1}</b>${esc(x)}</li>`).join("");
  const skin = t.sections.skin; const sc = makeupCrops(st, "skin", skin.variant);
  return `<section class="page p6">
  <div class="mtop"><div class="mphoto">${makeupHeaderPhoto(st)}</div>
    <div class="mtitle"><div class="mt1">${esc(t.title)}</div><div class="mt2">${nl(t.head)}</div><div class="mt3">${nl(t.intro)}</div></div>
    <div class="mkey"><div class="mklab">핵심 포인트</div><ol>${kp}</ol></div></div>
  <div class="msecs">${["brow", "eye", "nose", "blush", "contour"].map((k, i) => sec(k, i + 1)).join("")}</div>
  <div class="mlast">${sec("lip", 6, true)}
    <div class="msec skin"><div class="mhead"><span class="mnum">7</span><span class="mtit">${esc(skin.title)}</span><span class="msub">${esc(skin.sub)}</span></div>
      <div class="mbody"><div class="mimg sq">${sc ? photoSVG(F, st.front.w, st.front.h, sc[0].box) : `<div class="ph-empty sm">사진</div>`}</div>
      <div class="mpts"><div class="mplab">메이크업 포인트</div><ul>${skin.points.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div></div></div></div>
  </section>`;
}

/* ================= 안경 착용 시뮬레이션 ================= */
const LENS_H = { round: 0.9, oval: 0.66, softSquare: 0.74, wellington: 0.78, boston: 0.86, cateye: 0.66, rimless: 0.72, hexa: 0.8 };
function lensPath(shape, a, b) { // 로컬 좌표: +x = 바깥쪽
  const k = 0.5523;
  switch (shape) {
    case "round": case "oval": return `M${-a},0 C${-a},${-b * k * 1.0 - b * (1 - k)} ${-a * k},${-b} 0,${-b} C${a * k},${-b} ${a},${-b * k} ${a},0 C${a},${b * k} ${a * k},${b} 0,${b} C${-a * k},${b} ${-a},${b * k} ${-a},0Z`;
    case "softSquare": case "rimless": { const r = b * 0.45; return `M${-a + r},${-b} L${a - r},${-b} Q${a},${-b} ${a},${-b + r} L${a},${b - r} Q${a},${b} ${a - r},${b} L${-a + r},${b} Q${-a},${b} ${-a},${b - r} L${-a},${-b + r} Q${-a},${-b} ${-a + r},${-b}Z`; }
    case "wellington": { const r = b * 0.35; return `M${-a + r},${-b} L${a - r},${-b} Q${a + a * 0.04},${-b} ${a},${-b + r} L${a * 0.9},${b - r} Q${a * 0.86},${b} ${a * 0.86 - r},${b} L${-a * 0.86 + r},${b} Q${-a * 0.86},${b} ${-a * 0.9},${b - r} L${-a},${-b + r} Q${-a},${-b} ${-a + r},${-b}Z`; }
    case "boston": return `M${-a * 0.9},${-b} L${a * 0.9},${-b} Q${a * 1.02},${-b} ${a},${-b * 0.5} C${a},${b * 0.6} ${a * 0.55},${b} 0,${b} C${-a * 0.55},${b} ${-a},${b * 0.6} ${-a},${-b * 0.5} Q${-a * 1.02},${-b} ${-a * 0.9},${-b}Z`;
    case "cateye": return `M${-a},${-b * 0.6} Q${-a * 0.6},${-b * 1.05} ${a * 0.3},${-b * 1.05} Q${a * 1.05},${-b * 1.25} ${a * 1.08},${-b * 0.7} C${a},${b * 0.5} ${a * 0.5},${b} 0,${b} C${-a * 0.6},${b} ${-a},${b * 0.5} ${-a},${-b * 0.6}Z`;
    case "hexa": return `M${-a * 0.55},${-b} L${a * 0.55},${-b} L${a},${-b * 0.25} L${a * 0.8},${b * 0.8} L${a * 0.45},${b} L${-a * 0.45},${b} L${-a * 0.8},${b * 0.8} L${-a},${-b * 0.25}Z`;
  }
  return lensPath("oval", a, b);
}
function glassesSVG(st, item, idx, scales) {
  const F = st.photos.front; if (!F) return `<div class="ph-empty">사진</div>`;
  if (item.useUpload && item.img) return `<img src="${BlobCache.get(item.img)}" alt="">`;
  const { h, v } = st.front.lines; const ew = v.eRi - v.eRo, fw = v.faceR - v.faceL, fh = h.chin - h.hair;
  const eyeY = (h.upLid + h.lowLid) / 2;
  const GH = fh / 0.6, GW = GH * 157 / 160; const box = [(v.faceL + v.faceR) / 2 - GW / 2, h.hair - 0.17 * GH, GW, GH];
  const sizeK = 1 + ((scales?.[1] ?? 2) - 2) * 0.07, widthK = 1 + ((scales?.[2] ?? 2) - 2) * 0.05;
  const a = ew * 0.5 * 1.58 * sizeK * widthK * (item.size || 1), b = a * (LENS_H[item.shape] ?? 0.72);
  const acetate = ["black", "tortoise", "brown"].includes(item.color);
  const rimless = item.shape === "rimless", clear = item.color === "clear";
  const th = ew * (acetate ? 0.075 + 0.03 * (scales?.[0] ?? 2) : 0.028 + 0.016 * (scales?.[0] ?? 1)) * (rimless ? 0.4 : 1);
  const col = (METAL_COLORS[item.color] || METAL_COLORS.silver)[0];
  const gid = "gl" + idx + Math.random().toString(36).slice(2, 7);
  const cR = [(v.eRo + v.eRi) / 2 - ew * 0.04, eyeY + ew * 0.05], cL = [(v.eLi + v.eLo) / 2 + ew * 0.04, eyeY + ew * 0.05];
  const lp = lensPath(item.shape, a, b);
  const metalGrad = `<linearGradient id="${gid}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="${col}"/><stop offset=".6" stop-color="${col}"/><stop offset="1" stop-color="#3a3a3a" stop-opacity=".9"/></linearGradient>`;
  const tort = `<pattern id="${gid}t" patternUnits="userSpaceOnUse" width="${ew * 0.5}" height="${ew * 0.5}"><rect width="${ew * 0.5}" height="${ew * 0.5}" fill="#5a3a22"/><circle cx="${ew * 0.12}" cy="${ew * 0.15}" r="${ew * 0.09}" fill="#a26a35"/><circle cx="${ew * 0.36}" cy="${ew * 0.33}" r="${ew * 0.07}" fill="#2e1d10"/><circle cx="${ew * 0.32}" cy="${ew * 0.08}" r="${ew * 0.05}" fill="#c08a4a"/></pattern>`;
  const lensGrad = `<linearGradient id="${gid}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".45" stop-color="#fff" stop-opacity=".04"/><stop offset="1" stop-color="#bcd" stop-opacity=".1"/></linearGradient>`;
  const defs = `<defs>${metalGrad}${tort}${lensGrad}<filter id="${gid}s" filterUnits="userSpaceOnUse" x="0" y="0" width="${st.front.w}" height="${st.front.h}"><feGaussianBlur stdDeviation="${ew * 0.025}"/></filter></defs>`;
  const frameStroke = item.color === "tortoise" ? `url(#${gid}t)` : acetate ? col : clear ? "#d9cfc4" : `url(#${gid}m)`;
  const op = clear ? 0.6 : rimless ? 0.75 : 1;
  const tf = (c, dir) => `translate(${c[0]} ${c[1]}) scale(${dir} 1)`;
  const shadow = [cR, cL].map((c, i) => `<path d="${lp}" transform="translate(${c[0] + ew * 0.03} ${c[1] + ew * 0.07}) scale(${i ? 1 : -1} 1)" fill="none" stroke="#000" stroke-width="${th * 1.1}"/>`).join("");
  const lens = (c, dir) => `<path d="${lp}" transform="${tf(c, dir)}" fill="url(#${gid}l)" stroke="${frameStroke}" stroke-width="${th}" stroke-opacity="${op}" stroke-linejoin="round"/>`
    + (acetate ? "" : `<path d="${lp}" transform="${tf(c, dir)}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="${th * 0.25}" stroke-dasharray="${a * 0.9} ${a * 6}"/>`);
  const innerR = cR[0] + a * 0.97, innerL = cL[0] - a * 0.97, by = cR[1] - b * 0.48;
  const bridge = `<path d="M${innerR},${by} Q${(innerR + innerL) / 2},${by - b * 0.32} ${innerL},${by}" fill="none" stroke="${frameStroke}" stroke-width="${th * (acetate ? 1 : 0.85)}" stroke-opacity="${op}" stroke-linecap="round"/>`;
  const pads = acetate || rimless ? "" : [[innerR - a * 0.1, cR[1] + b * 0.25], [innerL + a * 0.1, cL[1] + b * 0.25]].map(q => `<ellipse cx="${q[0]}" cy="${q[1]}" rx="${ew * 0.04}" ry="${ew * 0.065}" fill="#fff" fill-opacity=".35" stroke="#999" stroke-opacity=".5" stroke-width="${ew * 0.008}"/>`).join("");
  const tY = cR[1] - b * 0.55;
  const temples = `<g stroke="${frameStroke}" stroke-opacity="${op * 0.95}" stroke-linecap="round"><path d="M${cR[0] - a * 0.98},${tY} L${v.faceL + fw * 0.015},${tY - ew * 0.03}" stroke-width="${th * (acetate ? 0.9 : 0.8)}"/><path d="M${cL[0] + a * 0.98},${tY} L${v.faceR - fw * 0.015},${tY - ew * 0.03}" stroke-width="${th * (acetate ? 0.9 : 0.8)}"/></g>`
    + (acetate ? "" : [[cR[0] - a * 0.98, tY], [cL[0] + a * 0.98, tY]].map(q => `<circle cx="${q[0]}" cy="${q[1]}" r="${th * 0.9}" fill="${col}" stroke="#555" stroke-width="${th * 0.2}"/>`).join(""));
  return photoSVG(F, st.front.w, st.front.h, box, defs + `<g filter="url(#${gid}s)" opacity=".22">${shadow}</g>` + temples + lens(cR, -1) + lens(cL, 1) + bridge + pads);
}

/* ================= 귀걸이 착용 시뮬레이션 ================= */
function earringSVG(st, item, idx) {
  const E = st.ear; if (item.useUpload && item.img) return `<img src="${BlobCache.get(item.img)}" alt="">`;
  if (!E.src) return `<div class="ph-empty">귀 사진</div>`;
  const S = Math.min(E.w, E.h) * 0.45 / (E.zoom || 1);
  const lobe = E.lobe || [E.w / 2, E.h / 2];
  const box = fitBox([lobe[0] - S * 0.45, lobe[1] - S * 0.62, S * 0.9, S], 147 / 178);
  const u = S * 0.035 * (item.size || 1); const col = (METAL_COLORS[item.color] || METAL_COLORS.gold)[0];
  const gid = `g${idx}${Math.random().toString(36).slice(2, 7)}`;
  const defs = `<defs><radialGradient id="${gid}m" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="${col}"/><stop offset="1" stop-color="#555"/></radialGradient>
    <radialGradient id="${gid}p" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="#f1ece4"/><stop offset="1" stop-color="#b9b0a3"/></radialGradient></defs>`;
  const [x, y] = lobe; let g = "";
  switch (item.shape) {
    case "stud": g = `<circle cx="${x}" cy="${y}" r="${u * 0.8}" fill="url(#${gid}m)"/>`; break;
    case "pearl": g = `<circle cx="${x}" cy="${y}" r="${u * 1.15}" fill="url(#${gid}p)"/>`; break;
    case "drop": g = `<circle cx="${x}" cy="${y}" r="${u * 0.45}" fill="url(#${gid}m)"/><line x1="${x}" y1="${y}" x2="${x}" y2="${y + u * 4}" stroke="${col}" stroke-width="${u * 0.16}" stroke-dasharray="${u * 0.22} ${u * 0.08}" stroke-linecap="round"/><circle cx="${x}" cy="${y + u * 4.6}" r="${u * 0.6}" fill="url(#${gid}p)"/>`; break;
    case "huggie": g = `<path d="M${x - u * 1.1},${y - u * 0.2} A${u * 1.15},${u * 1.15} 0 1 0 ${x + u * 1.1},${y - u * 0.2}" fill="none" stroke="url(#${gid}m)" stroke-width="${u * 0.38}" stroke-linecap="round"/>`; break;
    case "hoop": g = `<path d="M${x - u * 0.6},${y} A${u * 2.4},${u * 2.4} 0 1 0 ${x + u * 0.6},${y}" fill="none" stroke="url(#${gid}m)" stroke-width="${u * 0.32}" stroke-linecap="round" transform="translate(0 ${u * 0.1})"/>`; break;
    case "ovalHoop": g = `<ellipse cx="${x}" cy="${y + u * 2}" rx="${u * 1.3}" ry="${u * 2.1}" fill="none" stroke="url(#${gid}m)" stroke-width="${u * 0.3}"/>`; break;
    case "cluster": g = [[0, 0, 0.55], [0.8, 0.3, 0.42], [-0.7, 0.4, 0.4], [0.1, 0.9, 0.45], [0.3, -0.7, 0.35]].map(([dx, dy, r], i) => `<circle cx="${x + dx * u}" cy="${y + dy * u}" r="${r * u}" fill="url(#${gid}${i % 2 ? "p" : "m"})"/>`).join(""); break;
  }
  const shadow = `<g transform="translate(${u * 0.25} ${u * 0.35})" opacity=".25" filter="url(#${gid}sh)">${g.replace(/url\(#[^)]+\)/g, "#000").replace(/fill="#[0-9a-f]+"/gi, 'fill="#000"')}</g>`;
  const sdef = `<defs><filter id="${gid}sh" filterUnits="userSpaceOnUse" x="0" y="0" width="${E.w}" height="${E.h}"><feGaussianBlur stdDeviation="${u * 0.25}"/></filter></defs>`;
  return photoSVG(E.src, E.w, E.h, box, defs + sdef + shadow + g);
}

/* ================= p7 / p8 액세서리 ================= */
function scaleRow(lab, l, r, val, txt, n) {
  const pos = (val / 4) * 100;
  return `<div class="scl"><div class="slab">${n}. ${esc(lab)}</div><div class="strack"><span class="sline"></span>${[0, 1, 2, 3, 4].map(i => `<span class="stick" style="left:${i * 25}%"></span>`).join("")}<span class="sdot" style="left:${pos}%"></span></div>
    <div class="sends"><span>${esc(l)}</span><span>${esc(r)}</span></div><div class="stxt">${esc(txt)}</div></div>`;
}
function pageAccessory(st, kind) {
  const t = kind === "g" ? st.texts.glasses : st.texts.earrings; const L = kind === "g" ? GLASSES_SCALES : EARRING_SCALES;
  const items = t.items.map((it, i) => `<div class="acol"><div class="anum">0${i + 1}</div><div class="aimg">${kind === "g" ? glassesSVG(st, it, i, t.scales) : earringSVG(st, it, i)}</div>
      <div class="aname">${esc(it.name)}</div><div class="adesc">${nl(it.desc)}</div></div>`).join("");
  const order = [0, 2, 4, 1, 3, 5];
  const scales = order.map(i => scaleRow(L[i][0], L[i][1], L[i][2], t.scales[i], t.scaleText[i], i + 1)).join("");
  return `<section class="page p7 ${kind === "e" ? "p8" : ""}">${head("ACCESSORY FRAME", kind === "g" ? "안경" : "귀걸이", "")}
  <div class="aform">${esc(t.formula)}</div><div class="adesc0">${nl(t.desc)}</div>
  <div class="abox"><div class="alab">BEST SHAPES${kind === "g" ? ` <span class="gicons"><img src="assets/gicon1.png"><img src="assets/gicon2.png"><img src="assets/gicon3.png"></span>` : ""}</div><div class="arow ${kind}">${items}</div></div>
  <div class="sbox"><div class="alab">DETAIL SCALE</div><div class="sgrid">${scales}</div></div>
  <div class="ibox chk"><div class="ilab">SHOPPING CHECK</div>${t.checks.map((c, i) => `<div class="ck"><b>${i + 1}</b>${esc(c)}</div>`).join("")}</div></section>`;
}

const PAGE_FUNCS = [pageCover, pageBalance, pageFront, pageSide, pageHair, pageMakeup, st => pageAccessory(st, "g"), st => pageAccessory(st, "e")];
const PAGE_NAMES = ["표지", "페이스 밸런스", "정면 비율", "측면 비율", "헤어 BEST 3", "맞춤 메이크업", "안경", "귀걸이"];
function renderPage(st, i) { try { return PAGE_FUNCS[i](st); } catch (e) { console.error(e); return `<section class="page"><div class="page-err">페이지 ${i + 1} 렌더링 오류: ${esc(e.message)}</div></section>`; } }
