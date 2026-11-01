import { send, readBody, requireUser, loadKB, callAnalysis, imgPart, parseOrRepair } from "./_lib.js";
import { mockRatios, mockReport, mockRefresh } from "./_mock.js";

const EXTRA = `추가로 아래 키도 함께 출력하라:
"faceTypeKey": "oval|round|long|heart|square|hexagon|diamond" 중 하나 (긴 하트형처럼 복합형이면 가장 가까운 기본형, 라벨 문구 p2.chip1에는 'LONG HEART SHAPE : 긴 하트형'처럼 복합형으로 써도 된다),
"sidePoints": {"noseTip":[x,y],"lip":[x,y],"chin":[x,y],"ear":[x,y]}  — 측면 사진 기준 0~1 정규화 좌표(ear는 귓불 위치),
"makeupGuide": {"intro":"부제 2줄","core":["핵심 포인트 4개"],"overall":"전체적인 인상과 메이크업 방향 2~3문장","sections":[{"key":"brow","title":"눈썹 메이크업","sub":"한 줄 부제","steps":["앞머리: …","눈썹산: …","꼬리: …"]}, … 10개: 눈썹 메이크업, 아이섀도우, 아이라인, 언더 메이크업, 속눈썹 메이크업, 코 메이크업, 블러셔, 윤곽 셰이딩, 립 메이크업, 피부 표현 (각 steps 2~4개, 각 25자 이내)]}.
makeupGuide.sections 는 초안의 개수와 무관하게 반드시 정확히 10개를 출력한다. key 는 brow, shadow, liner, under, lash, nose, blush, contour, lip, skin 순서이며 각 key와 title은 같은 부위를 나타내야 한다. 기존 가이드가 일부만 있어도 나머지 부위를 빠짐없이 작성한다.
hair.items[].prompt / glasses.items[].prompt / earrings.items[].prompt 에는 GPT 이미지 생성용 영어 설명(길이·컬·볼륨·가르마·앞머리 / 테 모양·소재·색 / 귀걸이 모양·소재·크기·길이)을 1~2문장으로 쓴다.
hair.items[].ref 에는 [헤어 라이브러리]에서 그 스타일과 가장 비슷한 사진 id를 하나 넣는다(없으면 빈 문자열).
glasses.items[].shape 는 round|softSquare|oval|boston|wellington|cateye|rimless|hexa, color 는 silver|gold|rosegold|gunmetal|brown|black|clear|tortoise.
earrings.items[].shape 는 stud|pearl|drop|huggie|hoop|ovalHoop|cluster, color 는 gold|silver|rosegold.
scales 는 0~4 정수 6개, hair.avoid 는 줄바꿈(\\n)으로 구분된 5줄.`;

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    await requireUser(req);
    const body = await readBody(req);

    if (body.task === "ratios") {
      if (process.env.MOCK_AI === "1") return send(res, 200, mockRatios());
      const imgs = (body.images || []).map(imgPart).filter(Boolean).slice(0, 8);
      const text = await callAnalysis({
        system: "너는 얼굴 비율 측정 앱 화면 캡처에서 숫자를 정확히 읽는 도우미다. JSON만 출력한다.",
        content: [...imgs, { type: "text", text: `캡처 화면들에서 '비율 1 : …' 값을 읽어 아래 JSON으로만 답하라. 화면 제목으로 항목을 구분한다(얼굴 세로 비율=thirds, 얼굴 종횡비=aspect, 눈 위치=eyePos, 눈 거리=eyeDist, 코 위치=nosePos, 입 위치=mouthPos). 없는 항목은 null.
{"thirds":"1:1.3:0.9","aspect":"1:1.46","eyePos":"1:0.9","eyeDist":"1:1.5:1.0","nosePos":"1:0.7","mouthPos":"1:1.4"}` }],
        maxTokens: 800,
      });
      return send(res, 200, await parseOrRepair(text));
    }

    if (body.task === "report") {
      if (process.env.MOCK_AI === "1") return send(res, 200, mockReport(body));
      const kb = loadKB();
      const system = `${kb.knowledge}\n\n${kb.gold}\n\n# 참고: 하영님 분석 초안(처방 논리 참고용)\n${kb.drafts}`;
      const content = [];
      const f = imgPart(body.front), s = imgPart(body.side);
      if (f) content.push({ type: "text", text: "[정면 사진]" }, f);
      if (s) content.push({ type: "text", text: "[측면 사진]" }, s);
      const recent = (body.recent || []).slice(0, 3).map((e, i) => `### 최근 보고서 ${i + 1}\n${JSON.stringify(e).slice(0, 4000)}`).join("\n\n");
      content.push({ type: "text", text: `고객: ${body.name || "고객"}
상담 메모: ${body.memo || "-"}
측정 비율(비율 앱 측정값 — 숫자는 바꾸지 말 것): 종횡비 ${body.ratios?.aspect} / 상:중:하 ${body.ratios?.thirds} / 눈 너비 ${body.ratios?.eyes} / 눈 위치 ${body.ratios?.eyePos} / 코 위치 ${body.ratios?.nosePos} / 입 위치 ${body.ratios?.mouthPos}

[헤어 라이브러리: id|이름|길이|기존 얼굴형]
${body.hairLib || ""}
${recent ? "\n[최근 작성 보고서 — 문체 참고]\n" + recent : ""}

아래 [현재 초안]은 프로그램이 규칙으로 만든 기본 문장이다. 사진과 비율을 직접 분석해서, 기준 보고서(김희주님)와 같은 문체·길이로 이 고객에게 맞게 모든 값을 새로 작성하라.
- 같은 키 구조 그대로, 배열 길이와 줄바꿈(\\n) 개수도 초안과 비슷하게 유지(지면이 고정된 양식).
- p3.desc 는 카드 한 줄(22~30자), side.axes[].title 은 '부위 : 요약 + 요약' 형식.
- 측면 4축: 이마·눈썹뼈 / 콧대·코끝 / 입술(E-line 기준) / 턱끝·턱선.
${EXTRA}
출력은 JSON 하나만. 주석 금지. 문장 안에는 큰따옴표 대신 작은따옴표 사용.

[현재 초안]
${JSON.stringify(body.draft || {})}` });
      const text = await callAnalysis({ system, content, maxTokens: 12000 });
      return send(res, 200, await parseOrRepair(text));
    }
    if (body.task === "refresh") {
      const keys = (body.keys || []).filter(k => ["p2", "p3", "side", "hair", "makeup", "makeupGuide", "glasses", "earrings"].includes(k));
      if (!keys.length) return send(res, 200, {});
      if (process.env.MOCK_AI === "1") return send(res, 200, mockRefresh(body, keys));
      const kb = loadKB();
      const system = `${kb.knowledge}\n\n${kb.gold}`;
      const draft = body.draft || {}, part = {};
      keys.forEach(k => { if (draft[k] != null) part[k] = draft[k]; });
      const content = [{ type: "text", text: `고객: ${body.name || "고객"} / 얼굴형: ${body.faceType || "-"}
측정 비율(숫자는 바꾸지 말 것): 종횡비 ${body.ratios?.aspect} / 상:중:하 ${body.ratios?.thirds} / 눈 너비 ${body.ratios?.eyes} / 눈 위치 ${body.ratios?.eyePos} / 코 위치 ${body.ratios?.nosePos} / 입 위치 ${body.ratios?.mouthPos}

상담사가 보고서에서 아래 항목을 직접 선택·수정했다. 이 선택은 확정된 사실이다:
${(body.notes || []).map(n => "- " + n).join("\n")}

[전체 보고서 현재 상태 — 참고용]
${JSON.stringify(draft).slice(0, 14000)}

[다시 쓸 부분]
${JSON.stringify(part)}

지시:
- 위 선택이 반영되도록 [다시 쓸 부분]의 해석·설명 문장을 고쳐 써라. 선택과 어긋나는 문장, 앞뒤가 안 맞는 문장을 바로잡는다.
- 선택된 값(얼굴형, 아이템 이름, shape/color, 스케일 값, 메이크업 부제)은 바꾸지 말고 그것에 맞춰 문장을 쓴다.
- 이미지가 있는 아이템의 prompt(영문 이미지 설명)도 바뀐 선택에 맞게 고친다.
- 비어 있거나 'AI 분석 후 채워집니다' 같은 자리표시 문장은 반드시 이 고객에 맞게 채운다. 얼굴형이 바뀐 경우 p2(라벨·요약·이마/광대/옆턱/턱끝·STYLE KEY)를 새 얼굴형 기준으로 전부 다시 쓴다.
- 그 밖에 선택과 무관한 문장은 그대로 둬도 된다. 같은 키 구조, 배열 길이, 줄바꿈 개수를 유지(고정 지면).
${keys.includes("makeupGuide") ? "- makeupGuide.sections는 위 배열 길이 유지 규칙의 예외다. 현재 초안이 일부만 있어도 반드시 brow, shadow, liner, under, lash, nose, blush, contour, lip, skin 순서로 정확히 10개를 출력하고, 각 항목에 해당 key와 일치하는 title, sub, steps(2~4개)를 넣는다. 기존 부위별 고객 해석은 유지하면서 누락 부위를 채운다." : ""}
- 키는 ${keys.join(", ")} 만 포함. 기준 보고서와 같은 문체.
출력은 JSON 하나만. 주석 금지. 문장 안에는 큰따옴표 대신 작은따옴표 사용.` }];
      const text = await callAnalysis({ system, content, maxTokens: 8000 });
      return send(res, 200, await parseOrRepair(text));
    }
    return send(res, 400, { error: "unknown task" });
  } catch (e) {
    console.error(e);
    return send(res, e.code || 500, { error: e.message || String(e) });
  }
}
