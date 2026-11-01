import { randomUUID } from "node:crypto";

export const PROJECT_BUCKET = "lovlive-face-drafts";
export const PROJECT_TABLE = "lovlive_face_projects";
export const MAX_PROJECT_BYTES = 25 * 1024 * 1024;
const COLUMNS = "id,name,client_date,step,version,snapshot_path,created_by,updated_by,created_at,updated_at";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONFLICT = "다른 작업자가 이 작업을 먼저 저장했습니다. 저장소에서 최신 작업을 다시 열거나 새 작업으로 저장해 주세요.";

class ProjectError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new ProjectError(status, message); };
const backendFailure = () => fail(503, "공용 저장소에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");

let sharedClient;
export async function createProjectClient() {
  if (sharedClient) return sharedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) fail(503, "공용 저장소 설정이 준비되지 않았습니다. 관리자에게 확인해 주세요.");
  const { createClient } = await import("@supabase/supabase-js");
  sharedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return sharedClient;
}

function uuid(value) {
  if (typeof value !== "string" || !UUID.test(value)) fail(400, "작업 번호가 올바르지 않습니다.");
  return value.toLowerCase();
}
function expectedVersion(value) {
  if (!Number.isInteger(value) || value < 0 || value >= 2147483647) fail(400, "저장 버전이 올바르지 않습니다.");
  return value;
}
function date(value) {
  if (typeof value !== "string" || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, "진단일이 올바르지 않습니다.");
  const parsed = new Date(value + "T00:00:00Z");
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail(400, "진단일이 올바르지 않습니다.");
  return value;
}
function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "저장 요청 형식이 올바르지 않습니다.");
  const allowed = {
    list: ["action"], load: ["action", "id"],
    prepare: ["action", "id", "expectedVersion", "bytes"],
    complete: ["action", "id", "snapshotId", "expectedVersion", "name", "clientDate", "step"],
  };
  if (!Object.hasOwn(allowed, body.action) || Object.keys(body).some(key => !allowed[body.action].includes(key))) fail(400, "지원하지 않는 저장 요청입니다.");
  const input = { action: body.action };
  if (body.action === "list") return input;
  if (body.action === "load") return { ...input, id: uuid(body.id) };
  input.expectedVersion = expectedVersion(body.expectedVersion);
  if (body.action === "prepare") {
    input.id = body.id == null ? null : uuid(body.id);
    if (input.id == null && input.expectedVersion !== 0) fail(400, "새 작업의 저장 버전이 올바르지 않습니다.");
    if (!Number.isInteger(body.bytes) || body.bytes <= 0 || body.bytes > MAX_PROJECT_BYTES) fail(400, "임시저장은 최대 25MB까지 가능합니다. 이미지 후보를 정리한 뒤 다시 시도해 주세요.");
    return { ...input, bytes: body.bytes };
  }
  if (typeof body.name !== "string" || body.name.length > 100) fail(400, "고객 이름은 100자 이내로 입력해 주세요.");
  if (!Number.isInteger(body.step) || body.step < 1 || body.step > 9) fail(400, "작업 단계가 올바르지 않습니다.");
  return { ...input, id: uuid(body.id), snapshotId: uuid(body.snapshotId), name: body.name.trim() || "이름 없음", clientDate: date(body.clientDate), step: body.step };
}

function metadata(row) {
  return { id: row.id, name: row.name, clientDate: row.client_date, step: row.step, version: row.version,
    createdAt: row.created_at, updatedAt: row.updated_at, updatedBy: row.updated_by };
}
async function findProject(client, id) {
  const { data, error } = await client.from(PROJECT_TABLE).select(COLUMNS).eq("id", id).maybeSingle();
  if (error) backendFailure();
  return data;
}
function ensureVersion(row, version) {
  if ((row ? row.version : 0) !== version) fail(409, CONFLICT);
}
function snapshotPath(id, snapshotId) { return `${id}/${snapshotId}.json`; }
function ensureStoredPath(row) {
  if (typeof row.snapshot_path !== "string" || !row.snapshot_path.startsWith(row.id + "/")) backendFailure();
  const filename = row.snapshot_path.slice(row.id.length + 1);
  if (!filename.endsWith(".json") || !UUID.test(filename.slice(0, -5))) backendFailure();
  return row.snapshot_path;
}

async function handleAction(client, input, user, now, newId) {
  const bucket = () => client.storage.from(PROJECT_BUCKET);
  if (input.action === "list") {
    const { data, error } = await client.from(PROJECT_TABLE).select(COLUMNS).order("updated_at", { ascending: false }).limit(1000);
    if (error) backendFailure();
    return { projects: (data || []).map(metadata) };
  }
  if (input.action === "load") {
    const row = await findProject(client, input.id);
    if (!row) fail(404, "저장된 작업을 찾을 수 없습니다.");
    const { data, error } = await bucket().createSignedUrl(ensureStoredPath(row), 60);
    if (error || !data?.signedUrl) backendFailure();
    return { project: metadata(row), downloadUrl: data.signedUrl };
  }
  if (input.action === "prepare") {
    const id = input.id || uuid(newId());
    const row = input.id ? await findProject(client, id) : null;
    ensureVersion(row, input.expectedVersion);
    const snapshotId = uuid(newId());
    const { data, error } = await bucket().createSignedUploadUrl(snapshotPath(id, snapshotId), { upsert: false });
    if (error || !data?.signedUrl) backendFailure();
    return { id, snapshotId, uploadUrl: data.signedUrl };
  }

  const row = await findProject(client, input.id);
  ensureVersion(row, input.expectedVersion);
  const path = snapshotPath(input.id, input.snapshotId);
  const filename = `${input.snapshotId}.json`;
  const listed = await bucket().list(input.id, { search: filename, limit: 2 });
  if (listed.error) backendFailure();
  const file = listed.data?.find(item => item.name === filename && item.id != null);
  if (!file) fail(400, "업로드가 끝나지 않았습니다. 임시저장을 다시 시도해 주세요.");
  const size = Number(file.metadata?.size);
  const mime = file.metadata?.mimetype || file.metadata?.contentType;
  if (!Number.isFinite(size) || size <= 0 || size > MAX_PROJECT_BYTES || typeof mime !== "string" || mime.split(";")[0].trim().toLowerCase() !== "application/json") {
    fail(400, "업로드된 작업 파일 형식 또는 크기가 올바르지 않습니다.");
  }
  const updated = { name: input.name, client_date: input.clientDate, step: input.step,
    version: input.expectedVersion + 1, snapshot_path: path, updated_by: user.email, updated_at: now() };
  let result;
  if (row) {
    result = await client.from(PROJECT_TABLE).update(updated).eq("id", input.id).eq("version", input.expectedVersion).select(COLUMNS);
    if (!result.error && !result.data?.length) fail(409, CONFLICT);
  } else {
    result = await client.from(PROJECT_TABLE).insert({ ...updated, id: input.id, created_by: user.email, created_at: updated.updated_at }).select(COLUMNS);
  }
  if (result.error?.code === "23505") fail(409, CONFLICT);
  if (result.error || !result.data?.[0]) backendFailure();
  return { project: metadata(result.data[0]) };
}

function defaultSend(res, code, body) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

export function createProjectsHandler({ authorize, getClient = createProjectClient, readBody = async req => req.body,
  send = defaultSend, now = () => new Date().toISOString(), newId = randomUUID } = {}) {
  if (typeof authorize !== "function") throw new TypeError("Project authorization is required.");
  return async function projectsHandler(req, res) {
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: "POST only" }); }
    try {
      const user = await authorize(req);
      if (!user || typeof user.email !== "string" || !user.email) fail(403, "공용 저장소 접근 권한이 없습니다.");
      let body;
      try { body = await readBody(req); } catch { fail(400, "저장 요청 형식이 올바르지 않습니다."); }
      const input = validate(body);
      const client = await getClient();
      return send(res, 200, await handleAction(client, input, user, now, newId));
    } catch (error) {
      if (error instanceof ProjectError) return send(res, error.status, { error: error.message });
      if (error?.code === 401) return send(res, 401, { error: "로그인이 필요합니다. 다시 로그인해 주세요." });
      if (error?.code === 403) return send(res, 403, { error: "공용 저장소 접근 권한이 없습니다." });
      return send(res, 503, { error: "공용 저장소를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요." });
    }
  };
}
