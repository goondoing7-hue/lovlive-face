import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/js/identity_edit.js", import.meta.url), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));

function facePoints() {
  const points = Array.from({ length: 468 }, () => [500, 900]);
  const browIds = [70, 63, 105, 66, 107, 336, 296, 334, 293, 300];
  const browXs = [300, 340, 380, 420, 460, 540, 580, 620, 660, 700];
  const browYs = [600, 590, 585, 590, 600, 600, 590, 585, 590, 600];
  browIds.forEach((id, index) => { points[id] = [browXs[index], browYs[index]]; });
  const rightIds = [454, 323, 361, 288, 397, 365, 379, 378, 400, 377];
  const xs = [800, 780, 760, 740, 710, 670, 630, 590, 550, 520];
  const ys = [900, 1000, 1100, 1200, 1300, 1380, 1430, 1470, 1490, 1500];
  rightIds.forEach((id, index) => { points[id] = [xs[index], ys[index]]; });
  const leftIds = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148];
  leftIds.forEach((id, index) => { points[id] = [1000 - xs[index], ys[index]]; });
  Object.entries({ 152: [500, 1520], 33: [350, 780], 133: [450, 780], 263: [650, 780], 362: [550, 780],
    159: [400, 760], 145: [400, 800], 386: [600, 760], 374: [600, 800], 4: [500, 1040],
    61: [420, 1240], 291: [580, 1240], 13: [500, 1210], 14: [500, 1260] }).forEach(([id, point]) => { points[id] = point; });
  return points;
}
function client({ detect, load, encode } = {}) {
  const canvases = [], loads = [], detections = [];
  const context = vm.createContext({
    loadImage: async src => {
      loads.push(src);
      return load ? load(src) : { id: src, width: 1000, height: 2000 };
    },
    detectLandmarks: async src => {
      detections.push(src);
      return detect ? detect(src, detections.length) : { w: 1000, h: 2000, pts: facePoints() };
    },
    document: { createElement(kind) {
      assert.equal(kind, "canvas");
      const calls = [], path = [];
      const element = { id: "canvas-" + canvases.length, width: 0, height: 0,
        toDataURL(type, quality) { calls.push({ method: "encode", type, quality }); return encode ? encode(element, type) : `data:${type};base64,dGVzdA==`; } };
      const drawing = { calls, path,
        beginPath() { path.length = 0; calls.push({ method: "begin" }); },
        moveTo(x, y) { path.push([x, y]); }, lineTo(x, y) { path.push([x, y]); }, closePath() {},
        fillRect(...args) { calls.push({ method: "fillRect", args, color: this.fillStyle }); },
        clearRect(...args) { calls.push({ method: "clearRect", args }); },
        drawImage(image, ...args) { calls.push({ method: "draw", image: image.id, args }); },
        fill() { calls.push({ method: "fill", polygon: plain(path), color: this.fillStyle }); },
        save() {}, restore() {}, clip() { calls.push({ method: "clip", polygon: plain(path) }); },
      };
      element.getContext = () => drawing;
      canvases.push({ element, drawing });
      return element;
    } },
  });
  vm.runInContext(source + ";globalThis.identity = IdentityEdit;", context);
  return { identity: context.identity, canvases, loads, detections };
}

test("three parallel hair jobs share original-source landmark detection", async () => {
  const app = client();
  const state = { photos: { frontOrig: "original-customer", front: "rotated-customer" }, front: { w: 1000, h: 2000, pts: facePoints() } };
  const original = plain(state);
  const results = await Promise.all([0, 1, 2].map(() => app.identity.prepare(state)));
  assert.deepEqual(app.detections, ["original-customer"]);
  assert.equal(results.length, 3);
  assert.deepEqual(plain(state), original, "preparation must not mutate customer state or landmark data");
  assert.equal(app.loads.every(src => src === "original-customer"), true);
});

test("only landmarks from the exact original image and matching dimensions may be reused", async () => {
  const matching = client();
  await matching.identity.prepare({ photos: { front: "same-source" }, front: { w: 1000, h: 2000, pts: facePoints() } });
  assert.equal(matching.detections.length, 0);
  const differentSize = client();
  await differentSize.identity.prepare({ photos: { front: "same-source" }, front: { w: 600, h: 800, pts: facePoints() } });
  assert.deepEqual(differentSize.detections, ["same-source"]);
});

test("source and reusable landmarks are snapshotted before image loading can yield", async () => {
  let release;
  const delayedImage = new Promise(resolve => { release = resolve; });
  const app = client({ load: () => delayedImage });
  const state = { photos: { front: "same-original" }, front: { w: 1000, h: 2000, pts: facePoints() } };
  const preparing = app.identity.prepare(state);
  state.photos.front = "a-different-customer";
  state.front.w = 600; state.front.h = 800; state.front.pts[61][0] = 900;
  release({ id: "same-original", width: 1000, height: 2000 });
  const prepared = await preparing;
  assert.equal(app.detections.length, 0, "the original matching landmarks captured before await are safe to reuse");
  assert.deepEqual(app.loads, ["same-original"]);
  assert.equal(prepared.sourceWidth, 1000);
  assert.ok(Math.abs(prepared.polygon[0][0] - 403.456) < 0.00001);
});

test("missing original photos, absent faces and mismatched geometry stop before producing an edit input", async () => {
  const missing = client();
  await assert.rejects(missing.identity.prepare({ photos: {} }), error => /원본 정면 사진/.test(error.message));
  assert.equal(missing.loads.length, 0);
  const noFace = client({ detect: () => null });
  await assert.rejects(noFace.identity.prepare({ photos: { frontOrig: "customer" } }), error => /얼굴을 찾지 못/.test(error.message));
  assert.equal(noFace.canvases.length, 0);
  const wrongCoordinates = client({ detect: () => ({ w: 600, h: 800, pts: facePoints() }) });
  await assert.rejects(wrongCoordinates.identity.prepare({ photos: { frontOrig: "customer" } }), error => error.code === "IDENTITY_EDIT_FAILED");
  assert.equal(wrongCoordinates.canvases.length, 0);
});

test("a face with unprotected or invalid eyes, nose or mouth is rejected safely", async () => {
  for (const badPoint of [[900, 1240], [NaN, 1240], [500, "1240"]]) {
    const points = facePoints(); points[61] = badPoint;
    const app = client({ detect: () => ({ w: 1000, h: 2000, pts: points }) });
    await assert.rejects(app.identity.prepare({ photos: { frontOrig: "customer" } }), error => error.code === "IDENTITY_EDIT_FAILED");
    assert.equal(app.canvases.length, 0);
  }
});

test("contain geometry and the protected face polygon use the same exact canvas mapping", async () => {
  const app = client();
  const prepared = await app.identity.prepare({ photos: { frontOrig: "customer" } });
  assert.equal(prepared.width, 1024);
  assert.equal(prepared.height, 1024);
  assert.deepEqual(plain(prepared.contentBox), { x: 256, y: 0, width: 512, height: 1024 });
  const originalDraw = app.canvases[0].drawing.calls.find(call => call.method === "draw");
  assert.deepEqual(originalDraw, { method: "draw", image: "customer", args: [256, 0, 512, 1024] });
  assert.ok(Math.abs(prepared.polygon[0][0] - 403.456) < 0.00001);
  assert.ok(Math.abs(prepared.polygon[0][1] - 282.7648) < 0.00001);
  assert.ok(prepared.polygon.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y) && x >= 256 && x <= 768 && y >= 0 && y <= 1024));
  const faceMask = app.canvases[1].drawing.calls.find(call => call.method === "fill");
  assert.equal(faceMask.color, "#fff");
  assert.deepEqual(faceMask.polygon, plain(prepared.polygon));
  assert.ok(app.canvases[1].drawing.calls.some(call => call.method === "clearRect"));
  assert.match(prepared.image, /^data:image\/png;/);
  assert.match(prepared.mask, /^data:image\/png;/);
  assert.equal(prepared.inputWidth, prepared.width);
  assert.equal(prepared.inputHeight, prepared.height);
});

test("large PNG inputs and masks shrink together while restore geometry stays at output resolution", async () => {
  const app = client({ encode: (element, type) => `data:${type};base64,` + "A".repeat(element.width >= 896 ? 3 * 1024 * 1024 : 1000) });
  const prepared = await app.identity.prepare({ photos: { frontOrig: "customer" } });
  assert.equal(prepared.width, 1024);
  assert.equal(prepared.height, 1024);
  assert.equal(prepared.inputWidth, 768);
  assert.equal(prepared.inputHeight, 768);
  assert.ok(prepared.image.length + prepared.mask.length <= 2.8 * 1024 * 1024);
  const smallMask = app.canvases[5];
  assert.equal(smallMask.element.width, 768);
  const path = smallMask.drawing.calls.find(call => call.method === "fill").polygon;
  assert.deepEqual(path, plain(prepared.polygon.map(point => [point[0] * 0.75, point[1] * 0.75])));
  await prepared.restore("generated");
  const result = app.canvases.at(-1);
  assert.equal(result.element.width, 1024);
  assert.deepEqual(result.drawing.calls.find(call => call.method === "clip").polygon, plain(prepared.polygon));
});

test("restore keeps the generated canvas outside the same polygon and composites only the original face", async () => {
  const app = client();
  const prepared = await app.identity.prepare({ photos: { frontOrig: "customer-original" } });
  const restored = await prepared.restore("generated-hairstyle");
  const result = app.canvases[2].drawing.calls;
  assert.deepEqual(result.filter(call => call.method === "draw"), [
    { method: "draw", image: "generated-hairstyle", args: [0, 0, 1024, 1024] },
    { method: "draw", image: "canvas-0", args: [0, 0] },
  ]);
  assert.deepEqual(result.find(call => call.method === "clip").polygon, plain(prepared.polygon));
  assert.equal(result.at(-1).quality, 0.94);
  assert.match(restored, /^data:image\/jpeg;/);
});

test("a failed detector request is not permanently cached for the next attempt", async () => {
  const app = client({ detect: (_src, count) => { if (count === 1) throw new Error("temporary detection failure"); return { w: 1000, h: 2000, pts: facePoints() }; } });
  await assert.rejects(app.identity.prepare({ photos: { frontOrig: "customer" } }));
  await app.identity.prepare({ photos: { frontOrig: "customer" } });
  assert.equal(app.detections.length, 2);
});

let nativeCanvas;
try { nativeCanvas = await import(new URL("../../tmp/identity-canvas-qa/node_modules/@napi-rs/canvas/index.js", import.meta.url).href); }
catch { /* Native canvas is a temporary local QA tool, never an application dependency. */ }

test("native canvas preserves original eye/nose/mouth pixels and generated hair/background pixels", { skip: !nativeCanvas }, async () => {
  const { createCanvas, loadImage } = nativeCanvas;
  const original = createCanvas(1000, 2000), generated = createCanvas(1024, 1024);
  original.getContext("2d").fillStyle = "rgb(240,30,40)"; original.getContext("2d").fillRect(0, 0, 1000, 2000);
  generated.getContext("2d").fillStyle = "rgb(20,40,230)"; generated.getContext("2d").fillRect(0, 0, 1024, 1024);
  const context = vm.createContext({
    loadImage,
    detectLandmarks: async () => ({ w: 1000, h: 2000, pts: facePoints() }),
    document: { createElement: () => createCanvas(1, 1) },
  });
  vm.runInContext(source + ";globalThis.identity = IdentityEdit;", context);
  const prepared = await context.identity.prepare({ photos: { frontOrig: original.toDataURL("image/png") } });
  const inputImage = await loadImage(prepared.image), inputMask = await loadImage(prepared.mask);
  assert.match(prepared.image, /^data:image\/png;/);
  assert.match(prepared.mask, /^data:image\/png;/);
  assert.equal(inputImage.width, inputMask.width);
  assert.equal(inputImage.height, inputMask.height);
  const restored = await prepared.restore(generated.toDataURL("image/png"));
  const maskCanvas = createCanvas(1024, 1024), resultCanvas = createCanvas(1024, 1024);
  maskCanvas.getContext("2d").drawImage(await loadImage(prepared.mask), 0, 0);
  resultCanvas.getContext("2d").drawImage(await loadImage(restored), 0, 0);
  const pixel = (canvas, x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data];
  for (const [x, y] of [[461, 399], [512, 532], [512, 635]]) {
    assert.deepEqual(pixel(maskCanvas, x, y), [255, 255, 255, 255]);
    const actual = pixel(resultCanvas, x, y);
    assert.ok(Math.abs(actual[0] - 240) <= 5 && Math.abs(actual[1] - 30) <= 5 && Math.abs(actual[2] - 40) <= 5, `original central face pixel: ${actual}`);
  }
  for (const [x, y] of [[512, 100], [50, 800]]) {
    assert.equal(pixel(maskCanvas, x, y)[3], 0, "hair/background is editable and transparent in the protection mask");
    const actual = pixel(resultCanvas, x, y);
    assert.ok(Math.abs(actual[0] - 20) <= 5 && Math.abs(actual[1] - 40) <= 5 && Math.abs(actual[2] - 230) <= 5, `generated pixel outside face: ${actual}`);
  }
});
