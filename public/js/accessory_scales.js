/* 선택한 액세서리의 상대적인 디자인 속성 + 얼굴형 권장값으로 DETAIL SCALE을 요약한다.
   실제 제품의 치수나 무게를 측정하는 값은 아니며, 직접 수정한 항목을 우선한다. */
(function (root) {
  "use strict";

  const N = 6;
  const GLASSES = {
    round: [1, 2, 2, 2, 1, 3], softSquare: [1, 2, 3, 2, 2, 3],
    oval: [1, 1, 3, 2, 1, 3], boston: [1, 2, 2, 2, 2, 3],
    wellington: [2, 3, 3, 2, 3, 3], cateye: [1, 2, 3, 2, 3, 3],
    rimless: [0, 2, 2, 2, 0, 0], hexa: [1, 2, 2, 2, 2, 3],
  };
  const EARRINGS = {
    stud: [0, 0, 0, 0, 0, 1], pearl: [1, 2, 0, 1, 1, 2],
    drop: [2, 0, 4, 0, 2, 2], huggie: [1, 1, 1, 1, 0, 1],
    hoop: [3, 1, 3, 4, 1, 2], ovalHoop: [2, 1, 4, 2, 1, 2],
    cluster: [2, 2, 1, 3, 3, 4],
  };
  const NAMES = {
    glasses: { round: "라운드", softSquare: "소프트 스퀘어", oval: "오벌", boston: "보스턴", wellington: "웰링턴", cateye: "캣아이", rimless: "무테", hexa: "소프트 다각" },
    earrings: { stud: "스터드", pearl: "진주", drop: "드롭", huggie: "미니 후프", hoop: "후프", ovalHoop: "오벌 링", cluster: "클러스터" },
  };
  const COLOR_LIGHT = { silver: 0, gold: 1, rosegold: 1, gunmetal: 3, brown: 3, black: 4, clear: 0, tortoise: 3 };
  const WORDS = {
    glasses: [
      ["아주 얇은 테", "얇고 가벼운 테", "중간 굵기의 테", "조금 굵은 테", "굵고 또렷한 테"],
      ["아담한 프레임", "작은 프레임", "중간 크기의 프레임", "조금 큰 프레임", "큰 프레임"],
      ["아주 좁은 가로폭", "좁은 가로폭", "중간 가로폭", "여유 있는 가로폭", "넓은 가로폭"],
      ["밝고 가벼운 컬러", "밝은 컬러", "중간 명도의 컬러", "차분하고 어두운 컬러", "어둡고 또렷한 컬러"],
      ["프레임 존재감을 최소화", "섬세한 프레임 존재감", "적당한 프레임 존재감", "또렷한 프레임 존재감", "강한 프레임 존재감"],
      ["높은 투명감", "가벼운 투명감", "중간 투명감", "선명하고 불투명한 테", "불투명하고 또렷한 테"],
    ],
    earrings: [
      ["아주 작은 전체 크기", "작은 전체 크기", "중간 전체 크기", "조금 큰 전체 크기", "큰 전체 크기"],
      ["매우 가는 선", "가늘고 섬세한 선", "중간 굵기의 선", "조금 굵은 선", "굵고 또렷한 선"],
      ["귓불 가까이 끝나는 길이", "짧은 길이", "중간 드롭 길이", "조금 긴 드롭", "긴 세로 드롭"],
      ["가로 퍼짐을 최소화", "슬림한 가로폭", "적당한 가로폭", "여유 있는 가로 퍼짐", "넓은 가로 퍼짐"],
      ["하단 볼륨을 최소화", "가벼운 하단 볼륨", "적당한 하단 볼륨", "도톰한 하단 볼륨", "풍성한 하단 볼륨"],
      ["장식을 최소화", "담백한 포인트", "은은한 광택과 장식", "화사한 광택과 장식", "화려한 장식 포인트"],
    ],
  };

  function kindName(kind) {
    if (kind === "g" || kind === "glasses") return "glasses";
    if (kind === "e" || kind === "earrings") return "earrings";
    throw new TypeError("안경 또는 귀걸이 종류가 필요합니다.");
  }
  const clamp = value => Math.max(0, Math.min(4, value));
  const validIndex = index => Number.isInteger(index) && index >= 0 && index < N;
  function numeric(value, fallback) { return typeof value === "number" && Number.isFinite(value) ? clamp(value) : fallback; }
  function indexSet(indices) { return new Set((Array.isArray(indices) ? indices : []).map(Number).filter(validIndex)); }

  function profile(kind, item) {
    const source = (kind === "glasses" ? GLASSES : EARRINGS)[item?.shape];
    if (!source) return null;
    const values = source.slice();
    const size = Math.min(1.6, Math.max(0.6, Number.isFinite(Number(item.size)) && Number(item.size) > 0 ? Number(item.size) : 1));
    const offset = (size - 1) * 4;
    if (kind === "glasses") {
      const acetate = ["black", "brown", "tortoise"].includes(item.color) || /뿔테|아세테이트|acetate/i.test(String(item.name || ""));
      values[0] = item.shape === "rimless" ? 0 : acetate ? 3 : item.color === "clear" ? 2 : 1;
      values[1] += offset;
      values[2] += offset * 0.6;
      values[3] = COLOR_LIGHT[item.color] ?? 2;
      values[4] += offset * 0.5 + (acetate ? 0.8 : item.color === "clear" ? -0.8 : 0);
      values[5] = item.shape === "rimless" || item.color === "clear" ? 0 : acetate ? 4 : 3;
    } else {
      values[0] += offset;
      values[2] += offset * 0.6;
      values[3] += offset * 0.5;
      values[4] += offset * 0.5;
    }
    return values.map(clamp);
  }

  function recompute(kind, section, faceDefaults = {}, options = {}) {
    const key = kindName(kind);
    if (!section || typeof section !== "object") throw new TypeError("액세서리 항목이 필요합니다.");
    const baseline = Array.from({ length: N }, (_, i) => numeric(faceDefaults.scales?.[i], 2));
    const oldValues = Array.from({ length: N }, (_, i) => numeric(section.scales?.[i], baseline[i]));
    const oldTexts = Array.from({ length: N }, (_, i) => typeof section.scaleText?.[i] === "string" ? section.scaleText[i] : "");
    const items = (Array.isArray(section.items) ? section.items : []).filter(item => item && typeof item === "object");
    const profiles = items.map(item => profile(key, item)).filter(Boolean);
    const labels = [...new Set(items.map(item => NAMES[key][item.shape]).filter(Boolean))].join("·");
    const manualValues = indexSet(options.manualIndices);
    const manualTexts = indexSet(options.manualTextIndices);
    section.scales = baseline.map((base, i) => {
      if (section.manualScales?.[i] || manualValues.has(i)) return oldValues[i];
      if (!profiles.length) return base;
      const average = profiles.reduce((sum, values) => sum + values[i], 0) / profiles.length;
      return clamp(Math.round(base * 0.35 + average * 0.65));
    });
    section.scaleText = section.scales.map((value, i) => {
      if (section.manualScaleText?.[i] || manualTexts.has(i)) return oldTexts[i];
      if (!profiles.length) return typeof faceDefaults.scaleText?.[i] === "string" ? faceDefaults.scaleText[i] : oldTexts[i];
      return `${labels} 선택 기준: ${WORDS[key][i][Math.round(value)]}`;
    });
    return section;
  }

  function markManual(section, index, mode = "value") {
    if (!validIndex(index)) throw new RangeError("DETAIL SCALE 번호가 올바르지 않습니다.");
    if (mode !== "value" && mode !== "text") throw new TypeError("수동 수정 종류가 올바르지 않습니다.");
    const key = mode === "text" ? "manualScaleText" : "manualScales";
    if (!section[key] || typeof section[key] !== "object") section[key] = {};
    section[key][index] = true;
  }
  function clearManual(section, index) {
    if (index == null) { delete section.manualScales; delete section.manualScaleText; return; }
    if (!validIndex(index)) throw new RangeError("DETAIL SCALE 번호가 올바르지 않습니다.");
    if (section.manualScales) delete section.manualScales[index];
    if (section.manualScaleText) delete section.manualScaleText[index];
  }

  root.AccessoryScales = Object.freeze({ recompute, markManual, clearManual });
})(globalThis);
