/* =====================================================================
   AI 이미지 생성 (GPT 이미지 — 서버 /api/image 경유, 키는 서버에만 보관)
   헤어 3 · 안경 3 · 귀걸이 3 · 메이크업 가이드 1장
   ===================================================================== */
const SHAPE_EN = { round: "round", softSquare: "soft rounded-square", oval: "horizontal oval", boston: "Boston (rounded-bottom panto)", wellington: "Wellington", cateye: "subtle cat-eye", rimless: "rimless soft-square", hexa: "soft hexagonal",
  stud: "small stud", pearl: "pearl", drop: "drop", huggie: "mini huggie hoop", hoop: "thin hoop", ovalHoop: "vertical oval hoop", cluster: "cluster" };
let HAIR_LIB = [];
fetch("hair/library.json").then(r => r.json()).then(j => { HAIR_LIB = j; }).catch(() => {});

async function toJpeg(src, max = 1024, q = 0.9) {
  const img = await loadImage(src); const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", q);
}
async function shrinkDataURL(src, max = 1100) { return toJpeg(src, max, 0.9); }
/** 측면 사진에서 귀 주변을 정사각형으로 잘라냄 (귀걸이 합성용) */
async function earCrop(st) {
  const E = st.ear.src ? st.ear : { src: st.side.src, w: st.side.w, h: st.side.h, lobe: st.ear.lobe };
  if (!E.src) return null;
  const img = await loadImage(E.src);
  const lobe = E.lobe || st.side.earPt || [img.width * 0.62, img.height * 0.52];
  const S = Math.min(img.width, img.height) * 0.34 / (st.ear.zoom || 1);
  const c = document.createElement("canvas"); c.width = 768; c.height = 1024;
  const w = S * 0.75, h = S; const x = Math.max(0, Math.min(img.width - w, lobe[0] - w / 2)), y = Math.max(0, Math.min(img.height - h, lobe[1] - h * 0.55));
  c.getContext("2d").drawImage(img, x, y, w, h, 0, 0, 768, 1024);
  return c.toDataURL("image/jpeg", 0.92);
}
async function libImage(id) {
  try { return await toJpeg("hair/" + id + ".jpg", 768); }
  catch { throw new Error(`참고 헤어 사진(${id})을 불러오지 못했습니다. 참고 사진을 다시 선택하거나 해제한 뒤 시도해 주세요.`); }
}

const one = s => String(s || "").replace(/\n/g, " ").trim();
function imgPromptFor(kind, st, item) {
  const keep = "Keep the SAME person: identical face, facial features, skin tone, freckles/texture, expression, head angle and lighting. Photorealistic, natural, high detail, no text, no watermark.";
  if (kind === "hair") return `Edit the first photo (a real customer). Change ONLY her hairstyle to: "${one(item.name)}". Style description (Korean): ${one(item.desc)}. ${item.prompt ? "Details: " + one(item.prompt) + "." : ""}
${item.ref ? "Use the SECOND image only as the hairstyle reference (cut, length, layering, curl pattern, volume, parting). Do NOT copy the reference person's face." : ""}
Keep her natural hair color. ${keep}
Output: front-facing studio portrait from the top of the head to the upper chest, centered, plain light-gray background, soft even light, plain black top.`;
  if (kind === "glasses") return `Edit this photo of a real customer. Add eyeglasses: "${one(item.name)}" — ${SHAPE_EN[item.shape] || ""} frame, ${one(item.prompt || item.desc)}.
The glasses sit naturally on the nose bridge and ears, correct scale, clear non-tinted lenses with subtle reflections, soft contact shadows. ${keep}
Output: front-facing head-and-shoulders portrait, centered, keep original background.`;
  if (kind === "earrings") return `Edit this close-up photo of a real customer's ear. Remove any existing earring and put ONE earring through the earlobe piercing: "${one(item.name)}" — ${SHAPE_EN[item.shape] || ""}, ${one(item.prompt || item.desc)}.
Realistic jewelry scale and weight, natural reflections, soft contact shadow on skin. Keep ear, hair, skin and lighting the same. Photorealistic product-on-model close-up, vertical 3:4, no text.`;
  return "";
}
function makeupPrompt(st) {
  const G = st.texts.makeupGuide || {}; const T = st.texts.makeup;
  const secs = (G.sections && G.sections.length ? G.sections : Object.values(T.sections).map(s => ({ title: s.title, sub: s.sub, steps: s.steps }))).slice(0, 10);
  const core = (G.core && G.core.length ? G.core : T.keyPoints).slice(0, 4);
  const lines = secs.map((s, i) => `${i + 1}. ${s.title} — ${one(s.sub)}\n   ${(s.steps || []).map((x, j) => `${["①", "②", "③", "④"][j]} ${one(x)}`).join("\n   ")}`).join("\n");
  return `Create a vertical A4-style Korean beauty infographic poster titled "맞춤 메이크업 가이드", personalized for the woman in the input photo. Use HER real face (same identity, features, skin, freckles) in every photo crop. Clean, elegant magazine layout: warm ivory/blush background, soft pink accents, numbered pink circle badges, thin rounded section boxes, crisp small Korean text exactly as given below (do not invent extra text; keep spelling exact).

LAYOUT (top to bottom):
- Top-left: small caps "MAKEUP GUIDE", big serif title "맞춤 메이크업 가이드", subtitle: "${one(G.intro || T.intro)}"
- Top-right box "핵심 포인트" with 4 checkbox lines:
${core.map(x => "  ☑ " + one(x)).join("\n")}
- Left: her front face photo with three horizontal guide lines labeled 상안부 / 중안부 / 하안부.
- Right box "전체적인 인상과 메이크업 방향": "${one(G.overall || T.head)}"
- Then a grid of numbered sections; each has a close-up crop of HER face area with dotted white guide lines, small numbered markers and arrows showing where/how to apply, plus short numbered steps beside it:
${lines}
- Last row (skin): three small skin-texture crops with short captions.
Photorealistic makeup applied subtly and correctly on her real features. Portrait 2:3, high resolution, sharp legible Korean typography.`;
}

/** 6쪽용: 글씨 없이 메이크업만 적용한 정면 사진 (글씨·번호는 프로그램이 얹음) */
function makeupFacePrompt(st) {
  const G = st.texts.makeupGuide || {}; const T = st.texts.makeup;
  const secs = (G.sections && G.sections.length ? G.sections : Object.values(T.sections).map(s => ({ title: s.title, sub: s.sub, steps: s.steps }))).slice(0, 10);
  const plan = secs.map(s => `- ${s.title}: ${one(s.sub)} (${(s.steps || []).map(one).join(" / ")})`).join("\n");
  return `Edit this photo of a real customer. Apply the following personalized makeup to HER face, realistically and tastefully (Korean beauty-salon quality, natural finish):
${plan}
Overall direction: ${one(G.overall || T.head)}
Keep the SAME person: identical face shape, features, skin tone and texture, expression. Do not slim or reshape the face.
Output: straight-on front-facing beauty portrait, eyes open looking at camera, neutral relaxed mouth, hair tucked behind the ears and away from the forehead and cheeks so brows, eyes, nose, cheeks, jawline and lips are fully visible, soft even studio light, plain warm light-ivory background, face centered and filling about 70% of the frame from the top of the forehead to the chin.
ABSOLUTELY NO text, letters, numbers, labels, arrows, lines, frames or watermark — a clean photo only.`;
}
const IMG_COST_KRW = 1400; // 1달러 환산(대략)
const IMG_Q = { draft: "low", final: "medium" };

/** 서버 호출. opts.mode: "draft"(저품질 시안) | "final"(중간 품질), opts.base: 고화질로 다시 만들 시안 이미지 */
async function generateAIImage(kind, st, item, opts = {}) {
  const mode = opts.mode || "final"; const quality = IMG_Q[mode] || "medium";
  let images = [], size = "1024x1536", prompt;
  if (kind === "makeup") { images = [await toJpeg(st.photos.frontOrig || st.photos.front, 1024)]; prompt = makeupFacePrompt(st); }
  else if (kind === "makeupPoster") { images = [await toJpeg(st.photos.frontOrig || st.photos.front, 1024)]; prompt = makeupPrompt(st); }
  else if (kind === "earrings") { const e = await earCrop(st); if (!e) throw new Error("측면(귀) 사진이 없습니다"); images = [e]; prompt = imgPromptFor(kind, st, item); }
  else { images = [await toJpeg(st.photos.frontOrig || st.photos.front, 1024)]; if (kind === "hair" && item.ref) images.push(await libImage(item.ref)); if (kind === "glasses" || kind === "hair") size = "1024x1024"; prompt = imgPromptFor(kind, st, item); }
  if (opts.base) { // 고른 시안을 그대로 고화질로
    images = [await toJpeg(opts.base, 1024), images[0]];
    prompt = `Recreate the FIRST image faithfully at higher quality and sharper detail: keep the exact same composition, framing, pose, hairstyle/accessory/makeup design, colors and background. Use the SECOND image only to restore the person's exact facial identity, skin texture and fine details. Change nothing else. No text, no watermark.`;
  }
  const r = await apiPost("/api/image", { kind, prompt, images, size, quality });
  const usd = r.cost ?? 0;
  (st.costs = st.costs || []).push({ kind, quality, usd, at: Date.now() });
  return { image: r.image, quality, usd };
}
function costSummary(st) {
  const L = st.costs || []; const usd = L.reduce((s, c) => s + (c.usd || 0), 0);
  const by = q => L.filter(c => c.quality === q).length;
  return { n: L.length, usd, krw: Math.round(usd * IMG_COST_KRW), low: by("low"), medium: by("medium"), high: by("high") };
}
