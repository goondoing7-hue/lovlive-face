/* 공유 임시저장: 인증된 API는 목록·저장 권한만 처리하고, 큰 작업 파일은 비공개 저장소로 직접 전송한다. */
const ProjectStore = (() => {
  const MAX_BYTES = 25 * 1024 * 1024;
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
  let post = null, fetchFile = null, maxBytes = MAX_BYTES;

  function fail(message, code, cause) {
    const error = new Error(message);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }
  function configure(options = {}) {
    if (options.apiPost !== undefined && typeof options.apiPost !== "function") throw new TypeError("apiPost must be a function");
    if (options.fetch !== undefined && typeof options.fetch !== "function") throw new TypeError("fetch must be a function");
    if (options.maxBytes !== undefined && (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0 || options.maxBytes > MAX_BYTES)) throw new TypeError("Invalid project size limit");
    post = options.apiPost || post;
    fetchFile = options.fetch || fetchFile;
    maxBytes = options.maxBytes || maxBytes;
    return api;
  }
  async function request(body) {
    const send = post || (typeof apiPost === "function" ? apiPost : null);
    if (!send) throw fail("저장소 연결이 준비되지 않았습니다. 화면을 새로고침해 주세요.", "NOT_CONFIGURED");
    try { return await send("/api/projects", body); }
    catch (error) {
      if (error?.status === 409 || /409|conflict|충돌|다른.*(?:저장|변경)|버전.*(?:불일치|변경)/i.test(error?.message || "")) {
        throw fail("다른 작업에서 이 임시저장본을 먼저 변경했습니다. 저장소에서 최신 작업을 다시 열거나, 새 작업으로 저장해 주세요.", "PROJECT_CONFLICT", error);
      }
      throw error;
    }
  }
  function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
  function validStep(value) { return Number.isInteger(value) && value >= 1 && value <= 9; }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(value + "T00:00:00Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }
  function checkId(id) {
    if (typeof id !== "string" || !UUID.test(id)) throw fail("저장된 작업의 번호가 올바르지 않습니다. 저장소 목록에서 다시 선택해 주세요.", "INVALID_PROJECT_ID");
    return id;
  }
  function invalidState(path) { throw fail(`작업 파일의 ${path} 값이 올바르지 않습니다. 원래 작업 파일을 확인해 주세요.`, "INVALID_PROJECT_STATE"); }
  function objectAt(value, path) { if (!isObject(value)) invalidState(path); }
  function numberAt(value, path, min = -1000000, max = 1000000) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) invalidState(path);
  }
  function optional(object, key, check, path) { if (Object.hasOwn(object, key)) check(object[key], `${path}.${key}`); }
  function numericObject(value, path, keys = null) {
    objectAt(value, path);
    for (const [key, entry] of Object.entries(value)) {
      if (keys && !keys.includes(key)) invalidState(path);
      numberAt(entry, `${path}.${key}`);
    }
  }
  function finiteJson(value, path = "작업", seen = new WeakSet()) {
    if (typeof value === "number" && !Number.isFinite(value)) invalidState(path);
    if (!value || typeof value !== "object") return;
    if (seen.has(value)) invalidState(path);
    seen.add(value);
    for (const [key, entry] of Object.entries(value)) if (!UNSAFE_KEYS.has(key)) finiteJson(entry, `${path}.${key}`, seen);
    seen.delete(value);
  }
  function point(value, path, nullable = false) {
    if (nullable && value === null) return;
    if (!Array.isArray(value) || value.length < 2 || value.length > 3) invalidState(path);
    value.forEach((coordinate, index) => numberAt(coordinate, `${path}.${index}`));
  }
  function points(value, path, nullable = false, minimum = 0, nullPoints = false) {
    if (nullable && value === null) return;
    if (!Array.isArray(value) || value.length < minimum || value.length > 2000) invalidState(path);
    value.forEach((entry, index) => point(entry, `${path}.${index}`, nullPoints));
  }
  function frame(value, path) {
    objectAt(value, path);
    optional(value, "zoom", (number, where) => numberAt(number, where, 0.001, 1000), path);
    for (const key of ["dx", "dy"]) optional(value, key, numberAt, path);
  }
  function landmark(value, path) {
    if (value === null) return;
    objectAt(value, path);
    for (const key of ["w", "h"]) optional(value, key, (number, where) => numberAt(number, where, 1, 100000), path);
    optional(value, "pts", (entries, where) => points(entries, where, false, 455), path);
  }
  function image(value, path) {
    if (value === null || value === "") return;
    if (typeof value !== "string") invalidState(path);
    const match = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(value);
    if (!match || match[2].length % 4 !== 0) invalidState(path);
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", bytes = [];
    let bits = 0, buffer = 0;
    for (const character of match[2].slice(0, 24)) {
      const digit = alphabet.indexOf(character); if (digit < 0) break;
      buffer = (buffer << 6) | digit; bits += 6;
      if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); }
    }
    const type = match[1].toLowerCase();
    const valid = type === "png" ? [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)
      : type === "webp" ? [82, 73, 70, 70].every((byte, index) => bytes[index] === byte) && [87, 69, 66, 80].every((byte, index) => bytes[index + 8] === byte)
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!valid) invalidState(path);
  }
  function images(value, path) {
    if (!Array.isArray(value)) invalidState(path);
    value.forEach((entry, index) => image(entry, `${path}.${index}`));
  }
  function choice(value, path, values, empty = false) {
    if (empty && (value === null || value === "")) return;
    if (typeof value !== "string" || !values.includes(value)) invalidState(path);
  }
  function validateState(state) {
    const faces = ["oval", "round", "heart", "square", "diamond", "hexagon", "long"];
    const colors = ["silver", "gold", "rosegold", "gunmetal", "brown", "black", "clear", "tortoise"];
    const metrics = ["aspect", "thirds", "eyes", "thirdsM", "thirdsL", "eyeGap", "eyeR", "eyePos", "nosePos", "mouthPos"];
    optional(state, "step", (value, path) => { if (!validStep(value)) invalidState(path); }, "작업");
    for (const key of ["name", "date", "memo"]) optional(state.client, key, (value, path) => { if (typeof value !== "string") invalidState(path); }, "client");
    if (state.client.date && !validDate(state.client.date)) invalidState("client.date");
    for (const key of ["front", "frontOrig"]) optional(state.photos, key, image, "photos");
    for (const section of ["front", "side", "ear"]) if (Object.hasOwn(state, section)) {
      const value = state[section]; objectAt(value, section);
      for (const key of ["w", "h"]) optional(value, key, (number, path) => numberAt(number, path, 0, 100000), section);
      optional(value, "frame", frame, section);
      optional(value, "rot", (number, path) => numberAt(number, path, -3600, 3600), section);
      optional(value, "zoom", (number, path) => numberAt(number, path, 0.001, 1000), section);
      optional(value, "src", image, section);
      optional(value, "lobe", (entry, path) => point(entry, path, true), section);
      optional(value, "earPt", (entry, path) => point(entry, path, true), section);
      optional(value, "pts", (entries, path) => points(entries, path, true, section === "front" ? 455 : 0, section !== "front"), section);
    }
    if (state.front?.lines !== undefined) {
      objectAt(state.front.lines, "front.lines");
      optional(state.front.lines, "h", (value, path) => numericObject(value, path, ["hair", "brow", "upLid", "lowLid", "sn", "stom", "lowLip", "chin"]), "front.lines");
      optional(state.front.lines, "v", (value, path) => numericObject(value, path, ["faceL", "eRo", "eRi", "eLi", "eLo", "faceR"]), "front.lines");
    }
    for (const key of ["ratios", "raw"]) if (state.front?.[key] != null) {
      objectAt(state.front[key], `front.${key}`);
      for (const [name, value] of Object.entries(state.front[key])) {
        if (!metrics.includes(name)) invalidState(`front.${key}`);
        if (Array.isArray(value)) value.forEach((number, index) => numberAt(number, `front.${key}.${name}.${index}`));
        else numberAt(value, `front.${key}.${name}`);
      }
    }
    if (state.type !== undefined) {
      objectAt(state.type, "type");
      optional(state.type, "key", (value, path) => choice(value, path, faces), "type");
      optional(state.type, "auto", (value, path) => choice(value, path, faces, true), "type");
      if (state.type.scores != null) numericObject(state.type.scores, "type.scores", faces);
      if (state.type.widths != null) numericObject(state.type.widths, "type.widths", ["fore", "jaw", "chin", "cheek"]);
    }
    if (state.side?.sel !== undefined && (!Array.isArray(state.side.sel) || state.side.sel.some(value => !Number.isInteger(value) || value < 0 || value > 30))) invalidState("side.sel");
    if (state.manual !== undefined) {
      objectAt(state.manual, "manual");
      for (const [key, value] of Object.entries(state.manual)) if (!metrics.includes(key) || !(typeof value === "number" && Number.isFinite(value)) && !(typeof value === "string" && /^[\d\s:：.\-+]*$/.test(value))) invalidState("manual");
    }
    if (state.settings !== undefined) {
      objectAt(state.settings, "settings");
      if (state.settings.thresholds !== undefined) numericObject(state.settings.thresholds, "settings.thresholds", ["long", "roundMax", "squareJaw", "heartFore", "heartJaw", "hexFore", "hexJaw"]);
      if (state.settings.calib !== undefined) {
        objectAt(state.settings.calib, "settings.calib");
        for (const [key, value] of Object.entries(state.settings.calib)) {
          if (!metrics.includes(key) || !Array.isArray(value) || value.length !== 2) invalidState("settings.calib");
          value.forEach((number, index) => numberAt(number, `settings.calib.${key}.${index}`));
        }
      }
      if (state.settings.overlay !== undefined) { objectAt(state.settings.overlay, "settings.overlay"); for (const value of Object.values(state.settings.overlay)) if (typeof value !== "boolean") invalidState("settings.overlay"); }
    }
    for (const kind of ["hair", "glasses", "earrings"]) if (state.texts[kind] !== undefined) {
      const section = state.texts[kind]; objectAt(section, `texts.${kind}`);
      if (section.items !== undefined) {
        if (!Array.isArray(section.items)) invalidState(`texts.${kind}.items`);
        section.items.forEach((item, index) => {
          const path = `texts.${kind}.items.${index}`; objectAt(item, path);
          optional(item, "img", image, path); optional(item, "cands", images, path);
          optional(item, "size", (number, where) => numberAt(number, where, 0.01, 100), path);
          for (const key of ["name", "desc", "prompt"]) optional(item, key, (value, where) => { if (typeof value !== "string") invalidState(where); }, path);
          for (const key of ["ref", "photoChoice"]) optional(item, key, (value, where) => { if (value !== null && value !== "" && !(typeof value === "string" && /^h\d+$/.test(value))) invalidState(where); }, path);
          optional(item, "color", (value, where) => choice(value, where, colors), path);
          if (kind !== "hair") optional(item, "shape", (value, where) => choice(value, where, kind === "glasses" ? ["round", "softSquare", "oval", "boston", "wellington", "cateye", "rimless", "hexa"] : ["stud", "pearl", "drop", "huggie", "hoop", "ovalHoop", "cluster"]), path);
        });
      }
      if (section.scales !== undefined) { if (!Array.isArray(section.scales) || section.scales.length !== 6) invalidState(`texts.${kind}.scales`); section.scales.forEach((number, index) => numberAt(number, `texts.${kind}.scales.${index}`, 0, 4)); }
    }
    const makeup = state.texts.makeup;
    if (makeup !== undefined) {
      objectAt(makeup, "texts.makeup");
      for (const key of ["fullImage", "guideImg"]) optional(makeup, key, image, "texts.makeup");
      optional(makeup, "cands", images, "texts.makeup"); optional(makeup, "guideLm", landmark, "texts.makeup");
      optional(makeup, "mode", (value, path) => choice(value, path, ["guide", "template", "image"]), "texts.makeup");
      if (makeup.guideCands !== undefined) {
        if (!Array.isArray(makeup.guideCands)) invalidState("texts.makeup.guideCands");
        makeup.guideCands.forEach((entry, index) => { const path = `texts.makeup.guideCands.${index}`; objectAt(entry, path); optional(entry, "img", image, path); optional(entry, "lm", landmark, path); });
      }
      if (makeup.sections !== undefined) {
        objectAt(makeup.sections, "texts.makeup.sections");
        for (const [key, section] of Object.entries(makeup.sections)) {
          objectAt(section, `texts.makeup.sections.${key}`);
          optional(section, "variant", (value, path) => { if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(value)) invalidState(path); }, `texts.makeup.sections.${key}`);
        }
      }
    }
  }
  function snapshot(state) {
    if (!isObject(state) || state.version !== 1 || !isObject(state.client) || !isObject(state.photos) || !isObject(state.texts)) {
      throw fail("작업 파일 형식을 읽을 수 없습니다. 현재 작업을 확인해 주세요.", "INVALID_PROJECT_STATE");
    }
    let clean;
    try {
      finiteJson(state);
      const apiSettings = state.settings?.api, imageSettings = state.settings?.img;
      clean = JSON.parse(JSON.stringify(state, function (key, value) {
        if (UNSAFE_KEYS.has(key)) return undefined;
        // 예전 버전에서 브라우저에 입력했던 키가 작업 파일에 함께 올라가지 않게 한다.
        if ((this === apiSettings || this === imageSettings) && /key|token|secret/i.test(key)) return "";
        return value;
      }));
    } catch (error) { if (error?.code === "INVALID_PROJECT_STATE") throw error; throw fail("작업 내용을 저장 파일로 만들 수 없습니다.", "INVALID_PROJECT_STATE", error); }
    validateState(clean);
    if (clean.step === undefined) clean.step = 1;
    return clean;
  }
  function projectMetadata(value) {
    if (!isObject(value) || !Number.isInteger(value.version) || value.version < 1 || !validStep(value.step)) {
      throw fail("저장소 응답 형식을 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.", "INVALID_PROJECT_RESPONSE");
    }
    return {
      id: checkId(value.id), name: String(value.name || "이름 없는 작업"),
      clientDate: String(value.clientDate || ""), step: value.step, version: value.version,
      createdAt: value.createdAt || null, updatedAt: value.updatedAt || null, updatedBy: String(value.updatedBy || ""),
    };
  }
  function signedUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") throw new Error("https required");
      return url.href;
    } catch { throw fail("비공개 저장소 연결 주소를 받지 못했습니다. 다시 시도해 주세요.", "INVALID_STORAGE_URL"); }
  }
  function network(url, options) {
    const send = fetchFile || (typeof fetch === "function" ? fetch : null);
    if (!send) throw fail("이 브라우저에서 저장소에 연결할 수 없습니다.", "NOT_CONFIGURED");
    return send(url, { credentials: "omit", referrerPolicy: "no-referrer", ...options });
  }
  function checkSize(bytes) {
    if (bytes > maxBytes) throw fail("작업 파일이 저장 한도(25MB)를 넘었습니다. 사용하지 않는 생성 후보 사진을 줄인 뒤 다시 저장해 주세요.", "PROJECT_TOO_LARGE");
  }

  async function list() {
    const response = await request({ action: "list" });
    if (!Array.isArray(response?.projects)) throw fail("저장소 목록을 읽을 수 없습니다. 다시 시도해 주세요.", "INVALID_PROJECT_RESPONSE");
    return response.projects.map(projectMetadata);
  }
  async function save(state, options = {}) {
    // 첫 await 전에 복제하므로 저장 중 사용자가 수정한 내용이 중간에 섞이지 않는다.
    const clean = snapshot(state);
    const id = options.id == null ? null : checkId(options.id);
    const expectedVersion = options.version ?? 0;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0 || (id === null && expectedVersion !== 0) || (id !== null && expectedVersion < 1)) {
      throw fail("저장본의 버전 정보가 없습니다. 저장소에서 작업을 다시 열어 주세요.", "INVALID_PROJECT_VERSION");
    }
    if (options.step !== undefined) {
      if (!validStep(options.step)) throw fail("저장할 작업 단계가 올바르지 않습니다.", "INVALID_PROJECT_STATE");
      clean.step = options.step;
    }
    if (!validDate(clean.client.date)) throw fail("진단일을 올바르게 입력한 뒤 임시저장해 주세요.", "INVALID_PROJECT_STATE");
    const file = new Blob([JSON.stringify(clean)], { type: "application/json" });
    checkSize(file.size);
    const prepared = await request({ action: "prepare", id, expectedVersion, bytes: file.size });
    const preparedId = checkId(prepared?.id), snapshotId = checkId(prepared?.snapshotId);
    if (id !== null && preparedId !== id) throw fail("저장할 작업 번호가 일치하지 않습니다. 다시 열어 확인해 주세요.", "INVALID_PROJECT_RESPONSE");
    const uploadUrl = signedUrl(prepared?.uploadUrl);
    let uploaded;
    try { uploaded = await network(uploadUrl, { method: "PUT", headers: { "Content-Type": "application/json" }, body: file }); }
    catch (error) { throw fail("임시저장 파일을 업로드하지 못했습니다. 인터넷 연결을 확인하고 다시 저장해 주세요.", "PROJECT_UPLOAD_FAILED", error); }
    if (!uploaded.ok) throw fail("임시저장 파일을 업로드하지 못했습니다. 인터넷 연결을 확인하고 다시 저장해 주세요.", "PROJECT_UPLOAD_FAILED");
    const response = await request({
      action: "complete", id: preparedId, snapshotId, expectedVersion,
      name: String(clean.client.name || "").trim().slice(0, 100) || "이름 없는 작업",
      clientDate: String(clean.client.date || ""), step: clean.step,
    });
    const project = projectMetadata(response?.project);
    if (project.id !== preparedId) throw fail("저장 완료 응답이 작업과 일치하지 않습니다. 저장소 목록을 확인해 주세요.", "INVALID_PROJECT_RESPONSE");
    return project;
  }
  async function get(id) {
    checkId(id);
    const response = await request({ action: "load", id });
    const project = projectMetadata(response?.project);
    if (project.id !== id) throw fail("불러올 작업 번호가 일치하지 않습니다. 목록에서 다시 선택해 주세요.", "INVALID_PROJECT_RESPONSE");
    const downloadUrl = signedUrl(response?.downloadUrl);
    let downloaded;
    try { downloaded = await network(downloadUrl, { headers: { Accept: "application/json" } }); }
    catch (error) { throw fail("임시저장 파일을 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.", "PROJECT_DOWNLOAD_FAILED", error); }
    if (!downloaded.ok) throw fail("임시저장 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "PROJECT_DOWNLOAD_FAILED");
    const length = Number(downloaded.headers?.get?.("content-length"));
    if (Number.isFinite(length)) checkSize(length);
    const text = await downloaded.text();
    checkSize(new Blob([text]).size);
    let state;
    try { state = JSON.parse(text); }
    catch (error) { throw fail("저장된 작업 파일이 손상되어 읽을 수 없습니다.", "INVALID_PROJECT_STATE", error); }
    state = snapshot(state);
    state.step = project.step;
    return { project, state };
  }
  const api = Object.freeze({ configure, save, list, get, sanitizeState: snapshot });
  return api;
})();
