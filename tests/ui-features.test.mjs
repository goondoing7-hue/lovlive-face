import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const library = JSON.parse(await readFile(new URL("../public/hair/library.json", import.meta.url), "utf8"));
const files = ["lib.js", "engine.js", "image_source.js", "render.js", "accessory_scales.js", "hair_picker.js", "mkguide.js", "ai_image.js", "shell.js", "project_store.js", "ui.js", "project_ui.js"];
const scripts = await Promise.all(files.map(async file => ({ file, source: await readFile(new URL(`../public/js/${file}`, import.meta.url), "utf8") })));
const plain = value => JSON.parse(JSON.stringify(value));
const fixtureImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=";

function page() {
  const elements = new Map();
  const events = new Map();
  const effects = { editor: 0, preview: 0, notices: [] };
  let timerId = 0;
  const context = vm.createContext({
    Blob, URL, Response, console, fixtureLibrary: library, effects,
    fetch: async () => ({ json: async () => library }),
    document: { querySelector: selector => elements.get(selector) || null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, activeElement: null },
    window: { addEventListener: (name, handler) => events.set(name, handler) },
    localStorage: { getItem: () => null, setItem() {} },
    sessionStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => ++timerId, clearTimeout() {},
  });
  for (const { file, source } of scripts) vm.runInContext(source, context, { filename: file });
  vm.runInContext(`
    st = newState(); st.analyzed = true; CFG.devNoAuth = true; HAIR_LIB = fixtureLibrary;
    renderEditor = () => { effects.editor++; };
    renderPreview = () => { effects.preview++; };
    renderNav = () => {};
    toast = message => { effects.notices.push(message); };
  `, context);
  return { context, elements, effects, run: source => vm.runInContext(source, context) };
}

function field(path, { tagName = "INPUT", type = "text", value = "", options = [] } = {}) {
  const handlers = new Map();
  return {
    dataset: { path }, tagName, type, value, options, selectedIndex: 0,
    classList: { add() {} },
    addEventListener(name, handler) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(handler); },
    dispatch(name) { for (const handler of handlers.get(name) || []) handler({ target: this }); },
  };
}

test("photo selection updates the real report item and survives AI text refresh without replacing customer images", () => {
  const p = page();
  p.run(`st.texts.hair.items[0].img = 'existing-customer-hair'; st.texts.hair.items[0].cands = ['existing-customer-hair']; selectHairPhoto(0, 'h02');`);
  const photo = library.find(value => value.id === "h02");
  let item = plain(p.run("st.texts.hair.items[0]"));
  assert.equal(item.name, photo.name);
  assert.equal(item.ref, photo.id);
  assert.equal(item.photoChoice, photo.id);
  assert.match(item.prompt, /미디엄 레이어드 빌드펌/);
  assert.equal(item.img, "existing-customer-hair");
  assert.deepEqual(item.cands, ["existing-customer-hair"]);
  assert.equal(item.stale, true);
  assert.ok(p.effects.editor > 0 && p.effects.preview > 0);
  p.run(`applyRefresh({hair:{items:[{name:'AI가 바꾼 다른 이름', ref:'h03', prompt:'다른 참고 사진 설명', desc:'고객 얼굴형에 맞춰 보완한 설명'}]}}, ['hair']);`);
  item = plain(p.run("st.texts.hair.items[0]"));
  assert.equal(item.name, photo.name);
  assert.equal(item.ref, photo.id);
  assert.match(item.prompt, /미디엄 레이어드 빌드펌/);
  assert.equal(item.desc, "고객 얼굴형에 맞춰 보완한 설명");
  assert.equal(item.img, "existing-customer-hair");
});

test("real field handlers preserve manual scales and text when accessory type and AI descriptions change", () => {
  const p = page();
  p.run(`st.texts.earrings.items[0].img = 'existing-earring';`);
  const scale = field("texts.earrings.scales.2", { type: "range", value: "4" });
  const text = field("texts.earrings.scaleText.2", { value: "직접 작성한 길이 설명" });
  const shape = field("texts.earrings.items.0.shape", { tagName: "SELECT", type: "select-one", value: "huggie", options: [{ text: "미니 후프" }] });
  p.context.form = { querySelectorAll: selector => selector === "[data-path]" ? [scale, text, shape] : [] };
  p.run("bindFields(form)");
  scale.dispatch("change"); text.dispatch("input"); shape.dispatch("change");
  p.run(`applyRefresh({earrings:{items:[{shape:'drop',color:'silver',desc:'AI 설명'}],scales:[0,0,0,0,0,0],scaleText:['AI0','AI1','AI2','AI3','AI4','AI5']}}, ['earrings']);`);
  const section = plain(p.run("st.texts.earrings"));
  assert.equal(section.scales[2], 4);
  assert.equal(section.scaleText[2], "직접 작성한 길이 설명");
  assert.equal(section.items[0].shape, "huggie");
  assert.equal(section.items[0].stale, true);
  assert.equal(section.manualScales[2], true);
  assert.equal(section.manualScaleText[2], true);
  assert.match(section.scaleText[0], /미니 후프/);
});

test("recommended accessory dropdown keeps the explicitly selected shape, color and size through AI refresh", () => {
  const p = page();
  const choice = { dataset: { accpick: "glasses:0" }, value: "1" };
  p.context.form = { querySelectorAll: selector => selector === "[data-accpick]" ? [choice] : [] };
  p.run(`st.texts.glasses.items[0].color = 'black'; st.texts.glasses.items[0].size = 1.4; postAcc(form, 'glasses');`);
  choice.onchange();
  const selected = p.run("FACE_TYPES[st.type.key].glasses.items[1].shape");
  p.run(`applyRefresh({glasses:{items:[{shape:'rimless',color:'clear',desc:'AI 설명'}]}}, ['glasses']);`);
  const item = plain(p.run("st.texts.glasses.items[0]"));
  assert.equal(item.shape, selected);
  assert.equal(item.color, "black");
  assert.equal(item.size, 1.4);
  assert.ok(p.run("st.texts.glasses.scaleAuto"));
});

test("sequential shape, color and size edits preserve all three explicit choices after AI refresh", () => {
  const p = page();
  const shape = field("texts.glasses.items.0.shape", { tagName: "SELECT", type: "select-one", value: "softSquare", options: [{ text: "소프트 스퀘어" }] });
  const color = field("texts.glasses.items.0.color", { tagName: "SELECT", type: "select-one", value: "black", options: [{ text: "블랙" }] });
  const size = field("texts.glasses.items.0.size", { type: "range", value: "1.4" });
  p.context.form = { querySelectorAll: selector => selector === "[data-path]" ? [shape, color, size] : [] };
  p.run("bindFields(form)");
  shape.dispatch("change"); color.dispatch("change"); size.dispatch("change");
  p.run(`applyRefresh({glasses:{items:[{shape:'rimless',color:'clear',name:'AI 이름',desc:'선택에 맞춘 설명'}]}}, ['glasses']);`);
  const item = plain(p.run("st.texts.glasses.items[0]"));
  assert.equal(item.shape, "softSquare");
  assert.equal(item.color, "black");
  assert.equal(item.size, 1.4);
  assert.equal(item.desc, "선택에 맞춘 설명", "descriptions remain available for AI adaptation");
});

test("typing scale explanations before moving all six sliders preserves every manual explanation", () => {
  const p = page();
  const texts = Array.from({ length: 6 }, (_, i) => field(`texts.earrings.scaleText.${i}`, { value: `직접 쓴 기준 ${i + 1}` }));
  const sliders = Array.from({ length: 6 }, (_, i) => field(`texts.earrings.scales.${i}`, { type: "range", value: String(i % 5) }));
  p.context.form = { querySelectorAll: selector => selector === "[data-path]" ? [...texts, ...sliders] : [] };
  p.run("bindFields(form)");
  texts.forEach(input => input.dispatch("input"));
  sliders.forEach(input => input.dispatch("change"));
  p.run(`applyRefresh({earrings:{scales:[4,4,4,4,4,4],scaleText:['AI0','AI1','AI2','AI3','AI4','AI5']}}, ['earrings']);`);
  const section = plain(p.run("st.texts.earrings"));
  assert.deepEqual(section.scales, [0, 1, 2, 3, 4, 0]);
  assert.deepEqual(section.scaleText, Array.from({ length: 6 }, (_, i) => `직접 쓴 기준 ${i + 1}`));
});

test("the actual GPT image prompt carries chosen accessory color, size and scale guidance", () => {
  const p = page();
  p.run(`st.texts.glasses.items[0].shape = 'wellington'; st.texts.glasses.items[0].color = 'black'; st.texts.glasses.items[0].size = 1.4; syncAccessoryScales('glasses');`);
  const prompt = p.run("imgPromptFor('glasses', st, st.texts.glasses.items[0])");
  assert.match(prompt, /Selected accessory color: black/);
  assert.match(prompt, /Relative size for this item: 1\.4x/);
  assert.match(prompt, /frame thickness: \d\/4/);
  assert.match(prompt, /선택 기준/);
});

test("AI request tracking blocks switching projects and always clears after a failed request", async () => {
  const p = page();
  let rejectFetch;
  p.context.fetch = () => new Promise((resolve, reject) => { rejectFetch = reject; });
  const pending = p.run("apiPost('/api/image', {})");
  assert.equal(p.run("activeAIRequests"), 1);
  assert.equal(await p.run("DraftUI.beforeSwitch()"), false);
  rejectFetch(new Error("network unavailable"));
  await assert.rejects(pending, /network unavailable/);
  assert.equal(p.run("activeAIRequests"), 0);
  p.context.fetch = async () => ({ ok: false, status: 403, json: async () => ({ error: "not allowed" }) });
  await assert.rejects(p.run("apiPost('/api/analyze', {})"), error => error.status === 403);
  assert.equal(p.run("activeAIRequests"), 0);
});

test("a hair image job stays busy through deferred image decoding after its API response", async () => {
  const p = page();
  let finishDecode;
  p.context.pendingDecode = new Promise(resolve => { finishDecode = resolve; });
  p.run(`_aiConsent = true; generateAIImage = async () => ({ image:'api-image', quality:'low' }); shrinkDataURL = () => pendingDecode;`);
  const task = p.run("runAI('hair', 0, null, 'draft')");
  await Promise.resolve();
  assert.ok(p.run("activeAIRequests") > 0, "image decoding remains part of the active job");
  assert.equal(await p.run("DraftUI.beforeSwitch()"), false);
  finishDecode("decoded-hair");
  await task;
  assert.equal(p.run("activeAIRequests"), 0);
  assert.equal(p.run("st.texts.hair.items[0].img"), "decoded-hair");
});

test("an older image result stays a candidate when its style or chosen image changes during generation", async () => {
  for (const change of ["photo", "candidate"]) {
    const p = page();
    let finishDecode;
    p.context.pendingDecode = new Promise(resolve => { finishDecode = resolve; });
    const pick = { dataset: { pick: "hair:0:0" } };
    p.context.imageForm = { querySelectorAll: selector => selector === "[data-pick]" ? [pick] : [] };
    p.run(`
      _aiConsent = true; selectHairPhoto(0, 'h01');
      st.texts.hair.items[0].img = 'current-hair';
      st.texts.hair.items[0].cands = ['previous-candidate'];
      st.texts.hair.items[0].candQ = ['medium'];
      generateAIImage = async () => ({ image:'api-image', quality:'low' }); shrinkDataURL = () => pendingDecode;
      bindAI(imageForm);
    `);
    const task = p.run("runAI('hair', 0, null, 'draft')");
    await Promise.resolve();
    if (change === "photo") p.run("selectHairPhoto(0, 'h02')");
    else pick.onclick();
    finishDecode("older-generated-result");
    await task;
    const item = plain(p.run("st.texts.hair.items[0]"));
    assert.equal(item.img, change === "photo" ? "current-hair" : "previous-candidate");
    assert.equal(item.cands.at(-1), "older-generated-result");
    assert.equal(item.candQ.at(-1), "low");
    assert.equal(item.stale, true);
    assert.ok(p.effects.notices.some(message => message.includes("후보에 보관")));
    if (change === "photo") assert.equal(item.ref, "h02");
  }
});

test("a delayed makeup poster cannot be written into a subsequently selected customer", async () => {
  const p = page();
  let finishDecode;
  p.context.pendingDecode = new Promise(resolve => { finishDecode = resolve; });
  const generate = { disabled: false, textContent: "생성" };
  p.context.makeupForm = { querySelector: selector => selector === "#mkGen" ? generate : null, querySelectorAll: () => [] };
  p.run(`_aiConsent = true; const originalProject = st; generateAIImage = async () => ({image:'api-image'}); shrinkDataURL = () => pendingDecode; POST[6](makeupForm);`);
  const task = generate.onclick();
  await Promise.resolve();
  assert.ok(p.run("activeAIRequests") > 0);
  assert.equal(await p.run("DraftUI.beforeSwitch()"), false);
  // The original-target reference is a second line of protection if another loader ever changes state.
  p.run(`st = newState(); st.client.name = '다른 고객';`);
  finishDecode("decoded-original-poster");
  await task;
  assert.notEqual(p.run("st.texts.makeup.fullImage"), "decoded-original-poster");
  assert.equal(p.run("activeAIRequests"), 0);
});

test("legacy Drive loading observes project-switch guards and detaches copied shared-project links", async () => {
  const p = page();
  const open = { dataset: { df: "drive-project" } };
  const ids = ["#doPrint", "#doSave", "#dSave", "#doPdf", "#dList", "#dl"];
  for (const id of ids) p.elements.set(id, { innerHTML: "" });
  p.context.document.querySelectorAll = selector => selector === "[data-df]" ? [open] : [];
  p.run(`
    let driveLoads = 0;
    busy = () => {};
    driveFolders = async () => [{id:'drive-project',name:'드라이브 작업',modifiedTime:'2026-11-01T00:00:00Z'}];
    driveProject = async () => { driveLoads++; const copy = newState(); copy.client.name = '드라이브 작업'; copy.projectLink = {id:'11111111-1111-4111-8111-111111111111',version:3}; return copy; };
    goStep = value => { st.step = value; };
    st.client.name = '현재 작업'; DraftUI.loaded({clean:true}); POST[9]({});
  `);
  await p.elements.get("#dList").onclick();
  p.run("activeAIRequests = 1");
  await open.onclick();
  assert.equal(p.run("driveLoads"), 0, "Drive import cannot bypass an active AI job");
  assert.equal(p.run("st.client.name"), "현재 작업");
  p.run(`activeAIRequests = 0; _rq.scopes.add('hair'); _rq.notes.push('old-project edit');`);
  await open.onclick();
  assert.equal(p.run("driveLoads"), 1);
  assert.equal(p.run("st.client.name"), "드라이브 작업");
  assert.equal(p.run("st.projectLink"), undefined, "a Drive copy must save as a new shared project");
  assert.equal(p.run("_rq.notes.length"), 0);
  assert.equal(p.run("_rq.scopes.size"), 0);
});

test("shared snapshot round-trip retains actual photo selections, generated images and manual scale overrides", async () => {
  const p = page();
  p.context.fixtureImage = fixtureImage;
  p.run(`
    selectHairPhoto(0, 'h02'); st.client.name = '통합 검증 고객'; st.step = 7;
    st.photos.front = fixtureImage;
    st.texts.hair.items[0].img = fixtureImage;
    st.texts.hair.items[0].cands = [fixtureImage];
    st.texts.earrings.scales[2] = 4; st.texts.earrings.scaleText[2] = '직접 작성한 길이';
    AccessoryScales.markManual(st.texts.earrings, 2); AccessoryScales.markManual(st.texts.earrings, 2, 'text');
    st.settings.api.key = 'test-credential';
  `);
  const id = "11111111-1111-4111-8111-111111111111", snapshotId = "22222222-2222-4222-8222-222222222222";
  const project = { id, name: "통합 검증 고객", clientDate: p.run("st.client.date"), step: 7, version: 1, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T00:00:00Z", updatedBy: "test@example.com" };
  let uploaded;
  p.context.storageOptions = {
    apiPost: async (url, body) => {
      assert.equal(url, "/api/projects");
      if (body.action === "prepare") return { id, snapshotId, uploadUrl: "https://test.supabase.co/upload" };
      if (body.action === "complete") return { project };
      if (body.action === "load") return { project, downloadUrl: "https://test.supabase.co/download" };
      throw new Error("unexpected action");
    },
    fetch: async (url, options) => {
      if (options.method === "PUT") { uploaded = await options.body.text(); return { ok: true }; }
      return new Response(uploaded, { status: 200, headers: { "content-type": "application/json" } });
    },
  };
  p.run("ProjectStore.configure(storageOptions)");
  await p.run("ProjectStore.save(st)");
  p.context.projectId = id;
  await p.run("ProjectStore.get(projectId).then(result => { st = deepMerge(newState(), result.state); })");
  const restored = plain(p.run("st"));
  assert.equal(restored.step, 7);
  assert.equal(restored.photos.front, fixtureImage);
  assert.equal(restored.texts.hair.items[0].ref, "h02");
  assert.equal(restored.texts.hair.items[0].name, library.find(photo => photo.id === "h02").name);
  assert.equal(restored.texts.hair.items[0].img, fixtureImage);
  assert.deepEqual(restored.texts.hair.items[0].cands, [fixtureImage]);
  assert.equal(restored.texts.earrings.manualScales[2], true);
  assert.equal(restored.texts.earrings.manualScaleText[2], true);
  assert.equal(restored.texts.earrings.scales[2], 4);
  assert.equal(restored.texts.earrings.scaleText[2], "직접 작성한 길이");
  assert.equal(restored.settings.api.key, "");
});
