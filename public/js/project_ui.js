/* 공용 저장소와 명시적 임시저장. 기기 내 자동 복구 저장은 기존 autosave가 담당한다. */
const DraftUI = (() => {
  const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
  let serial = 0, dirty = false, saving = null, loading = false, lastError = null, initialized = false;
  let libraryDialog = null;
  const dialogs = [];

  function activeLink() {
    const link = st?.projectLink;
    return link && UUID.test(link.id || "") && Number.isInteger(link.version) && link.version > 0 ? link : null;
  }
  function meaningful() {
    if (!st) return false;
    return !!(String(st.client?.name || "").trim() || String(st.client?.memo || "").trim() ||
      st.photos?.front || st.photos?.frontOrig || st.side?.src || st.ear?.src || st.analyzed ||
      st.edited?.length || st.costs?.length || Object.values(st.manual || {}).some(value => String(value || "").trim()));
  }
  function dateTime(value, short = false) {
    const date = new Date(value);
    if (!value || Number.isNaN(date.getTime())) return "시간 정보 없음";
    return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", ...(short ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : { dateStyle: "short", timeStyle: "short" }) }).format(date);
  }
  function updateStatus() {
    const status = $("#draftStatus"), link = activeLink();
    const state = saving ? "saving" : loading ? "loading" : lastError ? "error" : dirty && meaningful() ? "dirty" : link ? "saved" : "local";
    const message = state === "saving" ? "공용 저장소에 임시저장 중…" : state === "loading" ? "저장한 작업을 여는 중…" : state === "error" ? "임시저장 실패 · 다시 시도" : state === "dirty" ? "변경사항 · 임시저장 필요" : state === "saved" ? `공용 임시저장 ${dateTime(link.savedAt, true)}` : "공용 임시저장 전";
    if (status) {
      status.textContent = message;
      status.dataset.state = state;
      status.title = lastError?.message || (link?.savedAt ? `마지막 공용 저장: ${dateTime(link.savedAt)} (한국 시간)` : "임시저장하면 두 계정과 다른 PC에서 이어서 열 수 있습니다.");
    }
    const saveButton = $("#tbDraftSave"), libraryButton = $("#tbDraftLibrary");
    if (saveButton) { saveButton.disabled = !!saving || loading; saveButton.textContent = saving ? "임시저장 중…" : "임시저장"; }
    if (libraryButton) libraryButton.disabled = !!saving || loading;
  }
  function resetRefresh() {
    if (typeof _rq === "undefined") return;
    clearTimeout(_rq.t); _rq.t = null; _rq.scopes.clear(); _rq.notes = [];
    if (typeof refreshBadge === "function") refreshBadge();
  }
  function changed() {
    serial++; dirty = true; lastError = null;
    if (activeLink()) st.projectLink.localChanges = true;
    updateStatus();
  }
  function loaded(options = {}) {
    serial++;
    const link = activeLink();
    dirty = options.clean === true ? false : meaningful() && (!link || link.localChanges === true);
    if (link) link.localChanges = dirty;
    else if (st?.projectLink) delete st.projectLink;
    lastError = null; resetRefresh(); updateStatus();
  }
  function aiWorking() {
    return (typeof activeAIRequests !== "undefined" && activeAIRequests > 0) ||
      (typeof _rq !== "undefined" && _rq.running) || !!document.querySelector(".busy");
  }
  function canSwitch() {
    if (saving || loading) { toast("임시저장·불러오기가 끝난 뒤 작업을 바꿔 주세요."); return false; }
    if (aiWorking()) { toast("AI 분석이나 사진 생성이 끝난 뒤 작업을 바꿔 주세요.", 5000); return false; }
    return true;
  }
  async function save(options = {}) {
    if (saving) return saving;
    if (!st || loading) throw new Error("작업을 불러온 뒤 임시저장해 주세요.");
    const state = st, capturedSerial = serial, link = activeLink();
    const saveOptions = options.asNew ? { step: state.step } : { id: link?.id, version: link?.version, step: state.step };
    const task = (async () => {
      try {
        const project = await ProjectStore.save(state, saveOptions);
        if (st === state) {
          dirty = serial !== capturedSerial;
          state.projectLink = { id: project.id, version: project.version, savedAt: project.updatedAt, localChanges: dirty };
          lastError = null; autosave({ quiet: true });
        }
        toast(`${esc(project.name || "이름 없는 작업")} 작업을 공용 저장소에 임시저장했어요.`, 4500);
        return project;
      } catch (error) {
        if (st === state) { dirty = true; lastError = error; if (activeLink()) st.projectLink.localChanges = true; }
        toast("임시저장 실패: " + esc(error.message || "잠시 후 다시 시도해 주세요."), 7000);
        throw error;
      } finally { saving = null; updateStatus(); }
    })();
    saving = task; updateStatus();
    return task;
  }

  function modal(title, intro, options = {}) {
    const previousFocus = document.activeElement;
    const overlay = document.createElement("div"); overlay.className = "draft-modal";
    const titleId = "draft-dialog-" + Math.random().toString(36).slice(2);
    overlay.innerHTML = `<section class="draft-dialog ${options.small ? "draft-dialog-small" : ""}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1"><header class="draft-dialog-header"><div><h2 id="${titleId}">${esc(title)}</h2><p>${esc(intro)}</p></div><button type="button" class="draft-close" aria-label="닫기">×</button></header><div class="draft-dialog-content"></div></section>`;
    document.body.appendChild(overlay);
    const box = $(".draft-dialog", overlay), content = $(".draft-dialog-content", overlay), closeButton = $(".draft-close", overlay);
    const item = { overlay, box, content, closed: false, busy: false, close };
    function close() {
      if (item.closed || item.busy) return;
      item.closed = true; overlay.remove();
      const index = dialogs.indexOf(item); if (index >= 0) dialogs.splice(index, 1);
      document.removeEventListener("keydown", keydown);
      if (previousFocus?.isConnected && typeof previousFocus.focus === "function") previousFocus.focus();
      else dialogs.at(-1)?.box.focus();
      options.onClose?.();
    }
    function keydown(event) {
      if (dialogs.at(-1) !== item) return;
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab") return;
      const focusable = [...box.querySelectorAll('button:not([disabled]),input:not([disabled]),a[href],[tabindex="0"]')].filter(element => !element.hidden);
      if (!focusable.length) { event.preventDefault(); box.focus(); return; }
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === box)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    dialogs.push(item); document.addEventListener("keydown", keydown);
    closeButton.onclick = close;
    overlay.onclick = event => { if (event.target === overlay) close(); };
    box.focus();
    return item;
  }
  function dialogBusy(dialog, value) {
    dialog.busy = value;
    dialog.box.setAttribute("aria-busy", String(value));
    $$("button", dialog.box).forEach(button => { button.disabled = value; });
  }
  async function beforeSwitch() {
    if (!canSwitch()) return false;
    if (!dirty || !meaningful()) return true;
    return new Promise(resolve => {
      let answer = false;
      const dialog = modal("작업을 바꾸기 전에", "현재 변경사항이 공용 저장소에 임시저장되지 않았습니다.", { small: true, onClose: () => resolve(answer) });
      dialog.content.innerHTML = `<p class="draft-switch-note">임시저장하면 사진·생성 후보·수정 문장과 현재 단계까지 다른 PC에서 이어서 열 수 있습니다.</p><p class="draft-inline-error" role="alert" hidden></p><div class="draft-actions"><button type="button" class="btn pri" data-draft-choice="save">임시저장 후 열기</button><button type="button" class="btn" data-draft-choice="discard">저장하지 않고 열기</button><button type="button" class="btn ghost" data-draft-choice="cancel">취소</button></div>`;
      const errorBox = $(".draft-inline-error", dialog.content);
      $$("[data-draft-choice]", dialog.content).forEach(button => button.onclick = async () => {
        const choice = button.dataset.draftChoice;
        if (choice === "cancel") { dialog.close(); return; }
        if (!canSwitch()) return;
        if (choice === "discard") { answer = true; dialog.close(); return; }
        dialogBusy(dialog, true); errorBox.hidden = true;
        try {
          await save();
          if (dirty) throw new Error("저장 중 변경된 내용이 있습니다. 한 번 더 임시저장한 뒤 열어 주세요.");
          if (aiWorking()) throw new Error("AI 처리가 끝난 뒤 작업을 열어 주세요.");
          answer = true;
        } catch (error) { errorBox.textContent = error.message || "임시저장에 실패했습니다. 현재 작업은 그대로 유지됩니다."; errorBox.hidden = false; }
        finally { dialogBusy(dialog, false); if (answer) dialog.close(); }
      });
      $("[data-draft-choice=save]", dialog.content).focus();
    });
  }
  function stepLabel(step) {
    const item = typeof STEPS !== "undefined" ? STEPS.find(value => value.n === step) : null;
    return `${step}단계${item ? " · " + item.t : ""}`;
  }
  async function library() {
    if (libraryDialog && !libraryDialog.closed) { libraryDialog.box.focus(); return; }
    const dialog = modal("저장소", "공용 저장소 · 두 계정에서 이어서 작업", { onClose: () => { libraryDialog = null; } });
    libraryDialog = dialog;
    dialog.content.innerHTML = `<div class="draft-library-tools"><label class="draft-search-label">고객 이름으로 찾기<input type="search" class="draft-search" placeholder="고객 이름 검색" autocomplete="off"></label><button type="button" class="btn" data-draft-refresh>새로고침</button></div><div class="draft-library-list" aria-live="polite"></div><footer class="draft-library-footer"><p>사진·생성 후보·수정 문장·작업 단계가 함께 저장됩니다. 다른 PC에서는 로그인 후 이 목록에서 열어 주세요.</p><div class="draft-actions"><button type="button" class="btn pri" data-draft-save-current>현재 작업 임시저장</button>${activeLink() ? `<button type="button" class="btn" data-draft-save-copy>새 사본으로 임시저장</button>` : ""}</div></footer>`;
    const list = $(".draft-library-list", dialog.content), search = $(".draft-search", dialog.content);
    let projects = [], refreshSerial = 0;
    function renderRows() {
      const query = search.value.trim().toLocaleLowerCase("ko-KR");
      const rows = projects.filter(project => project.name.toLocaleLowerCase("ko-KR").includes(query));
      if (!rows.length) { list.innerHTML = `<div class="draft-empty">${query ? "검색한 이름의 작업이 없습니다." : "아직 임시저장한 작업이 없습니다. 현재 작업에서 임시저장을 눌러 첫 작업을 남겨 보세요."}</div>`; return; }
      list.innerHTML = rows.map(project => `<article class="draft-item"><div class="draft-item-info"><h3>${esc(project.name)}${activeLink()?.id === project.id ? `<span class="draft-current">현재 작업</span>` : ""}</h3><p>진단일 ${esc(project.clientDate || "미입력")} · ${esc(stepLabel(project.step))}</p><p class="draft-item-time">마지막 저장 ${esc(dateTime(project.updatedAt))} (한국 시간)</p>${project.updatedBy ? `<p class="draft-item-owner">저장자 ${esc(project.updatedBy)}</p>` : ""}</div><button type="button" class="btn" data-draft-open="${esc(project.id)}" aria-label="${esc(project.name)} 작업 이어서 열기">이어서 작업</button></article>`).join("");
      $$("[data-draft-open]", list).forEach(button => button.onclick = () => openProject(button.dataset.draftOpen));
    }
    async function refresh() {
      const requestSerial = ++refreshSerial;
      list.innerHTML = '<div class="draft-empty" role="status">공용 저장소를 불러오는 중…</div>';
      try {
        const result = await ProjectStore.list();
        if (dialog.closed || requestSerial !== refreshSerial) return;
        projects = result.slice().sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        renderRows();
      } catch (error) {
        if (dialog.closed || requestSerial !== refreshSerial) return;
        list.innerHTML = `<div class="draft-library-error" role="alert"><p>${esc(error.message || "저장소를 불러오지 못했습니다.")}</p><button type="button" class="btn" data-draft-retry>다시 시도</button></div>`;
        $("[data-draft-retry]", list).onclick = refresh;
      }
    }
    async function openProject(id) {
      if (!await beforeSwitch() || dialog.closed || !canSwitch()) return;
      loading = true; dialogBusy(dialog, true); updateStatus();
      const previousState = st;
      const previousFlags = { serial, dirty, lastError };
      const previousRefresh = typeof _rq !== "undefined" ? { scopes: [..._rq.scopes], notes: _rq.notes.slice() } : null;
      let restored = null;
      // 대기 중인 이전 작업의 AI 갱신이 다운로드 도중 실행되지 않게 잠시 멈춘다.
      if (typeof _rq !== "undefined") { clearTimeout(_rq.t); _rq.t = null; }
      list.innerHTML = '<div class="draft-empty" role="status">사진과 작업 내용을 불러오는 중…</div>';
      try {
        const result = await ProjectStore.get(id);
        restored = deepMerge(newState(), result.state);
        restored.projectLink = { id: result.project.id, version: result.project.version, savedAt: result.project.updatedAt, localChanges: false };
        // 요청 중 프로그램 밖에서 작업이 교체되었다면 새 작업을 덮어쓰지 않는다.
        if (st !== previousState) throw new Error("현재 작업이 바뀌었습니다. 저장소에서 다시 열어 주세요.");
        resetRefresh(); st = restored; updateRatios(); goStep(result.project.step); loaded({ clean: true }); autosave({ quiet: true });
        toast(`${esc(result.project.name)} 작업을 이어서 엽니다.`, 4000);
        loading = false; dialogBusy(dialog, false); dialog.close();
      } catch (error) {
        if (st === restored) {
          st = previousState;
          try { updateRatios(); goStep(previousState.step || 1); } catch (restoreError) { console.error(restoreError); }
          serial = previousFlags.serial; dirty = previousFlags.dirty; lastError = previousFlags.lastError;
        }
        if (st === previousState && previousRefresh) {
          _rq.scopes.clear(); previousRefresh.scopes.forEach(scope => _rq.scopes.add(scope)); _rq.notes = previousRefresh.notes;
          if (_rq.notes.length && st.settings?.autoRefresh !== false && typeof runRefresh === "function") _rq.t = setTimeout(runRefresh, 1200);
          refreshBadge();
        }
        list.innerHTML = `<div class="draft-library-error" role="alert"><p>${esc(error.message || "작업을 불러오지 못했습니다.")}</p><p>현재 작업은 그대로 유지됩니다.</p><button type="button" class="btn" data-draft-retry>목록 다시 보기</button></div>`;
        $("[data-draft-retry]", list).onclick = refresh;
      } finally { loading = false; dialogBusy(dialog, false); updateStatus(); }
    }
    async function saveFromLibrary(asNew) {
      dialogBusy(dialog, true);
      try { await save({ asNew }); await refresh(); }
      catch (error) { list.innerHTML = `<div class="draft-library-error" role="alert"><p>${esc(error.message)}</p><p>현재 작업은 그대로 유지됩니다.</p></div>`; }
      finally { dialogBusy(dialog, false); }
    }
    $("[data-draft-refresh]", dialog.content).onclick = refresh;
    $("[data-draft-save-current]", dialog.content).onclick = () => saveFromLibrary(false);
    const copy = $("[data-draft-save-copy]", dialog.content); if (copy) copy.onclick = () => saveFromLibrary(true);
    search.oninput = renderRows;
    await refresh();
  }
  function init() {
    if (initialized) return;
    initialized = true;
    ProjectStore.configure({ apiPost: (url, body) => apiPost(url, body), fetch: (url, options) => fetch(url, options) });
    const status = $("#draftStatus"); if (status) { status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); }
    const saveButton = $("#tbDraftSave"), libraryButton = $("#tbDraftLibrary");
    if (saveButton) saveButton.onclick = () => save().catch(() => {});
    if (libraryButton) libraryButton.onclick = () => library().catch(error => toast("저장소 오류: " + esc(error.message), 6000));
    loaded();
  }
  return Object.freeze({ init, changed, loaded, beforeSwitch, save, library });
})();
