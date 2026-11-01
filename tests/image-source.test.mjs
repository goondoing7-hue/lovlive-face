import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const files = ["lib.js", "engine.js", "image_source.js", "render.js", "accessory_scales.js", "hair_picker.js", "mkguide.js", "ai_image.js", "shell.js", "project_store.js", "ui.js", "project_ui.js"];
const scripts = await Promise.all(files.map(async file => ({ file, source: await readFile(new URL(`../public/js/${file}`, import.meta.url), "utf8") })));
function page() {
  const effects = { notices: [] };
  const context = vm.createContext({
    Blob, URL, Response, console, effects,
    fetch: async () => ({ json: async () => [] }),
    document: { querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} },
    window: { addEventListener() {} }, localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 1, clearTimeout() {},
  });
  for (const { file, source } of scripts) vm.runInContext(source, context, { filename: file });
  const run = code => vm.runInContext(code, context);
  run(`st = newState(); st.photos.frontOrig = 'customer-A'; st.photos.front = 'customer-A';
    renderEditor = () => {}; renderPreview = () => {}; renderNav = () => {}; autosave = () => {};
    toast = message => effects.notices.push(message); _aiConsent = true;`);
  return { context, run, effects };
}

test("legacy images retain compatibility until a source changes, then old selected images and candidates remain tagged", () => {
  const p = page();
  p.run(`st.texts.hair.items[0].img = 'old-hair'; st.texts.hair.items[0].cands = ['old-hair'];
    st.texts.makeup.guideImg = 'old-makeup'; st.texts.makeup.guideCands = [{img:'old-makeup'}];
    st.texts.makeup.fullImage = 'old-poster'; st.texts.makeup.cands = ['old-poster'];`);
  assert.equal(p.run("ImageSource.isCurrentImage(st, 'hair', st.texts.hair.items[0])"), true);
  p.run("ImageSource.stampLegacySources(st); st.photos.frontOrig = 'customer-B';");
  assert.equal(p.run("ImageSource.isCurrentImage(st, 'hair', st.texts.hair.items[0])"), false);
  assert.equal(p.run("ImageSource.isCurrentMakeup(st)"), false);
  assert.equal(p.run("ImageSource.isCurrentPoster(st)"), false);
  assert.equal(p.run("ImageSource.matches(st, 'hair', st.texts.hair.items[0].candSources[0])"), false);
  assert.equal(p.run("ImageSource.matches(st, 'makeup', st.texts.makeup.guideCands[0].sourceKey)"), false);
  assert.equal(p.run("st.texts.hair.items[0].img"), "old-hair");
});

test("source keys inspect the whole image and survive JSON save/load without duplicating original photos", () => {
  const p = page();
  p.context.prefix = "x".repeat(10000);
  const first = p.run("st.photos.frontOrig = prefix + 'A'; ImageSource.sourceKey(st)");
  const second = p.run("st.photos.frontOrig = prefix + 'B'; ImageSource.sourceKey(st)");
  assert.notEqual(first, second);
  assert.ok(first.length < 80);
  p.run("st.texts.hair.items[0].img = 'hair'; ImageSource.stampLegacySources(st); st = JSON.parse(JSON.stringify(st));");
  assert.equal(p.run("ImageSource.isCurrentImage(st, 'hair', st.texts.hair.items[0])"), true);
  assert.equal(p.run("ImageSource.sourceKey(st)"), second);
});

test("front upload stamps old images and replaces the fallback photo before landmark detection finishes", async () => {
  const p = page(); let finish;
  p.context.pendingAnalysis = new Promise(resolve => { finish = resolve; });
  const input = { files: [{}] };
  const frontBox = { querySelector: () => input, style: {} };
  const sideBox = { querySelector: () => ({}), style: {} }, earBox = { querySelector: () => ({}), style: {} };
  const status = { style: {} }, shots = {};
  const lookup = selector => ({ "#upFront": frontBox, "#upSide": sideBox, "#upEar": earBox, "#anaStatus": status, "#shots": shots }[selector] || null);
  p.context.form = { querySelector: lookup, querySelectorAll: () => [] };
  p.context.document.querySelector = lookup;
  p.run(`st.front.pts = [[1,2]]; st.texts.hair.items[0].img = 'old-hair';
    fileToDataURL = async () => 'customer-B'; loadImage = async () => ({width:800,height:1000});
    analyzeFront = () => pendingAnalysis; BlobCache.get = src => src; POST[1](form);`);
  const task = input.onchange();
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  assert.equal(p.run("st.photos.front"), "customer-B");
  assert.equal(p.run("st.front.pts"), null);
  assert.equal(p.run("st.front.w"), 800);
  assert.equal(p.run("ImageSource.isCurrentImage(st, 'hair', st.texts.hair.items[0])"), false);
  finish(true); await task;
});

test("a changed hair style is hidden from the report until explicitly regenerated or selected", () => {
  const p = page();
  p.run("st.texts.hair.items[0].img = 'obsolete-hair'; st.texts.hair.items[0].stale = true; BlobCache.get = src => src;");
  const html = p.run("pageHair(st)");
  assert.doesNotMatch(html, /src="obsolete-hair"/);
  assert.match(html, /현재 사진·스타일로 다시 생성/);
});

test("old customer candidates cannot be selected and deletion cannot silently choose another old candidate", () => {
  const p = page();
  const pick = { dataset: { pick: "hair:0:0" } }, del = { dataset: { candel: "hair:0:1" } };
  p.context.form = { querySelectorAll: selector => selector === "[data-pick]" ? [pick] : selector === "[data-candel]" ? [del] : [] };
  p.run(`st.texts.hair.items[0].img = 'selected'; st.texts.hair.items[0].cands = ['old', 'selected'];
    ImageSource.stampLegacySources(st); st.photos.frontOrig = 'customer-B'; bindAI(form);`);
  pick.onclick();
  assert.equal(p.run("st.texts.hair.items[0].img"), "selected");
  assert.ok(p.effects.notices.some(message => message.includes("이전 고객 사진")));
  del.onclick();
  assert.equal(p.run("st.texts.hair.items[0].img"), null);
  assert.equal(p.run("st.texts.hair.items[0].cands.length"), 1);
  assert.equal(p.run("st.texts.hair.items[0].candSources.length"), 1);
});

test("a hair result finishing after the original changes is retained only as an old-source candidate", async () => {
  const p = page(); let finish;
  p.context.pending = new Promise(resolve => { finish = resolve; });
  p.run("generateAIImage = () => pending; shrinkDataURL = async image => image;");
  const task = p.run("runAI('hair', 0, null, 'draft')");
  p.run("ImageSource.stampLegacySources(st); st.photos.frontOrig = 'customer-B';");
  finish({ image: "old-source-result", quality: "low" }); await task;
  assert.notEqual(p.run("st.texts.hair.items[0].img"), "old-source-result");
  assert.equal(p.run("st.texts.hair.items[0].cands.at(-1)"), "old-source-result");
  assert.equal(p.run("ImageSource.matches(st, 'hair', st.texts.hair.items[0].candSources.at(-1))"), false);
});

test("makeup results cannot replace the current image after source or selected design changes during generation", async () => {
  for (const change of ["source", "design"]) {
    const p = page(); let finish;
    p.context.pending = new Promise(resolve => { finish = resolve; });
    p.context.button = { disabled: false, textContent: "생성" };
    p.run(`st.texts.makeup.guideImg = 'current-makeup'; generateAIImage = () => pending;
      shrinkDataURL = async image => image; detectLandmarks = async () => ({w:100,h:100,pts:[[1,2]]});`);
    const task = p.run("runMakeupGuide(button, 'draft')");
    if (change === "source") p.run("ImageSource.stampLegacySources(st); st.photos.frontOrig = 'customer-B';");
    else p.run("st.texts.makeup.head = '새로운 메이크업 방향';");
    finish({ image: "older-makeup-result", quality: "low" }); await task;
    assert.equal(p.run("st.texts.makeup.guideImg"), "current-makeup");
    assert.equal(p.run("st.texts.makeup.guideCands.at(-1).img"), "older-makeup-result");
    if (change === "source") assert.equal(p.run("ImageSource.matches(st, 'makeup', st.texts.makeup.guideCands.at(-1).sourceKey)"), false);
  }
});

test("old-source makeup candidates and posters cannot be reselected", () => {
  const p = page();
  const guidePick = { dataset: { mkgpick: "0" } }, posterPick = { dataset: { mkpick: "0" } };
  p.context.form = { querySelector: () => null, querySelectorAll: selector => selector === "[data-mkgpick]" ? [guidePick] : selector === "[data-mkpick]" ? [posterPick] : [] };
  p.run(`st.texts.makeup.guideCands = [{img:'old-guide'}]; st.texts.makeup.cands = ['old-poster'];
    ImageSource.stampLegacySources(st); st.photos.frontOrig = 'customer-B'; POST[6](form);`);
  guidePick.onclick(); posterPick.onclick();
  assert.notEqual(p.run("st.texts.makeup.guideImg"), "old-guide");
  assert.notEqual(p.run("st.texts.makeup.fullImage"), "old-poster");
  assert.equal(p.effects.notices.filter(message => message.includes("이전 고객 사진")).length, 2);
});

test("an old generated makeup photo is excluded from every guide crop after the customer source changes", () => {
  const p = page();
  p.run(`st.front.pts = [[1,2]]; st.texts.makeup.guideImg = 'old-guide';
    st.texts.makeup.guideLm = {w:100,h:100,pts:[[3,4]]}; ImageSource.stampLegacySources(st);
    st.photos.frontOrig = 'customer-B'; st.photos.front = 'customer-B';`);
  assert.equal(p.run("guideSource(st).src"), "customer-B");
  assert.equal(p.run("guideSource(st).gpt"), false);
});

test("a poster finishing for a replaced photo remains an old-source candidate instead of becoming current", async () => {
  const p = page(); let finish;
  p.context.pending = new Promise(resolve => { finish = resolve; });
  const button = { disabled: false, textContent: "생성" };
  p.context.form = { querySelector: selector => selector === "#mkGen" ? button : null, querySelectorAll: () => [] };
  p.run("st.texts.makeup.fullImage = 'current-poster'; generateAIImage = () => pending; shrinkDataURL = async image => image; POST[6](form);");
  const task = button.onclick();
  p.run("ImageSource.stampLegacySources(st); st.photos.frontOrig = 'customer-B';");
  finish({ image: "older-poster-result", quality: "medium" }); await task;
  assert.equal(p.run("st.texts.makeup.fullImage"), "current-poster");
  assert.equal(p.run("st.texts.makeup.cands.at(-1)"), "older-poster-result");
  assert.equal(p.run("ImageSource.matches(st, 'makeup', st.texts.makeup.candSources.at(-1))"), false);
});
