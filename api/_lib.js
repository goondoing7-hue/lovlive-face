import fs from "node:fs";
import path from "node:path";
import { OAuth2Client } from "google-auth-library";
import { jsonrepair } from "jsonrepair";

export const ALLOWED = (process.env.ALLOWED_EMAILS || "goondoing7@gmail.com,chayoung9310@gmail.com")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const oauth = new OAuth2Client(CLIENT_ID);

export function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

export async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  const txt = Buffer.concat(chunks).toString("utf8");
  return txt ? JSON.parse(txt) : {};
}

/** 구글 ID 토큰 검증 + 허용 계정(2개) 확인 */
export async function requireUser(req) {
  if (process.env.DEV_NO_AUTH === "1") return { email: "dev@local" };
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) throw Object.assign(new Error("로그인이 필요합니다"), { code: 401 });
  if (!CLIENT_ID) throw Object.assign(new Error("서버에 GOOGLE_CLIENT_ID가 설정되지 않았습니다"), { code: 500 });
  let payload;
  try { payload = (await oauth.verifyIdToken({ idToken: token, audience: CLIENT_ID })).getPayload(); }
  catch (e) { throw Object.assign(new Error("로그인이 만료되었습니다. 다시 로그인해 주세요"), { code: 401 }); }
  const email = (payload.email || "").toLowerCase();
  if (!payload.email_verified || !ALLOWED.includes(email)) throw Object.assign(new Error("허용되지 않은 계정입니다: " + email), { code: 403 });
  return { email };
}

const ROOT = process.cwd();
const rd = p => { try { return fs.readFileSync(path.join(ROOT, p), "utf8"); } catch { return ""; } };
export function loadKB() {
  const drafts = ["홍수진_v4.txt", "정다영님.txt", "최예영_v2.txt", "임보라님.txt", "김현애님_v2.txt"]
    .map(f => `### 하영님 분석 초안: ${f.replace(".txt", "")}\n${rd("kb/drafts/" + f).slice(0, 6000)}`).join("\n\n");
  return { knowledge: rd("kb/knowledge.md"), gold: rd("kb/gold_example.md"), drafts,
    hair: JSON.parse(rd("public/hair/library.json") || "[]") };
}

/** Claude 호출 (이미지 + 텍스트) → 텍스트 */
export async function callClaude({ system, content, maxTokens = 6000 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw Object.assign(new Error("서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다"), { code: 500 });
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.CLAUDE_MODEL || "claude-sonnet-5-5", max_tokens: maxTokens, system, messages: [{ role: "user", content }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error("AI 오류 " + r.status + ": " + (j.error?.message || "").slice(0, 300)), { code: 502 });
  return (j.content || []).map(c => c.text || "").join("");
}
/** OpenAI 텍스트(분석) 호출 — ANALYSIS_PROVIDER=openai 일 때 */
export async function callOpenAIText({ system, content, maxTokens = 8000 }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error("서버에 OPENAI_API_KEY가 설정되지 않았습니다"), { code: 500 });
  const parts = content.map(c => c.type === "image" ? { type: "image_url", image_url: { url: `data:${c.source.media_type};base64,${c.source.data}` } } : { type: "text", text: c.text });
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    body: JSON.stringify({ model: process.env.OPENAI_TEXT_MODEL || "gpt-5", max_completion_tokens: maxTokens, response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: parts }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error("GPT 오류 " + r.status + ": " + (j.error?.message || "").slice(0, 300)), { code: 502 });
  return j.choices?.[0]?.message?.content || "";
}
export async function callAnalysis(args) {
  return (process.env.ANALYSIS_PROVIDER || "claude").toLowerCase() === "openai" ? callOpenAIText(args) : callClaude(args);
}
export function imgPart(dataURL) {
  const m = /^data:(image\/[a-z]+);base64,(.*)$/s.exec(dataURL || "");
  if (!m) return null;
  return { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } };
}
export function parseJSON(text) {
  let t = String(text || "").replace(/```(?:json)?/gi, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b < 0) throw Object.assign(new Error("AI 응답을 읽을 수 없습니다"), { code: 502 });
  t = t.slice(a, b + 1);
  try { return JSON.parse(t); } catch (e1) {}
  try { return JSON.parse(jsonrepair(t)); } catch (e2) {}
  return null;
}
/** JSON 파싱 실패 시: 자동 복구 → 그래도 안 되면 AI에게 형식만 고쳐 달라고 1회 재요청 */
export async function parseOrRepair(text) {
  const j = parseJSON(text); if (j) return j;
  const fixed = await callAnalysis({ system: "너는 깨진 JSON을 고치는 도우미다. 내용은 바꾸지 말고 문법만 고쳐 올바른 JSON 하나만 출력한다.", content: [{ type: "text", text }], maxTokens: 8000 });
  const j2 = parseJSON(fixed); if (j2) return j2;
  throw Object.assign(new Error("AI 응답 형식 오류 — 한 번 더 실행해 주세요"), { code: 502 });
}
