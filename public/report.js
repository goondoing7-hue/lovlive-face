/* =====================================================================
   6쪽 '페이스 분석결과지' 렌더링 (B5 182×257mm = 688×971px, 김보라님 보고서 기준)
   ===================================================================== */
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl = s => esc(s).replace(/\n/g, "<br>");
const FACE_TYPES = ["계란형", "둥근형", "하트형", "사각형", "다이아몬드형", "육각형"];
const SIDE_OPTS = {
  forehead: ["[이마형태]", ["둥근 형태", "수직형 (반듯한)이마", "볼록한 이마"]],
  mouth: ["[입돌출형태]", ["돌출된", "중립적인", "들어가보이는"]],
  profile: ["[옆모습 프로파일]", ["평면형", "볼록형", "오목형"]],
};
const GLASSES = [["라운드형", "g_22"], ["직사각형", "g_20"], ["에비에이터형", "g_28"], ["보스턴형", "g_18"], ["브로우라인형", "g_16"], ["오벌형", "g_30"], ["캣아이형", "g_24"], ["웨이퍼러형", "g_26"], ["스퀘어형", "g_32"]];
// 귀걸이 표: [크기, 길이] → 아이콘
const EAR_CELLS = {
  "small,long": ["e_42"], "medium,long": ["e_44"], "large,long": ["e_46"],
  "small,medium": ["e_56", "e_38"], "medium,medium": ["e_36"], "large,medium": ["e_48"],
  "small,short": ["e_34", "e_40"], "medium,short": ["e_54"], "large,short": ["e_50", "e_52"],
};
const SIZES = ["small", "medium", "large"], LENGTHS = ["short", "medium", "long"];
const LOGO_SVG = `<svg viewBox="0 0 120 70" class="lv"><ellipse cx="60" cy="30" rx="44" ry="9" fill="none" stroke="#111" stroke-width="1.6"/><path d="M60 44 C40 30 38 16 48 12 C55 9 59 14 60 18 C61 14 65 9 72 12 C82 16 80 30 60 44Z" fill="#111"/><text x="60" y="64" text-anchor="middle" font-size="12" font-family="Pretendard,sans-serif" letter-spacing="1" fill="#222">LOVLIVE</text></svg>`;

function faceIcon(type) {
  const head = `<ellipse cx="50" cy="52" rx="34" ry="40" fill="#fbd5c5"/><rect x="30" y="80" width="40" height="40" fill="#e3c0b3"/><ellipse cx="18" cy="58" rx="6" ry="10" fill="#fbd5c5"/><ellipse cx="82" cy="58" rx="6" ry="10" fill="#fbd5c5"/>`;
  const st = `fill="#fbd5c5" stroke="#111" stroke-width="4.5" stroke-linejoin="round"`;
  const shapes = {
    "계란형": `<path d="M50 14 C72 14 80 34 78 54 C76 78 62 92 50 92 C38 92 24 78 22 54 C20 34 28 14 50 14Z" ${st}/>`,
    "둥근형": `<ellipse cx="50" cy="54" rx="29" ry="34" ${st}/>`,
    "하트형": `<path d="M50 30 C44 14 22 14 22 36 C22 60 42 78 50 92 C58 78 78 60 78 36 C78 14 56 14 50 30Z" ${st}/>`,
    "사각형": `<rect x="24" y="20" width="52" height="66" rx="3" ${st}/>`,
    "다이아몬드형": `<path d="M50 14 L76 52 L50 90 L24 52Z" ${st}/>`,
    "육각형": `<path d="M36 18 L64 18 L80 50 L64 84 L36 84 L20 50Z" ${st}/>`,
  };
  return `<svg viewBox="0 0 100 120" class="ficon">${head}${shapes[type]}</svg>`;
}
const CHECK = `<svg viewBox="0 0 30 24" class="chk"><path d="M2 12 L11 20 L28 2" fill="none" stroke="#e03131" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const box = (on) => `<span class="cb">□${on ? CHECK : ""}</span>`;

/* p1 표지 */
function pg1(st) {
  return `<section class="pg p1"><svg class="swoosh" viewBox="0 0 688 140" preserveAspectRatio="none">
    <path d="M0 0H688V88H0Z" fill="#cfcfcf"/><path d="M0 48 C70 44 110 56 160 88 L688 88 V140 H250 C200 112 140 60 0 60Z" fill="#fff"/>
    <path d="M170 88 H330 C360 100 380 120 410 138 H250 C220 120 200 100 170 88Z" fill="#ececec"/><path d="M330 88 H480 C510 104 540 124 565 138 H410 C380 120 360 100 330 88Z" fill="#bdbdbd"/>
    <path d="M480 88 H630 C650 100 668 116 688 128 V138 H565 C540 124 510 104 480 88Z" fill="#a7a7a7"/><path d="M630 88 H688 V128 C668 116 650 100 630 88Z" fill="#8e8e8e"/></svg>
    <div class="p1-name">${esc(st.name || "고객")}님</div><div class="p1-box">페이스 분석결과지<span class="notch"></span></div>
    <div class="p1-line"></div><div class="p1-logo">${LOGO_SVG}</div></section>`;
}

/* p2 사진 + 얼굴형 + 측면 */
function pg2(st) {
  const a = st.ai || {}; const ft = a.faceType || []; const sd = a.side || {};
  const imgs = [st.img?.front, st.img?.side, "assets/ideal_profile.jpg"].map((s, i) => `<div class="p2-img i${i}">${s ? `<img src="${s}">` : `<div class="ph">${["정면", "측면", ""][i]}</div>`}</div>`).join("");
  const faces = FACE_TYPES.map(t => `<div class="fcol">${faceIcon(t)}<div class="fl">${t}</div>${box(ft.includes(t))}</div>`).join("");
  const cols = Object.entries(SIDE_OPTS).map(([k, [h, opts]]) => `<div class="scol"><div class="sh">${h}</div>${opts.map(o => `<div class="so ${sd[k] === o ? "on" : ""}">${esc(o)}</div>`).join("")}</div>`).join("");
  return `<section class="pg p2"><div class="disc">본 분석은 보내주신 얼굴 이미지를 기반으로 작성되었으며, 가이드 기준과 일치하지 않을 경우<br>일부 결과의 정확도가 다소 떨어질 수 있는점 참고부탁드립니다.</div>
    <div class="p2-row">${imgs}</div><div class="h2 t1">얼굴형</div><div class="frow">${faces}</div>
    <div class="h2 t2">측면</div><div class="srow">${cols}</div><div class="blue">${nl(a.sideSummary || "")}</div><div class="foot-logo">${LOGO_SVG}</div></section>`;
}

/* 표 공통 */
function ratioTable(rows, merged) {
  const head = `<tr class="th"><td class="c1">항목</td><td class="c2">비율</td><td class="c3">해석</td></tr>`;
  const body = rows.map((r, i) => `<tr style="height:${r.h}px"><td class="c1"><div class="it">${esc(r.title)}</div>${r.sub ? `<div class="isub">${esc(r.sub)}</div>` : ""}<div class="istd">[${esc(r.std)}]</div></td><td class="c2">${esc(r.val || "")}</td>${merged ? (i === 0 ? `<td class="c3" rowspan="${rows.length}">${nl(r.text)}</td>` : "") : `<td class="c3">${nl(r.text)}</td>`}</tr>`).join("");
  return `<table class="rt">${head}${body}</table>`;
}
const fmtR = v => String(v || "").replace(/\s/g, "");

/* p3 얼굴비율평가 + 눈평가 */
function pg3(st) {
  const t = st.ai?.ratioText || {}; const R = st.ratios || {};
  return `<section class="pg p3"><div class="tt t1">얼굴비율평가</div>
    <img class="ill a1" src="assets/r_thirds.jpg"><img class="ill a2" src="assets/r_aspect.jpg">
    <div class="tbl b1">${ratioTable([{ title: "얼굴 전체 세로 비율", std: "1:1:1", val: fmtR(R.thirds), text: t.thirds, h: 143 }, { title: "종횡비 (가로폭:세로폭)", std: "1:1.43", val: fmtR(R.aspect), text: t.aspect, h: 140 }])}</div>
    <div class="tt t2">눈평가</div><img class="ill a3" src="assets/r_eyepos.jpg"><img class="ill a4" src="assets/r_eyedist.jpg">
    <div class="tbl b2">${ratioTable([{ title: "눈 위치", sub: "헤어라인 ~ 눈상부 : 눈하부 ~ 입술 중간", std: "1:1", val: fmtR(R.eyePos), text: t.eyePos, h: 113 }, { title: "눈 거리", sub: "오른쪽 눈의 가로폭 : 눈과 눈 사이:왼쪽 눈의 가로폭", std: "1:1:1", val: fmtR(R.eyeDist), text: t.eyeDist, h: 139 }])}</div></section>`;
}

/* p4 코와 입 + 안경 + 귀걸이 */
function pg4(st) {
  const a = st.ai || {}; const t = a.ratioText || {}; const R = st.ratios || {};
  const gsel = a.glasses || [];
  const glasses = GLASSES.map(([n, f]) => `<div class="gc"><img src="assets/${f}.png"><div class="gl">${box(gsel.includes(n))}${n}</div></div>`).join("");
  const esel = (a.earrings || []).map(x => x.join(","));
  let cells = "";
  LENGTHS.forEach((L, ri) => SIZES.forEach((S, ci) => {
    const key = `${S},${L}`; const icons = EAR_CELLS[key];
    cells += `<div class="ec" style="left:${ci * 92 + 8}px;top:${(2 - ri) * 62 + 6}px">${icons.map(i => `<img src="assets/${i}.png">`).join("")}${esel.includes(key) ? `<span class="ering"></span>` : ""}</div>`;
  }));
  return `<section class="pg p4"><div class="tt t0">코와 입 평가</div><img class="ill a5" src="assets/r_nose.jpg"><img class="ill a6" src="assets/r_mouth.jpg">
    <div class="tbl b3">${ratioTable([{ title: "코 위치", sub: "코아래에서 아래입술: 아래입술에서 턱", std: "1:1", val: fmtR(R.nosePos), text: t.noseMouth, h: 128 }, { title: "입 위치", sub: "코 아래에서 입술의 중심: 입술의 중심에서 턱", std: "1:2", val: fmtR(R.mouthPos), text: t.noseMouth, h: 113 }], true)}</div>
    <div class="h3 g1">얼굴형에 따른 추천 안경테</div><div class="ggrid">${glasses}</div>
    <div class="h3 g2">얼굴형에 따른 귀걸이 추천</div><div class="echart"><div class="ax-y">길이</div><div class="ax-x">크기</div><svg class="axes" viewBox="0 0 300 200"><path d="M6 196 V4 M6 4 L1 12 M6 4 L11 12 M6 196 H296 M296 196 L288 191 M296 196 L288 201" stroke="#222" stroke-width="1.6" fill="none"/></svg><div class="ecells">${cells}</div></div></section>`;
}

/* p5 메이크업 */
function pg5(st) {
  const m = st.ai?.makeup || {}; const strat = m.strategy || [];
  return `<section class="pg p5"><div class="logo-tr">${LOGO_SVG}</div><div class="mk-img">${st.img?.makeup ? `<img src="${st.img.makeup}">` : `<div class="ph">메이크업 주석 이미지</div>`}</div>
    <div class="mk-title">얼굴비율 및 이목구비 세부 분석에 따른 메이크업 전략</div>
    <div class="mk-text">${strat.map((s, i) => `<div class="ms"><div class="mst">${i + 1}. ${esc(s.title)}</div><div class="msb">: ${nl(s.text)}</div></div>`).join("")}</div></section>`;
}

/* p6 헤어 */
function pg6(st) {
  const h = st.ai?.hair || {}; const best = h.best || [];
  const rows = best.slice(0, 3).map((b, i) => `<div class="hr r${i}"><div class="himg">${st.img?.hair?.[i] ? `<img src="${st.img.hair[i]}">` : `<div class="ph">헤어 사진</div>`}</div>
    <div class="htx"><div class="hn">${esc(b.title)}</div><div class="hb">스타일: ${nl(b.style)}</div><div class="hb gap">포인트: ${nl(b.point)}</div></div></div>`).join("");
  return `<section class="pg p6"><div class="h6"><span class="big">헤어스타일링 분석 /</span> <span class="kw">${esc(h.subtitle || "")}</span><div class="big">Best 1-3위</div></div>
    <div class="caution">**주의 : ${esc(h.caution || "")}</div>${rows}</section>`;
}
const PAGES = [pg1, pg2, pg3, pg4, pg5, pg6];
const PAGE_NAMES = ["표지", "사진·얼굴형·측면", "얼굴비율·눈", "코입·안경·귀걸이", "메이크업", "헤어"];
function renderPage(st, i) { try { return PAGES[i](st); } catch (e) { console.error(e); return `<section class="pg"><p style="padding:40px;color:#c00">렌더링 오류: ${esc(e.message)}</p></section>`; } }
