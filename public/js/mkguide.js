/* =====================================================================
   6쪽 맞춤 메이크업 가이드 — "그림은 GPT, 글씨는 프로그램" 방식
   GPT가 글씨 없이 메이크업을 적용한 정면 사진 1장을 만들면,
   얼굴 인식으로 부위를 찾아 10개 부위 사진을 잘라내고
   번호 표시·가이드선·설명 글을 프로그램이 Pretendard로 얹는다.
   ===================================================================== */
const G_KEYS = ["brow", "shadow", "liner", "under", "lash", "nose", "blush", "contour", "lip", "skin"];
const G_TITLES = { brow: "눈썹 메이크업", shadow: "아이섀도우", liner: "아이라인", under: "언더 메이크업", lash: "속눈썹 메이크업", nose: "코 메이크업", blush: "블러셔", contour: "윤곽 셰이딩", lip: "립 메이크업", skin: "피부 표현" };
function gKeyFor(title) {
  const t = String(title || "").trim().toLowerCase();
  const aliases = { eyebrow: "brow", eyebrows: "brow", eye: "shadow", eyeshadow: "shadow", eye_shadow: "shadow", eyeliner: "liner", eye_liner: "liner", undereye: "under", under_eye: "under", eyelash: "lash", eyelashes: "lash", mascara: "lash", cheek: "blush", contouring: "contour", lips: "lip", base: "skin" };
  if (G_KEYS.includes(t)) return t;
  if (aliases[t]) return aliases[t];
  const rules = [[/속눈썹|eyelash|mascara/, "lash"], [/눈썹|eyebrow|\bbrows?\b/, "brow"], [/언더|애교|under[ _-]?eye|lower[ _-]?lid/, "under"], [/아이라인|아이\s*라인|eyeliner|eye[ _-]?liner|\bliner\b/, "liner"], [/섀도|쉐도|eyeshadow|eye[ _-]?shadow/, "shadow"], [/^(?:\d+[.)-]?\s*)?코(?:\s|메이크업|쉐딩|셰이딩|쉐이딩|윤곽|하이라이트|$)|콧대|콧볼|코끝|\bnose\b/, "nose"], [/블러|치크|\bblush\b|\bcheek\b/, "blush"], [/윤곽|셰이딩|쉐이딩|쉐딩|\bcontour|\bshading\b/, "contour"], [/립|입술|\blips?\b/, "lip"], [/피부|베이스|\bskin\b|\bcomplexion\b|\bbase\b/, "skin"]];
  for (const [re, k] of rules) if (re.test(t)) return k;
  return null;
}
/** 가이드에 쓸 사진: GPT 메이크업 사진(인식 성공 시) → 없으면 원본 정면 사진 */
function guideSource(st) {
  const t = st.texts.makeup;
  if (t.guideImg && t.guideLm && t.guideLm.pts && typeof ImageSource !== "undefined" && ImageSource.isCurrentMakeup(st)) return { src: t.guideImg, w: t.guideLm.w, h: t.guideLm.h, P: t.guideLm.pts, gpt: true };
  if (st.photos.front && st.front.pts) return { src: st.photos.front, w: st.front.w, h: st.front.h, P: st.front.pts, gpt: false };
  return null;
}
/** 일부 AI 섹션만 왔어도 부위별 원문을 유지하면서 기존 문장으로 10개를 완성한다. */
function guideSections(st) {
  const G = st.texts.makeupGuide || {}, T = st.texts.makeup?.sections || {};
  const text = value => typeof value === "string" ? value.trim() : "";
  const steps = value => Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, 4) : [];
  const defaults = {
    brow: { sub: "본래 눈썹의 결을 살려 자연스럽게 정리", steps: ["빈 부분은 모발 방향으로 가볍게 채웁니다.", "눈썹산은 부드럽게 이어 줍니다.", "꼬리는 가늘고 깔끔하게 정리합니다."] },
    shadow: { sub: "얇은 음영으로 눈매의 깊이를 표현", steps: ["눈두덩이에 밝은 베이스를 얇게 펴 바릅니다.", "눈꼬리 쪽에 은은한 음영을 더합니다.", "색의 경계를 부드럽게 블렌딩합니다."] },
    liner: { sub: "속눈썹 사이를 정리해 눈매를 또렷하게", steps: ["속눈썹 사이의 빈 부분을 얇게 채웁니다.", T.eye?.variant === "upturn" ? "눈꼬리는 자연스럽게 살짝 올립니다." : "눈꼬리 흐름을 따라 짧게 연장합니다.", "두꺼운 선 대신 가는 라인으로 정리합니다."] },
    under: { sub: "가벼운 음영으로 눈 아래를 자연스럽게 정돈", steps: ["언더 눈꼬리에 옅은 음영을 더합니다.", "애교살은 얇고 자연스럽게 표현합니다.", "진한 선 대신 경계를 부드럽게 풀어줍니다."] },
    lash: { sub: "결을 살린 컬링으로 자연스럽게 마무리", steps: ["뷰러로 뿌리부터 부드럽게 컬링합니다.", "마스카라를 얇게 덧발라 뭉침을 줄입니다.", "눈매에 맞춰 길이와 볼륨을 조절합니다."] },
    nose: { sub: "얇은 음영으로 본래의 입체감을 정리", steps: ["콧대 양옆에 얇게 음영을 넣습니다.", "콧볼 주변의 경계를 부드럽게 풀어줍니다.", "콧대 중앙에는 은은한 빛을 더합니다."] },
    blush: { sub: "가벼운 발색으로 자연스러운 생기를 표현", steps: ["볼의 중심에 소량씩 발색합니다.", "얼굴형에 맞춰 범위를 조절합니다.", "바깥 경계를 부드럽게 블렌딩합니다."] },
    contour: { sub: "얼굴 외곽의 음영을 부드럽게 연결", steps: ["외곽에 얇고 가벼운 음영을 더합니다.", "경계가 남지 않도록 충분히 블렌딩합니다.", "본래 얼굴선을 과하게 바꾸지 않습니다."] },
    lip: { sub: "본래 입술선을 살려 균형 있게 표현", steps: ["입술의 건조한 부분을 가볍게 정돈합니다.", "본래 입술선을 따라 얇게 발색합니다.", "가장자리를 부드럽게 마무리합니다."] },
    skin: { sub: "얇은 베이스로 피부 결을 자연스럽게 표현", steps: ["피부를 촉촉하게 준비합니다.", "베이스를 얇게 나누어 펴 바릅니다.", "필요한 부위만 소량씩 정돈합니다."] },
  };
  const eye = [...steps(T.eye?.steps), ...steps(T.eye?.points)];
  const eyePart = {
    shadow: line => /음영|섀도|쉐도|베이스|블렌딩/.test(line) && !/언더|애교/.test(line),
    liner: line => /아이라인|점막|속눈썹\s*사이|눈꼬리.*(?:연장|빼)/.test(line),
    under: line => /언더|애교/.test(line),
    lash: line => /속눈썹|마스카라|컬링|뷰러/.test(line) && !/속눈썹\s*사이|점막|아이라인/.test(line),
  };
  const found = new Map();
  const raw = Array.isArray(G.sections) ? G.sections : G.sections && typeof G.sections === "object" ? Object.entries(G.sections).map(([key, value]) => value && typeof value === "object" ? { ...value, key: value.key || key } : null) : [];
  for (const section of raw) {
    if (!section || typeof section !== "object") continue;
    const explicit = gKeyFor(section.key), titled = gKeyFor(section.title);
    if (explicit && titled && explicit !== titled) continue;
    const key = explicit || titled;
    if (!key) continue;
    const entry = { key, title: titled === key ? text(section.title) : G_TITLES[key], sub: text(section.sub), steps: steps(section.steps) };
    const previous = found.get(key);
    if (!previous || !previous.steps.length && entry.steps.length) found.set(key, entry);
  }
  return G_KEYS.map(key => {
    const source = T[key] || (key === "shadow" ? T.eye : null);
    const fallback = { ...defaults[key], steps: defaults[key].steps.slice() };
    if (source && (!gKeyFor(source.title) || gKeyFor(source.title) === key)) {
      fallback.sub = text(source.sub) || fallback.sub;
      const plan = key === "shadow" && source === T.eye ? steps(source.steps).filter(eyePart.shadow) : steps(source.steps);
      if (plan.length) fallback.steps = plan;
    } else if (eyePart[key]) {
      const plan = eye.filter(eyePart[key]).slice(0, 4);
      if (plan.length) fallback.steps = plan;
    }
    const entry = found.get(key);
    const complete = entry?.steps.length ? entry.steps.slice() : fallback.steps.slice();
    if (key === "skin") {
      for (const line of [...steps(T.skin?.points).slice(1), ...defaults.skin.steps]) {
        if (complete.length >= 3) break;
        if (!complete.includes(line)) complete.push(line);
      }
    }
    return { key, title: entry?.title || G_TITLES[key], sub: entry?.sub || fallback.sub, steps: complete };
  });
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
