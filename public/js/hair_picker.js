/* 기존 보고서의 실제 헤어 참고 사진을 고르는 화면에서 사용한다. */
const HairPicker = (() => {
  const FACE_NAMES = { oval: "계란형", round: "둥근형", heart: "하트형", square: "사각형", diamond: "다이아몬드형", hexagon: "육각형", long: "긴형" };
  const LENGTH_NAMES = { short: "짧은 기장", medium: "중간 기장", long: "긴 기장", updo: "묶음 머리" };
  const LENGTH_SEARCH = { short: "숏 단발 보브", medium: "미디엄 중단발 쇄골", long: "롱 긴머리", updo: "묶음 업스타일 번 포니테일" };
  const LENGTH_EN = { short: "short", medium: "medium", long: "long", updo: "updo" };
  const validPhoto = photo => photo && /^h\d+$/.test(photo.id) && typeof photo.name === "string" && photo.name.trim();
  const normalized = value => String(value || "").normalize("NFKC").toLocaleLowerCase("ko").replace(/\s+/g, " ").trim();
  const escapeHTML = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function faceName(faceKey) {
    return (typeof FACE_TYPES !== "undefined" && FACE_TYPES[faceKey]?.ko) || FACE_NAMES[faceKey] || "";
  }

  function candidates(faceKey, library, { query = "", recommendedOnly = false } = {}) {
    const face = faceName(faceKey);
    const terms = normalized(query).split(" ").filter(Boolean);
    return (Array.isArray(library) ? library : [])
      .filter(validPhoto)
      .map((photo, index) => ({ ...photo, recommended: !!face && photo.fromFace === face, _order: index }))
      .filter(photo => !recommendedOnly || photo.recommended)
      .filter(photo => {
        const text = normalized([photo.name, photo.fromFace, photo.curl, LENGTH_NAMES[photo.length], LENGTH_SEARCH[photo.length]].join(" "));
        return terms.every(term => text.includes(term));
      })
      .sort((a, b) => Number(b.recommended) - Number(a.recommended) || a._order - b._order)
      .map(({ _order, ...photo }) => photo);
  }

  function choose(photo, faceKey) {
    if (!validPhoto(photo)) throw new Error("선택한 헤어 사진을 찾을 수 없습니다. 다시 선택해 주세요.");
    const name = photo.name.trim();
    const length = LENGTH_NAMES[photo.length] || "참고 사진의 기장";
    const style = photo.curl ? `${photo.curl} 스타일` : "헤어스타일";
    const direction = typeof FACE_TYPES !== "undefined" ? FACE_TYPES[faceKey]?.hair?.subtitle : "";
    const description = photo.length === "updo" ? `${name}의 묶음과 모발 흐름을 참고합니다.` : `${length}의 ${style}을 참고합니다.`;
    return {
      name,
      desc: [description, direction].filter(Boolean).join("\n"),
      ref: photo.id,
      prompt: `Match the hairstyle in the SECOND reference image: "${name}". Hair length category: ${LENGTH_EN[photo.length] || "as shown in the reference"}; curl/style: ${photo.curl || "as shown in the reference"}. Follow the reference haircut, layering and curl pattern. Preserve the customer's exact identity and natural hair color.`,
    };
  }

  function renderCards(photos, { selectedId = "", faceKey = "" } = {}) {
    const face = faceName(faceKey);
    const entries = (Array.isArray(photos) ? photos : []).filter(validPhoto);
    if (!entries.length) return `<p class="hair-picker-empty" role="status">조건에 맞는 참고 사진이 없습니다. 검색어를 바꾸거나 전체 사진을 확인해 주세요.</p>`;
    return entries.map(photo => {
      const selected = photo.id === selectedId;
      const recommended = !!face && photo.fromFace === face;
      const source = recommended ? "현재 얼굴형 자료" : photo.fromFace ? `${photo.fromFace} 자료` : "참고 사진";
      const meta = [LENGTH_NAMES[photo.length], photo.curl].filter(Boolean).join(" · ");
      return `<button type="button" class="hair-photo-card${selected ? " is-selected" : ""}" data-hair-photo="${photo.id}" aria-pressed="${selected}" aria-label="${escapeHTML(photo.name)} 선택">
        <span class="hair-photo-card__image"><img src="hair/${photo.id}.jpg" alt="${escapeHTML(photo.name)}" loading="lazy" decoding="async">${selected ? `<span class="hair-photo-card__chosen" aria-hidden="true">선택됨</span>` : ""}</span>
        <span class="hair-photo-card__title">${escapeHTML(photo.name)}</span>
        <span class="hair-photo-card__meta">${escapeHTML(meta)}</span>
        <span class="hair-photo-card__source${recommended ? " is-recommended" : ""}">${escapeHTML(source)}</span>
      </button>`;
    }).join("");
  }

  return Object.freeze({ faceName, candidates, choose, renderCards });
})();
