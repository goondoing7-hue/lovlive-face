/* MOCK_AI=1 일 때 쓰는 예시 응답 (API 키 없이 화면·출력 점검용) */
export function mockRatios() {
  return { thirds: "1:1.3:0.9", aspect: "1:1.46", eyePos: "1:0.9", eyeDist: "1:1.5:1.0", nosePos: "1:0.7", mouthPos: "1:1.4",
    grades: { thirds: "B", aspect: "S", eyePos: "S", eyeDist: "B", nosePos: "C", mouthPos: "C" } };
}
export function mockReport(body) {
  const d = JSON.parse(JSON.stringify(body.draft || {}));
  d.p2 = { ...d.p2, chip1: "LONG HEART SHAPE : 긴 하트형", desc1: "광대와 옆턱의 윤곽이 은은하게 드러납니다.\n각진 골격과 곡선적인 윤곽이 자연스럽게 조화를 이룹니다.",
    details: [{ part: "이마", text: "상대적으로 폭이 있고 완만한 곡선을 이루며,\n얼굴 상부에 안정적인 볼륨감을 형성합니다." }, { part: "광대", text: "광대 윤곽이 은은하게 드러나며,\n광대 아래쪽으로 자연스러운 굴곡이 나타납니다." },
      { part: "옆턱", text: "각진 골격이 강하게 드러나지 않고,\n광대 아래부터 턱끝까지 부드럽게 좁아집니다." }, { part: "턱끝", text: "비교적 좁고 둥글게 마무리되어\n긴 얼굴형에 부드러운 인상을 더합니다." }],
    keyTitle: "세로감이 있는 긴 하트형 + 간결한 하안부", keyText: "(예시 응답) 전체적인 얼굴 길이는 조금 긴 편이지만 상·중안부는 균형적이고 하안부가 짧게 구성되어 있습니다.\n상부의 폭과 광대의 자연스러운 입체감을 살리면서, 얼굴의 세로감을 부드럽게 분산하는 스타일링을 추천합니다." };
  if (d.side) d.side.axes = [
    { title: "이마 · 눈썹뼈 : 완만한 이마 곡선 + 부드러운 눈썹뼈", text: "이마가 자연스럽게 둥근 곡선을 이루며,\n눈썹뼈의 돌출감이 강하지 않아 부드럽게 이어집니다." },
    { title: "콧대 · 코끝 : 자연스러운 콧대 + 갸름한 코끝", text: "콧대가 완만한 굴곡을 이루며,\n코끝은 적당한 돌출감을 보입니다." },
    { title: "입술 : E-line에 가깝거나 살짝 앞쪽에 위치한 입술", text: "입술이 코끝과 턱끝을 잇는 기준선에 가까우며,\n약간 앞으로 나온 형태로 보입니다." },
    { title: "턱끝 · 턱선 : 짧은 하안부 + 부드러운 턱끝", text: "입술 아래부터 턱끝까지의 구간이 비교적 짧으며,\n턱선은 완만하게 이어집니다." }];
  if (d.hair) { d.hair.keywords = "자연스러운 옆 볼륨 + 부드러운 컬감 + 하안부 균형"; d.hair.avoid = "정수리만 과하게 높이는 볼륨\n광대 옆에만 집중되는 풍성한 컬\n얼굴의 세로감을 강조하는 긴 일자 생머리\n턱선에서 무겁게 끊기는 일자 칼단발\n옆 볼륨 없이 뒤로 바짝 붙이는 올백 스타일"; d.hair.basic = "롱 레이어드 S컬";
    d.hair.items = [{ name: "롱 히피펌", desc: "풍성한 웨이브가 얼굴의 세로감을 분산하고, 이마와 광대 주변을 부드럽게 감싸 자연스럽고 개성 있는 분위기를 연출합니다.", prompt: "long voluminous hippie perm waves", ref: "h68" },
      { name: "미디엄 레이어드 C·S컬", desc: "쇄골 부근의 기장에 가벼운 레이어드와 C·S컬을 더해 광대에서 턱선까지 부드럽게 연결하고 균형 잡힌 인상을 만듭니다.", prompt: "collarbone-length layered cut with C and S curls", ref: "h32" },
      { name: "소프트 보브 C·S컬", desc: "턱선 아래 기장에 안팎으로 흐르는 C·S컬을 더해 짧은 하안부에 자연스러운 볼륨을 보완하고 세련된 분위기를 연출합니다.", prompt: "soft bob just below the jaw with in-and-out C-S curls", ref: "h27" }]; }
  d.faceTypeKey = "heart";
  d.sidePoints = { noseTip: [0.40, 0.56], lip: [0.43, 0.62], chin: [0.47, 0.69], ear: [0.66, 0.57] };
  d.makeupGuide = { intro: "지금의 얼굴 특징을 살려 미간과 중안부의 균형을 조절하고,\n도도하고 세련된 분위기를 강화하는 메이크업 방법입니다.", core: ["아웃라인 쌍꺼풀과 시크한 눈매를 살리는 정교한 아이메이크업", "중안부의 시선을 분산하는 언더 음영과 앞광대 블러셔", "본래의 입체감을 살리는 자연스러운 코 쉐이딩과 윤곽 정리", "과하지 않은 표현으로 세련되고 균형 있는 얼굴 연출"],
    overall: "가로로 긴 아웃라인 쌍꺼풀과 살짝 상승한 눈꼬리로 도도하고 시크한 분위기가 느껴집니다.",
    sections: ["눈썹 메이크업", "아이섀도우", "아이라인", "언더 메이크업", "속눈썹 메이크업", "코 메이크업", "블러셔", "윤곽 셰이딩", "립 메이크업", "피부 표현"].map(t => ({ title: t, sub: "(예시) " + t + " 부제", steps: ["단계 1", "단계 2", "단계 3"] })) };
  return d;
}
export function mockRefresh(body, keys) {
  const d = JSON.parse(JSON.stringify(body.draft || {})), out = {};
  const tag = "(반영) ";
  keys.forEach(k => { if (d[k] == null) return; out[k] = d[k]; });
  if (out.p2) out.p2.keyText = tag + (body.notes || []).join(" / ") + "\n" + String(out.p2.keyText || "").split("\n").slice(-1)[0];
  if (out.p3) out.p3.text = tag + (out.p3.text || "");
  if (out.side) out.side.text = tag + (body.notes || [])[0];
  ["hair", "glasses", "earrings"].forEach(k => { if (out[k]?.items) out[k].items.forEach(it => { if (typeof it.desc === "string" && !it.desc.startsWith(tag)) it.desc = tag + it.desc; }); });
  return out;
}
