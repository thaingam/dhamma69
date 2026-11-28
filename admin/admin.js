// หน้า admin — จัดการห้องสอบ นักเรียน กรรมการ แผนผัง ประกาศ และข้อมูลการสอบ
import { app, db, ADMIN_EMAIL, COL_ROOMS, COL_SITE } from '../assets/js/firebase.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-auth.js';
import {
  collection, doc, onSnapshot, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp,
  getDocs, query, orderBy,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import {
  th, toArabic, formatNo, LEVELS, STAGES, LEVEL_COLOR, roomTitle, roomShort, roomPinLabel,
  locationText, sortRooms, fullName, escapeHtml as h, safeImageUrl, computeStats, normalize,
  DEFAULT_MAP_URL, cloudinaryVariant,
} from '../assets/js/utils.js';
import { FLOORPLANS, findPlan, effectiveLocation } from '../assets/js/floorplans.js';
import {
  DEFAULT_QUOTES, DEFAULT_INTERVAL, parseQuoteLines, quoteLines, effectiveQuotes,
} from '../assets/js/quotes.js';
import {
  COL_SURVEYS, GROUPS, SECTIONS, QUESTIONS, levelOf, meanSd,
} from '../assets/js/survey-questions.js';

const auth = getAuth(app);
const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  rooms: new Map(),      // id → room (จาก Firestore)
  config: null,
  committee: null,
  tab: 'rooms',
  editId: null,          // ห้องที่กำลังแก้
  draft: null,           // สำเนาที่กำลังแก้
  dirty: false,
  studentFilter: '',
  unsub: [],
  loaded: { rooms: false, config: false, committee: false },
};

const PREFIX_OPTIONS = ['เด็กชาย', 'เด็กหญิง', 'นาย', 'นางสาว', 'นาง'];
const ROLE_OPTIONS = ['หัวหน้า', 'ผู้ช่วย', 'กรรมการ'];

/* ------------------------------------------------------------------ ทั่วไป */

function toast(msg, type = 'ok') {
  const box = $('#toast');
  const el = document.createElement('div');
  const tone = type === 'error' ? 'bg-red-600 text-white' : type === 'warn' ? 'bg-gold-300 text-navy-950' : 'bg-navy-900 text-white';
  el.className = `pointer-events-auto rounded-xl px-4 py-3 text-sm font-semibold shadow-xl ${tone}`;
  el.textContent = msg;
  box.replaceChildren(el);
  setTimeout(() => el.remove(), 3500);
}

function errText(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return 'ไม่มีสิทธิ์บันทึก — ตรวจสอบว่า publish firestore.rules แล้ว และล็อกอินด้วยอีเมลผู้ดูแล';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (code.includes('too-many-requests')) return 'ลองผิดหลายครั้งเกินไป กรุณารอสักครู่';
  if (code.includes('network')) return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้';
  return err?.message || String(err);
}

function show(view) {
  for (const id of ['loginView', 'deniedView', 'loadingView', 'appView']) $('#' + id).classList.toggle('hidden', id !== view);
  const inApp = view === 'appView';
  $('#tabs').classList.toggle('hidden', !inApp);
  $('#tabs').classList.toggle('flex', inApp);
}

const roomsSorted = () => sortRooms([...state.rooms.values()]);
const clone = (o) => JSON.parse(JSON.stringify(o));
const roomRef = (id) => doc(db, COL_ROOMS, id);
const siteRef = (id) => doc(db, COL_SITE, id);

function roomPayload(room) {
  const { id, updatedAt, ...rest } = room;
  rest.students = [...(rest.students || [])].sort((a, b) => a.no.localeCompare(b.no));
  return { ...rest, updatedAt: serverTimestamp() };
}

function levelBadge(room) {
  const c = LEVEL_COLOR[room.level];
  return `<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold" style="background:${c.bg};color:${c.fg}">${h(roomPinLabel(room))}</span>`;
}

/* ------------------------------------------------------------------ ล็อกอิน */

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btnLogin');
  btn.disabled = true;
  $('#loginError').classList.add('hidden');
  try {
    await signInWithEmailAndPassword(auth, $('#email').value.trim(), $('#password').value);
  } catch (err) {
    $('#loginError').textContent = errText(err);
    $('#loginError').classList.remove('hidden');
  } finally {
    btn.disabled = false;
  }
});

$('#btnLogout').addEventListener('click', async () => {
  if (state.dirty && !confirm('มีการแก้ไขที่ยังไม่บันทึก ต้องการออกจากระบบหรือไม่?')) return;
  await signOut(auth);
});

onAuthStateChanged(auth, (user) => {
  state.unsub.forEach((fn) => fn());
  state.unsub = [];
  $('#btnLogout').classList.toggle('hidden', !user);
  if (!user) { show('loginView'); return; }
  if ((user.email || '').toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    $('#deniedEmail').textContent = user.email || '';
    show('deniedView');
    return;
  }
  show('loadingView');
  subscribe();
});

function subscribe() {
  state.loaded = { rooms: false, config: false, committee: false };
  let shown = false;
  // วาดใหม่เฉพาะแท็บที่ใช้ข้อมูลนั้น เพื่อไม่ล้างฟอร์มที่กำลังพิมพ์ในแท็บอื่น
  const refresh = (tabs) => {
    if (!Object.values(state.loaded).every(Boolean)) return;
    if (!shown) { shown = true; show('appView'); render(); return; }
    if (tabs.includes(state.tab)) render();
  };
  state.unsub.push(onSnapshot(collection(db, COL_ROOMS), (snap) => {
    state.rooms = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    if (state.editId && !state.dirty) {
      const fresh = state.rooms.get(state.editId);
      state.draft = fresh ? clone(fresh) : null;
      if (!fresh) state.editId = null;
    }
    state.loaded.rooms = true;
    refresh(['rooms', 'map', 'system']);
  }, (err) => toast(errText(err), 'error')));
  state.unsub.push(onSnapshot(siteRef('config'), (snap) => {
    state.config = snap.exists() ? snap.data() : null;
    state.loaded.config = true;
    refresh(['system', 'survey']);
  }, (err) => toast(errText(err), 'error')));
  state.unsub.push(onSnapshot(siteRef('committee'), (snap) => {
    state.committee = snap.exists() ? snap.data() : null;
    state.loaded.committee = true;
    refresh(['system']);
  }, (err) => toast(errText(err), 'error')));
}

window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

/* ------------------------------------------------------------------ แท็บ */

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-tab]');
  if (!btn) return;
  if (state.dirty && state.tab === 'rooms' && btn.dataset.tab !== 'rooms'
    && !confirm('ห้องที่กำลังแก้ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่?')) return;
  if (state.dirty && btn.dataset.tab !== 'rooms') {
    // ทิ้งการแก้ไขที่ยังไม่บันทึก กลับไปใช้ข้อมูลจากฐานข้อมูล
    const fresh = state.editId && state.rooms.get(state.editId);
    state.draft = fresh ? clone(fresh) : null;
    state.dirty = false;
  }
  state.tab = btn.dataset.tab;
  document.querySelectorAll('#tabs .tab').forEach((t) => t.classList.toggle('active', t === btn));
  render();
  window.scrollTo({ top: 0 });
});

function render() {
  const view = $('#appView');
  if (!state.rooms.size && state.tab !== 'system' && state.tab !== 'survey') {
    view.innerHTML = `
      <div class="card mx-auto max-w-lg p-6 text-center">
        <p class="text-4xl">📦</p>
        <h2 class="mt-2 font-display text-xl text-navy-900">ยังไม่มีข้อมูลในฐานข้อมูล</h2>
        <p class="mt-1 text-sm text-slate-600">เริ่มต้นด้วยการนำเข้าข้อมูลตั้งต้น (ผู้เข้าสอบ ๒๙๔ คน ๑๕ ห้อง และคำสั่งแต่งตั้ง)</p>
        <button class="btn btn-gold mt-4" data-goto="system">ไปที่แท็บระบบ → นำเข้าข้อมูล</button>
      </div>`;
    view.querySelector('[data-goto]').onclick = () => $('#tabs [data-tab="system"]').click();
    return;
  }
  ({ rooms: renderRooms, map: renderMap, exam: renderExam, announce: renderAnnounce, quotes: renderQuotes,
    committee: renderCommittee, survey: renderSurvey, system: renderSystem })[state.tab]();
}

/* ------------------------------------------------------------------ แท็บ ห้องสอบ */

function renderRooms() {
  const view = $('#appView');
  const rooms = roomsSorted();
  view.innerHTML = `
    <div class="grid gap-5 lg:grid-cols-[20rem_1fr]">
      <aside class="space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="font-display text-lg text-navy-900">ห้องสอบ (${th(rooms.length)})</h2>
          <button class="btn btn-ghost px-3 py-1.5" id="btnAddRoom">+ เพิ่มห้อง</button>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-1" id="roomList">
          ${rooms.map((r) => `
            <button data-room="${h(r.id)}" class="card flex w-full items-center gap-3 p-3 text-left ring-gold-400 transition hover:ring-2 ${r.id === state.editId ? 'ring-2' : ''}">
              ${levelBadge(r)}
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold text-navy-900">${h(roomShort(r))}</span>
                <span class="block truncate text-xs text-slate-500">${h(locationText(effectiveLocation(r))) || '<i>ยังไม่ระบุตำแหน่ง</i>'}</span>
              </span>
              <span class="text-right text-xs text-slate-500">
                <b class="block text-base text-navy-900">${th((r.students || []).length)}</b>คน ${findPlan(r.id) ? '🏢' : ''}
              </span>
            </button>`).join('')}
        </div>
      </aside>
      <section id="roomEditor">${state.draft ? editorHtml() : `
        <div class="card grid h-full min-h-60 place-items-center p-6 text-center text-slate-500">
          เลือกห้องทางซ้ายเพื่อแก้ไขข้อมูลห้อง กรรมการ และรายชื่อนักเรียน
        </div>`}</section>
    </div>`;

  view.querySelector('#roomList').onclick = (e) => {
    const btn = e.target.closest('[data-room]');
    if (!btn || btn.dataset.room === state.editId) return;
    if (state.dirty && !confirm('ห้องที่กำลังแก้ยังไม่ได้บันทึก ต้องการเปลี่ยนห้องหรือไม่?')) return;
    openRoom(btn.dataset.room);
  };
  view.querySelector('#btnAddRoom').onclick = addRoomDialog;
  if (state.draft) bindEditor();
}

function openRoom(id) {
  if (!state.rooms.has(id)) return;
  state.editId = id;
  state.draft = clone(state.rooms.get(id));
  state.draft.location ||= { building: '', floor: '', roomName: '', note: '' };
  state.draft.proctors ||= [];
  state.draft.students ||= [];
  state.dirty = false;
  state.studentFilter = '';
  renderRooms();
  if (window.innerWidth < 1024) $('#roomEditor').scrollIntoView({ behavior: 'smooth' });
}

function editorHtml() {
  const d = state.draft;
  const f = normalize(state.studentFilter);
  const students = [...d.students].sort((a, b) => a.no.localeCompare(b.no));
  const shown = f ? students.filter((s) => normalize(`${s.no}${s.first}${s.last}`).includes(f)) : students;
  return `
    <div class="card overflow-hidden">
      <div class="flex flex-wrap items-center gap-3 bg-navy-900 px-4 py-3 text-white">
        ${levelBadge(d)}
        <h2 class="min-w-0 flex-1 font-display text-base sm:text-lg">${h(roomTitle(d))}</h2>
        <span id="dirtyFlag" class="${state.dirty ? '' : 'hidden'} rounded-full bg-gold-300 px-2 py-0.5 text-xs font-bold text-navy-950">ยังไม่บันทึก</span>
      </div>
      <div class="space-y-6 p-4 sm:p-5">
        <fieldset class="space-y-3">
          <legend class="font-display text-navy-900">ตำแหน่งห้องสอบ</legend>
          <div class="grid gap-3 sm:grid-cols-3">
            <div><label class="lbl">อาคาร</label><input class="inp" data-loc="building" list="dlBuilding" value="${h(d.location.building)}" placeholder="เช่น อาคาร ๒">
              <datalist id="dlBuilding"><option value="อาคาร ๒"><option value="อาคาร ๓"><option value="อาคาร ๔"></datalist></div>
            <div><label class="lbl">ชั้น</label><input class="inp" data-loc="floor" value="${h(d.location.floor)}" placeholder="เช่น 1"></div>
            <div><label class="lbl">ชื่อห้องจริง</label><input class="inp" data-loc="roomName" value="${h(d.location.roomName)}" placeholder="เช่น ห้อง ป.๔/๑"></div>
          </div>
          <div><label class="lbl">หมายเหตุ</label><input class="inp" data-loc="note" value="${h(d.location.note)}" placeholder="เช่น ทางขึ้นบันไดฝั่งโรงอาหาร"></div>
          <p class="text-xs text-slate-500">${findPlan(d.id) ? `🏢 ตามผังอาคาร: <b>${h(locationText(effectiveLocation(d)))}</b> — ระบบใช้อาคาร/ชั้นจากผังแทนช่องด้านบน (ช่องชื่อห้องจริงและหมายเหตุยังใช้ได้)` : 'ห้องนี้ยังไม่อยู่ในผังอาคาร — ระบบจะแสดงตำแหน่งตามที่กรอกด้านบน'}</p>
        </fieldset>

        <fieldset class="space-y-3">
          <legend class="font-display text-navy-900">กรรมการกำกับห้องสอบ</legend>
          <div class="space-y-2" id="proctorRows">
            ${d.proctors.map((p, i) => `
              <div class="grid gap-2 rounded-xl border border-slate-200 p-2 sm:grid-cols-[7rem_1fr_1fr_auto]" data-proctor="${i}">
                <select class="inp" data-pf="role">${ROLE_OPTIONS.map((r) => `<option ${r === p.role ? 'selected' : ''}>${r}</option>`).join('')}</select>
                <input class="inp" data-pf="name" value="${h(p.name)}" placeholder="ชื่อ-นามสกุล">
                <input class="inp" data-pf="affiliation" value="${h(p.affiliation)}" placeholder="ตำแหน่ง/สังกัด">
                <button class="btn btn-danger px-3" data-remove-proctor="${i}" title="ลบ">ลบ</button>
              </div>`).join('') || '<p class="text-sm text-slate-500">ยังไม่มีกรรมการ</p>'}
          </div>
          <button class="btn btn-ghost px-3 py-1.5" id="btnAddProctor">+ เพิ่มกรรมการ</button>
        </fieldset>

        <fieldset class="space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <legend class="font-display text-navy-900">ผู้เข้าสอบ (${th(d.students.length)} คน)</legend>
            <span class="flex-1"></span>
            <button class="btn btn-gold px-3 py-1.5" id="btnAddStudent">+ เพิ่มนักเรียน</button>
          </div>
          <input class="inp" id="studentFilter" placeholder="กรองรายชื่อในห้องนี้…" value="${h(state.studentFilter)}">
          <div class="divide-y divide-slate-100 rounded-xl border border-slate-200" id="studentRows">
            ${shown.map((s) => `
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span class="w-24 shrink-0 font-mono text-xs text-slate-500">${formatNo(s.no)}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold text-navy-900">${h(fullName(s))} ${s.note ? `<span class="text-gold-600">${h(s.note)}</span>` : ''}</span>
                  <span class="block text-xs text-slate-500">${h(s.wat)} · ${h(s.school)}</span>
                </span>
                <span class="flex gap-1">
                  <button class="btn btn-ghost px-2.5 py-1 text-xs" data-edit-student="${h(s.no)}">แก้ไข</button>
                  <button class="btn btn-ghost px-2.5 py-1 text-xs" data-move-student="${h(s.no)}">ย้ายห้อง</button>
                  <button class="btn btn-danger px-2.5 py-1 text-xs" data-del-student="${h(s.no)}">ลบ</button>
                </span>
              </div>`).join('') || `<p class="p-4 text-center text-sm text-slate-500">${d.students.length ? 'ไม่พบรายชื่อที่กรอง' : 'ยังไม่มีผู้เข้าสอบในห้องนี้ (รอประกาศรายชื่อ)'}</p>`}
          </div>
        </fieldset>

        <div class="sticky bottom-3 z-10 flex flex-wrap gap-2 rounded-2xl bg-white/95 p-2 shadow-lg ring-1 ring-slate-200 backdrop-blur">
          <button class="btn btn-navy flex-1" id="btnSaveRoom" ${state.dirty ? '' : 'disabled'}>บันทึกห้องนี้</button>
          <button class="btn btn-ghost" id="btnRevertRoom" ${state.dirty ? '' : 'disabled'}>ยกเลิกการแก้ไข</button>
          <button class="btn btn-danger" id="btnDeleteRoom" ${d.students.length ? 'disabled title="ย้าย/ลบนักเรียนออกก่อนจึงลบห้องได้"' : ''}>ลบห้อง</button>
        </div>
      </div>
    </div>`;
}

function markDirty() {
  state.dirty = true;
  $('#dirtyFlag')?.classList.remove('hidden');
  $('#btnSaveRoom')?.removeAttribute('disabled');
  $('#btnRevertRoom')?.removeAttribute('disabled');
}

function bindEditor() {
  const ed = $('#roomEditor');
  ed.querySelectorAll('[data-loc]').forEach((inp) => {
    inp.oninput = () => { state.draft.location[inp.dataset.loc] = inp.value.trim(); markDirty(); };
  });
  ed.querySelectorAll('[data-proctor]').forEach((row) => {
    const i = Number(row.dataset.proctor);
    row.querySelectorAll('[data-pf]').forEach((inp) => {
      const update = () => { state.draft.proctors[i][inp.dataset.pf] = inp.value.trim(); markDirty(); };
      inp.oninput = update; inp.onchange = update;
    });
  });
  ed.querySelectorAll('[data-remove-proctor]').forEach((b) => {
    b.onclick = () => { state.draft.proctors.splice(Number(b.dataset.removeProctor), 1); state.dirty = true; renderRooms(); };
  });
  $('#btnAddProctor').onclick = () => {
    state.draft.proctors.push({ role: state.draft.proctors.length ? 'ผู้ช่วย' : 'หัวหน้า', name: '', affiliation: '' });
    state.dirty = true; renderRooms();
  };
  const filter = $('#studentFilter');
  filter.oninput = () => {
    state.studentFilter = filter.value;
    const pos = filter.selectionStart;
    renderRooms();
    const again = $('#studentFilter'); again.focus(); again.setSelectionRange(pos, pos);
  };
  $('#btnAddStudent').onclick = () => studentDialog(null);
  ed.querySelectorAll('[data-edit-student]').forEach((b) => { b.onclick = () => studentDialog(b.dataset.editStudent); });
  ed.querySelectorAll('[data-move-student]').forEach((b) => { b.onclick = () => moveDialog(b.dataset.moveStudent); });
  ed.querySelectorAll('[data-del-student]').forEach((b) => {
    b.onclick = () => {
      const s = state.draft.students.find((x) => x.no === b.dataset.delStudent);
      if (!s || !confirm(`ลบ ${fullName(s)} (${formatNo(s.no)}) ออกจากห้องนี้?\n(ต้องกด “บันทึกห้องนี้” จึงจะมีผล)`)) return;
      state.draft.students = state.draft.students.filter((x) => x !== s);
      state.dirty = true; renderRooms();
    };
  });
  $('#btnSaveRoom').onclick = saveRoom;
  $('#btnRevertRoom').onclick = () => { if (confirm('ยกเลิกการแก้ไขทั้งหมดของห้องนี้?')) openRoom(state.editId); };
  $('#btnDeleteRoom').onclick = deleteRoom;
}

async function saveRoom() {
  const btn = $('#btnSaveRoom');
  btn.disabled = true;
  try {
    state.draft.proctors = state.draft.proctors.filter((p) => p.name);
    await setDoc(roomRef(state.editId), roomPayload(state.draft));
    state.dirty = false;
    toast('บันทึกห้องเรียบร้อย');
    openRoom(state.editId);
  } catch (err) {
    toast(errText(err), 'error');
    btn.disabled = false;
  }
}

async function deleteRoom() {
  const d = state.draft;
  if (d.students.length) return;
  if (!confirm(`ลบ ${roomTitle(d)} ออกจากระบบ? (กู้คืนไม่ได้ ยกเว้นนำเข้าข้อมูลตั้งต้นใหม่)`)) return;
  try {
    await deleteDoc(roomRef(state.editId));
    state.editId = null; state.draft = null; state.dirty = false;
    toast('ลบห้องแล้ว');
    renderRooms();
  } catch (err) { toast(errText(err), 'error'); }
}

/* ---------- กล่องโต้ตอบ ---------- */

function openDialog(html, onSubmit) {
  const dlg = $('#dlg');
  dlg.innerHTML = `<form method="dialog" class="space-y-4 p-5">${html}
    <div class="flex justify-end gap-2 pt-2">
      <button type="button" class="btn btn-ghost" data-cancel>ยกเลิก</button>
      <button class="btn btn-navy" value="ok">ตกลง</button>
    </div></form>`;
  const form = dlg.querySelector('form');
  dlg.querySelector('[data-cancel]').onclick = () => dlg.close();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const ok = await onSubmit(new FormData(form), form);
    if (ok !== false) dlg.close();
  };
  dlg.showModal();
  form.querySelector('input,select')?.focus();
}

function allNumbers(exceptRoomId) {
  const set = new Set();
  for (const r of state.rooms.values()) {
    if (r.id === exceptRoomId) continue;
    (r.students || []).forEach((s) => set.add(s.no));
  }
  return set;
}

function knownValues(key) {
  const set = new Set();
  for (const r of state.rooms.values()) (r.students || []).forEach((s) => s[key] && set.add(s[key]));
  return [...set];
}

function studentDialog(no) {
  const editing = no ? state.draft.students.find((s) => s.no === no) : null;
  const s = editing || { no: '', prefix: 'เด็กชาย', first: '', last: '', wat: '', school: '', note: '' };
  openDialog(`
    <h3 class="font-display text-lg text-navy-900">${editing ? 'แก้ไขข้อมูลนักเรียน' : 'เพิ่มนักเรียน'} · ${h(roomShort(state.draft))}</h3>
    <div><label class="lbl">เลขที่สอบ (๘ หลัก เช่น 030-10001)</label><input class="inp" name="no" required value="${h(s.no ? formatNo(s.no) : '030-')}" inputmode="numeric"></div>
    <div class="grid grid-cols-[8rem_1fr] gap-2">
      <div><label class="lbl">คำนำหน้า</label><select class="inp" name="prefix">${PREFIX_OPTIONS.map((p) => `<option ${p === s.prefix ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
      <div><label class="lbl">ชื่อ</label><input class="inp" name="first" required value="${h(s.first)}"></div>
    </div>
    <div><label class="lbl">นามสกุล</label><input class="inp" name="last" required value="${h(s.last)}"></div>
    <div><label class="lbl">สังกัดวัด</label><input class="inp" name="wat" list="dlWat" value="${h(s.wat)}"></div>
    <div><label class="lbl">องค์กร/สถานศึกษา</label><input class="inp" name="school" list="dlSchool" value="${h(s.school)}"></div>
    <div><label class="lbl">หมายเหตุ (แสดงต่อท้ายชื่อ)</label><input class="inp" name="note" value="${h(s.note)}" placeholder="เช่น (ซ้ำ)"></div>
    <p class="text-xs text-slate-500">หลังกดตกลง ต้องกด “บันทึกห้องนี้” จึงจะมีผล</p>
    <datalist id="dlWat">${knownValues('wat').map((v) => `<option value="${h(v)}">`).join('')}</datalist>
    <datalist id="dlSchool">${knownValues('school').map((v) => `<option value="${h(v)}">`).join('')}</datalist>
  `, (fd) => {
    const newNo = toArabic(fd.get('no')).replace(/\D/g, '');
    if (newNo.length !== 8) { alert('เลขที่สอบต้องมี ๘ หลัก เช่น 030-10001'); return false; }
    const taken = allNumbers(state.editId);
    state.draft.students.forEach((x) => { if (x !== editing) taken.add(x.no); });
    if (taken.has(newNo)) { alert(`เลขที่สอบ ${formatNo(newNo)} มีอยู่แล้ว`); return false; }
    const data = {
      no: newNo, prefix: fd.get('prefix'), first: fd.get('first').trim(), last: fd.get('last').trim(),
      wat: fd.get('wat').trim(), school: fd.get('school').trim(), note: fd.get('note').trim(),
    };
    if (editing) Object.assign(editing, data); else state.draft.students.push(data);
    state.dirty = true;
    renderRooms();
    return true;
  });
}

function moveDialog(no) {
  const s = state.draft.students.find((x) => x.no === no);
  if (!s) return;
  const targets = roomsSorted().filter((r) => r.id !== state.editId);
  openDialog(`
    <h3 class="font-display text-lg text-navy-900">ย้ายห้องสอบ</h3>
    <p class="text-sm"><b>${h(fullName(s))}</b> <span class="text-slate-500">${formatNo(s.no)}</span><br>จาก ${h(roomShort(state.draft))}</p>
    <div><label class="lbl">ย้ายไปห้อง</label>
      <select class="inp" name="target">${targets.map((r) => `<option value="${h(r.id)}">${h(roomShort(r))} (${th((r.students || []).length)} คน)</option>`).join('')}</select></div>
    <p class="text-xs text-slate-500">บันทึกทันทีทั้ง ๒ ห้อง (รวมการแก้ไขอื่นที่ยังไม่บันทึกของห้องนี้ด้วย)</p>
  `, async (fd) => {
    const target = state.rooms.get(fd.get('target'));
    if (!target) return false;
    const from = clone(state.draft);
    from.students = from.students.filter((x) => x.no !== no);
    from.proctors = from.proctors.filter((p) => p.name);
    const to = clone(target);
    to.students = [...(to.students || []), clone(s)];
    try {
      const batch = writeBatch(db);
      batch.set(roomRef(state.editId), roomPayload(from));
      batch.set(roomRef(target.id), roomPayload(to));
      await batch.commit();
      state.dirty = false;
      toast(`ย้ายไป ${roomShort(target)} แล้ว`);
      openRoom(state.editId);
      return true;
    } catch (err) { toast(errText(err), 'error'); return false; }
  });
}

function addRoomDialog() {
  openDialog(`
    <h3 class="font-display text-lg text-navy-900">เพิ่มห้องสอบ</h3>
    <div class="grid grid-cols-3 gap-2">
      <div><label class="lbl">ชั้น</label><select class="inp" name="level">${Object.entries(LEVELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label class="lbl">ช่วงชั้น</label><select class="inp" name="stage">${Object.entries(STAGES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div><label class="lbl">ห้องที่</label><input class="inp" name="roomNo" type="number" min="1" max="30" required value="1"></div>
    </div>
  `, async (fd) => {
    const level = fd.get('level'), stage = fd.get('stage'), roomNo = Number(fd.get('roomNo'));
    const id = `${level}-${stage}-${roomNo}`;
    if (state.rooms.has(id)) { alert('มีห้องนี้อยู่แล้ว'); return false; }
    try {
      await setDoc(roomRef(id), roomPayload({
        level, stage, roomNo, order: state.rooms.size + 1,
        location: { building: '', floor: '', roomName: '', note: '' }, pin: null, proctors: [], students: [],
      }));
      toast('เพิ่มห้องแล้ว');
      setTimeout(() => openRoom(id), 300);
      return true;
    } catch (err) { toast(errText(err), 'error'); return false; }
  });
}

/* ------------------------------------------------------------------ แท็บ แผนผัง */

function renderMap() {
  const view = $('#appView');
  const rooms = roomsSorted();
  const c = state.config || {};
  const url = safeImageUrl(c.mapUrl) || DEFAULT_MAP_URL;
  const unplaced = rooms.filter((r) => !findPlan(r.id));
  view.innerHTML = `
    <div class="space-y-4">
      <div class="card space-y-3 p-4">
        <h2 class="font-display text-lg text-navy-900">ผังรวมโรงเรียน</h2>
        <p class="text-sm text-slate-600">ภาพแสดงทุกอาคารของโรงเรียน และอาคารที่ใช้สอบ (ภาพจาก Cloudinary) — ถ้าเว้นว่าง จะใช้ภาพผังเริ่มต้น</p>
        <div><label class="lbl">ลิงก์ภาพผังรวม</label>
          <input class="inp" id="mapUrl" type="url" placeholder="https://res.cloudinary.com/..." value="${h(c.mapUrl || DEFAULT_MAP_URL)}"></div>
        <div class="grid gap-3 sm:grid-cols-2">
          <div><label class="lbl">อาคารที่ใช้สอบ (แสดงเหนือผัง)</label><input class="inp" id="examBuildings" value="${h(c.examBuildings || '')}" placeholder="เช่น อาคาร ๒ · อาคาร ๓ · อาคาร ๔"></div>
          <div><label class="lbl">จุดรวมแถวและแจกข้อสอบ</label><input class="inp" id="assemblyPoint" value="${h(c.assemblyPoint || '')}" placeholder="เช่น ลานหน้าอาคาร ๔"></div>
        </div>
        <button class="btn btn-navy" id="btnSaveMap">บันทึกข้อมูลผังรวม</button>
        <img src="${h(cloudinaryVariant(url, 'f_auto,q_auto,w_1000'))}" alt="ผังรวมโรงเรียน" class="mt-2 w-full rounded-xl border border-slate-200">
      </div>

      <div class="card space-y-3 p-4">
        <h2 class="font-display text-lg text-navy-900">ผังห้องสอบรายอาคาร</h2>
        <p class="text-sm text-slate-600">ผังวาดจากภาพผังที่โรงเรียนส่งมา (ไฟล์ <code>assets/js/floorplans.js</code>) ระบบกำหนดอาคารและชั้นของห้องสอบให้อัตโนมัติ ถ้าห้องสอบย้ายอาคาร ต้องแก้ผังในไฟล์นี้</p>
        <ul class="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          ${FLOORPLANS.map((p) => `
            <li class="px-3 py-2.5">
              <b class="text-navy-900">${h(p.name)} (${h(p.subtitle)})</b>
              <span class="block text-slate-600">${p.floors.map((f) => `ชั้น ${th(f.no)}: ${f.rooms.filter((r) => r.room).map((r) => (state.rooms.get(r.room) ? roomShort(state.rooms.get(r.room)) : `<span class="text-red-600">${h(r.room)} (ไม่มีในระบบ)</span>`)).join(', ') || '-'}`).join(' · ')}</span>
            </li>`).join('')}
        </ul>
        ${unplaced.length ? `<p class="rounded-xl bg-gold-100 px-3 py-2 text-sm text-navy-900">ห้องสอบที่ยังไม่มีในผังอาคาร (${th(unplaced.length)} ห้อง): ${unplaced.map((r) => h(roomShort(r))).join(', ')}</p>` : '<p class="text-sm text-green-700">✅ ห้องสอบทุกห้องอยู่ในผังอาคารแล้ว</p>'}
      </div>
    </div>`;

  $('#btnSaveMap').onclick = async () => {
    const raw = $('#mapUrl').value.trim();
    if (raw && !safeImageUrl(raw)) { toast('ลิงก์ต้องขึ้นต้นด้วย https://', 'error'); return; }
    try {
      await setDoc(siteRef('config'), {
        mapUrl: raw,
        examBuildings: $('#examBuildings').value.trim(),
        assemblyPoint: $('#assemblyPoint').value.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast('บันทึกข้อมูลผังรวมแล้ว');
    } catch (err) { toast(errText(err), 'error'); }
  };
}

/* ------------------------------------------------------------------ แท็บ ข้อมูลการสอบ */

function isoToLocal(iso) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso || '') ? iso.slice(0, 16) : '';
}

function renderExam() {
  const c = state.config || {};
  const view = $('#appView');
  view.innerHTML = `
    <form id="examForm" class="card space-y-4 p-4 sm:p-5">
      <h2 class="font-display text-lg text-navy-900">ข้อมูลการสอบ</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class="lbl">ชื่อหัวเว็บ</label><input class="inp" name="title" value="${h(c.title)}"></div>
        <div><label class="lbl">คำโปรย</label><input class="inp" name="subtitle" value="${h(c.subtitle)}"></div>
        <div><label class="lbl">สนามสอบ</label><input class="inp" name="venue" value="${h(c.venue)}"></div>
        <div><label class="lbl">ที่อยู่</label><input class="inp" name="address" value="${h(c.address)}"></div>
        <div><label class="lbl">รหัสสนาม</label><input class="inp" name="fieldCode" value="${h(c.fieldCode)}"></div>
        <div><label class="lbl">วันสอบ (ข้อความ)</label><input class="inp" name="examDateText" value="${h(c.examDateText)}"></div>
        <div><label class="lbl">เริ่มสอบ (ใช้นับถอยหลัง)</label><input class="inp" type="datetime-local" name="examStart" value="${h(isoToLocal(c.examStart))}"></div>
        <div><label class="lbl">สิ้นสุดการสอบ</label><input class="inp" type="datetime-local" name="examEnd" value="${h(isoToLocal(c.examEnd))}"></div>
      </div>
      <div><label class="lbl">ตารางสอบ (บรรทัดละรายการ: เวลา | วิชา)</label>
        <textarea class="inp min-h-28" name="schedule">${h((c.schedule || []).map((s) => `${s.time} | ${s.subject}`).join('\n'))}</textarea></div>
      <div><label class="lbl">ระเบียบ/ข้อปฏิบัติผู้เข้าสอบ (บรรทัดละข้อ)</label>
        <textarea class="inp min-h-40" name="rules">${h((c.rules || []).join('\n'))}</textarea></div>
      <div><label class="lbl">ชื่อผู้พัฒนา (แสดงท้ายเว็บ)</label><input class="inp" name="developer" value="${h(c.developer || 'ธุรการไทยงาม')}"></div>
      <button class="btn btn-navy w-full sm:w-auto">บันทึกข้อมูลการสอบ</button>
    </form>`;
  $('#examForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const lines = (k) => String(fd.get(k) || '').split('\n').map((l) => l.trim()).filter(Boolean);
    const local = (k) => (fd.get(k) ? `${fd.get(k)}:00+07:00` : '');
    const data = {
      title: fd.get('title').trim(), subtitle: fd.get('subtitle').trim(), venue: fd.get('venue').trim(),
      address: fd.get('address').trim(), fieldCode: fd.get('fieldCode').trim(), examDateText: fd.get('examDateText').trim(),
      examStart: local('examStart'), examEnd: local('examEnd'),
      schedule: lines('schedule').map((l) => {
        const [time, ...rest] = l.split('|');
        return { time: time.trim(), subject: rest.join('|').trim() };
      }),
      rules: lines('rules'),
      developer: fd.get('developer').trim() || 'ธุรการไทยงาม',
      updatedAt: serverTimestamp(),
    };
    try { await setDoc(siteRef('config'), data, { merge: true }); toast('บันทึกข้อมูลการสอบแล้ว'); }
    catch (err) { toast(errText(err), 'error'); }
  };
}

/* ------------------------------------------------------------------ แท็บ ประกาศ */

function renderAnnounce() {
  const a = state.config?.announcement || { active: false, text: '', tone: 'info' };
  const view = $('#appView');
  view.innerHTML = `
    <form id="annForm" class="card space-y-4 p-4 sm:p-5">
      <h2 class="font-display text-lg text-navy-900">ประกาศข่าวด่วน</h2>
      <label class="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
        <input type="checkbox" name="active" class="h-5 w-5 accent-[#C9A227]" ${a.active ? 'checked' : ''}>
        <span class="font-semibold text-navy-900">แสดงประกาศบนหน้าเว็บ</span>
      </label>
      <div><label class="lbl">ระดับ</label>
        <select class="inp" name="tone">
          <option value="info" ${a.tone !== 'urgent' ? 'selected' : ''}>ข่าวสารทั่วไป (สีทอง)</option>
          <option value="urgent" ${a.tone === 'urgent' ? 'selected' : ''}>ด่วน (สีแดง)</option>
        </select></div>
      <div><label class="lbl">ข้อความประกาศ</label><textarea class="inp min-h-28" name="text" maxlength="500" placeholder="เช่น ผู้เข้าสอบชั้นโท ประถม ห้อง ๖ ให้ไปรายงานตัวที่…">${h(a.text)}</textarea></div>
      <button class="btn btn-navy w-full sm:w-auto">บันทึกประกาศ</button>
    </form>`;
  $('#annForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const announcement = { active: fd.get('active') === 'on', tone: fd.get('tone'), text: String(fd.get('text') || '').trim() };
    if (announcement.active && !announcement.text) { toast('กรุณาพิมพ์ข้อความประกาศ', 'warn'); return; }
    try { await setDoc(siteRef('config'), { announcement, updatedAt: serverTimestamp() }, { merge: true }); toast('บันทึกประกาศแล้ว'); }
    catch (err) { toast(errText(err), 'error'); }
  };
}

/* ------------------------------------------------------------------ แท็บ ภาษิตธรรม */

function renderQuotes() {
  const q = effectiveQuotes(state.config);
  const view = $('#appView');
  view.innerHTML = `
    <form id="quoteForm" class="card space-y-4 p-4 sm:p-5">
      <div>
        <h2 class="font-display text-lg text-navy-900">สุภาษิตธรรม (พุทธศาสนสุภาษิต)</h2>
        <p class="text-sm text-slate-500">แสดงใต้ช่องค้นหาบนหน้าเว็บ ด้วยฟอนต์ Thasadith · สุ่มบทเมื่อเปิดหน้า และเปลี่ยนบทเองตามเวลาที่กำหนด</p>
      </div>
      <label class="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
        <input type="checkbox" name="active" class="h-5 w-5 accent-[#C9A227]" ${q.active ? 'checked' : ''}>
        <span class="font-semibold text-navy-900">แสดงสุภาษิตบนหน้าเว็บ</span>
      </label>
      <div class="max-w-xs"><label class="lbl">เปลี่ยนบททุก ๆ (วินาที)</label>
        <input class="inp" type="number" name="interval" min="0" max="600" step="1" value="${h(q.interval)}">
        <p class="mt-1 text-xs text-slate-500">ใส่ 0 = ไม่เปลี่ยนเอง (ผู้ชมกด “สุ่มบทใหม่” ได้) · ขั้นต่ำ ๕ วินาที</p></div>
      <div>
        <div class="mb-1 flex flex-wrap items-end justify-between gap-2">
          <label class="lbl mb-0">รายการสุภาษิต — บรรทัดละบท: <code>บาลี | คำแปล | ที่มา (ไม่ใส่ก็ได้)</code></label>
          <button type="button" class="btn btn-ghost px-3 py-1.5 text-xs" id="quoteDefaults">ใส่ชุดเริ่มต้น (${th(DEFAULT_QUOTES.length)} บท)</button>
        </div>
        <textarea class="inp min-h-64 font-pali text-lg" name="items" spellcheck="false">${h(quoteLines(q.items))}</textarea>
        <p class="mt-1 text-xs text-slate-500">ถ้าลบจนว่าง หน้าเว็บจะใช้ชุดเริ่มต้นแทน · บรรทัดที่ไม่มี | จะแสดงเป็นข้อความภาษาไทยอย่างเดียว</p>
      </div>
      <div>
        <p class="lbl">ตัวอย่างการแสดงผล <span id="quoteCount" class="font-normal text-slate-500"></span></p>
        <div id="quotePreview" class="max-h-80 space-y-2 overflow-y-auto rounded-xl bg-gold-100/60 p-3"></div>
      </div>
      <button class="btn btn-navy w-full sm:w-auto">บันทึกสุภาษิต</button>
    </form>`;
  const form = $('#quoteForm');
  const ta = form.elements.items;
  const preview = () => {
    const items = parseQuoteLines(ta.value);
    $('#quoteCount').textContent = `(${th(items.length)} บท)`;
    $('#quotePreview').innerHTML = items.length ? items.map((x) => `
      <div class="rounded-lg bg-white px-3 py-2 text-center">
        ${x.pali ? `<p class="font-pali text-xl font-bold text-navy-900">${h(x.pali)}</p>` : ''}
        ${x.thai ? `<p class="font-pali text-base text-[#B88A1B]">${h(th(x.thai))}</p>` : ''}
        ${x.ref ? `<p class="text-xs text-slate-500">${h(th(x.ref))}</p>` : ''}
      </div>`).join('') : '<p class="text-sm text-slate-500">ว่าง — จะใช้ชุดเริ่มต้น</p>';
  };
  ta.addEventListener('input', preview);
  preview();
  $('#quoteDefaults').onclick = () => {
    if (ta.value.trim() && !confirm('แทนที่รายการปัจจุบันด้วยชุดเริ่มต้นหรือไม่? (ยังไม่บันทึกจนกว่าจะกดบันทึก)')) return;
    ta.value = quoteLines(DEFAULT_QUOTES);
    preview();
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const n = Number.parseInt(fd.get('interval'), 10);
    const quotes = {
      active: fd.get('active') === 'on',
      interval: Number.isFinite(n) ? Math.min(600, Math.max(0, n)) : DEFAULT_INTERVAL,
      items: parseQuoteLines(fd.get('items')),
    };
    try { await setDoc(siteRef('config'), { quotes, updatedAt: serverTimestamp() }, { merge: true }); toast('บันทึกสุภาษิตแล้ว'); }
    catch (err) { toast(errText(err), 'error'); }
  };
}

/* ------------------------------------------------------------------ แท็บ คณะกรรมการ */

function renderCommittee() {
  const c = state.committee || {};
  const toLines = (arr) => (arr || []).map((p) => [p.name, p.position, p.role].join(' | ')).join('\n');
  const view = $('#appView');
  view.innerHTML = `
    <form id="comForm" class="card space-y-4 p-4 sm:p-5">
      <h2 class="font-display text-lg text-navy-900">คำสั่งแต่งตั้งคณะกรรมการ</h2>
      <div class="grid gap-3 sm:grid-cols-2">
        <div><label class="lbl">คำสั่ง</label><input class="inp" name="orderTitle" value="${h(c.orderTitle)}"></div>
        <div><label class="lbl">เรื่อง</label><input class="inp" name="orderSubject" value="${h(c.orderSubject)}"></div>
        <div><label class="lbl">สั่ง ณ วันที่</label><input class="inp" name="orderDate" value="${h(c.orderDate)}"></div>
        <div><label class="lbl">ผู้ลงนาม</label><input class="inp" name="signer" value="${h(c.signer)}"></div>
      </div>
      <div><label class="lbl">คณะกรรมการดำเนินการ (บรรทัดละคน: ชื่อ | ตำแหน่ง | หน้าที่)</label>
        <textarea class="inp min-h-64 text-sm" name="executive">${h(toLines(c.executive))}</textarea></div>
      <div><label class="lbl">กองงานเลขานุการ (บรรทัดละคน: ชื่อ | ตำแหน่ง | หน้าที่)</label>
        <textarea class="inp min-h-56 text-sm" name="secretariat">${h(toLines(c.secretariat))}</textarea></div>
      <p class="text-xs text-slate-500">กรรมการกำกับห้องสอบ แก้ไขได้ที่แท็บ “ห้องสอบ & นักเรียน”</p>
      <button class="btn btn-navy w-full sm:w-auto">บันทึกคณะกรรมการ</button>
    </form>`;
  $('#comForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const parse = (k) => String(fd.get(k) || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name = '', position = '', role = ''] = l.split('|').map((x) => x.trim());
      return { name, position, role };
    });
    const data = {
      orderTitle: fd.get('orderTitle').trim(), orderSubject: fd.get('orderSubject').trim(),
      orderDate: fd.get('orderDate').trim(), signer: fd.get('signer').trim(),
      executive: parse('executive'), secretariat: parse('secretariat'), updatedAt: serverTimestamp(),
    };
    try { await setDoc(siteRef('committee'), data, { merge: true }); toast('บันทึกคณะกรรมการแล้ว'); }
    catch (err) { toast(errText(err), 'error'); }
  };
}

/* ------------------------------------------------------------------ แท็บ แบบประเมิน */

const survey = { list: null, loading: false, error: '', group: 'all' };
const groupLabel = (id) => GROUPS.find((g) => g.id === id)?.label || id;
const fmt2 = (n) => th(n.toFixed(2));
const dateText = (r) => (r.createdAt?.toDate ? th(r.createdAt.toDate().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })) : '-');

async function loadSurveys() {
  survey.loading = true; survey.error = '';
  if (state.tab === 'survey') renderSurvey();
  try {
    const snap = await getDocs(query(collection(db, COL_SURVEYS), orderBy('createdAt', 'desc')));
    survey.list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    survey.error = errText(err);
  }
  survey.loading = false;
  if (state.tab === 'survey') renderSurvey();
}

function surveyCsv(list) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['ลำดับ', 'วันเวลา', 'กลุ่มผู้ตอบ', ...QUESTIONS.map((q, i) => `ข้อ ${i + 1} ${q.text}`), 'สิ่งที่ประทับใจ', 'ข้อเสนอแนะ'];
  const rows = list.map((r, i) => [
    i + 1,
    r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString('th-TH') : '',
    groupLabel(r.group),
    ...QUESTIONS.map((q) => r.ans?.[q.id] ?? ''),
    r.text?.like || '', r.text?.suggest || '',
  ]);
  return '﻿' + [head, ...rows].map((row) => row.map(esc).join(',')).join('\r\n');
}

function renderSurvey() {
  const view = $('#appView');
  const open = state.config?.surveyOpen !== false;
  const surveyUrl = new URL('../survey/', location.href).href;
  if (!survey.list && !survey.loading && !survey.error) { loadSurveys(); return; }

  const all = survey.list || [];
  const list = survey.group === 'all' ? all : all.filter((r) => r.group === survey.group);
  const stat = (ids) => meanSd(list.flatMap((r) => ids.map((id) => r.ans?.[id]).filter((v) => typeof v === 'number')));
  const overall = stat(QUESTIONS.map((q) => q.id));
  const comments = list.filter((r) => r.text?.like || r.text?.suggest);
  let no = 0;

  view.innerHTML = `
    <div class="space-y-4">
      <div class="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-lg text-navy-900">แบบประเมินความพึงพอใจ</h2>
          <p class="text-sm ${open ? 'text-green-700' : 'text-red-600'}">${open ? '● เปิดรับแบบประเมินอยู่' : '● ปิดรับแบบประเมินแล้ว'}</p>
          <p class="mt-1 break-all text-xs text-slate-500">${h(surveyUrl)}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <button class="btn btn-ghost" id="btnCopySurvey">คัดลอกลิงก์</button>
          <a class="btn btn-ghost" href="../survey/" target="_blank">เปิดดู ↗</a>
          <button class="btn ${open ? 'btn-danger' : 'btn-gold'}" id="btnToggleSurvey">${open ? 'ปิดรับ' : 'เปิดรับ'}</button>
        </div>
      </div>

      ${survey.error ? `<p class="rounded-xl bg-red-50 p-3 text-sm text-red-700">${h(survey.error)}</p>` : ''}
      ${survey.loading && !survey.list ? '<div class="card p-6 text-center text-slate-500">กำลังโหลดผลการประเมิน…</div>' : `

      <div class="flex flex-wrap items-center gap-2">
        ${[['all', 'ทั้งหมด', all.length], ...GROUPS.map((g) => [g.id, g.label, all.filter((r) => r.group === g.id).length])].map(([id, label, n]) => `
          <button class="rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${survey.group === id ? 'bg-navy-900 text-gold-300 ring-navy-900' : 'bg-white text-navy-900 ring-slate-200'}" data-sgroup="${id}">${h(label)} (${th(n)})</button>`).join('')}
        <span class="flex-1"></span>
        <button class="btn btn-ghost px-3 py-1.5" id="btnReloadSurvey">↻ รีเฟรช</button>
        <button class="btn btn-navy px-3 py-1.5" id="btnCsv" ${list.length ? '' : 'disabled'}>⬇ ส่งออก CSV (Excel)</button>
      </div>

      <div class="grid grid-cols-3 gap-3">
        <div class="card p-4 text-center"><p class="font-display text-3xl text-navy-900">${th(list.length)}</p><p class="text-xs text-slate-500">ผู้ตอบ (คน/รูป)</p></div>
        <div class="card p-4 text-center"><p class="font-display text-3xl text-navy-900">${overall.n ? fmt2(overall.mean) : '-'}</p><p class="text-xs text-slate-500">ค่าเฉลี่ยรวม (x̄)</p></div>
        <div class="card p-4 text-center"><p class="font-display text-2xl text-gold-600">${levelOf(overall.mean)}</p><p class="text-xs text-slate-500">ระดับความพึงพอใจ</p></div>
      </div>

      <div class="card overflow-x-auto">
        <table class="w-full min-w-[560px] text-sm">
          <thead><tr class="bg-navy-900 text-left text-gold-300">
            <th class="px-3 py-2 font-semibold">รายการประเมิน</th><th class="w-16 px-2 py-2 text-center">x̄</th><th class="w-16 px-2 py-2 text-center">S.D.</th><th class="w-24 px-2 py-2 text-center">ระดับ</th>
          </tr></thead>
          <tbody>
            ${SECTIONS.map((sec) => {
              const ss = stat(sec.items.map((q) => q.id));
              return `
              <tr class="bg-gold-100/70 font-bold text-navy-900"><td class="px-3 py-2">${h(sec.title)}</td><td class="px-2 text-center">${ss.n ? fmt2(ss.mean) : '-'}</td><td class="px-2 text-center">${ss.n ? fmt2(ss.sd) : '-'}</td><td class="px-2 text-center">${levelOf(ss.mean)}</td></tr>
              ${sec.items.map((q) => {
                no += 1;
                const s = stat([q.id]);
                return `<tr class="border-t border-slate-100">
                  <td class="px-3 py-2">${th(no)}. ${h(q.text)}
                    <div class="mt-1 h-1.5 rounded-full bg-slate-100"><div class="h-1.5 rounded-full bg-gold-500" style="width:${(s.mean / 5) * 100}%"></div></div></td>
                  <td class="px-2 text-center">${s.n ? fmt2(s.mean) : '-'}</td><td class="px-2 text-center">${s.n ? fmt2(s.sd) : '-'}</td><td class="px-2 text-center">${levelOf(s.mean)}</td></tr>`;
              }).join('')}`;
            }).join('')}
            <tr class="border-t-2 border-navy-900 bg-navy-900/5 font-bold text-navy-900"><td class="px-3 py-2">รวมทุกด้าน</td><td class="px-2 text-center">${overall.n ? fmt2(overall.mean) : '-'}</td><td class="px-2 text-center">${overall.n ? fmt2(overall.sd) : '-'}</td><td class="px-2 text-center">${levelOf(overall.mean)}</td></tr>
          </tbody>
        </table>
        <p class="px-3 py-2 text-xs text-slate-500">เกณฑ์แปลผล: ๔.๕๑–๕.๐๐ มากที่สุด · ๓.๕๑–๔.๕๐ มาก · ๒.๕๑–๓.๕๐ ปานกลาง · ๑.๕๑–๒.๕๐ น้อย · ๑.๐๐–๑.๕๐ น้อยที่สุด</p>
      </div>

      <div class="card p-4">
        <h3 class="font-display text-lg text-navy-900">ความคิดเห็นเพิ่มเติม (${th(comments.length)})</h3>
        <ul class="mt-3 space-y-2">
          ${comments.map((r) => `
            <li class="rounded-xl border border-slate-200 p-3 text-sm">
              <div class="flex items-center gap-2 text-xs text-slate-500">
                <span class="rounded-md bg-gold-100 px-2 py-0.5 font-semibold text-navy-900">${h(groupLabel(r.group))}</span>
                <span>${dateText(r)}</span><span class="flex-1"></span>
                <button class="text-red-600 hover:underline" data-del-survey="${h(r.id)}">ลบ</button>
              </div>
              ${r.text.like ? `<p class="mt-2"><b class="text-green-700">ประทับใจ:</b> ${h(r.text.like)}</p>` : ''}
              ${r.text.suggest ? `<p class="mt-1"><b class="text-gold-600">เสนอแนะ:</b> ${h(r.text.suggest)}</p>` : ''}
            </li>`).join('') || '<li class="text-sm text-slate-500">ยังไม่มีความคิดเห็น</li>'}
        </ul>
      </div>

      <details class="card p-4">
        <summary class="font-semibold text-navy-900">รายการคำตอบทั้งหมด (${th(list.length)}) — ลบคำตอบที่ไม่เหมาะสม/สแปม</summary>
        <ul class="mt-3 divide-y divide-slate-100 text-sm">
          ${list.map((r) => `
            <li class="flex items-center gap-2 py-2">
              <span class="w-32 shrink-0 text-xs text-slate-500">${dateText(r)}</span>
              <span class="min-w-0 flex-1 truncate">${h(groupLabel(r.group))} · ${QUESTIONS.map((q) => th(r.ans?.[q.id] ?? '-')).join(' ')}</span>
              <button class="text-red-600 hover:underline" data-del-survey="${h(r.id)}">ลบ</button>
            </li>`).join('')}
        </ul>
      </details>`}
    </div>`;

  $('#btnCopySurvey').onclick = async () => {
    try { await navigator.clipboard.writeText(surveyUrl); toast('คัดลอกลิงก์แล้ว'); } catch { prompt('คัดลอกลิงก์นี้', surveyUrl); }
  };
  $('#btnToggleSurvey').onclick = async () => {
    if (!confirm(open ? 'ปิดรับแบบประเมิน? (ผู้ใช้จะส่งแบบประเมินไม่ได้)' : 'เปิดรับแบบประเมิน?')) return;
    try {
      await setDoc(siteRef('config'), { surveyOpen: !open, updatedAt: serverTimestamp() }, { merge: true });
      toast(open ? 'ปิดรับแบบประเมินแล้ว' : 'เปิดรับแบบประเมินแล้ว');
      setTimeout(renderSurvey, 300);
    } catch (err) { toast(errText(err), 'error'); }
  };
  if (survey.loading && !survey.list) return;
  $('#btnReloadSurvey').onclick = loadSurveys;
  view.querySelectorAll('[data-sgroup]').forEach((b) => { b.onclick = () => { survey.group = b.dataset.sgroup; renderSurvey(); }; });
  $('#btnCsv').onclick = () => {
    const blob = new Blob([surveyCsv(list)], { type: 'text/csv;charset=utf-8' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `แบบประเมิน-ธรรมศึกษา2569-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(a.href);
  };
  view.querySelectorAll('[data-del-survey]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('ลบคำตอบนี้ถาวร? (กู้คืนไม่ได้)')) return;
      try {
        await deleteDoc(doc(db, COL_SURVEYS, b.dataset.delSurvey));
        survey.list = survey.list.filter((r) => r.id !== b.dataset.delSurvey);
        toast('ลบคำตอบแล้ว');
        renderSurvey();
      } catch (err) { toast(errText(err), 'error'); }
    };
  });
}

/* ------------------------------------------------------------------ แท็บ ระบบ */

function renderSystem() {
  const rooms = roomsSorted();
  const s = computeStats(rooms);
  const view = $('#appView');
  view.innerHTML = `
    <div class="grid gap-4 lg:grid-cols-2">
      <div class="card space-y-3 p-4 sm:p-5">
        <h2 class="font-display text-lg text-navy-900">ข้อมูลในระบบตอนนี้</h2>
        <ul class="space-y-1 text-sm">
          <li>ห้องสอบ: <b>${th(s.rooms)}</b> ห้อง · ผู้เข้าสอบ: <b>${th(s.total)}</b> คน · กรรมการกำกับห้อง: <b>${th(s.proctors)}</b></li>
          <li>อยู่ในผังอาคารแล้ว: <b>${th(rooms.filter((r) => findPlan(r.id)).length)}</b> / ${th(rooms.length)} ห้อง</li>
          <li>ข้อมูลการสอบ: ${state.config ? '✅ มี' : '❌ ยังไม่มี'} · คำสั่งแต่งตั้ง: ${state.committee ? '✅ มี' : '❌ ยังไม่มี'}</li>
        </ul>
        <button class="btn btn-ghost" id="btnExport">⬇ ส่งออกข้อมูลสำรอง (JSON)</button>
      </div>

      <div class="card space-y-3 p-4 sm:p-5">
        <h2 class="font-display text-lg text-navy-900">นำเข้าข้อมูลตั้งต้น</h2>
        <p class="text-sm text-slate-600">เลือกไฟล์ <code>seed-2569.json</code> จากเครื่องของผู้ดูแล (ถอดจากบัญชีเรียกชื่อและคำสั่ง ๐๗/๒๕๖๙: ผู้เข้าสอบ ๒๙๔ คน ๑๕ ห้อง) หรือไฟล์สำรองที่ส่งออกไว้ — ห้องที่มีอยู่แล้วจะถูกแทนที่ด้วยข้อมูลในไฟล์</p>
        <p class="rounded-xl bg-gold-100 p-3 text-xs text-navy-900">🔒 ไฟล์นี้มีชื่อ-นามสกุลเต็มของนักเรียน <b>ห้ามอัปขึ้น GitHub</b> — เก็บไว้ในเครื่องเท่านั้น และลบทิ้งภายใน ๒๕ ก.พ. ๒๕๗๐</p>
        <input type="file" id="seedFile" accept=".json,application/json" class="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-navy-900 file:px-3 file:py-2 file:font-semibold file:text-gold-300">
        <p id="seedInfo" class="hidden text-sm"></p>
        <label class="flex items-start gap-2 text-sm"><input type="checkbox" id="keepLoc" class="mt-1 h-4 w-4" checked> คงตำแหน่งห้องและหมุดที่กรอกไว้แล้ว</label>
        <label class="flex items-start gap-2 text-sm"><input type="checkbox" id="withConfig" class="mt-1 h-4 w-4" ${state.config ? '' : 'checked'}> นำเข้าข้อมูลการสอบ (วันเวลา ตารางสอบ ระเบียบ) ด้วย — ลิงก์แผนผังและประกาศเดิมจะคงไว้</label>
        <label class="flex items-start gap-2 text-sm"><input type="checkbox" id="withCommittee" class="mt-1 h-4 w-4" ${state.committee ? '' : 'checked'}> นำเข้าคำสั่งแต่งตั้ง (กรรมการดำเนินการ/เลขานุการ) ด้วย</label>
        <button class="btn btn-gold" id="btnImport" disabled>นำเข้าข้อมูลตั้งต้น</button>
      </div>
    </div>`;

  $('#btnExport').onclick = () => {
    const strip = (o) => JSON.parse(JSON.stringify(o, (k, v) => (k === 'updatedAt' ? undefined : v)));
    const data = { exportedAt: new Date().toISOString(), config: strip(state.config), committee: strip(state.committee), rooms: strip(rooms) };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `dhamma69-backup-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // อ่านไฟล์จากเครื่องผู้ดูแล (ไม่เก็บไฟล์รายชื่อไว้บนเว็บ — กันข้อมูลเต็มรั่วผ่าน GitHub Pages)
  let seed = null;
  $('#seedFile').onchange = async (e) => {
    const info = $('#seedInfo');
    seed = null;
    $('#btnImport').disabled = true;
    const file = e.target.files[0];
    if (!file) { info.classList.add('hidden'); return; }
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.rooms) || !data.rooms.every((r) => r.id && Array.isArray(r.students))) throw new Error('bad');
      seed = data;
      const n = data.rooms.reduce((t, r) => t + r.students.length, 0);
      info.className = 'text-sm text-green-700';
      info.textContent = `✅ ${file.name}: ${th(data.rooms.length)} ห้อง · ผู้เข้าสอบ ${th(n)} คน${data.committee ? ' · มีคำสั่งแต่งตั้ง' : ''}`;
      $('#btnImport').disabled = false;
      if (!data.config) $('#withConfig').checked = false;
      if (!data.committee) $('#withCommittee').checked = false;
    } catch {
      info.className = 'text-sm text-red-700';
      info.textContent = '❌ ไฟล์ไม่ถูกต้อง — ต้องเป็นไฟล์ seed-2569.json หรือไฟล์สำรองที่ส่งออกจากหน้านี้';
    }
  };

  $('#btnImport').onclick = async () => {
    if (!seed) return;
    if (prompt('พิมพ์คำว่า ยืนยัน เพื่อนำเข้าข้อมูลตั้งต้น') !== 'ยืนยัน') return;
    const btn = $('#btnImport');
    btn.disabled = true; btn.textContent = 'กำลังนำเข้า…';
    try {
      const keep = $('#keepLoc').checked;
      const batch = writeBatch(db);
      for (const r of seed.rooms) {
        const old = state.rooms.get(r.id);
        const room = { ...r };
        if (keep && old) { room.location = old.location || room.location; }
        batch.set(roomRef(r.id), roomPayload(room));
      }
      if ($('#withConfig').checked && seed.config) {
        const { mapUrl, announcement, ...cfg } = seed.config;
        const extra = state.config ? {} : { mapUrl, announcement };
        batch.set(siteRef('config'), { ...cfg, ...extra, updatedAt: serverTimestamp() }, { merge: true });
      }
      if ($('#withCommittee').checked && seed.committee) batch.set(siteRef('committee'), { ...seed.committee, updatedAt: serverTimestamp() });
      await batch.commit();
      state.dirty = false; state.editId = null; state.draft = null;
      toast(`นำเข้าเรียบร้อย: ${seed.rooms.length} ห้อง`);
    } catch (err) {
      toast(errText(err), 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'นำเข้าข้อมูลตั้งต้น';
    }
  };
}
