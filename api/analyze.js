import { send, readBody, requireUser, loadKB, callClaude, imgPart, parseJSON } from "./_lib.js";
import { mockRatios, mockReport } from "./_mock.js";

const SCHEMA = `{
  "faceType": ["둥근형"],                 // 계란형|둥근형|하트형|사각형|다이아몬드형|육각형 중 1~2개
  "faceReason": "판정 근거 한두 문장(편집자 참고용)",
  "side": {"forehead": "둥근 형태|수직형 (반듯한)이마|볼록한 이마", "mouth": "돌출된|중립적인|들어가보이는", "profile": "평면형|볼록형|오목형"},
  "sideSummary": "파란 글씨 요약 2문장",
  "sidePoints": {"hairline":[x,y], "glabella":[x,y], "noseTip":[x,y], "subnasale":[x,y], "stomion":[x,y], "chin":[x,y], "ear":[x,y]},
  "ratioText": {"thirds": "...", "aspect": "...", "eyePos": "...", "eyeDist": "...", "noseMouth": "코 위치 문단\\n\\n입 위치 문단\\n\\n따라서 … 종합 문단"},
  "glasses": ["보스턴형", "웨이퍼러형", "스퀘어형"],
  "earrings": [["small","short"], ["small","medium"]],
  "makeup": {
    "annotations": [{"key":"forehead_hl","on":true,"label":"하이라이터"}, {"key":"brow","on":true,"label":"세미아치형 눈썹"}, {"key":"blush","on":true,"label":"블러셔","shape":"horizontal"}],
    "strategy": [{"title":"눈썹과 눈썹 주변","text":"..."},{"title":"아이메이크업","text":"..."},{"title":"블러셔","text":"..."},{"title":"쉐딩","text":"..."},{"title":"하이라이터","text":"..."},{"title":"입술","text":"..."}]
  },
  "hair": {"subtitle": "가로폭 확장, 여백 보완, 하단 볼륨", "caution": "…, …, …", "best": [{"id":"h70","title":"...","style":"...","point":"..."}]}
}`;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    await requireUser(req);
    const body = await readBody(req);

    /* ---- 1) 비율 앱 캡처 읽기 ---- */
    if (body.task === "ratios") {
      if (process.env.MOCK_AI === "1") return send(res, 200, mockRatios());
      const imgs = (body.images || []).map(imgPart).filter(Boolean).slice(0, 8);
      const text = await callClaude({
        system: "너는 얼굴 비율 측정 앱 화면 캡처에서 숫자를 정확히 읽는 도우미다. JSON만 출력한다.",
        content: [...imgs, { type: "text", text: `캡처 화면들에서 '비율 1 : …' 값을 읽어 아래 JSON으로만 답하라. 화면 제목으로 항목을 구분한다(얼굴 세로 비율, 얼굴 종횡비, 눈 위치, 눈 거리, 코 위치, 입 위치). 없는 항목은 null. 평가 등급(S/A/B/C)도 함께.
{"thirds":"1:1.3:0.9","aspect":"1:1.46","eyePos":"1:0.9","eyeDist":"1:1.5:1.0","nosePos":"1:0.7","mouthPos":"1:1.4","grades":{"thirds":"B","aspect":"S","eyePos":"S","eyeDist":"B","nosePos":"C","mouthPos":"C"}}` }],
        maxTokens: 800,
      });
      return send(res, 200, parseJSON(text));
    }

    /* ---- 2) 보고서 전체 분석 ---- */
    if (body.task === "report") {
      if (process.env.MOCK_AI === "1") return send(res, 200, mockReport(body));
      const kb = loadKB();
      const hairList = kb.hair.map(h => `${h.id} | ${h.name} | 길이:${h.length} | ${h.curl} | 기존 사용 얼굴형:${h.fromFace || "-"}`).join("\n");
      const system = `${kb.knowledge}\n\n${kb.gold}\n\n# 참고: 하영님이 직접 작성한 분석 초안(방법론·처방 논리 참고용, 결과지는 기준 예시처럼 간결하게)\n${kb.drafts}`;
      const recent = (body.recentExamples || []).slice(0, 3).map((e, i) => `### 최근 저장 보고서 ${i + 1}\n${JSON.stringify(e).slice(0, 5000)}`).join("\n\n");
      const content = [];
      const f = imgPart(body.front), s = imgPart(body.side);
      if (f) content.push({ type: "text", text: "[정면 사진]" }, f);
      if (s) content.push({ type: "text", text: "[측면 사진]" }, s);
      content.push({ type: "text", text: `고객: ${body.name || "고객"} (부를 때: ${body.callName || body.name || "고객"} 님)
상담 메모: ${body.memo || "-"}
측정 비율(별도 앱 측정값, 그대로 사용): 세로 ${body.ratios?.thirds} / 종횡비 ${body.ratios?.aspect} / 눈 위치 ${body.ratios?.eyePos} / 눈 거리 ${body.ratios?.eyeDist} / 코 위치 ${body.ratios?.nosePos} / 입 위치 ${body.ratios?.mouthPos}
정면 사진 윤곽 수치(자동 측정, 참고용): ${JSON.stringify(body.faceMetrics || {})}

[헤어 라이브러리 — 이 중에서만 id 선택]
${hairList}
${recent ? "\n[같은 방식으로 최근 작성된 보고서 — 문체 참고]\n" + recent : ""}

위 지침과 기준 예시에 맞춰 이 고객의 분석결과지 내용을 작성하라. 아래 스키마의 JSON 하나만 출력한다(주석 제외).
${SCHEMA}` });
      const text = await callClaude({ system, content, maxTokens: 7000 });
      const out = parseJSON(text);
      return send(res, 200, out);
    }
    return send(res, 400, { error: "unknown task" });
  } catch (e) {
    console.error(e);
    return send(res, e.code || 500, { error: e.message || String(e) });
  }
}
