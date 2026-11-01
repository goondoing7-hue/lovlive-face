import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const run = promisify(execFile);
const prepareScript = path.join(root, "dev", "prepare-hair.mjs");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

async function fixture(t, library) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "lovlive-face-image-test-"));
  t.after(async () => {
    // Only remove the uniquely created test directory inside the system temp directory.
    assert.equal(path.dirname(dir), path.resolve(os.tmpdir()));
    assert.ok(path.basename(dir).startsWith("lovlive-face-image-test-"));
    await rm(dir, { recursive: true, force: true });
  });
  await mkdir(path.join(dir, "dev"));
  await mkdir(path.join(dir, "public", "hair"), { recursive: true });
  await copyFile(prepareScript, path.join(dir, "dev", "prepare-hair.mjs"));
  await writeFile(path.join(dir, "public", "hair", "library.json"), JSON.stringify(library));
  return dir;
}

test("a fresh build publishes the referenced photos and preserves their originals", async t => {
  const dir = await fixture(t, [{ id: "h01" }, { id: "h02" }]);
  const images = [Buffer.from([0xff, 0xd8, 1, 0xff, 0xd9]), Buffer.from([0xff, 0xd8, 2, 0xff, 0xd9])];
  for (const [i, image] of images.entries()) await writeFile(path.join(dir, `h0${i + 1}.jpg`), image);
  await writeFile(path.join(dir, "h03.jpg"), "unlisted original");

  // Starting in another directory also checks that paths are based on the script location.
  await run(process.execPath, [path.join(dir, "dev", "prepare-hair.mjs")], { cwd: os.tmpdir() });

  for (const [i, image] of images.entries()) {
    assert.deepEqual(await readFile(path.join(dir, `h0${i + 1}.jpg`)), image);
    assert.deepEqual(await readFile(path.join(dir, "public", "hair", `h0${i + 1}.jpg`)), image);
  }
  assert.equal(await readFile(path.join(dir, "h03.jpg"), "utf8"), "unlisted original");
  await assert.rejects(access(path.join(dir, "public", "hair", "h03.jpg")), { code: "ENOENT" });
});

test("a missing source photo fails the build with its reference ID", async t => {
  const dir = await fixture(t, [{ id: "h99" }]);
  await assert.rejects(
    run(process.execPath, [path.join(dir, "dev", "prepare-hair.mjs")]),
    error => error.code !== 0 && /h99\.jpg/.test(error.stderr),
  );
});

test("the real build publishes every library reference without changing image bytes", async t => {
  await run(process.execPath, [prepareScript], { cwd: root });
  const library = JSON.parse(await readFile(path.join(root, "public", "hair", "library.json"), "utf8"));
  assert.ok(library.length > 0);
  for (const { id } of library) {
    const original = await readFile(path.join(root, `${id}.jpg`));
    const published = await readFile(path.join(root, "public", "hair", `${id}.jpg`));
    assert.equal(digest(published), digest(original), `${id}: published photo must match its original`);
  }
  t.diagnostic(`${library.length} reference photos are available and byte-identical`);
});

async function imageClient() {
  const requests = [];
  const loaded = [];
  const context = vm.createContext({
    IdentityEdit: {
      async prepare(state) {
        loaded.push(state.photos.frontOrig || state.photos.front);
        return { image: `data:image/jpeg;base64,${Buffer.from(state.photos.frontOrig || state.photos.front).toString("base64")}`, mask: "data:image/png;base64,cHJvdGVjdGVkLWZhY2U=", restore: async image => image };
      },
    },
    fetch: async () => ({ json: async () => [] }),
    apiPost: async (url, body) => {
      requests.push({ url, ...body });
      return { image: "data:image/jpeg;base64,b3V0cHV0", quality: body.quality, cost: 0.01 };
    },
    loadImage: async src => {
      loaded.push(src);
      if (src.startsWith("hair/")) {
        try { await access(path.join(root, "public", src)); }
        catch { throw { type: "error" }; } // Browser Image.onerror supplies an event, not an Error.
      }
      return { src, width: 800, height: 1200 };
    },
    document: {
      createElement() {
        let imageSource;
        return {
          getContext: () => ({ fillRect() {}, drawImage(image) { imageSource = image.src; } }),
          toDataURL: () => `data:image/jpeg;base64,${Buffer.from(imageSource).toString("base64")}`,
        };
      },
    },
  });
  vm.runInContext(await readFile(path.join(root, "public", "js", "mkguide.js"), "utf8"), context);
  vm.runInContext(await readFile(path.join(root, "public", "js", "ai_image.js"), "utf8"), context);
  const state = {
    photos: { front: "data:image/jpeg;base64,ZnJvbnQ=" },
    side: { src: "data:image/jpeg;base64,c2lkZQ==", w: 800, h: 1200 },
    ear: { zoom: 1 },
    texts: { makeup: { sections: { eye: { title: "눈", sub: "눈 메이크업", steps: ["아이라인"] } }, keyPoints: ["눈"], intro: "intro", head: "head" } },
  };
  return {
    requests, loaded, state,
    generate(kind, item = {}, options = {}) {
      context.testKind = kind;
      context.testState = state;
      context.testItem = item;
      context.testOptions = options;
      return vm.runInContext("generateAIImage(testKind, testState, testItem, testOptions)", context);
    },
  };
}

test("hair with a published reference reaches the image API with both photos", async () => {
  const client = await imageClient();
  for (const [mode, quality] of [["draft", "low"], ["final", "medium"]]) {
    await client.generate("hair", { name: "롱보브", desc: "레이어드", ref: "h01" }, { mode });
    const request = client.requests.at(-1);
    assert.equal(request.url, "/api/image");
    assert.equal(request.size, "1024x1024");
    assert.equal(request.quality, quality);
    assert.equal(request.images.length, 2);
    assert.notEqual(request.images[0], request.images[1]);
    assert.match(request.mask, /^data:image\/png;base64,/);
    assert.match(request.prompt, /SECOND image only as the hairstyle reference/);
  }
  assert.ok(client.loaded.includes("hair/h01.jpg"));
});

test("upgrading always keeps the original customer first, with drafts and hair references used only for design", async () => {
  const client = await imageClient();
  client.state.photos.frontOrig = "data:image/jpeg;base64,b3JpZ2luYWw=";
  for (const kind of ["hair", "glasses", "makeup"]) {
    await client.generate(kind, { name: "selected style", ref: "h01", shape: "round" }, { base: "data:image/jpeg;base64,ZHJhZnQ=", mode: "final" });
    const request = client.requests.at(-1);
    assert.equal(Buffer.from(request.images[0].split(",")[1], "base64").toString(), client.state.photos.frontOrig);
    assert.equal(Buffer.from(request.images[1].split(",")[1], "base64").toString(), "data:image/jpeg;base64,ZHJhZnQ=");
    assert.match(request.prompt, /FIRST image is the original customer and the ONLY identity source/);
    assert.match(request.prompt, /Never copy a changed face/);
    if (kind === "hair") { assert.equal(request.images.length, 3); assert.match(request.prompt, /THIRD image only as the hairstyle reference/); }
    else assert.equal(request.images.length, 2);
  }
});

test("partial makeup plans still instruct all ten areas and preserve the original pose and hairstyle", async () => {
  const client = await imageClient();
  client.state.texts.makeupGuide = { sections: [{ title: "눈썹 메이크업", sub: "기존 눈썹 유지", steps: ["빈 곳만 채우기"] }, { title: "아이섀도우", steps: ["얇은 음영"] }] };
  await client.generate("makeup");
  const request = client.requests.at(-1);
  for (const title of ["눈썹 메이크업", "아이섀도우", "아이라인", "언더 메이크업", "속눈썹 메이크업", "코 메이크업", "블러셔", "윤곽 셰이딩", "립 메이크업", "피부 표현"]) assert.ok(request.prompt.includes(title), title);
  assert.match(request.prompt, /original expression, gaze, eye openness, head angle, hairstyle/);
  assert.doesNotMatch(request.prompt, /hair tucked behind|eyes open looking at camera|plain warm light-ivory background/);
  await client.generate("hair", { name: "bob", ref: "h01" });
  assert.match(client.requests.at(-1).prompt, /do not crop, rotate, zoom, recenter or create a new portrait/);
  assert.doesNotMatch(client.requests.at(-1).prompt, /plain black top|plain light-gray background/);
});

test("a draft or reference can never substitute for a missing original customer photograph", async () => {
  const client = await imageClient(); client.state.photos = {};
  for (const kind of ["hair", "makeup", "makeupPoster", "glasses"]) await assert.rejects(client.generate(kind, { name: "style", ref: "h01" }, { base: "data:image/jpeg;base64,ZHJhZnQ=" }), /원본 정면 사진/);
  assert.equal(client.requests.length, 0);
});

test("a missing reference gives an actionable error before any paid API request", async () => {
  const client = await imageClient();
  await assert.rejects(
    client.generate("hair", { name: "style", ref: "h999999" }),
    error => /참고 헤어 사진\(h999999\)/.test(error.message) && /다시 선택하거나 해제/.test(error.message),
  );
  assert.equal(client.requests.length, 0);
});

test("the other existing photo-generation branches still reach the image API", async () => {
  const client = await imageClient();
  for (const kind of ["hair", "glasses", "earrings", "makeup", "makeupPoster"]) {
    await client.generate(kind, { name: "style", desc: "description", shape: "round" });
    const request = client.requests.at(-1);
    assert.equal(request.kind, kind);
    assert.equal(request.images.length, 1);
    assert.ok(request.prompt.length > 0);
    assert.equal(request.size, kind === "hair" || kind === "glasses" ? "1024x1024" : "1024x1536");
  }
});
