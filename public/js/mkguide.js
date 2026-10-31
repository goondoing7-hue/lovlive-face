/* =====================================================================
   6쪽 맞춤 메이크업 가이드 — "그림은 GPT, 글씨는 프로그램" 방식
   GPT가 글씨 없이 메이크업을 적용한 정면 사진 1장을 만들면,
   얼굴 인식으로 부위를 찾아 10개 부위 사진을 잘라내고
   번호 표시·가이드선·설명 글을 프로그램이 Pretendard로 얹는다.
   ===================================================================== */
const G_KEYS = ["brow", "shadow", "liner", "under", "lash", "nose", "blush", "contour", "lip", "skin"];
const G_TITLES = { brow: "눈썹 메이크업", shadow: "아이섀도우", liner: "아이라인", under: "언더 메이크업", lash: "속눈썹 메이크업", nose: "코 메이크업", blush: "블러셔", contour: "윤곽 셰이딩", lip: "립 메이크업", skin: "피부 표현" };
function gKeyFor(title, i) {
  const t = String(title || "");
  const rules = [[/속눈썹/, "lash"], [/눈썹/, "brow"], [/섀도|쉐도/, "shadow"], [/라인/, "liner"], [/언더|애교/, "under"], [/코/, "nose"], [/블러/, "blush"], [/윤곽|셰이딩|쉐이딩|쉐딩/, "contour"], [/립|입술/, "lip"], [/피부|베이스/, "skin"]];
  for (const [re, k] of rules) if (re.test(t)) return k;
  return G_KEYS[i] || "skin";
}
/** 가이드에 쓸 사진: GPT 메이크업 사진(인식 성공 시) → 없으면 원본 정면 사진 */
function guideSource(st) {
  const t = st.texts.makeup;
  if (t.guideImg && t.guideLm && t.guideLm.pts) return { src: t.guideImg, w: t.guideLm.w, h: t.guideLm.h, P: t.guideLm.pts, gpt: true };
  if (st.photos.front && st.front.pts) return { src: st.photos.front, w: st.front.w, h: st.front.h, P: st.front.pts, gpt: false };
  return null;
}
/** 섹션 목록: AI 메이크업 가이드(10개) → 없으면 자동 템플릿 문장으로 대체 */
function guideSections(st) {
  const G = st.texts.makeupGuide;
  if (G && G.sections && G.sections.length) return G.sections.slice(0, 10).map((s, i) => ({ key: gKeyFor(s.title, i), title: s.title, sub: s.sub || "", steps: (s.steps || []).slice(0, 4) }));
  const T = st.texts.makeup.sections; const map = { brow: "brow", eye: "shadow", nose: "nose", blush: "blush", contour: "contour", lip: "lip", skin: "skin" };
  return Object.entries(map).filter(([k]) => T[k]).map(([k, g]) => ({ key: g, title: G_TITLES[g], sub: T[k].sub || "", steps: (T[k].steps || []).slice(0, 3) }));
}

function guideCrop(S, key, aspect) {
  const P = S.P, p = i => P[i]; const ew = Math.abs(p(133)[0] - p(33)[0]) || S.w * 0.06;
  const md = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const dot = (d, w) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" stroke-dasharray="${w * 2.2} ${w * 1.8}" stroke-linecap="round" opacity=".95"/>`;
  let box, anchors = [], guides = "";
  const lid = [33, 246, 161, 160, 159, 158, 157, 173, 133].map(p), low = [33, 7, 163, 144, 145, 153, 154, 155, 133].map(p);
  const crease = lid.map((q, i) => [q[0] + (i < 3 ? -ew * 0.06 : 0), q[1] - ew * (0.22 + 0.1 * Math.sin(Math.PI * i / 8))]);
  const eyeBox = () => boxAround([...lid, ...low, ...crease, p(70), p(105), [p(145)[0], p(145)[1] + ew * 0.45]], 0.32, 0.2);
  switch (key) {
    case "brow": {
      const up = LM.rBrowUp.map(p), lo = LM.rBrowLo.map(p); const bw = Math.abs(up[4][0] - up[0][0]);
      const tail = [lo[0][0] - bw * 0.12, (lo[0][1] + up[0][1]) / 2 + bw * 0.04];
      box = boxAround([...up, ...lo, tail], 0.3, 1.3);
      anchors = [md(up[4], lo[4]), md(up[2], lo[2]), tail, up[1]];
      guides = dot(smoothPath([tail, ...up, ...lo.slice().reverse()], true), ew * 0.02); break;
    }
    case "shadow": {
      box = eyeBox(); anchors = [[lid[4][0], lid[4][1] - ew * 0.07], crease[2], [p(33)[0] - ew * 0.12, p(33)[1] - ew * 0.05], [lid[7][0], lid[7][1] - ew * 0.1]];
      guides = dot(smoothPath(crease), ew * 0.02); break;
    }
    case "liner": {
      const ext = [p(33)[0] - ew * 0.2, p(33)[1] - ew * 0.07];
      box = eyeBox(); anchors = [...[p(173), p(159), ext].map(q => [q[0], q[1] - ew * 0.05]), [p(163)[0], p(163)[1] + ew * 0.08]];
      guides = dot(smoothPath([lid[6], lid[5], lid[4], lid[3], lid[2], lid[1], lid[0], ext]), ew * 0.018); break;
    }
    case "under": {
      const eh = Math.abs(p(145)[1] - p(159)[1]) || ew * 0.3; const dn = low.map(q => [q[0], q[1] + eh * 0.35]);
      box = eyeBox(); anchors = [dn[2], dn[4], dn[6], [p(145)[0], p(145)[1] + eh * 0.9]];
      guides = dot(smoothPath(dn), ew * 0.018); break;
    }
    case "lash": {
      box = eyeBox(); anchors = [[p(159)[0], p(159)[1] - ew * 0.12], [p(246)[0] - ew * 0.05, p(246)[1] - ew * 0.08], [p(145)[0], p(145)[1] + ew * 0.1], [p(157)[0] + ew * 0.05, p(157)[1] - ew * 0.12]];
      guides = [246, 161, 160, 159, 158].map(i => { const q = p(i); const L = ew * 0.16; return dot(`M${q[0]},${q[1]} L${q[0] - L * 0.35},${q[1] - L}`, ew * 0.014); }).join(""); break;
    }
    case "nose": {
      const nw = Math.abs(p(358)[0] - p(129)[0]); const cx = p(6)[0];
      box = boxAround([p(168), p(2), p(129), p(358), p(55), p(285)], 0.3, 0.08);
      anchors = [[cx - nw * 0.32, p(197)[1]], p(4), [p(98)[0] - nw * 0.05, p(98)[1]], p(168)];
      guides = [-1, 1].map(d => dot(smoothPath([[cx + d * nw * 0.22, p(168)[1]], [cx + d * nw * 0.3, p(197)[1]], [cx + d * nw * 0.27, p(195)[1]]]), nw * 0.025)).join("") + dot(smoothPath([p(64), [p(98)[0], p(98)[1] + nw * 0.05], p(2), [p(327)[0], p(327)[1] + nw * 0.05], p(294)]), nw * 0.025); break;
    }
    case "blush": {
      const c0 = p(50); box = [c0[0] - ew * 1.05, c0[1] - ew * 0.6, ew * 2.1, ew * 1.2];
      anchors = [c0, [c0[0] - ew * 0.45, c0[1] - ew * 0.22], [c0[0] + ew * 0.25, c0[1] + ew * 0.1], [c0[0] - ew * 0.15, c0[1] + ew * 0.3]];
      guides = `<ellipse cx="${c0[0] - ew * 0.1}" cy="${c0[1] - ew * 0.05}" rx="${ew * 0.55}" ry="${ew * 0.28}" transform="rotate(18 ${c0[0]} ${c0[1]})" fill="none" stroke="#fff" stroke-width="${ew * 0.02}" stroke-dasharray="${ew * 0.045} ${ew * 0.035}"/>`; break;
    }
    case "contour": {
      const pts = [127, 234, 93, 132, 58, 172, 136, 116, 205, 50].map(p);
      box = boxAround(pts, 0.18, 0.12);
      anchors = [md(p(234), p(205)), p(172), [p(127)[0] + ew * 0.15, p(127)[1]], p(58)];
      guides = dot(smoothPath([p(127), p(234), p(93), p(132), p(58), p(172), p(136)]), ew * 0.02) + dot(smoothPath([p(234), md(p(234), p(205)), p(205)]), ew * 0.02); break;
    }
    case "lip": {
      const o = LM.lipOuter.map(p); box = boxAround(o, 0.38, 0.75);
      anchors = [p(0), p(17), p(61), p(291)];
      guides = dot(smoothPath(o, true), ew * 0.014); break;
    }
    default: box = boxAround([p(10), p(152), p(234), p(454)], 0.05, 0.05);
  }
  box = fitBox(box, aspect);
  return { box, anchors, guides };
}
function guideMarkers(box, anchors, n) {
  const r = Math.max(box[2], box[3]) * 0.036;
  return anchors.slice(0, n).map((q, i) => `<g><circle cx="${q[0]}" cy="${q[1]}" r="${r}" fill="#fff" stroke="${PINK}" stroke-width="${r * 0.22}"/><text x="${q[0]}" y="${q[1] + r * 0.42}" text-anchor="middle" font-size="${r * 1.25}" font-weight="700" fill="${PINK}" font-family="Pretendard,sans-serif">${i + 1}</text></g>`).join("");
}
function guidePhoto(S, key, aspect, n) {
  if (!S) return `<div class="ph-empty sm">사진</div>`;
  const c = guideCrop(S, key, aspect);
  return photoSVG(S.src, S.w, S.h, c.box, c.guides + guideMarkers(c.box, c.anchors, n));
}
function guideSkinCrops(S, aspect) {
  if (!S) return [null, null, null];
  const p = i => S.P[i]; const ew = Math.abs(p(133)[0] - p(33)[0]) || S.w * 0.06;
  return [[p(151), 1.5], [p(205), 1.3], [p(199), 1.1]].map(([c, k]) => fitBox([c[0] - ew * k / 2, c[1] - ew * k * 0.35, ew * k, ew * k * 0.7], aspect));
}
const stepHTML = (s, i) => { const m = String(s).match(/^([^:：]{1,10})[:：]\s*(.*)$/s); return `<li><span class="gn">${i + 1}</span><span>${m ? `<b>${esc(m[1])}</b> ${nl(m[2])}` : nl(s)}</span></li>`; };

function pageMakeupGuide(st) {
  const t = st.texts.makeup, G = st.texts.makeupGuide || {}; const S = guideSource(st);
  const secs = guideSections(st);
  const skin = secs.find(s => s.key === "skin"); const main = secs.filter(s => s !== skin);
  const two = main.slice(0, 6), three = main.slice(6, 9);
  const box = (s, n, cls, aspect) => `<div class="gsec ${cls}"><div class="ghd"><span class="gbadge">${n}</span><span class="gtit">${esc(s.title)}</span><span class="gsub">${esc(s.sub)}</span></div>
    <div class="gbd"><div class="gimg">${guidePhoto(S, s.key, aspect, s.steps.length)}</div><ol class="gsteps">${s.steps.map(stepHTML).join("")}</ol></div></div>`;
  // 상단 얼굴 + 3등분 선
  let face = `<div class="ph-empty">사진</div>`, labels = "";
  if (S) {
    const p = i => S.P[i]; const fw = Math.abs(p(454)[0] - p(234)[0]); const top = p(10)[1] - (p(152)[1] - p(10)[1]) * 0.12;
    const fb = fitBox([p(234)[0] - fw * 0.08, top - fw * 0.06, fw * 1.16, (p(152)[1] - top) + fw * 0.12], 150 / 150);
    const ys = [top, (p(105)[1] + p(334)[1]) / 2, p(2)[1], p(152)[1]];
    const sw = fb[2] * 0.006;
    const ov = ys.map(y => `<line x1="${fb[0]}" x2="${fb[0] + fb[2]}" y1="${y}" y2="${y}" stroke="#fff" stroke-width="${sw}" stroke-dasharray="${sw * 3} ${sw * 2}"/>`).join("");
    face = photoSVG(S.src, S.w, S.h, fb, ov, "", false);
    labels = ["상안부", "중안부", "하안부"].map((l, i) => `<div class="glab" style="top:${(((ys[i] + ys[i + 1]) / 2 - fb[1]) / fb[3] * 150 - 7).toFixed(1)}px">${l}</div>`).join("");
  }
  const core = (G.core && G.core.length ? G.core : t.keyPoints).slice(0, 4);
  return `<section class="page p6 g6">
  <div class="gtop"><div class="gey">MAKEUP GUIDE</div><div class="gt1">맞춤 메이크업 가이드</div><div class="gt2">${nl(G.intro || t.intro)}</div></div>
  <div class="gcore"><div class="gcl">핵심 포인트</div><ul>${core.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>
  <div class="gface">${labels}<div class="gfimg">${face}</div></div>
  <div class="gover"><div class="gol">전체적인 인상과 메이크업 방향</div><div class="got">${nl(G.overall || t.head)}</div></div>
  <div class="ggrid">
    <div class="grow2">${two.map((s, i) => box(s, i + 1, "w2", 168 / 120)).join("")}</div>
    ${three.length ? `<div class="grow3">${three.map((s, i) => box(s, 7 + i, "w3", 96 / 118)).join("")}</div>` : ""}
    ${skin ? `<div class="gsec wskin"><div class="ghd"><span class="gbadge">${main.length + 1}</span><span class="gtit">${esc(skin.title)}</span><span class="gsub">${esc(skin.sub)}</span></div>
      <div class="gskin">${guideSkinCrops(S, 96 / 100).map((b, i) => `<div class="gsk"><div class="gskimg">${b ? photoSVG(S.src, S.w, S.h, b) : `<div class="ph-empty sm">사진</div>`}</div><div class="gskt">${skin.steps[i] ? stepHTML(skin.steps[i], i).replace(/^<li>|<\/li>$/g, "") : ""}</div></div>`).join("")}</div></div>` : ""}
  </div>
  ${S && !S.gpt ? `<div class="gnote">※ GPT 메이크업 사진 생성 전 — 원본 사진으로 표시 중</div>` : ""}
  </section>`;
}
