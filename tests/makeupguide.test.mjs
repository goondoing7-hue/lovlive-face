import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const files = ["lib.js", "engine.js", "render.js", "mkguide.js", "ui.js"];
const source = await Promise.all(files.map(async file => ({ file, code: await readFile(new URL(`../public/js/${file}`, import.meta.url), "utf8") })));
const keys = ["brow", "shadow", "liner", "under", "lash", "nose", "blush", "contour", "lip", "skin"];
const plain = value => JSON.parse(JSON.stringify(value));

function page() {
  const context = vm.createContext({
    window: { addEventListener() {} }, document: { addEventListener() {} }, boot() {},
    localStorage: { getItem: () => null },
  });
  for (const script of source) vm.runInContext(script.code, context, { filename: script.file });
  vm.runInContext("st = newState();", context);
  return { context, run: code => vm.runInContext(code, context), sections() { return plain(vm.runInContext("guideSections(st)", context)); } };
}

test("the normal seven-part template expands into all ten guide areas using its actual text", () => {
  const p = page();
  const normal = plain(p.run("st.texts.makeup.sections"));
  const sections = p.sections();
  assert.deepEqual(sections.map(section => section.key), keys);
  for (const key of ["brow", "nose", "blush", "contour", "lip", "skin"]) {
    assert.equal(sections.find(section => section.key === key).sub, normal[key].sub);
    const plan = sections.find(section => section.key === key).steps;
    assert.deepEqual(key === "skin" ? plan.slice(0, normal[key].steps.length) : plan, normal[key].steps);
  }
  assert.ok(sections.every(section => section.steps.length > 0));
  assert.ok(sections.find(section => section.key === "liner").steps.some(step => /속눈썹\s*사이|아이라인/.test(step)));
  assert.ok(sections.find(section => section.key === "under").steps.some(step => /언더|애교/.test(step)));
  assert.ok(sections.find(section => section.key === "lash").steps.every(step => !/속눈썹\s*사이|아이라인/.test(step)));
});

test("a two-section AI guide keeps both customer plans and fills all eight missing areas", () => {
  const p = page();
  p.run(`
    st.texts.makeup.sections.nose.sub = '원래 고객의 코 전략';
    st.texts.makeup.sections.nose.steps = ['고객의 코에 맞춘 기존 방법'];
    st.texts.makeupGuide = {sections:[
      {title:'눈썹 메이크업', sub:'고객 눈썹 전략', steps:['눈썹 앞머리: 결을 살립니다.']},
      {title:'아이섀도우', sub:'고객 섀도우 전략', steps:['음영: 얇게 표현합니다.']}
    ]};
  `);
  const before = p.run("JSON.stringify(st.texts.makeupGuide)");
  const sections = p.sections();
  assert.equal(sections.length, 10);
  assert.equal(sections[0].sub, "고객 눈썹 전략");
  assert.deepEqual(sections[0].steps, ["눈썹 앞머리: 결을 살립니다."]);
  assert.equal(sections[1].sub, "고객 섀도우 전략");
  assert.equal(sections[5].sub, "원래 고객의 코 전략");
  assert.deepEqual(sections[5].steps, ["고객의 코에 맞춘 기존 방법"]);
  assert.equal(p.run("JSON.stringify(st.texts.makeupGuide)"), before, "rendering does not overwrite the stored AI response");
  const markup = p.run("pageMakeupGuide(st)");
  assert.equal((markup.match(/class="gsec /g) || []).length, 10);
  assert.match(markup, /<span class="gbadge">10<\/span>/);
  assert.match(markup, /피부 표현/);
});

test("reordered and explicitly keyed AI entries remain attached to their correct crops", () => {
  const p = page();
  p.run(`st.texts.makeupGuide = {sections:[
    {title:'립 메이크업', sub:'입술 전용 설명', steps:['입술 원문']},
    {key:'skin', title:'피부 표현', sub:'피부 전용 설명', steps:['피부 원문']},
    {key:'brow', title:'눈썹 메이크업', steps:['눈썹 원문']},
    {key:'shadow', steps:['섀도우 원문']},
    {key:'under_eye', title:'언더 메이크업', steps:['언더 원문']}
  ]};`);
  const sections = p.sections();
  assert.deepEqual(sections.map(section => section.key), keys);
  assert.deepEqual(sections[8].steps, ["입술 원문"]);
  assert.deepEqual(sections[9].steps.slice(0, 1), ["피부 원문"]);
  assert.equal(sections[9].steps.length, 3);
  assert.deepEqual(sections[0].steps, ["눈썹 원문"]);
  assert.deepEqual(sections[1].steps, ["섀도우 원문"]);
  assert.deepEqual(sections[3].steps, ["언더 원문"]);
});

test("all three skin crops receive a caption when the old template has only one step", () => {
  const p = page();
  p.run(`st.texts.makeup.sections.skin.steps=['고객 피부 결 정리']; st.texts.makeup.sections.skin.points=['중복 기본 표현','이마·콧대의 은은한 광감','입 주변을 가볍게 정리'];`);
  assert.deepEqual(p.sections()[9].steps, ['고객 피부 결 정리','이마·콧대의 은은한 광감','입 주변을 가볍게 정리']);
  const markup = p.run('pageMakeupGuide(st)');
  for (const caption of ['고객 피부 결 정리','이마·콧대의 은은한 광감','입 주변을 가볍게 정리']) assert.ok(markup.includes(caption));
});

test("unknown or conflicting labels cannot be assigned to another body area by array position", () => {
  const p = page();
  const original = p.sections();
  p.run(`st.texts.makeupGuide = {sections:[
    {title:'특별 보정', sub:'잘못된 부위', steps:['어느 부위인지 모르는 문장']},
    {key:'lip', title:'눈썹 메이크업', steps:['키와 제목이 충돌하는 문장']},
    {title:'헤어라인', steps:['메이크업 10개 부위와 무관한 문장']}
  ]};`);
  assert.deepEqual(p.sections(), original);
  assert.equal(p.run("gKeyFor('알 수 없는 제목', 0)"), null);
  assert.equal(p.run("gKeyFor('속눈썹 메이크업')"), "lash");
  assert.equal(p.run("gKeyFor('코 쉐딩')"), "nose");
  assert.equal(p.run("gKeyFor('코랄 립 메이크업')"), "lip");
  assert.equal(p.run("gKeyFor('언더 아이라인')"), "under");
});

test("empty or sparse guide responses still produce ten nonempty sections", () => {
  const p = page();
  for (const value of [null, {}, { sections: [] }, { sections: [null, {}, { title: "아이섀도우", steps: [] }] }]) {
    p.context.guide = value;
    p.run("st.texts.makeupGuide = guide");
    assert.equal(p.sections().length, 10);
    assert.ok(p.sections().every(section => section.title && section.steps.length));
  }
  p.run("st.texts.makeup.sections = {}; st.texts.makeupGuide = {sections:[]};");
  assert.equal(p.sections().length, 10);
  assert.ok(p.sections().every(section => section.steps.length >= 2));
});

test("duplicate entries choose the first usable plan and keyed objects normalize deterministically", () => {
  const p = page();
  p.run(`st.texts.makeupGuide = {sections:[
    {title:'눈썹 메이크업', steps:[]},
    {title:'눈썹 메이크업', sub:'완성된 계획', steps:['완성된 첫 계획']},
    {title:'눈썹 메이크업', steps:['같은 부위의 다른 계획']}
  ]};`);
  assert.deepEqual(p.sections()[0].steps, ["완성된 첫 계획"]);
  p.run(`st.texts.makeupGuide = {sections:{lip:{title:'립 메이크업',steps:['입술 계획']}, liner:{steps:['아이라인 계획']}}};`);
  assert.deepEqual(p.sections()[8].steps, ["입술 계획"]);
  assert.deepEqual(p.sections()[2].steps, ["아이라인 계획"]);
});

test("generated makeup images require current-source confirmation and otherwise preserve the original fallback", () => {
  const p = page();
  p.run(`st.photos.front = 'current-original'; st.front.pts = [[1,2]]; st.texts.makeup.guideImg = 'older-generated'; st.texts.makeup.guideLm = {w:20,h:30,pts:[[3,4]]};`);
  assert.equal(p.run("guideSource(st).src"), "current-original");
  p.context.ImageSource = { isCurrentMakeup: () => false };
  assert.equal(p.run("guideSource(st).src"), "current-original");
  p.context.ImageSource = { isCurrentMakeup: () => true };
  assert.equal(p.run("guideSource(st).src"), "older-generated");
  assert.equal(p.run("st.texts.makeup.guideImg"), "older-generated", "history remains available");
});
