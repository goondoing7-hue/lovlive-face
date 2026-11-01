import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = fileURLToPath(new URL("../", import.meta.url));
const library = JSON.parse(await readFile(path.join(root, "public", "hair", "library.json"), "utf8"));
const context = vm.createContext({});
vm.runInContext(await readFile(path.join(root, "public", "js", "lib.js"), "utf8"), context);
vm.runInContext(await readFile(path.join(root, "public", "js", "hair_picker.js"), "utf8"), context);
const picker = vm.runInContext("HairPicker", context);

test("photo candidates use all real references, prioritize the current face, and preserve the source list", async () => {
  const before = JSON.stringify(library);
  const photos = picker.candidates("round", library);
  assert.equal(photos.length, 68);
  const matching = library.filter(photo => photo.fromFace === "둥근형");
  assert.deepEqual(Array.from(photos.slice(0, matching.length), photo => photo.id), matching.map(photo => photo.id));
  assert.ok(photos.slice(0, matching.length).every(photo => photo.recommended));
  assert.equal(JSON.stringify(library), before);
  for (const photo of photos) await access(path.join(root, `${photo.id}.jpg`));
});

test("search combines photo metadata and length words without inventing recommendations", () => {
  const matches = picker.candidates("heart", library, { query: "미디엄 빌드펌" });
  assert.ok(matches.some(photo => photo.id === "h02"));
  assert.ok(matches.every(photo => photo.name.includes("빌드펌") || photo.curl === "빌드펌"));
  const recommended = picker.candidates("heart", library, { recommendedOnly: true });
  assert.equal(recommended.length, library.filter(photo => photo.fromFace === "하트형").length);
  assert.equal(picker.candidates("long", library, { recommendedOnly: true }).length, 0);
  assert.equal(picker.candidates("long", library).length, 68);
});

test("choosing a photo keeps its real name and reference together without replacing generated images", () => {
  const photo = library.find(item => item.id === "h02");
  const original = JSON.stringify(photo);
  const chosen = picker.choose(photo, "round");
  assert.equal(chosen.name, photo.name);
  assert.equal(chosen.ref, photo.id);
  assert.match(chosen.desc, /중간 기장/);
  assert.match(chosen.desc, /빌드펌/);
  assert.match(chosen.desc, /둥근 윤곽/);
  assert.match(chosen.prompt, /SECOND reference image/);
  assert.match(chosen.prompt, /미디엄 레이어드 빌드펌/);
  assert.deepEqual(Object.keys(chosen).sort(), ["desc", "name", "prompt", "ref"]);
  const item = { img: "customer-generated-photo", cands: ["customer-generated-photo"] };
  Object.assign(item, chosen);
  assert.equal(item.img, "customer-generated-photo");
  assert.deepEqual(item.cands, ["customer-generated-photo"]);
  assert.equal(JSON.stringify(photo), original);
});

test("cards have native keyboard buttons, selected state, real photo paths, and escaped text", () => {
  const markup = picker.renderCards([{ id: "h01", name: '<img src=x onerror="alert(1)">', fromFace: "하트형", length: "medium", curl: "C컬" }], { selectedId: "h01", faceKey: "heart" });
  assert.match(markup, /<button type="button"/);
  assert.match(markup, /data-hair-photo="h01"/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /src="hair\/h01\.jpg"/);
  assert.match(markup, /현재 얼굴형 자료/);
  assert.match(markup, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(markup, /<img src=x/);
  assert.match(picker.renderCards([]), /role="status"/);
});

test("invalid reference paths cannot be selected or rendered", () => {
  const invalid = { id: '../private" onclick="bad', name: "bad" };
  assert.throws(() => picker.choose(invalid, "round"), /다시 선택/);
  assert.equal(picker.candidates("round", [invalid]).length, 0);
  assert.doesNotMatch(picker.renderCards([invalid]), /data-hair-photo=/);
});
