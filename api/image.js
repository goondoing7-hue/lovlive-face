import { send, readBody, requireUser } from "./_lib.js";

function rasterFile(value, pngOnly = false) {
  if (typeof value !== "string") return null;
  const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
  if (!match || match[2].length % 4 !== 0) return null;
  const type = match[1].toLowerCase().replace("jpg", "jpeg"), bytes = Buffer.from(match[2], "base64");
  if (pngOnly && type !== "png") return null;
  const valid = type === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : type === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return valid ? { bytes, type: "image/" + type, extension: type } : null;
}

/** GPT 이미지 생성/편집: 고객 사진(+참고 사진)을 넣어 헤어·안경·귀걸이·메이크업 가이드를 만든다 */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    await requireUser(req);
    const body = await readBody(req);
    const { prompt, images = [], size = "1024x1536" } = body;
    const quality = ["low", "medium", "high"].includes(body.quality) ? body.quality : (process.env.OPENAI_IMAGE_QUALITY || "medium");
    if (typeof prompt !== "string" || !prompt.trim() || !Array.isArray(images) || images.length < 1 || images.length > 4) return send(res, 400, { error: "설명과 고객 원본 사진이 필요합니다. 사진은 최대 4장까지 사용할 수 있습니다." });
    const files = images.map(value => rasterFile(value));
    if (files.some(file => !file)) return send(res, 400, { error: "고객 원본과 참고 사진을 읽을 수 없습니다. JPG·PNG·WEBP 사진을 다시 올려 주세요." });
    const mask = body.mask === undefined ? null : rasterFile(body.mask, true);
    if (body.mask !== undefined && !mask) return send(res, 400, { error: "얼굴 보호 영역을 만들지 못했습니다. 원본 정면 사진을 다시 확인해 주세요." });
    if (mask && (files[0].type !== "image/png" || files[0].bytes.length < 26 || mask.bytes.length < 26 ||
      !files[0].bytes.subarray(16, 24).equals(mask.bytes.subarray(16, 24)) || ![4, 6].includes(mask.bytes[25]))) return send(res, 400, { error: "원본 사진과 얼굴 보호 영역의 크기·형식이 맞지 않습니다. 정면 사진을 다시 확인해 주세요." });
    if (process.env.MOCK_AI === "1") return send(res, 200, { image: images[0], mock: true, quality, cost: estimateCost("gpt-image-1.5", quality, size, null) });
    const key = process.env.OPENAI_API_KEY;
    if (!key) return send(res, 500, { error: "서버에 OPENAI_API_KEY가 설정되지 않았습니다 (Vercel 환경변수)" });
    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
    const fd = new FormData();
    fd.append("model", model);
    fd.append("prompt", prompt);
    files.forEach((file, i) => fd.append("image[]", new Blob([file.bytes], { type: file.type }), `in${i}.${file.extension}`));
    if (mask) fd.append("mask", new Blob([mask.bytes], { type: "image/png" }), "face-protection.png");
    fd.append("size", size);
    fd.append("quality", quality);
    fd.append("output_format", "jpeg");
    fd.append("output_compression", "88");
    if (/^gpt-image-1(?:\.5)?(?:-\d{4}-\d{2}-\d{2})?$/.test(model)) fd.append("input_fidelity", "high");
    const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + key }, body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j.error?.message || "";
      const hint = /verif/i.test(msg) ? " (OpenAI 조직 인증(Verify Organization)이 필요할 수 있습니다)" : /safety|moderation/i.test(msg) ? " (안전 필터에 걸렸습니다 — 설명을 바꿔 다시 시도)" : "";
      return send(res, 502, { error: `GPT 이미지 오류 ${r.status}: ${msg.slice(0, 240)}${hint}` });
    }
    const b64 = j.data?.[0]?.b64_json; if (!b64) return send(res, 502, { error: "이미지가 반환되지 않았습니다" });
    return send(res, 200, { image: "data:image/jpeg;base64," + b64, model, quality, size, usage: j.usage || null, cost: estimateCost(model, quality, size, j.usage) });
  } catch (e) {
    console.error(e);
    return send(res, e.code || 500, { error: e.message || String(e) });
  }
}

/* 비용(USD): usage(토큰)가 오면 토큰 단가로, 없으면 공식 장당 가격표로 추정 */
const RATE = { "gpt-image-1.5": [5, 8, 32], "gpt-image-2": [5, 8, 30], "gpt-image-1": [5, 10, 40], "gpt-image-1-mini": [2, 2.5, 8] };
const PER = { low: [0.009, 0.013], medium: [0.034, 0.05], high: [0.133, 0.2] };
function estimateCost(model, quality, size, u) {
  const rate = RATE[model] || RATE["gpt-image-1.5"];
  if (u && (u.input_tokens || u.output_tokens)) {
    const d = u.input_tokens_details || {}; const img = d.image_tokens ?? 0, txt = d.text_tokens ?? Math.max(0, (u.input_tokens || 0) - img);
    return +((txt * rate[0] + img * rate[1] + (u.output_tokens || 0) * rate[2]) / 1e6).toFixed(4);
  }
  return (PER[quality] || PER.medium)[size === "1024x1024" ? 0 : 1];
}
