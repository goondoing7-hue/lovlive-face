import { send, readBody, requireUser } from "./_lib.js";

/** GPT 이미지 생성/편집: 고객 사진(+참고 사진)을 넣어 헤어·안경·귀걸이·메이크업 가이드를 만든다 */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    await requireUser(req);
    const { prompt, images = [], size = "1024x1536", quality = "medium" } = await readBody(req);
    if (!prompt || !images.length) return send(res, 400, { error: "prompt와 사진이 필요합니다" });
    if (process.env.MOCK_AI === "1") return send(res, 200, { image: images[0], mock: true });
    const key = process.env.OPENAI_API_KEY;
    if (!key) return send(res, 500, { error: "서버에 OPENAI_API_KEY가 설정되지 않았습니다 (Vercel 환경변수)" });
    const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
    const fd = new FormData();
    fd.append("model", model);
    fd.append("prompt", prompt);
    images.slice(0, 4).forEach((d, i) => {
      const m = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(d); if (!m) return;
      fd.append("image[]", new Blob([Buffer.from(m[2], "base64")], { type: m[1] }), `in${i}.${m[1].split("/")[1]}`);
    });
    fd.append("size", size);
    fd.append("quality", process.env.OPENAI_IMAGE_QUALITY || quality);
    fd.append("output_format", "jpeg");
    fd.append("output_compression", "88");
    if (/^gpt-image-1/.test(model)) fd.append("input_fidelity", "high");
    const r = await fetch("https://api.openai.com/v1/images/edits", { method: "POST", headers: { Authorization: "Bearer " + key }, body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = j.error?.message || "";
      const hint = /verif/i.test(msg) ? " (OpenAI 조직 인증(Verify Organization)이 필요할 수 있습니다)" : /safety|moderation/i.test(msg) ? " (안전 필터에 걸렸습니다 — 설명을 바꿔 다시 시도)" : "";
      return send(res, 502, { error: `GPT 이미지 오류 ${r.status}: ${msg.slice(0, 240)}${hint}` });
    }
    const b64 = j.data?.[0]?.b64_json; if (!b64) return send(res, 502, { error: "이미지가 반환되지 않았습니다" });
    return send(res, 200, { image: "data:image/jpeg;base64," + b64 });
  } catch (e) {
    console.error(e);
    return send(res, e.code || 500, { error: e.message || String(e) });
  }
}
