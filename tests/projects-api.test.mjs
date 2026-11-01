import assert from "node:assert/strict";
import test from "node:test";
import { createProjectsHandler, MAX_PROJECT_BYTES, PROJECT_BUCKET, PROJECT_TABLE } from "../api/_projects.js";

const ID = "11111111-1111-4111-8111-111111111111";
const SNAPSHOT = "22222222-2222-4222-8222-222222222222";
const NEW_SNAPSHOT = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-11-01T13:00:00.000Z";
const USER = { email: "first@example.com" };
const row = (overrides = {}) => ({ id: ID, name: "고객", client_date: "2026-11-01", step: 5, version: 1,
  snapshot_path: `${ID}/${SNAPSHOT}.json`, created_by: USER.email, updated_by: USER.email, created_at: NOW, updated_at: NOW, ...overrides });

function fakeClient(initial = []) {
  const rows = new Map(initial.map(item => [item.id, structuredClone(item)]));
  const files = new Map();
  const calls = [];
  const client = {
    rows, files, calls, beforeUpdate: null, insertRace: false, backendError: null,
    from(table) {
      assert.equal(table, PROJECT_TABLE);
      let operation = "select", value, filters = [], limit = 1000, ordering;
      const query = {
        select() { return this; },
        eq(key, expected) { filters.push([key, expected]); return this; },
        order(key, options) { ordering = [key, options]; return this; },
        limit(n) { limit = n; return this; },
        update(data) { operation = "update"; value = structuredClone(data); return this; },
        insert(data) { operation = "insert"; value = structuredClone(data); return this; },
        async execute(single = false) {
          calls.push({ operation, filters: structuredClone(filters), value });
          if (client.backendError) return { data: null, error: { message: client.backendError } };
          if (operation === "insert") {
            if (rows.has(value.id) || client.insertRace) return { data: null, error: { code: "23505", message: "duplicate" } };
            rows.set(value.id, structuredClone(value));
            return { data: [structuredClone(value)], error: null };
          }
          if (operation === "update") client.beforeUpdate?.();
          let matches = [...rows.values()].filter(item => filters.every(([key, expected]) => item[key] === expected));
          if (operation === "update") {
            matches = matches.map(item => { Object.assign(item, value); return item; });
          } else if (ordering) matches.sort((a, b) => String(b[ordering[0]]).localeCompare(String(a[ordering[0]])));
          const data = matches.slice(0, limit).map(item => structuredClone(item));
          return { data: single ? data[0] || null : data, error: null };
        },
        maybeSingle() { return this.execute(true); },
        then(resolve, reject) { return this.execute().then(resolve, reject); },
      };
      return query;
    },
    storage: { from(bucket) {
      assert.equal(bucket, PROJECT_BUCKET);
      return {
        async createSignedUploadUrl(path, options) { calls.push({ upload: path, options }); return { data: { signedUrl: `https://storage.example/upload/${path}?token=short-lived` }, error: null }; },
        async createSignedUrl(path, seconds) { calls.push({ download: path, seconds }); return { data: { signedUrl: `https://storage.example/download/${path}?token=short-lived` }, error: null }; },
        async list(prefix, options) { calls.push({ list: prefix, options }); return { data: [...files.values()].filter(file => file.prefix === prefix && file.name.includes(options.search)), error: null }; },
      };
    } },
  };
  return client;
}
function addFile(client, snapshot = NEW_SNAPSHOT, overrides = {}) {
  client.files.set(snapshot, { id: "file-id", prefix: ID, name: `${snapshot}.json`, metadata: { size: 12345, mimetype: "application/json" }, ...overrides });
}
async function request(client, body, options = {}) {
  let clientCalls = 0;
  const ids = [ID, NEW_SNAPSHOT];
  const handler = createProjectsHandler({ authorize: options.authorize || (async () => USER),
    getClient: async () => { clientCalls++; return client; }, now: () => NOW,
    newId: () => ids.shift(), readBody: options.readBody || (async req => req.body) });
  const res = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: options.method || "POST", body }, res);
  return { status: res.statusCode, body: res.body, headers: res.headers, clientCalls };
}
const complete = (overrides = {}) => ({ action: "complete", id: ID, snapshotId: NEW_SNAPSHOT, expectedVersion: 1,
  name: "수정 고객", clientDate: "2026-11-01", step: 7, ...overrides });

test("authorization runs before storage and never leaks the underlying error", async () => {
  const client = fakeClient();
  const result = await request(client, { action: "list" }, { authorize: async () => { throw Object.assign(new Error("secret-token-value"), { code: 401 }); } });
  assert.equal(result.status, 401);
  assert.equal(result.clientCalls, 0);
  assert.equal(client.calls.length, 0);
  assert.doesNotMatch(JSON.stringify(result.body), /secret-token-value/);
  assert.equal(result.headers["Cache-Control"], "no-store");
});

test("unsupported methods and invalid IDs, versions, sizes, metadata are rejected before client access", async () => {
  assert.equal((await request(fakeClient(), {}, { method: "GET" })).status, 405);
  const invalid = [
    { action: "delete", id: ID }, { action: "load", id: "../other-account" },
    { action: "prepare", id: null, expectedVersion: 1, bytes: 100 },
    { action: "prepare", id: null, expectedVersion: 0, bytes: MAX_PROJECT_BYTES + 1 },
    { action: "prepare", id: ID, expectedVersion: -1, bytes: 100 },
    { action: "prepare", id: ID, expectedVersion: 1, bytes: 100, images: ["photo"] },
    complete({ clientDate: "2026-02-30" }), complete({ step: 10 }), complete({ name: "가".repeat(101) }),
  ];
  for (const input of invalid) {
    const result = await request(fakeClient(), input);
    assert.equal(result.status, 400);
    assert.equal(result.clientCalls, 0, JSON.stringify(input));
  }
});

test("list exposes shared project metadata without snapshot paths or creator internals", async () => {
  const client = fakeClient([row(), row({ id: SNAPSHOT, name: "다른 계정 작업", updated_by: "second@example.com" })]);
  const result = await request(client, { action: "list" });
  assert.equal(result.status, 200);
  assert.equal(result.body.projects.length, 2);
  assert.equal(result.body.projects[0].clientDate, "2026-11-01");
  assert.equal(result.body.projects[0].snapshot_path, undefined);
  assert.equal(result.body.projects[0].created_by, undefined);
  assert.equal(client.calls.some(call => call.filters?.some(([key]) => key === "created_by")), false, "both allowed users share the same repository");
});

test("prepare grants upload access only to a new immutable JSON snapshot", async () => {
  const client = fakeClient();
  const result = await request(client, { action: "prepare", id: null, expectedVersion: 0, bytes: 12345 });
  assert.equal(result.status, 200);
  assert.equal(result.body.id, ID);
  assert.equal(result.body.snapshotId, NEW_SNAPSHOT);
  assert.match(result.body.uploadUrl, /short-lived/);
  const upload = client.calls.find(call => call.upload);
  assert.equal(upload.upload, `${ID}/${NEW_SNAPSHOT}.json`);
  assert.deepEqual(upload.options, { upsert: false });
  assert.equal(client.rows.size, 0, "an unfinished upload is not a saved project");
});

test("prepare rejects an outdated version before issuing a signed upload URL", async () => {
  const client = fakeClient([row({ version: 2 })]);
  const result = await request(client, { action: "prepare", id: ID, expectedVersion: 1, bytes: 100 });
  assert.equal(result.status, 409);
  assert.equal(client.calls.some(call => call.upload), false);
});

test("complete creates the first saved revision only after upload exists", async () => {
  const client = fakeClient(); addFile(client);
  const result = await request(client, complete({ expectedVersion: 0, name: "" }));
  assert.equal(result.status, 200);
  assert.equal(result.body.project.version, 1);
  assert.equal(result.body.project.name, "이름 없음");
  assert.equal(client.rows.get(ID).snapshot_path, `${ID}/${NEW_SNAPSHOT}.json`);
  assert.equal(client.rows.get(ID).created_by, USER.email);
});

test("complete uses optimistic CAS and preserves the original author", async () => {
  const client = fakeClient([row({ created_by: "second@example.com" })]); addFile(client);
  const result = await request(client, complete());
  assert.equal(result.status, 200);
  assert.equal(result.body.project.version, 2);
  assert.equal(client.rows.get(ID).created_by, "second@example.com");
  assert.equal(client.rows.get(ID).updated_by, USER.email);
  const update = client.calls.find(call => call.operation === "update");
  assert.deepEqual(update.filters, [["id", ID], ["version", 1]]);
});

test("another save during completion produces 409 and cannot overwrite the newer snapshot", async () => {
  const client = fakeClient([row()]); addFile(client);
  client.beforeUpdate = () => Object.assign(client.rows.get(ID), { version: 2, name: "새로운 작업", snapshot_path: `${ID}/${SNAPSHOT}.json` });
  const result = await request(client, complete());
  assert.equal(result.status, 409);
  assert.equal(client.rows.get(ID).name, "새로운 작업");
  assert.equal(client.rows.get(ID).snapshot_path, `${ID}/${SNAPSHOT}.json`);
});

test("simultaneous first-save insert conflict is reported without destroying an existing record", async () => {
  const client = fakeClient(); addFile(client); client.insertRace = true;
  const result = await request(client, complete({ expectedVersion: 0 }));
  assert.equal(result.status, 409);
  assert.equal(client.rows.size, 0);
});

test("missing, oversized, folder, or non-JSON upload never changes the saved project", async () => {
  for (const file of [null, { metadata: { size: MAX_PROJECT_BYTES + 1, mimetype: "application/json" } }, { id: null }, { metadata: { size: 12345, mimetype: "text/html" } }]) {
    const client = fakeClient([row()]);
    if (file) addFile(client, NEW_SNAPSHOT, file);
    const result = await request(client, complete());
    assert.equal(result.status, 400);
    assert.equal(client.rows.get(ID).version, 1);
    assert.equal(client.rows.get(ID).snapshot_path, `${ID}/${SNAPSHOT}.json`);
  }
});

test("load signs only the saved private snapshot for 60 seconds", async () => {
  const client = fakeClient([row()]);
  const result = await request(client, { action: "load", id: ID });
  assert.equal(result.status, 200);
  assert.match(result.body.downloadUrl, new RegExp(SNAPSHOT));
  assert.deepEqual(client.calls.find(call => call.download), { download: `${ID}/${SNAPSHOT}.json`, seconds: 60 });
  assert.equal((await request(fakeClient(), { action: "load", id: ID })).status, 404);
});

test("malformed stored paths and backend errors cannot disclose raw backend details", async () => {
  const malformed = fakeClient([row({ snapshot_path: `other/${SNAPSHOT}.json` })]);
  assert.equal((await request(malformed, { action: "load", id: ID })).status, 503);
  assert.equal(malformed.calls.some(call => call.download), false);
  const failed = fakeClient(); failed.backendError = "service-role-key-private-value";
  const result = await request(failed, { action: "list" });
  assert.equal(result.status, 503);
  assert.doesNotMatch(JSON.stringify(result.body), /service-role-key-private-value/);
});

test("the installed Supabase SDK signs the exact raw JSON PUT upload contract", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const serverOnlyTestKey = "server-only-test-key-do-not-return";
  const path = `${ID}/${NEW_SNAPSHOT}.json`;
  const transfers = [];
  const client = createClient("https://example.supabase.co", serverOnlyTestKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      const address = new URL(url);
      const headers = new Headers(options.headers);
      transfers.push({ url: address.href, method: options.method, contentType: headers.get("content-type"), body: options.body });
      if (options.method === "POST") {
        assert.equal(address.pathname, `/storage/v1/object/upload/sign/${PROJECT_BUCKET}/${path}`);
        return new Response(JSON.stringify({ url: `/object/upload/sign/${PROJECT_BUCKET}/${path}?token=short-lived-upload-token` }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      }
      assert.equal(options.method, "PUT");
      return new Response(JSON.stringify({ Key: `${PROJECT_BUCKET}/${path}` }), { status: 200, headers: { "Content-Type": "application/json" } });
    } },
  });
  const signed = await request(client, { action: "prepare", id: null, expectedVersion: 0, bytes: 123 });
  assert.equal(signed.status, 200);
  assert.doesNotMatch(JSON.stringify(signed.body), new RegExp(serverOnlyTestKey));
  assert.equal(new URL(signed.body.uploadUrl).searchParams.get("token"), "short-lived-upload-token");
  const snapshot = JSON.stringify({ version: 1, photos: {} });
  const result = await client.storage.from(PROJECT_BUCKET).uploadToSignedUrl(path, "short-lived-upload-token", snapshot, { contentType: "application/json", upsert: false });
  assert.equal(result.error, null);
  assert.equal(transfers[1].url, signed.body.uploadUrl);
  assert.equal(transfers[1].method, "PUT");
  assert.equal(transfers[1].contentType, "application/json");
  assert.equal(transfers[1].body, snapshot, "JSON string bytes are uploaded directly, as the browser adapter does with a JSON Blob");
});
