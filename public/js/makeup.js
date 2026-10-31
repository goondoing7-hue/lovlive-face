/* =====================================================================
   메이크업 시뮬레이션: 부위 사진 위에 실제 색조를 단계별로 입힘
   (블러 + multiply/screen 블렌딩으로 사진에 스며들게 표현)
   ===================================================================== */
let _mkUid = 0;
const MKC = { brow: "#5b4033", shadow: "#b07a62", deep: "#7a4a3a", liner: "#24160f", blush: "#ef6f84", blushDeep: "#e2566f", contour: "#8a5a44", hi: "#fff4e6", lip: "#c4475e", lipLine: "#a83b52" };

function makeupCrops(st, key, variant) {
  const c = mkCtx(st); if (!c) return null;
  const { p, ew, fw } = c; const A = key === "lip" ? 1.7 : 3.1; const sw = ew * 0.03;
  const id = "mk" + (++_mkUid);
  const defs = (...sds) => `<defs>${sds.map((s, i) => `<filter id="${id}b${i}" filterUnits="userSpaceOnUse" x="0" y="0" width="${st.front.w}" height="${st.front.h}"><feGaussianBlur stdDeviation="${s}"/></filter>`).join("")}</defs>`;
  const paint = (inner, color, op, bi, blend = "multiply") => `<g filter="url(#${id}b${bi})" style="mix-blend-mode:${blend}" opacity="${op}" fill="${color}" stroke="none">${inner}</g>`;
  const guide = (d, op = 0.9) => `<path d="${d}" fill="none" stroke="${PINK}" stroke-width="${sw * 0.6}" stroke-dasharray="${sw * 2} ${sw * 1.6}" stroke-linecap="round" opacity="${op}"/>`;
  const ell = (x, y, rx, ry, rot = 0) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${rot} ${x} ${y})"/>`;
  const shift = (pts, dx, dy) => pts.map(q => [q[0] + dx, q[1] + dy]);

  if (key === "brow") {
    const up = LM.rBrowUp.map(p), lo = LM.rBrowLo.map(p); // 0 = 바깥(꼬리) … 4 = 안쪽(앞머리)
    const bw = Math.abs(up[4][0] - up[0][0]), bh = Math.max(ew * 0.12, Math.abs(lo[2][1] - up[2][1]));
    const lift = { semiArch: -0.12, straight: 0.12, arch: -0.35 }[variant] ?? 0;
    const upA = up.map((q, i) => [q[0], q[1] + (i === 2 || i === 1 ? lift * bh : 0)]);
    const tailExt = [lo[0][0] - bw * 0.16, (lo[0][1] + up[0][1]) / 2 + (variant === "straight" ? 0 : bh * 0.25)];
    const shape = full => smoothPath([...(full ? [tailExt] : []), ...upA, ...lo.slice().reverse()], true);
    const headPart = smoothPath([upA[3], upA[4], lo[4], lo[3]], true);
    const bb = boxAround([...up, ...lo, tailExt], 0.2, 0.2); const box = fitBox([bb[0], bb[1] - bh * 0.4, bb[2], bb[3] + bh * 1.6], A);
    const D = defs(bh * 0.22, bh * 0.1);
    return [
      { box, ov: D + paint(`<path d="${headPart}"/>`, MKC.brow, 0.3, 0) + guide(headPart, 0.55) },
      { box, ov: D + paint(`<path d="${shape(false)}"/>`, MKC.brow, 0.32, 0) + guide(`M${upA[0][0]},${upA[0][1] - bh * 0.35} Q${upA[2][0]},${upA[2][1] - bh * 0.9} ${upA[4][0]},${upA[4][1] - bh * 0.35}`, 0.7) },
      { box, ov: D + paint(`<path d="${shape(true)}"/>`, MKC.brow, 0.36, 0) + paint(`<path d="${shape(true)}"/>`, MKC.brow, 0.12, 1) + arrow(lo[0], [tailExt[0] - bw * 0.05, tailExt[1]], sw * 0.6) },
    ];
  }

  if (key === "eye") {
    const lid = [33, 246, 161, 160, 159, 158, 157, 173, 133].map(p), low = [33, 7, 163, 144, 145, 153, 154, 155, 133].map(p);
    const eh = Math.abs(p(145)[1] - p(159)[1]) || ew * 0.3;
    const crease = lid.map((q, i) => [q[0] + (i < 3 ? -ew * 0.06 : 0), q[1] - ew * (0.22 + 0.1 * Math.sin(Math.PI * i / 8))]);
    const lidArea = smoothPath([...lid, ...crease.slice().reverse()], true);
    const oc = mid(lid[2], crease[2]); const ang = Math.atan2(lid[4][1] - lid[0][1], lid[4][0] - lid[0][0]) * 180 / Math.PI; const outerEl = ell(oc[0] + ew * 0.02, oc[1], ew * 0.3, ew * 0.15, ang);
    const ext = variant === "upturn" ? [p(33)[0] - ew * 0.2, p(33)[1] - ew * 0.09] : [p(33)[0] - ew * 0.2, p(33)[1] - ew * 0.015];
    const liner = smoothPath([lid[5], lid[4], lid[3], lid[2], lid[1], lid[0], ext]);
    const under = smoothPath(low.slice(0, 5));
    const box = fitBox(boxAround([...lid, ...low, ...crease], 0.3, 0.3), A);
    const D = defs(ew * 0.045, ew * 0.02, ew * 0.008);
    return [
      { box, ov: D + paint(`<path d="${lidArea}"/>`, MKC.shadow, 0.55, 0) },
      { box, ov: D + paint(`<path d="${lidArea}"/>`, MKC.shadow, 0.38, 0) + paint(outerEl, MKC.deep, 0.55, 0) + guide(smoothPath(crease.slice(0, 5)), 0.6) },
      { box, ov: D + paint(`<path d="${lidArea}"/>`, MKC.shadow, 0.36, 0) + paint(outerEl, MKC.deep, 0.5, 0)
          + `<g filter="url(#${id}b2)" style="mix-blend-mode:multiply"><path d="${liner}" fill="none" stroke="${MKC.liner}" stroke-width="${ew * 0.028}" stroke-linecap="round" opacity=".9"/></g>`
          + `<g filter="url(#${id}b1)" style="mix-blend-mode:multiply"><path d="${under}" fill="none" stroke="${MKC.deep}" stroke-width="${eh * 0.22}" stroke-linecap="round" opacity=".45"/></g>` },
    ];
  }

  if (key === "nose") {
    const nw = Math.abs(p(358)[0] - p(129)[0]); const cx = p(6)[0];
    const endY = variant === "full" ? p(4)[1] : p(195)[1];
    const side = d => smoothPath([[p(55)[0] + (d < 0 ? nw * 0.05 : 0) + (d > 0 ? (p(285)[0] - p(55)[0]) - nw * 0.05 : 0), p(168)[1] - nw * 0.1], [cx + d * nw * 0.3, p(197)[1]], [cx + d * nw * 0.27, endY]]);
    const band = d => `<path d="${side(d)}" fill="none" stroke="${MKC.contour}" stroke-width="${nw * 0.12}" stroke-linecap="round"/>`;
    const tip = d => `<path d="${smoothPath([d < 0 ? p(64) : p(294), [(d < 0 ? p(98) : p(327))[0], (d < 0 ? p(98) : p(327))[1] + nw * 0.05], [p(2)[0] + d * nw * 0.1, p(2)[1] + nw * 0.03]])}" fill="none" stroke="${MKC.contour}" stroke-width="${nw * 0.12}" stroke-linecap="round"/>`;
    const hl = `<line x1="${cx}" y1="${p(6)[1]}" x2="${cx}" y2="${variant === "full" ? p(4)[1] : p(195)[1]}" stroke="${MKC.hi}" stroke-width="${nw * 0.13}" stroke-linecap="round"/>` + ell(p(4)[0], p(4)[1] - nw * 0.05, nw * 0.08, nw * 0.06);
    const box = fitBox(boxAround([p(168), p(2), p(129), p(358), p(55), p(285)], 0.25, 0.08), A);
    const D = defs(nw * 0.065, nw * 0.05);
    return [
      { box, ov: D + paint(band(-1) + band(1), MKC.contour, 0.8, 0) },
      { box, ov: D + paint(band(-1) + band(1), MKC.contour, 0.75, 0) + paint(tip(-1) + tip(1), MKC.contour, 0.75, 1) },
      { box, ov: D + paint(band(-1) + band(1), MKC.contour, 0.72, 0) + paint(tip(-1) + tip(1), MKC.contour, 0.7, 1) + `<g filter="url(#${id}b1)" style="mix-blend-mode:screen" opacity=".7" fill="${MKC.hi}" stroke="none">${hl.replace('stroke="' + MKC.hi + '"', `stroke="${MKC.hi}"`)}</g>` },
    ];
  }

  if (key === "blush") {
    const c0 = p(50);
    const [x, y, rx, ry, rot] = {
      diagonal: [c0[0] - ew * 0.12, c0[1] - ew * 0.08, ew * 0.55, ew * 0.26, 25],
      horizontal: [c0[0] + ew * 0.05, c0[1], ew * 0.62, ew * 0.24, 0],
      apple: [c0[0] + ew * 0.1, c0[1], ew * 0.34, ew * 0.32, 0],
    }[variant] || [c0[0], c0[1], ew * 0.5, ew * 0.25, 0];
    const box = fitBox([c0[0] - ew * 1.05, c0[1] - ew * 0.55, ew * 2.1, ew * 1.1], A);
    const D = defs(rx * 0.35, rx * 0.55);
    const dir = variant === "diagonal" ? [x - rx * 0.95, y - ry * 1.5] : [x - rx * 1.1, y];
    return [
      { box, ov: D + paint(ell(x, y, rx * 0.55, ry * 0.6, rot), MKC.blushDeep, 0.5, 0) },
      { box, ov: D + paint(ell(x, y, rx, ry, rot), MKC.blush, 0.5, 0) + arrow([x + rx * 0.2, y + (variant === "diagonal" ? ry * 0.3 : 0)], dir, sw * 0.6) },
      { box, ov: D + paint(ell(x, y, rx * 1.15, ry * 1.2, rot), MKC.blush, 0.42, 1) + paint(ell(x, y, rx * 0.7, ry * 0.7, rot), MKC.blushDeep, 0.22, 0) },
    ];
  }

  if (key === "contour") {
    const jaw = [132, 58, 172, 136, 150, 149, 176, 148, 152].map(p);
    const stroke = (pts, w) => `<path d="${smoothPath(pts)}" fill="none" stroke="${MKC.contour}" stroke-width="${w}" stroke-linecap="round"/>`;
    const D = defs(fw * 0.026, fw * 0.018);
    const R = {
      underCheek: { box: boxAround([p(234), p(61), p(116), p(172)], 0.15, 0.15), ov: paint(stroke([lerp(p(234), p(93), 0.2), lerp(p(137), p(205), 0.4), lerp(p(137), p(61), 0.6)], fw * 0.07), MKC.contour, 0.8, 0) },
      jawline: { box: boxAround([...jaw, p(93)], 0.12, 0.12), ov: paint(stroke(shift(jaw.slice(0, 7), fw * 0.015, -fw * 0.01), fw * 0.06), MKC.contour, 0.78, 0) },
      chinTip: { box: boxAround([p(149), p(378), p(17), p(152)], 0.25, 0.25), ov: `<g filter="url(#${id}b0)" style="mix-blend-mode:screen" opacity=".55" fill="${MKC.hi}">${ell(p(152)[0], p(152)[1] - ew * 0.15, ew * 0.32, ew * 0.16)}</g>` + guide(smoothPath([p(149), p(176), p(148), p(152), p(377), p(400), p(378)]), 0.6) },
      temple: { box: boxAround([p(54), p(162), p(234), p(70)], 0.2, 0.2), ov: paint(stroke([p(54), p(21), p(162), p(127)], fw * 0.06), MKC.contour, 0.8, 0) },
      foreheadHair: { box: boxAround([p(54), p(10), p(70), p(162)], 0.2, 0.4), ov: paint(stroke([p(162), p(54), p(103), p(67), p(109)], fw * 0.05), MKC.contour, 0.75, 0) },
      jawAngle: { box: boxAround([p(132), p(172), p(150), p(93)], 0.25, 0.2), ov: paint(ell(p(172)[0] + fw * 0.02, p(172)[1], fw * 0.07, fw * 0.11, 20), MKC.contour, 0.8, 0) },
      cheekbone: { box: boxAround([p(234), p(116), p(127), p(93)], 0.3, 0.3), ov: paint(stroke([p(127), p(234), p(93)], fw * 0.05), MKC.contour, 0.8, 0) },
      highlight: { box: boxAround([p(10), p(152), p(234), p(4)], 0.05, 0.05), ov: `<g filter="url(#${id}b0)" style="mix-blend-mode:screen" opacity=".6" fill="${MKC.hi}">${[p(151), p(6), p(4), p(152)].map(q => ell(q[0], q[1], ew * 0.2, ew * 0.13)).join("")}</g>` },
    };
    const seq = { cheekSide: ["underCheek", "jawline", "chinTip"], foreheadChin: ["foreheadHair", "chinTip", "underCheek"], temple: ["temple", "foreheadHair", "jawline"],
      jawAngle: ["jawAngle", "underCheek", "temple"], cheekbone: ["cheekbone", "underCheek", "highlight"], minimal: ["underCheek", "jawline", "highlight"] }[variant] || ["underCheek", "jawline", "chinTip"];
    return seq.map(k => ({ box: fitBox(R[k].box, A), ov: D + R[k].ov }));
  }

  if (key === "lip") {
    const out = LM.lipOuter.map(p), inn = LM.lipInner.map(p); const lw = Math.abs(p(291)[0] - p(61)[0]);
    const box = fitBox(boxAround(out, 0.35, 0.45), A);
    const D = defs(lw * 0.012, lw * 0.05, lw * 0.03);
    const outerD = smoothPath(variant === "wide" ? out.map((q, i) => i === 0 ? [q[0] - lw * 0.03, q[1]] : i === 10 ? [q[0] + lw * 0.03, q[1]] : q)
      : variant === "over" ? out.map((q, i) => i <= 10 ? [q[0], q[1] - lw * 0.03 * Math.sin(Math.PI * i / 10)] : q) : out, true);
    const m = mid(p(13), p(14));
    const gid = id + "g";
    const grad = `<defs><radialGradient id="${gid}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${MKC.lip}" stop-opacity=".85"/><stop offset="1" stop-color="${MKC.lip}" stop-opacity="0"/></radialGradient></defs>`;
    return [
      { box, ov: D + `<g filter="url(#${id}b0)" style="mix-blend-mode:multiply"><path d="${outerD}" fill="none" stroke="${MKC.lipLine}" stroke-width="${lw * 0.022}" opacity=".75"/></g>` },
      { box, ov: D + grad + `<g filter="url(#${id}b2)" style="mix-blend-mode:multiply"><ellipse cx="${m[0]}" cy="${m[1]}" rx="${lw * 0.3}" ry="${lw * 0.16}" fill="url(#${gid})"/></g>` + `<g filter="url(#${id}b0)" style="mix-blend-mode:multiply" opacity=".4"><path d="${outerD}" fill="none" stroke="${MKC.lipLine}" stroke-width="${lw * 0.018}"/></g>` },
      { box, ov: D + `<g filter="url(#${id}b0)" style="mix-blend-mode:multiply" opacity=".5" fill="${MKC.lip}"><path d="${outerD} ${smoothPath(inn, true)}" fill-rule="evenodd"/></g>`
          + `<g filter="url(#${id}b1)" style="mix-blend-mode:screen" opacity=".35" fill="#fff">${ell(p(14)[0], p(14)[1] + lw * 0.07, lw * 0.11, lw * 0.035)}</g>`
          + (variant === "wide" ? arrow(p(61), [p(61)[0] - lw * 0.1, p(61)[1]], sw * 0.5) + arrow(p(291), [p(291)[0] + lw * 0.1, p(291)[1]], sw * 0.5) : "") },
    ];
  }

  if (key === "skin") {
    const c0 = p(425); const box = fitBox([c0[0] - ew * 0.8, c0[1] - ew * 0.8, ew * 1.6, ew * 1.6], 1);
    const D = defs(ew * 0.035);
    return [{ box, ov: D + `<image href="${BlobCache.get(st.photos.front)}" width="${st.front.w}" height="${st.front.h}" filter="url(#${id}b0)" opacity=".55"/><rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" fill="#fff6ee" opacity=".08"/>` }];
  }
  return null;
}
