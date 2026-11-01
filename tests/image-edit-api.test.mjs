import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/image.js";

const CUSTOMER = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=";
const REFERENCE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const TEST_KEY = "dummy-openai-key-used-only-with-mocked-fetch";
const OUTPUT = "/9j/2Q==";

function environment(t, overrides = {}) {
  const settings = { DEV_NO_AUTH: "1", MOCK_AI: undefined, OPENAI_API_KEY: TEST_KEY, OPENAI_IMAGE_MODEL: undefined, OPENAI_IMAGE_QUALITY: undefined, ...overrides };
  const previous = new Map(Object.keys(settings).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
  t.mock.method(console, "error", () => {});
}
function success() {
  return { ok: true, status: 200, json: async () => ({ data: [{ b64_json: OUTPUT }], usage: { input_tokens: 8, output_tokens: 4, input_tokens_details: { text_tokens: 2, image_tokens: 6 } } }) };
}
function mockFetch(t, response = success) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => { calls.push({ url, options }); return response(url, options); });
  return calls;
}
async function request(body, options = {}) {
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = JSON.parse(value); } };
  await handler({ method: options.method || "POST", headers: options.headers || {}, body }, res);
  return { status: res.statusCode, body: res.body, headers: res.headers };
}
const edit = (overrides = {}) => ({ kind: "hair", prompt: "Change only the customer's hairstyle using the second image as a style reference.", images: [CUSTOMER, REFERENCE], quality: "medium", size: "1024x1024", ...overrides });

test("the edit handler sends the customer first and the reference second as real multipart files", async t => {
  environment(t);
  const calls = mockFetch(t);
  const result = await request(edit());
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, "https://api.openai.com/v1/images/edits");
  assert.equal(options.method, "POST");
  assert.equal(new Headers(options.headers).get("authorization"), "Bearer " + TEST_KEY);
  assert.equal(new Headers(options.headers).has("content-type"), false, "fetch must set its own multipart boundary");
  assert.ok(options.body instanceof FormData);
  const images = options.body.getAll("image[]");
  assert.equal(images.length, 2);
  assert.equal(images[0].type, "image/png");
  assert.equal(images[1].type, "image/png");
  assert.deepEqual(Buffer.from(await images[0].arrayBuffer()), Buffer.from(CUSTOMER.split(",")[1], "base64"));
  assert.deepEqual(Buffer.from(await images[1].arrayBuffer()), Buffer.from(REFERENCE.split(",")[1], "base64"));
  assert.notDeepEqual(Buffer.from(await images[0].arrayBuffer()), Buffer.from(await images[1].arrayBuffer()));
  assert.equal(options.body.get("model"), "gpt-image-1.5");
  assert.equal(options.body.get("input_fidelity"), "high");
  assert.equal(options.body.get("output_format"), "jpeg");
  assert.equal(result.body.image, "data:image/jpeg;base64," + OUTPUT);
  assert.equal(result.body.quality, "medium");
  assert.equal(typeof result.body.cost, "number");
});

test("gpt-image-1-mini never receives the unsupported input_fidelity parameter", async t => {
  environment(t, { OPENAI_IMAGE_MODEL: "gpt-image-1-mini" });
  const calls = mockFetch(t);
  const result = await request(edit({ images: [CUSTOMER] }));
  assert.equal(result.status, 200);
  assert.equal(calls[0].options.body.get("model"), "gpt-image-1-mini");
  assert.equal(calls[0].options.body.has("input_fidelity"), false);
});

test("protection masks require PNG customer images, matching dimensions and an alpha channel", async t => {
  environment(t); const calls = mockFetch(t);
  const differentSize = Buffer.from(CUSTOMER.split(",")[1], "base64"); differentSize.writeUInt32BE(2, 16);
  const noAlpha = Buffer.from(CUSTOMER.split(",")[1], "base64"); noAlpha[25] = 2;
  for (const input of [
    { images: ["data:image/jpeg;base64,/9j/AA=="], mask: CUSTOMER },
    { images: [CUSTOMER], mask: "data:image/png;base64," + differentSize.toString("base64") },
    { images: [CUSTOMER], mask: "data:image/png;base64," + noAlpha.toString("base64") },
  ]) assert.equal((await request(edit(input))).status, 400);
  assert.equal(calls.length, 0);
});

test("a PNG face-protection mask accompanies the customer without changing image order", async t => {
  environment(t);
  const calls = mockFetch(t);
  const result = await request(edit({ mask: CUSTOMER }));
  assert.equal(result.status, 200);
  const form = calls[0].options.body;
  const mask = form.get("mask");
  assert.equal(mask.type, "image/png");
  assert.deepEqual(Buffer.from(await mask.arrayBuffer()), Buffer.from(CUSTOMER.split(",")[1], "base64"));
  const photos = form.getAll("image[]");
  assert.equal(photos.length, 2);
  assert.deepEqual(Buffer.from(await photos[0].arrayBuffer()), Buffer.from(CUSTOMER.split(",")[1], "base64"));
  assert.deepEqual(Buffer.from(await photos[1].arrayBuffer()), Buffer.from(REFERENCE.split(",")[1], "base64"));
});

test("malformed or non-PNG protection masks fail before any paid image request", async t => {
  environment(t);
  const calls = mockFetch(t);
  for (const mask of [null, "", "data:image/jpeg;base64,/9j/2Q==", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:image/png;base64,not$base64", { image: CUSTOMER }]) {
    const result = await request(edit({ mask }));
    assert.equal(result.status, 400);
    assert.equal(calls.length, 0);
    assert.match(result.body.error, /얼굴 보호/);
  }
});

test("malformed first photos are rejected instead of silently turning a reference into the customer", async t => {
  environment(t);
  const calls = mockFetch(t);
  for (const original of [null, "", "not-an-image", "https://example.invalid/customer.jpg", { image: CUSTOMER }]) {
    const result = await request(edit({ images: [original, REFERENCE] }));
    assert.equal(result.status, 400, "the first photo must remain the validated customer photo");
    assert.equal(calls.length, 0);
    assert.equal(typeof result.body.error, "string");
    assert.doesNotMatch(JSON.stringify(result.body), /dummy-openai-key|iVBORw0KGgo/);
  }
});

test("missing or incorrectly shaped image arrays fail before any OpenAI request", async t => {
  environment(t);
  const calls = mockFetch(t);
  for (const images of [undefined, null, [], CUSTOMER, { 0: CUSTOMER, length: 1 }, Array(5).fill(CUSTOMER)]) {
    const result = await request(edit({ images }));
    assert.equal(result.status, 400);
    assert.equal(calls.length, 0);
  }
});

test("malformed references and non-raster or invalid base64 images are rejected together", async t => {
  environment(t);
  const calls = mockFetch(t);
  const invalid = [
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
    "data:image/png;base64,not$base64",
    "data:image/jpeg;base64,",
    'data:image/png;base64,iVBORw0KGgo=" onload="injected-marker',
  ];
  for (const reference of invalid) {
    const result = await request(edit({ images: [CUSTOMER, reference] }));
    assert.equal(result.status, 400);
    assert.equal(calls.length, 0);
  }
});

test("mock mode also validates the original photo rather than hiding invalid input", async t => {
  environment(t, { MOCK_AI: "1" });
  const calls = mockFetch(t);
  const invalid = await request(edit({ images: [null, REFERENCE] }));
  assert.equal(invalid.status, 400);
  const valid = await request(edit());
  assert.equal(valid.status, 200);
  assert.equal(valid.body.image, CUSTOMER);
  assert.equal(valid.body.mock, true);
  assert.equal(calls.length, 0);
});

test("upstream failures return an actionable error without disclosing input photos or credentials", async t => {
  environment(t);
  const calls = mockFetch(t, async () => ({ ok: false, status: 403, json: async () => ({ error: { message: "Your organization must be verified to use this model." } }) }));
  const result = await request(edit());
  assert.equal(calls.length, 1);
  assert.equal(result.status, 502);
  assert.match(result.body.error, /403/);
  assert.match(result.body.error, /조직 인증/);
  assert.doesNotMatch(JSON.stringify(result.body), /dummy-openai-key|iVBORw0KGgo/);
});

test("an empty upstream success is reported as missing output", async t => {
  environment(t);
  mockFetch(t, async () => ({ ok: true, status: 200, json: async () => ({ data: [] }) }));
  const result = await request(edit());
  assert.equal(result.status, 502);
  assert.match(result.body.error, /이미지/);
});

test("authentication and method checks run before the paid image request", async t => {
  environment(t, { DEV_NO_AUTH: undefined });
  const calls = mockFetch(t);
  assert.equal((await request(edit())).status, 401);
  assert.equal((await request(edit(), { method: "GET" })).status, 405);
  assert.equal(calls.length, 0);
});
