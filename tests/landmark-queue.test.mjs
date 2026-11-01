import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../public/js/engine.js", import.meta.url), "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));
const result = (x, y) => ({ multiFaceLandmarks: [[{ x, y }]] });

function engine() {
  const instances = [], timers = new Map();
  let timerId = 0;
  class FakeFaceMesh {
    constructor() { this.sent = []; this.closed = false; instances.push(this); }
    setOptions(options) { this.options = options; }
    onResults(callback) { this.callback = callback; }
    reset() {}
    send({ image }) { this.sent.push(image); return this.sendError ? Promise.reject(this.sendError) : Promise.resolve(); }
    close() {
      this.closed = true;
      if (instances.indexOf(this) === 0) return Promise.reject(new Error("async close failure"));
      throw new Error("sync close failure");
    }
  }
  class FakeImage {
    set src(value) {
      this.source = value;
      [this.width, this.height] = value.split("x").map(Number);
      queueMicrotask(() => this.onload());
    }
  }
  const context = vm.createContext({
    FaceMesh: FakeFaceMesh, window: { FaceMesh: FakeFaceMesh }, Image: FakeImage,
    setTimeout(callback, delay) { assert.equal(delay, 30000); const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  vm.runInContext(source, context, { filename: "engine.js" });
  return {
    instances, timers,
    detect: source => context.detectLandmarks(source),
    expire() { assert.equal(timers.size, 1); timers.values().next().value(); },
  };
}

test("concurrent landmark requests send serially and retain each original image's dimensions", async () => {
  const e = engine();
  const first = e.detect("100x200"), second = e.detect("300x400");
  await flush();
  assert.equal(e.instances.length, 1);
  const fm = e.instances[0];
  assert.deepEqual(fm.sent.map(image => image.source), ["100x200"]);
  assert.equal(e.timers.size, 1);
  fm.callback(result(0.25, 0.5));
  assert.deepEqual(plain(await first), { w: 100, h: 200, pts: [[25, 100]] });
  await flush();
  assert.deepEqual(fm.sent.map(image => image.source), ["100x200", "300x400"]);
  fm.callback(result(0.5, 0.75));
  assert.deepEqual(plain(await second), { w: 300, h: 400, pts: [[150, 300]] });
  assert.equal(e.timers.size, 0, "successful results clear their timeout handles");
  assert.equal(fm.closed, false);
});

test("timeout and send failure discard old instances, ignore late results, and leave the queue usable", async () => {
  const e = engine();
  const first = e.detect("100x200"), second = e.detect("300x400");
  const failed = assert.rejects(first, /얼굴 인식 시간 초과/);
  await flush();
  const old = e.instances[0];
  e.expire();
  await failed;
  await flush();
  assert.equal(old.closed, true);
  assert.equal(e.instances.length, 2);
  const fresh = e.instances[1];
  let secondSettled = false;
  second.then(() => { secondSettled = true; });
  old.callback(result(0.99, 0.99));
  await flush();
  assert.equal(secondSettled, false, "a timed-out instance cannot resolve the next photograph");
  assert.equal(e.timers.size, 1);
  fresh.callback(result(0.2, 0.25));
  assert.deepEqual(plain(await second), { w: 300, h: 400, pts: [[60, 100]] });
  assert.equal(e.timers.size, 0);

  fresh.sendError = new Error("send failed");
  const third = e.detect("500x600"), fourth = e.detect("700x800");
  await assert.rejects(third, /send failed/);
  await flush();
  assert.equal(fresh.closed, true);
  assert.equal(e.instances.length, 3);
  fresh.callback(result(0.9, 0.9));
  e.instances[2].callback(result(0.1, 0.5));
  assert.deepEqual(plain(await fourth), { w: 700, h: 800, pts: [[70, 400]] });
  assert.equal(e.timers.size, 0, "failed sends also clear timeout handles");
});
