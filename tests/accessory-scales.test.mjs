import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(await readFile(new URL("../public/js/accessory_scales.js", import.meta.url), "utf8"), context);
const { recompute, markManual, clearManual } = context.AccessoryScales;
const snapshot = value => JSON.parse(JSON.stringify(value));
const defaults = { scales: [2, 2, 2, 2, 2, 2], scaleText: ["굵기", "크기", "길이", "폭", "볼륨", "장식"] };
const section = items => ({ items: snapshot(items), scales: defaults.scales.slice(), scaleText: defaults.scaleText.slice() });

test("earring kinds update the shared scale and descriptions immediately", () => {
  const s = section(Array.from({ length: 3 }, () => ({ shape: "stud", color: "gold", size: 1 })));
  recompute("earrings", s, defaults);
  const before = snapshot(s.scales);
  s.items[0].shape = "drop";
  recompute("earrings", s, defaults);
  assert.ok(s.scales[2] > before[2], "a drop adds length to the selected-design summary");
  assert.match(s.scaleText[2], /드롭/);
  assert.match(s.scaleText[2], /선택 기준/);
});

test("glasses material, colour, shape and size affect corresponding scales", () => {
  const s = section([{ shape: "rimless", color: "clear", size: 0.6 }]);
  recompute("glasses", s, defaults);
  const before = snapshot(s.scales);
  s.items[0] = { shape: "wellington", color: "black", size: 1.6, name: "웰링턴 뿔테" };
  recompute("glasses", s, defaults);
  for (const i of [0, 1, 2, 3, 4, 5]) assert.ok(s.scales[i] > before[i], `axis ${i} changes for the selected frame`);
  assert.match(s.scaleText[0], /웰링턴/);
});

test("manual slider values and manually typed descriptions survive type changes", () => {
  const s = section([{ shape: "stud", size: 1 }]);
  s.scales[2] = 4;
  s.scaleText[2] = "하영님이 직접 고친 설명";
  markManual(s, 2);
  markManual(s, 2, "text");
  recompute("earrings", s, defaults);
  s.items[0].shape = "huggie";
  recompute("earrings", s, defaults);
  assert.equal(s.scales[2], 4);
  assert.equal(s.scaleText[2], "하영님이 직접 고친 설명");
  const resumed = snapshot(s);
  recompute("earrings", resumed, defaults);
  assert.equal(resumed.scales[2], 4, "manual marks persist through saved-project JSON");
  assert.equal(resumed.scaleText[2], "하영님이 직접 고친 설명");
});

test("legacy edit/lock indices preserve previous manual edits without new metadata", () => {
  const s = section([{ shape: "drop", size: 1.2 }]);
  s.scales[0] = 0;
  s.scaleText[1] = "기존 프로젝트의 수동 문장";
  recompute("e", s, defaults, { manualIndices: [0], manualTextIndices: [1] });
  assert.equal(s.scales[0], 0);
  assert.equal(s.scaleText[1], "기존 프로젝트의 수동 문장");
  assert.equal(s.manualScales, undefined);
});

test("recalculation starts from the face baseline and never drifts", () => {
  const s = section([{ shape: "drop", size: 1.6 }, { shape: "hoop", size: 0.7 }, { shape: "pearl", size: 1 }]);
  recompute("earrings", s, defaults);
  const once = snapshot(s);
  for (let i = 0; i < 12; i++) recompute("earrings", s, defaults);
  assert.deepEqual(snapshot(s), once);
  assert.deepEqual(defaults.scales, [2, 2, 2, 2, 2, 2]);
  const alteredFace = { scales: [0, 0, 0, 0, 0, 0], scaleText: defaults.scaleText };
  recompute("earrings", s, alteredFace);
  assert.notDeepEqual(snapshot(s.scales), once.scales, "face-type baseline also remains part of the summary");
});

test("existing or partially populated projects fall back safely and preserve unrelated data", () => {
  const s = { items: [{ shape: "unknown", size: null }, null], img: "existing-photo", formula: "기존 공식" };
  recompute("g", s, defaults);
  assert.deepEqual(snapshot(s.scales), defaults.scales);
  assert.deepEqual(snapshot(s.scaleText), defaults.scaleText);
  assert.equal(s.img, "existing-photo");
  assert.equal(s.formula, "기존 공식");
  assert.deepEqual(snapshot(s.items), [{ shape: "unknown", size: null }, null]);
  recompute("earrings", { items: [{ shape: "hoop", size: NaN }] }, {});
});

test("clearing a manual override restores only the requested automatic axes", () => {
  const s = section([{ shape: "stud", size: 1 }]);
  s.scales[0] = 4; s.scales[2] = 4;
  markManual(s, 0); markManual(s, 2); markManual(s, 2, "text");
  clearManual(s, 2);
  recompute("earrings", s, defaults);
  assert.equal(s.scales[0], 4);
  assert.ok(s.scales[2] < 4);
  clearManual(s);
  recompute("earrings", s, defaults);
  assert.ok(s.scales[0] < 4);
  assert.throws(() => markManual(s, 6), /올바르지/);
});
