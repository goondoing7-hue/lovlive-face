/* =====================================================================
   측정·판정·문장 생성 엔진
   ===================================================================== */
const LM = {
  faceOval: [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109],
  rEye: [33,246,161,160,159,158,157,173,133,155,154,153,145,144,163,7],
  lEye: [263,466,388,387,386,385,384,398,362,382,381,380,374,373,390,249],
  rBrowUp: [70,63,105,66,107], rBrowLo: [46,53,52,65,55],
  lBrowUp: [300,293,334,296,336], lBrowLo: [276,283,282,295,285],
  lipOuter: [61,185,40,39,37,0,267,269,270,409,291,375,321,405,314,17,84,181,91,146],
  lipInner: [78,191,80,81,82,13,312,311,310,415,308,324,318,402,317,14,87,178,88,95],
};
const H_LINES = [
  ["hair", "헤어라인", "#e8590c"], ["brow", "눈썹선", "#d6336c"], ["upLid", "윗눈꺼풀", "#7048e8"], ["lowLid", "아랫눈꺼풀", "#4263eb"],
  ["sn", "코밑", "#1098ad"], ["stom", "입술 중앙", "#2f9e44"], ["lowLip", "아랫입술", "#66a80f"], ["chin", "턱끝", "#f08c00"],
];
const V_LINES = [
  ["faceL", "얼굴 외곽(좌)", "#e8590c"], ["eRo", "눈 바깥(좌)", "#7048e8"], ["eRi", "눈 안쪽(좌)", "#4263eb"],
  ["eLi", "눈 안쪽(우)", "#4263eb"], ["eLo", "눈 바깥(우)", "#7048e8"], ["faceR", "얼굴 외곽(우)", "#e8590c"],
];

/* 기존 보고서 13건: [자동 측정값, 하영님 수동값] — 보정 계수 계산의 기본 데이터 */
const BUILTIN_CALIB = [{"aspect":[1.303,1.37],"thirdsM":[1.486,1.0],"thirdsL":[1.194,1.0],"eyeGap":[1.434,1.2],"eyeR":[1.076,1.1],"eyePos":[1.127,0.9],"nosePos":[0.882,1.0],"mouthPos":[1.74,2.0]},{"aspect":[1.411,1.38],"thirdsM":[1.165,1.1],"thirdsL":[1.034,1.0],"eyeGap":[1.327,1.0],"eyeR":[0.941,1.0],"eyePos":[0.986,0.9],"nosePos":[0.794,0.9],"mouthPos":[1.68,1.9]},{"aspect":[1.416,1.45],"thirdsM":[1.312,1.1],"thirdsL":[1.245,1.2],"eyeGap":[1.304,1.0],"eyeR":[0.994,0.9],"eyePos":[1.087,1.0],"nosePos":[0.794,1.0],"mouthPos":[1.635,1.9]},{"aspect":[1.363,1.38],"thirdsM":[1.28,1.0],"thirdsL":[1.019,0.9],"eyeGap":[1.255,1.0],"eyeR":[0.915,1.0],"eyePos":[1.06,0.9],"nosePos":[0.699,0.7],"mouthPos":[1.439,1.6]},{"aspect":[1.389,1.3],"thirdsM":[1.082,1.0],"thirdsL":[1.098,1.1],"eyeGap":[1.441,1.1],"eyeR":[0.991,0.9],"eyePos":[0.925,0.9],"nosePos":[0.826,0.8],"mouthPos":[1.817,2.0]},{"aspect":[1.324,1.39],"thirdsM":[1.269,1.0],"thirdsL":[1.187,1.0],"eyeGap":[1.308,1.1],"eyeR":[0.951,1.0],"eyePos":[0.991,0.9],"nosePos":[1.163,1.1],"mouthPos":[2.201,2.1]},{"aspect":[1.321,1.33],"thirdsM":[1.21,1.0],"thirdsL":[1.053,1.0],"eyeGap":[1.509,1.1],"eyeR":[1.024,1.0],"eyePos":[0.948,0.8],"nosePos":[0.875,0.9],"mouthPos":[1.839,1.8]},{"aspect":[1.359,1.45],"thirdsM":[1.377,1.0],"thirdsL":[1.167,0.9],"eyeGap":[1.312,1.1],"eyeR":[1.01,1.0],"eyePos":[1.07,0.9],"nosePos":[0.67,0.7],"mouthPos":[1.608,1.8]},{"aspect":[1.305,1.33],"thirdsM":[1.379,1.1],"thirdsL":[1.142,1.0],"eyeGap":[1.385,1.0],"eyeR":[0.949,1.0],"eyePos":[1.121,1.0],"nosePos":[0.713,0.7],"mouthPos":[1.595,1.8]},{"aspect":[1.239,1.33],"thirdsM":[1.406,1.2],"thirdsL":[1.466,1.3],"eyeGap":[1.372,1.2],"eyeR":[0.984,1.0],"eyePos":[1.098,1.0],"nosePos":[1.131,1.2],"mouthPos":[1.949,2.0]},{"aspect":[1.391,1.36],"thirdsM":[1.172,1.1],"thirdsL":[1.029,1.0],"eyeGap":[1.297,1.0],"eyeR":[0.941,1.0],"eyePos":[0.896,0.9],"nosePos":[0.842,0.8],"mouthPos":[1.731,1.7]},{"aspect":[1.326,1.34],"thirdsM":[1.141,1.0],"thirdsL":[0.989,1.0],"eyeGap":[1.316,1.1],"eyeR":[0.949,1.0],"eyePos":[0.925,0.9],"nosePos":[1.202,1.1],"mouthPos":[2.055,2.2]},{"aspect":[1.377,1.39],"thirdsM":[1.065,1.0],"thirdsL":[1.137,1.1],"eyeGap":[1.459,1.1],"eyeR":[1.01,1.0],"eyePos":[0.877,0.8],"nosePos":[1.316,1.3],"mouthPos":[2.269,2.6]}];
const DEFAULT_SETTINGS = {
  brand: "LOVIVE FACE REPORT",
  thresholds: { long: 1.47, roundMax: 1.40, squareJaw: 0.82, heartFore: 0.90, heartJaw: 0.735, hexFore: 0.80, hexJaw: 0.74 },
  /* 기본 보정값: 기존 보고서 13건(수동 측정)과 자동 측정의 중앙값 차이 */
  calib: { aspect: [1, 0], thirdsM: [1, -0.21], thirdsL: [1, -0.05], eyeGap: [1, -0.3], eyeR: [1, 0.02], eyePos: [1, -0.09], nosePos: [1, 0], mouthPos: [1, 0.18] },
  api: { key: "", model: "claude-sonnet-5-5", sendPhotos: false },
  img: { provider: "gemini", geminiKey: "", geminiModel: "gemini-2.5-flash-image", openaiKey: "", openaiModel: "gpt-image-1.5", quality: "medium" },
  overlay: { p3FaceEdges: true, p3EyeLines: true },
};

/* ---------------- 이미지 유틸 ---------------- */
function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function fileToDataURL(file, maxDim = 1800) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        const img = await loadImage(r.result);
        const s = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.92));
      } catch (e) { rej(e); }
    };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
async function rotateDataURL(src, deg) {
  const img = await loadImage(src);
  const rad = deg * Math.PI / 180, cos = Math.abs(Math.cos(rad)), sin = Math.abs(Math.sin(rad));
  const w = Math.round(img.width * cos + img.height * sin), h = Math.round(img.width * sin + img.height * cos);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
  g.translate(w / 2, h / 2); g.rotate(rad); g.drawImage(img, -img.width / 2, -img.height / 2);
  // 회전으로 생긴 흰 모서리를 잘라낸 안쪽 직사각형만 사용
  const cw = Math.floor(img.width * cos - img.height * sin), ch = Math.floor(img.height * cos - img.width * sin);
  if (cw < img.width * 0.6 || ch < img.height * 0.6) return c.toDataURL("image/jpeg", 0.92);
  const o = document.createElement("canvas"); o.width = cw; o.height = ch;
  o.getContext("2d").drawImage(c, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
  return o.toDataURL("image/jpeg", 0.92);
}

/* ---------------- 얼굴 랜드마크 (MediaPipe FaceMesh) ---------------- */
let _fm = null, _fmResolve = null;
const FM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619/";
function ensureFaceMesh() {
  if (_fm) return Promise.resolve(_fm);
  return new Promise((res, rej) => {
    const go = () => {
      try {
        _fm = new FaceMesh({ locateFile: f => FM_BASE + f });
        _fm.setOptions({ staticImageMode: true, selfieMode: false, maxNumFaces: 1, refineLandmarks: true, minDetectionConfidence: 0.4, minTrackingConfidence: 0.4 });
        _fm.onResults(r => { if (_fmResolve) { const f = _fmResolve; _fmResolve = null; f(r); } });
        res(_fm);
      } catch (e) { rej(e); }
    };
    if (window.FaceMesh) return go();
    const s = document.createElement("script"); s.src = FM_BASE + "face_mesh.js"; s.crossOrigin = "anonymous";
    s.onload = go; s.onerror = () => rej(new Error("얼굴 인식 모듈을 불러오지 못했습니다 (인터넷 연결 확인)"));
    document.head.appendChild(s);
  });
}
async function detectLandmarks(src) {
  const fm = await ensureFaceMesh();
  const img = await loadImage(src);
  const r = await Promise.race([
    new Promise(res => { _fmResolve = res; try { fm.reset && fm.reset(); } catch (e) {} fm.send({ image: img }); }),
    new Promise((_, rej) => setTimeout(() => rej(new Error("얼굴 인식 시간 초과")), 30000)),
  ]);
  const lm = r.multiFaceLandmarks && r.multiFaceLandmarks[0];
  if (!lm) return null;
  return { w: img.width, h: img.height, pts: lm.map(p => [p.x * img.width, p.y * img.height]) };
}

/* 헤어라인 추정: 이마 피부색에서 벗어나 어두워지는 첫 지점 */
async function estimateHairline(src, pts) {
  const img = await loadImage(src);
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0);
  const cx = Math.round((pts[107][0] + pts[336][0]) / 2);
  const eyeW = Math.abs(pts[263][0] - pts[33][0]);
  const band = Math.max(3, Math.round(eyeW * 0.06));
  const yStart = Math.round(pts[151][1]);
  const sample = (x, y) => { const d = g.getImageData(x - band, y - 1, band * 2, 3).data; let r = 0, gg = 0, b = 0, n = d.length / 4; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; } return [r / n, gg / n, b / n]; };
  const skin = sample(cx, yStart);
  const L = v => (v[0] + v[1] + v[2]) / 3;
  const skinL = L(skin);
  let run = 0; const need = Math.max(3, Math.round(eyeW * 0.02));
  for (let y = yStart; y > 2; y--) {
    const px = sample(cx, y);
    const dist = Math.hypot(px[0] - skin[0], px[1] - skin[1], px[2] - skin[2]);
    if (dist > 50 && L(px) < skinL * 0.75) { run++; if (run >= need) return y + run; }
    else run = 0;
  }
  return pts[10][1] - (pts[152][1] - pts[10][1]) * 0.12;
}

function linesFromLandmarks(pts, hairY) {
  const avgY = ids => ids.reduce((s, i) => s + pts[i][1], 0) / ids.length;
  return {
    h: {
      hair: hairY, brow: avgY([...LM.rBrowLo, ...LM.lBrowLo]),
      upLid: avgY([159, 386]), lowLid: avgY([145, 374]),
      sn: pts[2][1], stom: (pts[13][1] + pts[14][1]) / 2, lowLip: pts[17][1], chin: pts[152][1],
    },
    v: { faceL: pts[234][0], eRo: pts[33][0], eRi: pts[133][0], eLi: pts[362][0], eLo: pts[263][0], faceR: pts[454][0] },
  };
}
function defaultLines(w, h) {
  return {
    h: { hair: h * .18, brow: h * .36, upLid: h * .40, lowLid: h * .44, sn: h * .55, stom: h * .62, lowLip: h * .66, chin: h * .75 },
    v: { faceL: w * .22, eRo: w * .32, eRi: w * .44, eLi: w * .56, eLo: w * .68, faceR: w * .78 },
  };
}

/* 정면 비율 계산 */
function computeRatios(lines, calib) {
  const { h, v } = lines;
  const cal = (k, x) => { const c = (calib && calib[k]) || [1, 0]; return c[0] * x + c[1]; };
  const up = h.brow - h.hair, rE = v.eRi - v.eRo;
  return {
    aspect: cal("aspect", (h.chin - h.hair) / (v.faceR - v.faceL)),
    thirds: [1, cal("thirdsM", (h.sn - h.brow) / up), cal("thirdsL", (h.chin - h.sn) / up)],
    eyes: [1, cal("eyeGap", (v.eLi - v.eRi) / rE), cal("eyeR", (v.eLo - v.eLi) / rE)],
    eyePos: cal("eyePos", (h.stom - h.lowLid) / (h.upLid - h.hair)),
    nosePos: cal("nosePos", (h.chin - h.lowLip) / (h.lowLip - h.sn)),
    mouthPos: cal("mouthPos", (h.chin - h.stom) / (h.stom - h.sn)),
  };
}
/* 수동값 우선 표기: 2단계에서 '수동값을 보고서에 표기'를 켠 경우 */
function effRatios(st) {
  const r = st.front.ratios; const m = { ...r, thirds: [...r.thirds], eyes: [...r.eyes] };
  if (!st.useManual || !st.manual) return m;
  const P = s => String(s || "").split(/[:：]/).map(x => parseFloat(x.trim())).filter(x => !isNaN(x));
  for (const k of ["aspect", "thirds", "eyes", "eyePos", "nosePos", "mouthPos"]) {
    const v = P(st.manual[k]); if (!v.length) continue;
    if (k === "thirds" || k === "eyes") { if (v.length >= 3) m[k] = [1, v[1], v[2]]; }
    else m[k] = v[v.length - 1];
  }
  return m;
}
const r1 = x => (Math.round(x * 10) / 10).toFixed(1);
const r2 = x => (Math.round(x * 100) / 100).toFixed(2);
function roundRatios(m) {
  return {
    aspect: +r2(m.aspect), thirds: [1, +r1(m.thirds[1]), +r1(m.thirds[2])], eyes: [1, +r1(m.eyes[1]), +r1(m.eyes[2])],
    eyePos: +r1(m.eyePos), nosePos: +r1(m.nosePos), mouthPos: +r1(m.mouthPos),
  };
}
function fmtRatio(key, m) {
  const f = x => (Number.isInteger(x) ? x.toFixed(1) : String(x));
  switch (key) {
    case "aspect": return `1 : ${r2(m.aspect)}`;
    case "thirds": return `1 : ${r1(m.thirds[1])} : ${r1(m.thirds[2])}`;
    case "eyes": return `1 : ${r1(m.eyes[1])} : ${r1(m.eyes[2])}`;
    default: return `1 : ${r1(m[key])}`;
  }
}

/* 얼굴형 판정 */
function faceWidths(pts) {
  const dx = (a, b) => Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
  const cheek = dx(234, 454);
  return { fore: dx(54, 284) / cheek, jaw: dx(172, 397) / cheek, chin: dx(176, 400) / cheek, cheek };
}
function classifyFace(aspect, pts, T) {
  /* 참고용 판정: 기존 보고서 13건 검증 결과 랜드마크 폭 비율만으로는 하트·육각·둥근형 구분이 어려워
     종횡비 중심으로 보수적으로 제안하고, 최종 판정은 사용자가 선택합니다. */
  const w = pts ? faceWidths(pts) : null;
  const s = { round: 0, oval: 0, long: 0, heart: 0, square: 0, hexagon: 0, diamond: 0 };
  s.long = (aspect - 1.43) / 0.04;
  s.round = (1.43 - aspect) / 0.04;
  s.oval = 1 - Math.abs(aspect - 1.43) / 0.03;
  if (w) {
    if (w.jaw >= T.squareJaw) s.square = 2 + (w.jaw - T.squareJaw) * 40;
    if (w.fore >= T.heartFore && w.jaw <= T.heartJaw) s.heart = 2 + (T.heartJaw - w.jaw) * 40;
    if (w.fore <= T.hexFore && w.jaw <= T.hexJaw) s.hexagon = 2 + (T.hexFore - w.fore) * 40;
  }
  const type = Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
  return { type, scores: Object.fromEntries(Object.entries(s).map(([k, v]) => [k, Math.round(v * 100) / 100])), widths: w };
}

/* ---------------- 문장 생성 ---------------- */
const pick = (table, v) => (table.find(r => v <= r.max) || table[table.length - 1]).t;
function thirdsInfo(t) {
  const m = t[1], l = t[2];
  const dm = Math.round((m - 1) * 10) / 10, dl = Math.round((l - 1) * 10) / 10;
  const amt = d => Math.abs(d) >= 0.2 ? "" : "약간 ";
  if (Math.abs(dm) < 0.1 && Math.abs(dl) < 0.1) return { balanced: true, short: "상·중·하안부의 비율이 고르게 나타나 균형적인 편.", sent: "상·중·하안부의 비율이 고르게 나타나며,\n안정적인 세로 균형을 이루고 있습니다.", title: "균형적인 세로 3등분을 유지하고", lead: "상·중·하안부는 균형적이지만" };
  if (dm >= 0.1 && dl >= 0.1) return { short: "상안부에 비해 중·하안부가 긴 편", sent: "상안부에 비해 중·하안부가 길게 나타나,\n얼굴의 세로 인상이 아래쪽에서 만들어집니다.", title: "중·하안부의 세로 흐름을 짧게 끊고", lead: "상안부에 비해 중·하안부가 긴 편이며" };
  if (dm <= -0.1 && dl <= -0.1) return { short: "상안부가 상대적으로 긴 편", sent: "상안부가 상대적으로 길게 나타나,\n이마 쪽에 시선이 머무는 편입니다.", title: "상안부의 길이를 앞머리로 보완하고", lead: "상안부가 상대적으로 긴 편이며" };
  if (Math.abs(dl) >= Math.abs(dm)) {
    return dl > 0
      ? { short: `하안부가 ${amt(dl)}더 긴 편`, sent: `하안부가 ${amt(dl)}길게 나타나,\n입 아래~턱끝의 세로 길이감이 존재합니다.`, title: "하안부의 세로 길이감을 가볍게 정리하고", lead: `하안부가 ${amt(dl)}긴 편이며` }
      : { short: `하안부가 ${amt(dl)}짧은 편`, sent: `하안부가 ${amt(dl)}짧게 나타나,\n얼굴 아래쪽이 컴팩트하게 정리된 인상입니다.`, title: "컴팩트한 하안부에 길이감을 보완하고", lead: `하안부가 ${amt(dl)}짧은 편이며` };
  }
  return dm > 0
    ? { short: `중안부가 ${amt(dm)}긴 편`, sent: `중안부가 ${amt(dm)}길게 나타나,\n얼굴의 중심이 눈과 코 사이에 머무는 인상입니다.`, title: "중안부의 세로선을 짧게 끊고", lead: `중안부가 ${amt(dm)}긴 편이며` }
    : { short: `중안부가 ${amt(dm)}짧은 편`, sent: `중안부가 ${amt(dm)}짧게 나타나,\n이목구비가 모여 있어 어려 보이는 인상입니다.`, title: "모여 있는 이목구비의 장점을 살리고", lead: `중안부가 ${amt(dm)}짧은 편이며` };
}
function aspectSentence(a) {
  const d = a - 1.43;
  if (d <= -0.07) return "기준 비율 1:1.43보다 세로 비율이 짧아,\n얼굴의 가로 폭이 상대적으로 강조되는 편입니다.";
  if (d <= -0.03) return "기준 비율 1:1.43보다 세로 비율이 조금 짧아,\n얼굴의 가로 폭이 상대적으로 강조되는 편입니다.";
  if (d <= 0.02) return "기준 비율 1:1.43에 가까워,\n가로와 세로의 균형이 안정적인 편입니다.";
  if (d <= 0.06) return "기준 비율 1:1.43보다 세로 비율이 소폭 길어,\n얼굴선이 길게 이어지는 편입니다.";
  return "기준 비율 1:1.43보다 세로 비율이 길어,\n가로 폭에 비해 세로 인상이 강한 편입니다.";
}
const TYPE_CLAUSE = {
  round: "얼굴의 가로 폭을 자연스럽게 보완합니다.", diamond: "도드라지는 광대를 부드럽게 감쌉니다.", oval: "타고난 윤곽의 균형을 살립니다.", long: "전체 실루엣의 세로 흐름을 끊어 줍니다.",
  heart: "넓은 상부와 좁은 하관의 균형을 맞춥니다.", square: "또렷한 하관을 곡선으로 부드럽게 감쌉니다.", hexagon: "도드라지는 광대를 자연스럽게 감쌉니다.",
};
const TYPE_FEATURE = {
  round: "얼굴의 가로 폭이 상대적으로 강조되는", oval: "가로와 세로의 균형이 안정적인", long: "가로 폭 대비 세로가 긴",
  heart: "턱으로 갈수록 부드럽게 좁아지는", square: "하악각이 또렷한", hexagon: "광대 부분이 가장 넓은", diamond: "광대가 가장 넓고 턱끝이 좁은",
};
const MAKEUP_HEAD = {
  round: "부드러운 인상을 유지하면서 이목구비에\n선명도를 더하는 단정하고 세련된\n자연스러운 입체 메이크업",
  oval: "균형 잡힌 윤곽을 살리면서\n이목구비의 선명도를 높이는\n깨끗하고 세련된 메이크업",
  long: "세로 인상은 짧게 끊고\n가로 방향으로 시선을 분산하는\n부드럽고 안정적인 메이크업",
  heart: "넓은 상부는 가볍게 정리하고\n좁은 하관에 부드러움을 더하는\n여리하고 세련된 메이크업",
  square: "또렷한 윤곽을 부드럽게 감싸고\n곡선과 생기를 더하는\n세련되고 우아한 메이크업",
  hexagon: "도드라지는 광대를 부드럽게 정리하고\n이마와 턱에 폭을 더하는\n입체적이고 세련된 메이크업",
  diamond: "도드라지는 광대를 부드럽게 정리하고\n이마와 턱끝에 폭을 더하는\n입체적이고 세련된 메이크업",
};

function generateTexts(st) {
  const m = roundRatios(effRatios(st));
  const T = FACE_TYPES[st.type.key];
  const th = thirdsInfo(m.thirds);
  const mods = MODIFIERS.filter(x => x.when(m));
  const out = {};
  out.p2 = {
    chip1: `${T.en.replace(" FACE", " SHAPE")} : ${T.ko}`, desc1: T.desc.split("\n").slice(0, 2).join("\n"),
    details: [
      { part: "이마", text: "AI 분석 후 채워집니다." }, { part: "광대", text: "" }, { part: "옆턱", text: "" }, { part: "턱끝", text: "" },
    ],
    keyTitle: T.keyTitle, keyText: T.keyText,
  };
  out.p3 = {
    desc: {
      aspect: pick(METRIC_DESC.aspect, m.aspect), thirds: th.short, eyes: pick(METRIC_DESC.eyeGap, m.eyes[1]),
      eyePos: pick(METRIC_DESC.eyePos, m.eyePos), nosePos: pick(METRIC_DESC.nosePos, m.nosePos), mouthPos: pick(METRIC_DESC.mouthPos, m.mouthPos),
    },
    title: `${th.title}, ${TYPE_CLAUSE[st.type.key]}`,
    text: `${th.lead} ${TYPE_FEATURE[st.type.key]} ${T.ko}입니다.\n${T.frontDir}`.replace("균형적이지만 가로와 세로의 균형이 안정적인", "균형적이며 가로와 세로의 균형이 안정적인"),
  };
  // 헤어
  out.hair = {
    subtitle: T.hair.subtitle, keywords: T.hair.subtitle, desc: "", basic: T.hair.items[0].name.replace(/\n/g, " "),
    items: T.hair.items.slice(0, 3).map(x => ({ name: x.name, desc: x.desc, img: null })),
    volume: T.hair.volume.map(x => ({ ...x })), avoid: T.hair.avoid,
  };
  // 메이크업
  const secs = {};
  for (const k of MAKEUP_ORDER) {
    const lib = MAKEUP_LIB[k];
    const variant = k === "eye" ? T.makeup.liner : k === "skin" ? "semiMatte" : T.makeup[k];
    const v = lib.variants[variant] || Object.values(lib.variants)[0];
    let points = v.points.slice();
    mods.forEach(mo => { if (mo.makeup[k] && !points.includes(mo.makeup[k])) points = [...points.slice(0, 3), mo.makeup[k]]; });
    secs[k] = { variant, title: lib.title, sub: v.sub, steps: v.steps.slice(), points };
  }
  const feat = [TYPE_FEATURE[st.type.key].replace(/는$/, "은")];
  if (th.balanced) feat.push("균형적인 이목구비");
  if (m.eyes[1] >= 1.05) feat.push("소폭 넓은 미간"); else if (m.eyes[1] <= 0.94) feat.push("좁은 미간");
  out.makeup = {
    mode: "guide", fullImage: null, guideImg: null, guideLm: null,
    title: "맞춤 메이크업 가이드", head: MAKEUP_HEAD[st.type.key],
    intro: `${feat.join("과 ")}를 가진 ${T.ko} 얼굴의 특징을 고려하여, 과한 변화 없이 장점을 살리고 전체적인 윤곽과 선명도를 정돈하는 메이크업 방법입니다.`.replace("은과", "과").replace("미간를", "미간을").replace("이목구비를", "이목구비를"),
    keyPoints: [secs.brow.sub, secs.eye.sub.replace("하여 ", " "), secs.nose.sub, secs.blush.sub, secs.contour.sub, secs.lip.sub.replace("하여 자연스러운 벨벳 질감으로 표현", " 벨벳 질감"), secs.skin.sub, mods[0] ? mods[0].makeup[Object.keys(mods[0].makeup)[0]] : "전체적으로 과하지 않은 음영 사용"].slice(0, 8),
    sections: secs,
  };
  // 액세서리
  const acc = (lib, kind) => ({
    formula: lib.formula, desc: lib.desc,
    items: lib.items.slice(0, 3).map((x, i) => ({ ...x, img: null, color: kind === "g" ? (st.type.key === "long" ? "clear" : "silver") : "gold", size: 1, useUpload: false })),
    scales: lib.scales.slice(), scaleText: lib.scaleText.slice(), checks: lib.checks.slice(),
  });
  out.glasses = acc(T.glasses, "g");
  out.earrings = acc(T.earrings, "e");
  return out;
}

function generateSide(sel) {
  const ax = SIDE_AXES.map((a, i) => ({ title: a.title, text: a.options[sel[i]].t }));
  const k3 = SIDE_AXES[2].options[sel[2]].k, k4 = SIDE_AXES[3].options[sel[3]].k;
  const S = SIDE_SUMMARY[k3];
  const extra = SIDE_EXTRA[k4] ? " " + SIDE_EXTRA[k4] : "";
  return { axes: ax, title: S.title, text: S.text + extra };
}

/* ---------------- AI 연동 ---------------- */
function buildAIPrompt(st) {
  const m = roundRatios(effRatios(st));
  const data = {
    고객명: st.client.name, 얼굴형: FACE_TYPES[st.type.key].ko, 종횡비: fmtRatio("aspect", m), 상중하: fmtRatio("thirds", m),
    눈너비: fmtRatio("eyes", m), 눈위치: fmtRatio("eyePos", m), 코위치: fmtRatio("nosePos", m), 입위치: fmtRatio("mouthPos", m),
    측면선택: st.side.axes.map(a => `${a.title}: ${a.text.replace(/\n/g, " ")}`), 상담메모: st.client.memo || "",
  };
  const t = st.texts;
  const current = {
    p2: t.p2, p3: { desc: t.p3.desc, title: t.p3.title, text: t.p3.text },
    side: { axes: st.side.axes, title: st.side.title, text: st.side.text },
    hair: { subtitle: t.hair.subtitle, items: t.hair.items.map(x => ({ name: x.name, desc: x.desc })), volume: t.hair.volume, avoid: t.hair.avoid },
    makeup: { head: t.makeup.head, intro: t.makeup.intro, keyPoints: t.makeup.keyPoints, sections: Object.fromEntries(Object.entries(t.makeup.sections).map(([k, s]) => [k, { sub: s.sub, steps: s.steps, points: s.points }])) },
    glasses: { formula: t.glasses.formula, desc: t.glasses.desc, items: t.glasses.items.map(x => ({ name: x.name, desc: x.desc })), scaleText: t.glasses.scaleText, checks: t.glasses.checks },
    earrings: { formula: t.earrings.formula, desc: t.earrings.desc, items: t.earrings.items.map(x => ({ name: x.name, desc: x.desc })), scaleText: t.earrings.scaleText, checks: t.earrings.checks },
  };
  return `당신은 퍼스널 이미지 컨설팅 브랜드 '럽리브(LOVIVE)'의 페이스 분석 보고서 작성자입니다.
아래 [측정 데이터]와 [현재 초안]을 바탕으로 보고서 문장을 다듬어 주세요.

[작성 규칙]
- 존댓말 서술형(~합니다, ~편입니다), 따뜻하고 전문적인 톤. 단점 표현은 '보완', '정리' 같은 긍정어로.
- 숫자 비율은 [측정 데이터]와 다르게 바꾸지 마세요. 사실에 없는 특징을 지어내지 마세요.
- 각 문장의 길이와 줄바꿈(\\n) 개수는 현재 초안과 비슷하게 유지하세요 (지면이 고정된 양식입니다).
- 같은 키 구조의 JSON만 출력하세요. 설명이나 코드블록 표시 없이 JSON 하나만.
${st.client.memo ? "- 상담 메모의 고객 고민·선호를 자연스럽게 반영하세요.\n" : ""}
[문체 예시 — 럽리브 기존 보고서 문장. 이 톤·길이·어미를 따라 주세요]
- 볼에 자연스러운 볼륨이 있으며, 광대에서 턱끝까지 부드러운 곡선으로 이어지는 둥근형입니다.
- 상·중·하안부는 균형적이지만 얼굴의 가로 폭이 상대적으로 강조되는 둥근형입니다.
- 세로는 끊고, 하관은 부드럽게 넓혀 균형을 맞춥니다.
- 입술의 과한 볼륨 표현을 피하고 턱끝에 은은한 입체감을 더하면 자연스럽고 균형 잡힌 측면을 연출할 수 있습니다.
- 높은 아치로 세로선을 더 만들기보다 눈썹 꼬리를 부드럽게 연장해 가로 범위를 넓힙니다.
- 이 네 가지를 피하면 오벌·소프트 긱시크·무테/얇은 메탈 라인 안에서 비교적 자유롭게 선택할 수 있습니다.

[측정 데이터]
${JSON.stringify(data, null, 1)}

[현재 초안]
${JSON.stringify(current, null, 1)}`;
}
function parseAIResponse(text) {
  let s = text.trim();
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < 0) throw new Error("JSON을 찾지 못했습니다");
  return JSON.parse(s.slice(a, b + 1));
}
function mergeAI(st, j) {
  const t = st.texts;
  const deep = (dst, src) => {
    if (!src || typeof src !== "object") return;
    for (const k of Object.keys(src)) {
      if (!(k in dst)) continue;
      if (Array.isArray(src[k]) && Array.isArray(dst[k])) {
        src[k].forEach((v, i) => {
          if (i >= dst[k].length) return;
          if (typeof v === "object" && v && typeof dst[k][i] === "object") deep(dst[k][i], v);
          else if (typeof v === typeof dst[k][i]) dst[k][i] = v;
        });
      } else if (typeof src[k] === "object" && src[k] && typeof dst[k] === "object" && dst[k]) deep(dst[k], src[k]);
      else if (typeof src[k] === "string" && typeof dst[k] === "string") dst[k] = src[k];
    }
  };
  ["p2", "p3", "hair", "makeup", "glasses", "earrings"].forEach(k => deep(t[k], j[k]));
  if (j.side) deep(st.side, j.side);
}
async function callClaude(st, prompt) {
  const { key, model, sendPhotos } = st.settings.api;
  if (!key) throw new Error("설정에서 API 키를 입력해 주세요");
  const content = [];
  if (sendPhotos) {
    for (const src of [st.photos.front, st.side.src]) {
      if (!src) continue;
      const [head, b64] = src.split(",");
      content.push({ type: "image", source: { type: "base64", media_type: head.match(/data:(.*?);/)[1], data: b64 } });
    }
  }
  content.push({ type: "text", text: prompt });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model, max_tokens: 8000, messages: [{ role: "user", content }] }),
  });
  if (!r.ok) throw new Error("API 오류 " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  return j.content.map(c => c.text || "").join("");
}

function imagePrompt(kind, st, item) {
  const ko = FACE_TYPES[st.type.key].ko;
  if (kind === "hair") return `첨부한 정면 사진 속 인물의 얼굴(이목구비·피부·표정·조명·배경·옷)은 그대로 유지하고, 헤어스타일만 "${item.name.replace(/\n/g, " ")}"로 바꾼 사실적인 사진을 만들어 주세요. 정면, 어깨 위까지, 세로 3:4 비율. 스타일 설명: ${item.desc.replace(/\n/g, " ")} (${ko} 얼굴형 보완 목적)`;
  if (kind === "glasses") return `첨부한 정면 사진 속 인물의 얼굴은 그대로 유지하고, "${item.name}" 안경(${GLASSES_SHAPES[item.shape] || ""}, ${(METAL_COLORS[item.color] || ["", ""])[1]} 컬러)을 자연스럽게 착용한 사실적인 사진을 만들어 주세요. 정면, 얼굴 중심 크롭, 가로 6:5 비율.`;
  return `첨부한 귀 옆모습 사진은 그대로 유지하고, 귓불에 "${item.name}" 귀걸이(${EARRING_SHAPES[item.shape] || ""}, ${(METAL_COLORS[item.color] || ["", ""])[1]})를 착용한 사실적인 근접 사진을 만들어 주세요. 세로 3:4 비율.`;
}
