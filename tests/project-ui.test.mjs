import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/js/project_ui.js", import.meta.url), "utf8");
const ID = "12345678-1234-4234-8234-123456789abc";
const OTHER_ID = "87654321-1234-4234-8234-123456789abc";
const metadata = (id = ID, version = 1) => ({ id, version, name: "고객 A", step: 5, updatedAt: "2026-11-01T13:00:00Z" });
const currentState = (link = null) => ({
  version: 1, step: 5, client: { name: "고객 A", date: "2026-11-01", memo: "상담 메모" },
  photos: { front: "data:image/jpeg;base64,front" }, texts: { hair: { items: [] } }, settings: {},
  ...(link ? { projectLink: link } : {}),
});
const savedLink = () => ({ id: ID, version: 1, savedAt: "2026-11-01T13:00:00Z", localChanges: false });
function harness({ state = currentState(savedLink()), backend } = {}) {
  const nodes = new Map();
  for (const id of ["#draftStatus", "#tbDraftSave", "#tbDraftLibrary"]) nodes.set(id, { textContent: "", dataset: {}, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } });
  const notices = [], localSaves = [], cloudSaves = [];
  let configured = false;
  const flags = { busy: false };
  const context = vm.createContext({
    st: state, activeAIRequests: 0, clearTimeout() {}, setTimeout() {}, console,
    _rq: { t: null, scopes: new Set(), notes: [], running: false },
    $: selector => nodes.get(selector) || null,
    document: { querySelector: selector => selector === ".busy" && flags.busy ? {} : null },
    toast: message => notices.push(message), esc: text => String(text),
    autosave: options => localSaves.push(options), refreshBadge() {},
    apiPost() {}, fetch() {},
    ProjectStore: {
      configure() { configured = true; },
      save(snapshot, options) {
        cloudSaves.push({ state: JSON.parse(JSON.stringify(snapshot)), options: { ...options } });
        return backend ? backend(snapshot, options) : Promise.resolve(metadata(options.id || ID, (options.version || 0) + 1));
      },
    },
  });
  vm.runInContext(source + ";globalThis.testDraftUI = DraftUI;", context);
  context.testDraftUI.init();
  return { ui: context.testDraftUI, context, nodes, notices, localSaves, cloudSaves, flags, configured: () => configured };
}

test("initialization wires the explicit save and library controls and announces saved status", () => {
  const app = harness();
  assert.equal(app.configured(), true);
  assert.equal(typeof app.nodes.get("#tbDraftSave").onclick, "function");
  assert.equal(typeof app.nodes.get("#tbDraftLibrary").onclick, "function");
  assert.equal(app.nodes.get("#draftStatus").attributes["aria-live"], "polite");
  assert.equal(app.nodes.get("#draftStatus").dataset.state, "saved");
  assert.match(app.nodes.get("#draftStatus").textContent, /22:00|오후 10:00/);
});

test("successful saves advance the cloud link only after completion and persist it locally", async () => {
  let release;
  const app = harness({ backend: () => new Promise(resolve => { release = resolve; }) });
  app.ui.changed();
  const saving = app.ui.save();
  assert.equal(app.context.st.projectLink.version, 1);
  assert.equal(app.nodes.get("#tbDraftSave").disabled, true);
  assert.equal(app.nodes.get("#draftStatus").dataset.state, "saving");
  release(metadata(ID, 2));
  await saving;
  assert.equal(app.context.st.projectLink.version, 2);
  assert.equal(app.context.st.projectLink.localChanges, false);
  assert.equal(app.nodes.get("#draftStatus").dataset.state, "saved");
  assert.equal(app.nodes.get("#tbDraftSave").disabled, false);
  assert.equal(app.localSaves[0].quiet, true);
});

test("edits made during a save remain visibly unsaved after that snapshot succeeds", async () => {
  let release;
  const app = harness({ backend: () => new Promise(resolve => { release = resolve; }) });
  app.ui.changed();
  const saving = app.ui.save();
  app.context.st.client.memo = "저장 시작 후 추가한 메모";
  app.ui.changed();
  release(metadata(ID, 2));
  await saving;
  assert.equal(app.context.st.projectLink.version, 2);
  assert.equal(app.context.st.projectLink.localChanges, true);
  assert.equal(app.nodes.get("#draftStatus").dataset.state, "dirty");
  assert.equal(app.cloudSaves[0].state.client.memo, "상담 메모");
});

test("a delayed old save never attaches its cloud ID to a newly selected state", async () => {
  let release;
  const app = harness({ backend: () => new Promise(resolve => { release = resolve; }) });
  const previous = app.context.st;
  const saving = app.ui.save();
  app.context.st = currentState({ ...savedLink(), id: OTHER_ID, version: 3 });
  app.ui.loaded({ clean: true });
  release(metadata(ID, 2));
  await saving;
  assert.equal(app.context.st.projectLink.id, OTHER_ID);
  assert.equal(app.context.st.projectLink.version, 3);
  assert.equal(previous.projectLink.version, 1);
  assert.equal(app.localSaves.length, 0);
});

test("save failures and conflicts preserve the active project's ID, version and edits", async () => {
  const app = harness({ backend: async () => { throw Object.assign(new Error("다른 계정의 저장과 충돌했습니다"), { code: "PROJECT_CONFLICT" }); } });
  app.context.st.client.memo = "아직 보존할 메모";
  app.ui.changed();
  await assert.rejects(app.ui.save(), error => error.code === "PROJECT_CONFLICT");
  assert.equal(app.context.st.projectLink.id, ID);
  assert.equal(app.context.st.projectLink.version, 1);
  assert.equal(app.context.st.projectLink.localChanges, true);
  assert.equal(app.context.st.client.memo, "아직 보존할 메모");
  assert.equal(app.nodes.get("#draftStatus").dataset.state, "error");
  assert.equal(app.nodes.get("#tbDraftSave").disabled, false);
});

test("opening another task is refused during AI work or an unfinished save", async () => {
  let release;
  const app = harness({ backend: () => new Promise(resolve => { release = resolve; }) });
  app.context.activeAIRequests = 1;
  assert.equal(await app.ui.beforeSwitch(), false);
  assert.match(app.notices.at(-1), /AI 분석/);
  app.context.activeAIRequests = 0;
  app.context._rq.running = true;
  assert.equal(await app.ui.beforeSwitch(), false);
  app.context._rq.running = false;
  const saving = app.ui.save();
  assert.equal(await app.ui.beforeSwitch(), false);
  release(metadata(ID, 2));
  await saving;
  assert.equal(await app.ui.beforeSwitch(), true);
});

test("local recovery retains the unsaved marker and fresh cloud restore clears it", () => {
  const app = harness();
  app.ui.changed();
  app.context.st = JSON.parse(JSON.stringify(app.context.st));
  app.ui.loaded();
  assert.equal(app.nodes.get("#draftStatus").dataset.state, "dirty");
  app.ui.loaded({ clean: true });
  assert.equal(app.nodes.get("#draftStatus").dataset.state, "saved");
  assert.equal(app.context.st.projectLink.localChanges, false);
});

test("new blank tasks switch without a save prompt and copying starts a separate cloud project", async () => {
  const blank = { version: 1, step: 1, client: { name: "", date: "2026-11-01", memo: "" }, photos: {}, texts: {}, settings: {} };
  const app = harness({ state: blank });
  assert.equal(await app.ui.beforeSwitch(), true);
  const saved = harness();
  await saved.ui.save({ asNew: true });
  assert.equal(saved.cloudSaves[0].options.id, undefined);
  assert.equal(saved.cloudSaves[0].options.version, undefined);
  assert.equal(saved.cloudSaves[0].options.step, 5);
});
