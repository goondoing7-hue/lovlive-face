import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/js/project_store.js", import.meta.url), "utf8");
const ID = "12345678-1234-4234-8234-123456789abc";
const SNAPSHOT = "87654321-1234-4234-8234-123456789abc";
const URL_UPLOAD = "https://example.supabase.co/storage/v1/object/upload/sign/private/snapshot.json?token=test-only";
const URL_DOWNLOAD = "https://example.supabase.co/storage/v1/object/sign/private/snapshot.json?token=test-only";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=";
const plain = value => JSON.parse(JSON.stringify(value));
const state = () => ({
  version: 1, step: 5, client: { name: "테스트 고객", date: "2026-11-01", memo: "상담 메모" },
  photos: { front: PNG, frontOrig: PNG },
  side: { src: PNG }, ear: { src: PNG },
  type: { key: "round" }, manual: { aspect: "1:1.4" }, edited: ["texts.hair.items.0.name"],
  texts: { hair: { items: [{ ref: "h01", img: PNG, cands: [PNG] }] } },
  settings: { api: { key: "do-not-upload-analysis-key", model: "existing-model" }, img: { openaiKey: "do-not-upload-image-key", geminiKey: "do-not-upload-other-key", quality: "medium" }, brand: "LOVIVE" },
});
const metadata = (version = 1) => ({ id: ID, name: "테스트 고객", clientDate: "2026-11-01", step: 5, version, createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-01T01:00:00Z", updatedBy: "allowed@example.com" });

function client(overrides = {}) {
  const calls = [], transfers = [];
  const context = vm.createContext({ Blob, URL });
  vm.runInContext(source + ";globalThis.testStore = ProjectStore;", context);
  const store = context.testStore;
  store.configure({
    apiPost: async (url, body) => {
      calls.push({ url, body: plain(body) });
      if (overrides.apiPost) return overrides.apiPost(url, body);
      if (body.action === "prepare") return { id: ID, snapshotId: SNAPSHOT, uploadUrl: URL_UPLOAD };
      if (body.action === "complete") return { project: metadata(body.expectedVersion + 1) };
      if (body.action === "list") return { projects: [metadata(2)] };
      if (body.action === "load") return { project: metadata(2), downloadUrl: URL_DOWNLOAD };
      throw new Error("unexpected action");
    },
    fetch: async (url, options) => {
      transfers.push({ url, options });
      if (overrides.fetch) return overrides.fetch(url, options);
      return { ok: true, text: async () => JSON.stringify(state()), headers: { get: () => null } };
    },
    ...(overrides.maxBytes ? { maxBytes: overrides.maxBytes } : {}),
  });
  return { store, calls, transfers };
}

test("save sends a snapshot over a signed upload, then commits metadata and version", async () => {
  const { store, calls, transfers } = client();
  const original = state();
  const result = await store.save(original, { id: ID, version: 1, step: 7 });
  assert.equal(result.version, 2);
  assert.equal(calls[0].url, "/api/projects");
  assert.deepEqual(calls.map(x => x.body.action), ["prepare", "complete"]);
  assert.equal(calls[0].body.expectedVersion, 1);
  assert.equal(calls[1].body.expectedVersion, 1);
  assert.equal(calls[1].body.snapshotId, SNAPSHOT);
  assert.equal(calls[1].body.step, 7);
  assert.equal(transfers[0].url, URL_UPLOAD);
  assert.equal(transfers[0].options.method, "PUT");
  assert.equal(transfers[0].options.credentials, "omit");
  assert.equal(transfers[0].options.headers.Authorization, undefined);
  const uploaded = JSON.parse(await transfers[0].options.body.text());
  assert.equal(uploaded.step, 7);
  assert.deepEqual(uploaded.photos, original.photos);
  assert.deepEqual(uploaded.texts, original.texts);
  assert.equal(uploaded.side.src, original.side.src);
  assert.equal(uploaded.ear.src, original.ear.src);
  assert.equal(uploaded.settings.api.key, "");
  assert.equal(uploaded.settings.img.openaiKey, "");
  assert.equal(uploaded.settings.img.geminiKey, "");
  assert.equal(uploaded.settings.api.model, "existing-model");
  assert.equal(uploaded.type.key, "round");
  assert.equal(original.settings.api.key, "do-not-upload-analysis-key");
  assert.equal(original.step, 5);
});

test("large photo snapshots bypass the API body limit", async () => {
  const { store, calls, transfers } = client();
  const original = state();
  original.photos.frontOrig = "data:image/jpeg;base64,/9j/" + "A".repeat(5 * 1024 * 1024);
  await store.save(original);
  assert.ok(calls[0].body.bytes > 4.5 * 1024 * 1024);
  assert.equal(calls[0].body.bytes, transfers[0].options.body.size);
  assert.ok(JSON.stringify(calls).length < 1000, "authenticated API calls only carry metadata");
  assert.equal(JSON.parse(await transfers[0].options.body.text()).photos.frontOrig, original.photos.frontOrig);
});

test("save captures the state before the first asynchronous request", async () => {
  let release;
  const prepared = new Promise(resolve => { release = resolve; });
  const { store, transfers } = client({ apiPost: async (_url, body) => body.action === "prepare" ? prepared : { project: metadata() } });
  const original = state();
  const saving = store.save(original);
  original.client.name = "저장 도중 수정";
  original.photos.front = "changed";
  original.texts.hair.items[0].cands.push("changed");
  release({ id: ID, snapshotId: SNAPSHOT, uploadUrl: URL_UPLOAD });
  await saving;
  const uploaded = JSON.parse(await transfers[0].options.body.text());
  assert.equal(uploaded.client.name, "테스트 고객");
  assert.equal(uploaded.photos.front, PNG);
  assert.equal(uploaded.texts.hair.items[0].cands.length, 1);
});

test("failed uploads never complete a metadata save", async () => {
  const { store, calls } = client({ fetch: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(store.save(state()), error => error.code === "PROJECT_UPLOAD_FAILED");
  assert.deepEqual(calls.map(x => x.body.action), ["prepare"]);
});

test("offline file transfers show a clear error without marking the project saved", async () => {
  const { store, calls } = client({ fetch: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(store.save(state()), error => error.code === "PROJECT_UPLOAD_FAILED" && /인터넷 연결/.test(error.message));
  assert.deepEqual(calls.map(x => x.body.action), ["prepare"]);
  await assert.rejects(store.get(ID), error => error.code === "PROJECT_DOWNLOAD_FAILED" && /인터넷 연결/.test(error.message));
});

test("a changed cloud version produces an actionable conflict", async () => {
  const { store } = client({ apiPost: async (_url, body) => {
    if (body.action === "prepare") return { id: ID, snapshotId: SNAPSHOT, uploadUrl: URL_UPLOAD };
    throw Object.assign(new Error("version conflict"), { status: 409 });
  } });
  await assert.rejects(store.save(state(), { id: ID, version: 1 }), error => error.code === "PROJECT_CONFLICT" && /최신 작업/.test(error.message));
});

test("invalid state, missing versions, and oversize files fail before any network request", async () => {
  const { store, calls } = client({ maxBytes: 100 });
  await assert.rejects(store.save({ version: 999 }), error => error.code === "INVALID_PROJECT_STATE");
  await assert.rejects(store.save(state(), { id: ID }), error => error.code === "INVALID_PROJECT_VERSION");
  await assert.rejects(store.save({ ...state(), client: { date: "2026-02-30" } }), error => error.code === "INVALID_PROJECT_STATE");
  await assert.rejects(store.save(state()), error => error.code === "PROJECT_TOO_LARGE");
  assert.equal(calls.length, 0);
});

test("list returns display metadata and load restores photos, candidates and the saved step", async () => {
  const { store, calls, transfers } = client();
  const projects = await store.list();
  assert.equal(projects[0].id, ID);
  assert.equal(projects[0].version, 2);
  const restored = await store.get(ID);
  assert.equal(restored.project.version, 2);
  assert.equal(restored.state.client.name, "테스트 고객");
  assert.equal(restored.state.photos.frontOrig, state().photos.frontOrig);
  assert.deepEqual(plain(restored.state.texts), state().texts);
  assert.equal(restored.state.settings.api.key, "");
  assert.equal(calls.at(-1).body.action, "load");
  assert.equal(transfers[0].url, URL_DOWNLOAD);
  assert.equal(transfers[0].options.credentials, "omit");
});

test("downloads reject malformed snapshots and unsafe signed URLs", async () => {
  const badJson = client({ fetch: async () => ({ ok: true, text: async () => "not-json" }) });
  await assert.rejects(badJson.store.get(ID), error => error.code === "INVALID_PROJECT_STATE");
  const badSchema = client({ fetch: async () => ({ ok: true, text: async () => '{"version":99}' }) });
  await assert.rejects(badSchema.store.get(ID), error => error.code === "INVALID_PROJECT_STATE");
  const unsafe = client({ apiPost: async () => ({ project: metadata(), downloadUrl: "http://untrusted.invalid/file" }) });
  await assert.rejects(unsafe.store.get(ID), error => error.code === "INVALID_STORAGE_URL");
  assert.equal(unsafe.transfers.length, 0);
});

test("snapshot sanitation removes prototype keys without removing normal type keys", async () => {
  const { store, transfers } = client();
  const original = JSON.parse(JSON.stringify(state()).replace('"manual":{', '"__proto__":{"polluted":true},"manual":{"constructor":{"prototype":{"polluted":true}},'));
  await store.save(original);
  const text = await transfers[0].options.body.text();
  assert.equal(text.includes('"__proto__"'), false);
  assert.equal(text.includes('"constructor"'), false);
  assert.equal(JSON.parse(text).type.key, "round");
});

test("cloud loading rejects the reproduced SVG attribute injection in front dimensions", async () => {
  const malicious = state();
  malicious.front = { w: '600" onload="injected-marker', h: 800 };
  const { store } = client({ fetch: async () => ({ ok: true, text: async () => JSON.stringify(malicious) }) });
  await assert.rejects(store.get(ID), error => error.code === "INVALID_PROJECT_STATE" && /front.w/.test(error.message));
});

test("all persisted image paths reject arbitrary URLs, SVG and attribute-breaking payloads", () => {
  const { store } = client();
  const attacks = [
    'data:image/jpeg;base64,/9j/" onload="injected-marker',
    "https://untrusted.invalid/customer.jpg", "blob:untrusted",
    "data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIj48L3N2Zz4=",
    "data:image/png;base64,PHN2Zz48L3N2Zz4=", // SVG content disguised as PNG.
  ];
  const locations = [
    (value, image) => { value.photos.frontOrig = image; },
    (value, image) => { value.side.src = image; },
    (value, image) => { value.ear.src = image; },
    (value, image) => { value.texts.hair.items[0].img = image; },
    (value, image) => { value.texts.hair.items[0].cands = [image]; },
    (value, image) => { value.texts.glasses = { items: [{ img: image }] }; },
    (value, image) => { value.texts.earrings = { items: [{ cands: [image] }] }; },
    (value, image) => { value.texts.makeup = { guideImg: image }; },
    (value, image) => { value.texts.makeup = { fullImage: image }; },
    (value, image) => { value.texts.makeup = { cands: [image] }; },
    (value, image) => { value.texts.makeup = { guideCands: [{ img: image, lm: null }] }; },
  ];
  for (const attack of attacks) for (const setImage of locations) {
    const malicious = state(); setImage(malicious, attack);
    assert.throws(() => store.sanitizeState(malicious), error => error.code === "INVALID_PROJECT_STATE");
  }
});

test("render coordinates, frames, calibration and scales require finite numeric values", () => {
  const { store } = client();
  const malicious = [
    value => { value.front = { frame: { zoom: '1" onclick="attack' } }; },
    value => { value.front = { lines: { h: { hair: '100" onload="attack' } } }; },
    value => { value.front = { pts: Array.from({ length: 468 }, () => [50, 50]) }; value.front.pts[33][0] = "50"; },
    value => { value.side.pts = [null, ['20" onload="attack', 30], null]; },
    value => { value.ear.lobe = ["20", 30]; },
    value => { value.settings.calib = { aspect: ["1", 0] }; },
    value => { value.settings.thresholds = { long: '1.5" onfocus="attack' }; },
    value => { value.texts.glasses = { items: [{ size: "1.2" }] }; },
    value => { value.texts.earrings = { scales: [0, 1, 2, 3, 4, "2"] }; },
    value => { value.texts.makeup = { guideLm: { w: '600" onload="attack', h: 800, pts: [] } }; },
    value => { value.texts.makeup = { guideCands: [{ img: PNG, lm: { w: 600, h: 800, pts: Array.from({ length: 468 }, () => [0, "2"]) } }] }; },
    value => { value.front = { w: Infinity }; },
    value => { value.front = { w: NaN }; },
  ];
  for (const attack of malicious) {
    const value = state(); attack(value);
    assert.throws(() => store.sanitizeState(value), error => error.code === "INVALID_PROJECT_STATE");
  }
});

test("persisted selectors reject unknown or markup-bearing choice keys", () => {
  const { store } = client();
  const attacks = [
    value => { value.type.key = "unknown-face"; },
    value => { value.manual.aspect = '1:1.4" onfocus="attack'; },
    value => { value.texts.hair.items[0].ref = '../secret" onerror="attack'; },
    value => { value.texts.glasses = { items: [{ shape: "constructor" }] }; },
    value => { value.texts.earrings = { items: [{ color: 'gold" onload="attack' }] }; },
  ];
  for (const attack of attacks) {
    const value = state(); attack(value);
    assert.throws(() => store.sanitizeState(value), error => error.code === "INVALID_PROJECT_STATE");
  }
});

test("the application's real newState and complete generated-photo state remain compatible", async () => {
  const app = vm.createContext({ window: { addEventListener() {} }, document: { addEventListener() {} }, localStorage: { getItem: () => null }, boot() {}, console });
  for (const path of ["lib.js", "engine.js", "ui.js"]) vm.runInContext(await readFile(new URL("../public/js/" + path, import.meta.url), "utf8"), app);
  const initial = vm.runInContext("newState()", app);
  const { store } = client();
  const cleanInitial = store.sanitizeState(initial);
  assert.equal(cleanInitial.front.w, 600);
  assert.equal(cleanInitial.side.w, 0);
  assert.deepEqual(plain(cleanInitial.side.pts), [null, null, null]);
  initial.photos.front = PNG; initial.photos.frontOrig = PNG;
  initial.front.pts = Array.from({ length: 468 }, (_, index) => [index + 0.5, index + 1.25]);
  initial.side = { ...initial.side, src: PNG, w: 600, h: 800, pts: [[1, 2], null, [30, 40]], earPt: [50, 60] };
  initial.ear = { ...initial.ear, src: PNG, w: 600, h: 800, lobe: [100, 150] };
  for (const kind of ["hair", "glasses", "earrings"]) for (const item of initial.texts[kind].items) { item.img = PNG; item.cands = [PNG]; }
  initial.texts.makeup.guideImg = PNG;
  initial.texts.makeup.guideLm = { w: 600, h: 800, pts: initial.front.pts };
  initial.texts.makeup.guideCands = [{ img: PNG, lm: initial.texts.makeup.guideLm, q: "medium" }];
  const restored = store.sanitizeState(initial);
  assert.equal(restored.photos.front, PNG);
  assert.equal(restored.texts.glasses.items[0].cands[0], PNG);
  assert.equal(restored.texts.makeup.guideCands[0].lm.pts.length, 468);
});
