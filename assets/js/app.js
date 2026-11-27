// หน้า landing สาธารณะ — อ่านข้อมูลจาก Firestore (อ่านอย่างเดียว ไม่ต้องล็อกอิน)
import { db, COL_ROOMS, COL_SITE } from './firebase.js';
import {
  collection, doc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import {
  th, formatNo, LEVELS, LEVEL_ORDER, STAGES, STAGE_SHORT, LEVEL_COLOR, levelTitle, roomTitle, roomShort,
  roomPinLabel, locationText, sortRooms, buildIndex, search, escapeHtml as h, safeImageUrl, computeStats,
  DEFAULT_MAP_URL, cloudinaryVariant, listSchools, parseQuery, publicName, publicPersonName,
} from './utils.js';
import { FLOORPLANS, findPlan, effectiveLocation, planTheme } from './floorplans.js';
import { mountFloorPlan } from './floorplan-canvas.js';
import { icon } from './icons.js';

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  rooms: [],
  index: [],
  config: null,
  committee: null,
  loaded: { rooms: false, config: false, committee: false },
  mode: 'name',
  pick: { level: 'tri', stage: 'p', roomId: null },
  school: { name: null, filter: '' },
  mapRoomId: null,
  buildingId: null,
  zoom: 1,
};

const ICON = {
  pin: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  list: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  share: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  chev: '<svg class="chev h-5 w-5 shrink-0 text-slate-400 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
  expand: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
  print: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/></svg>',
};

/* ------------------------------------------------------------------ โหลดข้อมูล */

function onError(err) {
  console.error(err);
  const box = $('#results');
  if (box && !state.rooms.length) {
    box.innerHTML = `<p class="rounded-xl bg-red-50 p-4 text-sm text-red-700">โหลดข้อมูลไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองรีเฟรชหน้าอีกครั้ง</p>`;
  }
}

function setRooms(rooms) {
  state.rooms = sortRooms(rooms);
  state.index = buildIndex(state.rooms);
  state.loaded.rooms = true;
}

// ?preview=seed : ดูหน้าเว็บด้วยไฟล์ seed-2569.json ที่เลือกจากเครื่อง (ไว้ตรวจก่อนนำเข้า Firestore)
// ไฟล์รายชื่อเต็มไม่อยู่บนเว็บ — อ่านในเบราว์เซอร์เท่านั้น ไม่ส่งไปที่ใด
if (new URLSearchParams(location.search).get('preview') === 'seed') {
  const picker = document.createElement('div');
  picker.className = 'fixed inset-x-3 top-20 z-50 mx-auto max-w-md rounded-2xl bg-white p-4 shadow-2xl ring-1 ring-slate-200';
  picker.innerHTML = `
    <p class="font-display text-lg text-navy-900">โหมดตัวอย่าง</p>
    <p class="mt-1 text-sm text-slate-600">เลือกไฟล์ <code>seed-2569.json</code> จากเครื่อง เพื่อดูหน้าเว็บด้วยข้อมูลตั้งต้น — ไฟล์ไม่ถูกอัปโหลดไปที่ใด</p>
    <input type="file" accept=".json,application/json" class="mt-3 block w-full text-sm">`;
  document.body.append(picker);
  picker.querySelector('input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const seed = JSON.parse(await file.text());
      picker.remove();
      setRooms(seed.rooms);
      state.config = { ...seed.config, announcement: { active: true, tone: 'info', text: 'โหมดตัวอย่าง: แสดงข้อมูลจากไฟล์ตั้งต้น ยังไม่ใช่ข้อมูลจริงจากฐานข้อมูล' } };
      state.committee = seed.committee;
      state.loaded.config = true;
      state.loaded.committee = true;
      renderAll();
    } catch (err) { onError(err); }
  });
} else {
  onSnapshot(collection(db, COL_ROOMS), (snap) => {
    setRooms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    renderAll();
  }, onError);

  onSnapshot(doc(db, COL_SITE, 'config'), (snap) => {
    state.config = snap.exists() ? snap.data() : {};
    state.loaded.config = true;
    renderAll();
  }, onError);

  onSnapshot(doc(db, COL_SITE, 'committee'), (snap) => {
    state.committee = snap.exists() ? snap.data() : {};
    state.loaded.committee = true;
    renderCommittee();
  }, onError);
}

let firstRender = true;
function renderAll() {
  if (!state.loaded.rooms || !state.loaded.config) return;
  renderAnnouncement();
  renderHero();
  renderSearchReady();
  renderStats();
  renderSchedule();
  renderMap();
  renderRules();
  renderCommittee();
  renderFeedback();
  renderFooter();
  if (firstRender) { firstRender = false; applyDeepLink(); }
}

const roomById = (id) => state.rooms.find((r) => r.id === id);
const roomLoc = (room) => locationText(effectiveLocation(room));
// แบ่งข้อความเป็นช่วง ๆ (inline-block) ให้ขึ้นบรรทัดใหม่ระหว่างช่วงเท่านั้น ไม่ตัดกลางคำ (เช่น ชำนาญเพ็ญ|ชาติ)
// max-w-full: ถ้าช่วงไหนยาวเกินจอจริง ๆ ยังตัดภายในช่วงได้ ไม่ล้นกล่อง
const chunks = (text, sep = /\s·\s/) => String(text || '').split(sep).map((t) => t.trim()).filter(Boolean)
  .map((t) => `<span class="inline-block max-w-full">${h(th(t))}</span>`);
// keep: ตัดบรรทัดได้เฉพาะที่ " · " และหน้าวงเล็บ — "อาคาร ๒ | (ชำนาญเพ็ญชาติ) · | ชั้น ๒"
const keep = (text) => String(text || '').split(/(\s·\s|\s(?=\())/)
  .map((t, i) => (i % 2 ? (t.includes('·') ? ' · ' : ' ') : t && `<span class="inline-block max-w-full">${h(th(t))}</span>`)).join('');
const mapUrl = () => safeImageUrl(state.config?.mapUrl) || DEFAULT_MAP_URL;
const MAP_INLINE = 'f_auto,q_auto,w_1400';   // ภาพในหน้าเว็บ (~300KB)
const MAP_FULL = 'f_auto,q_auto';            // ภาพเต็มจอ (ความละเอียดเต็ม)

/* ------------------------------------------------------------------ ประกาศ + hero */

function renderAnnouncement() {
  const a = state.config?.announcement;
  const box = $('#announce');
  if (!a?.active || !a.text) { box.classList.add('hidden'); return; }
  const urgent = a.tone === 'urgent';
  box.className = urgent ? 'bg-red-700 text-white' : 'bg-gold-300 text-navy-950';
  box.innerHTML = `
    <div class="mx-auto flex max-w-5xl items-start gap-2 px-4 py-2.5 text-sm font-semibold">
      <span class="shrink-0 rounded-md ${urgent ? 'bg-white/20' : 'bg-navy-900 text-gold-300'} px-2 py-0.5 text-xs">${urgent ? 'ประกาศด่วน' : 'ประกาศ'}</span>
      <p class="whitespace-pre-line">${h(th(a.text))}</p>
    </div>`;
}

function renderHero() {
  const c = state.config || {};
  if (c.fieldCode) $('#heroCode').textContent = `รหัสสนาม ${th(c.fieldCode)}`;
  if (c.examDateText) $('#heroDate').textContent = th(c.examDateText);
  if (c.venue) $('#heroSub').innerHTML = [...chunks(c.subtitle, /\s·\s/), ...chunks(c.venue, /\s·\s/)].join(' · ');
  if (c.address) $('#heroAddr').innerHTML = `${icon('pin', 'mt-0.5 h-3.5 w-3.5 shrink-0 text-gold-300 sm:h-4 sm:w-4')}<span>${chunks(c.address, /\s+/).join(' ')}</span>`;
  tickCountdown();
}

let countdownTimer = null;
function tickCountdown() {
  clearTimeout(countdownTimer);
  const box = $('#countdown');
  const start = Date.parse(state.config?.examStart || '');
  const end = Date.parse(state.config?.examEnd || '') || start + 9 * 3600e3;
  if (!start) { box.innerHTML = ''; return; }
  const now = Date.now();
  if (now >= end) {
    box.innerHTML = `<p class="rounded-2xl bg-white/10 px-4 py-3 text-center font-display text-lg text-gold-300 ring-1 ring-white/15">การสอบเสร็จสิ้นแล้ว · ขออนุโมทนาบุญทุกท่าน</p>`;
    return;
  }
  if (now >= start) {
    box.innerHTML = `<p class="flex items-center justify-center gap-2 rounded-2xl bg-gold-500 px-4 py-3 text-center font-display text-lg text-navy-950">
      <span class="relative flex h-3 w-3"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-600 opacity-60"></span><span class="relative inline-flex h-3 w-3 rounded-full bg-red-600"></span></span>
      กำลังดำเนินการสอบ</p>`;
  } else {
    let s = Math.floor((start - now) / 1000);
    const parts = [[Math.floor(s / 86400), 'วัน'], [Math.floor((s %= 86400) / 3600), 'ชั่วโมง'], [Math.floor((s %= 3600) / 60), 'นาที'], [s % 60, 'วินาที']];
    box.innerHTML = `
      <p class="mb-2 text-xs font-semibold text-white/60">นับถอยหลังสู่วันสอบ</p>
      <div class="grid grid-cols-4 gap-2">
        ${parts.map(([v, label]) => `
          <div class="rounded-2xl bg-white/[.06] px-1 py-3 text-center ring-1 ring-gold-400/25">
            <p class="font-display text-3xl leading-none text-gold-300 tabular-nums sm:text-4xl">${th(String(v).padStart(2, '0'))}</p>
            <p class="mt-1 text-[11px] text-white/60">${label}</p>
          </div>`).join('')}
      </div>`;
  }
  countdownTimer = setTimeout(tickCountdown, 1000 - (Date.now() % 1000));
}

/* ------------------------------------------------------------------ ค้นหา */

function renderSearchReady() {
  const q = $('#q');
  q.disabled = false;
  q.placeholder = 'ชื่อ นามสกุล หรือเลขที่สอบ';
  if (!state.rooms.length) {
    $('#results').innerHTML = `<p class="rounded-xl bg-gold-100 p-4 text-sm text-navy-900">ยังไม่มีรายชื่อผู้เข้าสอบในระบบ</p>`;
    return;
  }
  runSearch();
  renderRoomPicker();
  renderSchoolPicker();
}

function proctorList(room) {
  const list = (room.proctors || []).filter((p) => p.name);
  if (!list.length) return '<p class="text-sm text-slate-500">ยังไม่ระบุ</p>';
  return `<ul class="space-y-2">${list.map((p) => `
    <li class="flex items-start gap-3">
      <span class="mt-0.5 shrink-0 rounded-md ${p.role === 'หัวหน้า' ? 'bg-navy-900 text-gold-300' : 'bg-gold-100 text-navy-900'} px-2 py-0.5 text-[11px] font-bold">${h(p.role)}</span>
      <span class="min-w-0 text-sm"><b class="block text-navy-900">${h(th(publicPersonName(p.name)))}</b><span class="text-slate-500">${h(th(p.affiliation))}</span></span>
    </li>`).join('')}</ul>`;
}

function roomBanner(room) {
  const c = LEVEL_COLOR[room.level];
  const loc = roomLoc(room);
  return `
    <div class="relative overflow-hidden rounded-2xl bg-navy-900 p-4 text-white">
      <div class="dot-pattern absolute inset-0 opacity-30"></div>
      <div class="relative flex items-center gap-4">
        <div class="grid h-20 w-20 shrink-0 place-items-center rounded-2xl text-center" style="background:${c.bg};color:${c.fg}">
          <div><p class="text-[11px] font-bold leading-none">ห้องสอบที่</p><p class="font-display text-4xl leading-none">${th(room.roomNo)}</p></div>
        </div>
        <div class="min-w-0">
          <p class="font-display text-lg leading-snug text-gold-300">${keep(levelTitle(room))}</p>
          <p class="mt-1 flex items-start gap-1 text-sm text-white/85">${ICON.pin}<span>${loc ? keep(loc) : 'ตำแหน่งห้องจะแจ้งให้ทราบ'}</span></p>
          ${room.location?.note ? `<p class="mt-0.5 text-xs text-white/60">${h(th(room.location.note))}</p>` : ''}
        </div>
      </div>
    </div>`;
}

function actionButtons(room, student) {
  const found = findPlan(room.id);
  return `
    <div class="flex flex-wrap gap-2">
      ${found ? `<button class="inline-flex items-center gap-1.5 rounded-xl bg-gold-500 px-3.5 py-2 text-sm font-bold text-navy-950 hover:bg-gold-400" data-show-map="${h(room.id)}">${ICON.pin} ดูผังห้องสอบ (${h(th(found.plan.name))})</button>` : ''}
      ${student ? `<button class="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-navy-900 hover:bg-slate-50" data-open-room="${h(room.id)}">${ICON.list} รายชื่อทั้งห้อง</button>
      <button class="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-navy-900 hover:bg-slate-50" data-share="${h(student.no)}">${ICON.share} แชร์</button>` : ''}
    </div>`;
}

function resultCard(hit, open) {
  const { student: s, room } = hit;
  const c = LEVEL_COLOR[room.level];
  return `
    <details class="group overflow-hidden rounded-2xl border border-slate-200 bg-white open:border-gold-400 open:shadow-md" ${open ? 'open' : ''}>
      <summary class="flex items-center gap-3 p-3.5">
        <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-center font-display text-lg leading-none" style="background:${c.soft};color:${room.level === 'tri' ? '#7A5A00' : c.bg}">${th(room.roomNo)}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-semibold text-navy-900">${h(publicName(s))}${s.note ? ` <span class="text-gold-600">${h(s.note)}</span>` : ''}</span>
          <span class="block truncate text-xs text-slate-500">${formatNo(s.no)} · ${h(roomShort(room))}</span>
        </span>
        ${ICON.chev}
      </summary>
      <div class="space-y-4 border-t border-slate-100 p-3.5">
        ${roomBanner(room)}
        <dl class="grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-xl bg-cream p-3"><dt class="text-xs text-slate-500">เลขที่สอบ</dt><dd class="font-display text-lg text-navy-900">${formatNo(s.no)}</dd></div>
          <div class="rounded-xl bg-cream p-3"><dt class="text-xs text-slate-500">ชั้น / ช่วงชั้น</dt><dd class="font-semibold text-navy-900">${LEVELS[room.level]} · ${STAGES[room.stage]}</dd></div>
          <div class="col-span-2 rounded-xl bg-cream p-3 sm:col-span-1"><dt class="text-xs text-slate-500">สังกัดวัด</dt><dd class="font-semibold text-navy-900">${h(s.wat || '-')}</dd></div>
          <div class="col-span-2 rounded-xl bg-cream p-3 sm:col-span-1"><dt class="text-xs text-slate-500">องค์กร/สถานศึกษา</dt><dd class="font-semibold text-navy-900">${h(s.school || '-')}</dd></div>
        </dl>
        <div><p class="mb-2 text-sm font-bold text-navy-900">กรรมการกำกับห้องสอบ</p>${proctorList(room)}</div>
        ${actionButtons(room, s)}
      </div>
    </details>`;
}

function runSearch() {
  const raw = $('#q').value;
  $('#qClear').classList.toggle('hidden', !raw);
  const box = $('#results');
  if (!state.rooms.length) return;
  if (!raw.trim()) {
    box.innerHTML = `
      <div class="grid grid-cols-3 gap-2 text-center text-xs text-slate-500">
        <div class="rounded-xl bg-cream p-3">${icon('search', 'mx-auto mb-1.5 h-6 w-6 text-gold-600')}พิมพ์ชื่อหรือเลขที่สอบ</div>
        <div class="rounded-xl bg-cream p-3">${icon('school', 'mx-auto mb-1.5 h-6 w-6 text-gold-600')}รู้ห้องสอบ + ตำแหน่ง</div>
        <div class="rounded-xl bg-cream p-3">${icon('pin', 'mx-auto mb-1.5 h-6 w-6 text-gold-600')}ดูหมุดบนแผนผัง</div>
      </div>`;
    return;
  }
  const hits = search(state.index, raw, 30);
  if (!hits.length) {
    box.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">
      ไม่พบผู้เข้าสอบที่ตรงกับ “${h(raw)}”<br><span class="text-xs text-slate-500">ลองพิมพ์เฉพาะชื่อ หรือเฉพาะนามสกุล หรือเลขที่สอบ ๕ หลักท้าย · ต้องพิมพ์อย่างน้อย ๒ ตัวอักษร</span></div>`;
    return;
  }
  box.innerHTML = `<p class="text-xs font-semibold text-slate-500">พบ ${th(hits.length)}${hits.length === 30 ? '+' : ''} รายการ${hits.length > 1 ? ' · แตะเพื่อดูรายละเอียด' : ''}</p>`
    + hits.map((hit, i) => resultCard(hit, hits.length === 1 || (i === 0 && hits[0].score === 0 && hits[1]?.score !== 0))).join('');
}

let searchTimer;
$('#q').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 120); });
$('#q').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
$('#qClear').addEventListener('click', () => { $('#q').value = ''; runSearch(); $('#q').focus(); });
document.querySelector('[data-example]').addEventListener('click', (e) => {
  $('#q').value = e.currentTarget.dataset.example; runSearch();
});
document.querySelectorAll('[data-focus-search]').forEach((a) => a.addEventListener('click', () => {
  setMode('name');
  setTimeout(() => $('#q').focus({ preventScroll: true }), 400);
}));

/* ---------- สลับโหมด ---------- */

function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
  $('#modeName').classList.toggle('hidden', mode !== 'name');
  $('#modeRoom').classList.toggle('hidden', mode !== 'room');
  $('#modeSchool').classList.toggle('hidden', mode !== 'school');
}
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

/* ---------- ดูตามห้อง ---------- */

function renderRoomPicker() {
  const { pick } = state;
  const levels = LEVEL_ORDER.filter((lv) => state.rooms.some((r) => r.level === lv));
  if (!levels.includes(pick.level)) pick.level = levels[0];
  const stages = ['p', 'm'].filter((st) => state.rooms.some((r) => r.level === pick.level && r.stage === st));
  if (!stages.includes(pick.stage)) pick.stage = stages[0];
  const rooms = state.rooms.filter((r) => r.level === pick.level && r.stage === pick.stage);
  if (!rooms.some((r) => r.id === pick.roomId)) pick.roomId = rooms[0]?.id || null;

  $('#pickLevel').innerHTML = levels.map((lv) => `<button class="seg ${lv === pick.level ? 'active' : ''}" data-level="${lv}">ชั้น${LEVELS[lv]}</button>`).join('');
  $('#pickStage').innerHTML = stages.map((st) => `<button class="seg ${st === pick.stage ? 'active' : ''}" data-stage="${st}">${STAGE_SHORT[st]}ศึกษา</button>`).join('');
  $('#pickRoom').innerHTML = rooms.map((r) => `
    <button class="chip ${r.id === pick.roomId ? 'active' : ''}" data-pick-room="${h(r.id)}">
      ห้อง ${th(r.roomNo)} <span class="ml-1 text-xs opacity-70">(${th((r.students || []).length)})</span>
    </button>`).join('');
  renderRoomDetail();
}

function renderRoomDetail() {
  const room = roomById(state.pick.roomId);
  const box = $('#roomDetail');
  if (!room) { box.innerHTML = ''; return; }
  const students = [...(room.students || [])].sort((a, b) => a.no.localeCompare(b.no));
  box.innerHTML = `
    <div class="space-y-4">
      ${roomBanner(room)}
      <div class="grid gap-4 md:grid-cols-[1fr_1.4fr]">
        <div class="space-y-3 rounded-2xl bg-cream p-4">
          <p class="text-sm font-bold text-navy-900">กรรมการกำกับห้องสอบ</p>
          ${proctorList(room)}
          ${actionButtons(room, null)}
          <div class="flex flex-wrap gap-2 border-t border-gold-300/50 pt-3">
            ${students.length ? `<button class="inline-flex items-center gap-1.5 rounded-xl bg-navy-900 px-3.5 py-2 text-sm font-semibold text-gold-300 hover:bg-navy-800" data-print-room="${h(room.id)}">${ICON.print} พิมพ์บัญชีรายชื่อห้องนี้</button>` : ''}
            <button class="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-navy-900 hover:bg-slate-50" data-print-all>${ICON.print} พิมพ์ทุกห้อง (ห้องละหน้า)</button>
          </div>
        </div>
        <div class="rounded-2xl border border-slate-200">
          <p class="border-b border-slate-100 px-4 py-3 text-sm font-bold text-navy-900">รายชื่อผู้เข้าสอบ ${th(students.length)} คน</p>
          ${students.length ? `<ol class="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
            ${students.map((s, i) => `
              <li class="flex items-center gap-3 px-4 py-2.5">
                <span class="w-6 shrink-0 text-right text-xs text-slate-400">${th(i + 1)}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold text-navy-900">${h(publicName(s))}${s.note ? ` <span class="text-gold-600">${h(s.note)}</span>` : ''}</span>
                  <span class="block text-xs text-slate-500">${formatNo(s.no)} · ${h(s.wat)}</span>
                </span>
              </li>`).join('')}
          </ol>` : '<p class="p-5 text-center text-sm text-slate-500">รอประกาศรายชื่อผู้เข้าสอบห้องนี้</p>'}
        </div>
      </div>
    </div>`;
}

$('#modeRoom').addEventListener('click', (e) => {
  const t = e.target.closest('[data-level],[data-stage],[data-pick-room]');
  if (!t) return;
  if (t.dataset.level) { state.pick.level = t.dataset.level; state.pick.roomId = null; }
  if (t.dataset.stage) { state.pick.stage = t.dataset.stage; state.pick.roomId = null; }
  if (t.dataset.pickRoom) state.pick.roomId = t.dataset.pickRoom;
  renderRoomPicker();
});

function openRoomView(roomId) {
  const room = roomById(roomId);
  if (!room) return;
  state.pick = { level: room.level, stage: room.stage, roomId };
  setMode('room');
  renderRoomPicker();
  $('#search').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- ดูตามโรงเรียน (ครู / ผู้ปกครอง ดูนักเรียนของโรงเรียนตนเอง) ---------- */

const schoolHits = (name) => state.index.filter((x) => x.school === name);

/** นักเรียนของโรงเรียน แยกตามห้องสอบ (เรียงห้องตามลำดับปกติ) */
function schoolGroups(hits) {
  return state.rooms
    .map((room) => ({ room, items: hits.filter((x) => x.room === room).sort((a, b) => a.no.localeCompare(b.no)) }))
    .filter((g) => g.items.length);
}

function filterSchoolHits(hits, raw) {
  const { text, isNumber } = parseQuery(raw);
  if (!text) return hits;
  return hits.filter((x) => (isNumber ? x.no.includes(text) : x.name.includes(text)));
}

function schoolUrl(name) {
  return `${location.origin}${location.pathname}?school=${encodeURIComponent(name)}`;
}

function renderSchoolPicker() {
  const schools = listSchools(state.index);
  if (!schools.some((s) => s.name === state.school.name)) state.school.name = null;
  $('#pickSchool').innerHTML = schools.map((s) => `
    <button class="chip flex items-center gap-2 text-left ${s.name === state.school.name ? 'active' : ''}" data-school="${h(s.name)}">
      ${icon('school', 'h-5 w-5 shrink-0 opacity-70')}
      <span class="min-w-0 flex-1 leading-snug">${h(th(s.name))}</span>
      <span class="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs">${th(s.total)} คน</span>
    </button>`).join('');
  renderSchoolDetail();
}

function renderSchoolDetail() {
  const box = $('#schoolDetail');
  const name = state.school.name;
  if (!name) {
    box.innerHTML = `<p class="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">
      เลือกโรงเรียนด้านบน เพื่อดูรายชื่อนักเรียนทั้งหมดของโรงเรียน<br><span class="text-xs text-slate-500">แยกตามห้องสอบ พร้อมตำแหน่งห้องและแผนผัง</span></p>`;
    return;
  }
  const hits = schoolHits(name);
  const byLevel = LEVEL_ORDER.map((lv) => [lv, hits.filter((x) => x.room.level === lv).length]).filter(([, n]) => n);
  const rooms = new Set(hits.map((x) => x.room.id)).size;
  const hadFocus = document.activeElement?.id === 'schoolFilter';
  box.innerHTML = `
    <div class="space-y-4">
      <div class="relative overflow-hidden rounded-2xl bg-navy-900 p-4 text-white">
        <div class="dot-pattern absolute inset-0 opacity-30"></div>
        <div class="relative">
          <p class="text-xs text-gold-300">นักเรียนจาก</p>
          <p class="font-display text-xl leading-snug">${h(th(name))}</p>
          <p class="mt-1 text-sm text-white/80">เข้าสอบ <b class="text-gold-300">${th(hits.length)}</b> คน · ใน ${th(rooms)} ห้องสอบ</p>
          <div class="mt-3 flex flex-wrap gap-2">
            ${byLevel.map(([lv, n]) => `<span class="rounded-full px-2.5 py-0.5 text-xs font-bold" style="background:${LEVEL_COLOR[lv].bg};color:${LEVEL_COLOR[lv].fg}">ชั้น${LEVELS[lv]} ${th(n)} คน</span>`).join('')}
          </div>
        </div>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row">
        <label for="schoolFilter" class="sr-only">ค้นหาชื่อในโรงเรียนนี้</label>
        <input id="schoolFilter" type="search" enterkeyhint="search" autocomplete="off" value="${h(state.school.filter)}"
          placeholder="ค้นชื่อ / เลขที่สอบ ในโรงเรียนนี้"
          class="min-w-0 flex-1 rounded-xl border-2 border-slate-200 bg-white px-4 py-2.5 text-navy-900 placeholder:text-slate-400 focus:border-gold-500 focus:outline-none focus:ring-4 focus:ring-gold-300/40">
        <div class="flex shrink-0 gap-2">
          <button class="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm font-semibold text-navy-900 hover:bg-slate-50" data-school-share>${ICON.share} แชร์รายชื่อ</button>
          <button class="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-navy-900 px-3.5 py-2.5 text-sm font-semibold text-gold-300 hover:bg-navy-800" data-school-print>${ICON.print} พิมพ์บัญชี</button>
        </div>
      </div>
      <div id="schoolList" class="space-y-3"></div>
    </div>`;
  renderSchoolList();
  if (hadFocus) { const f = $('#schoolFilter'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
}

function renderSchoolList() {
  const box = $('#schoolList');
  if (!box) return;
  const all = schoolHits(state.school.name);
  const hits = filterSchoolHits(all, state.school.filter);
  if (!hits.length) {
    box.innerHTML = `<p class="rounded-2xl border border-dashed border-slate-300 p-5 text-center text-sm text-slate-600">ไม่พบนักเรียนที่ตรงกับ “${h(state.school.filter)}” ในโรงเรียนนี้</p>`;
    return;
  }
  box.innerHTML = (hits.length < all.length ? `<p class="text-xs font-semibold text-slate-500">พบ ${th(hits.length)} จาก ${th(all.length)} คน</p>` : '')
    + schoolGroups(hits).map(({ room, items }) => {
      const c = LEVEL_COLOR[room.level];
      const loc = roomLoc(room);
      const plan = findPlan(room.id);
      return `
      <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div class="flex flex-wrap items-center gap-3 border-b border-slate-100 bg-cream px-3.5 py-3">
          <span class="grid h-11 w-11 shrink-0 place-items-center rounded-xl font-display text-lg leading-none" style="background:${c.bg};color:${c.fg}">${th(room.roomNo)}</span>
          <span class="min-w-[12rem] flex-1">
            <span class="block font-semibold text-navy-900">${h(roomShort(room))} <span class="text-xs font-normal text-slate-500">(${th(items.length)} คน)</span></span>
            <span class="flex items-start gap-1 text-xs text-slate-500">${ICON.pin}<span>${loc ? keep(loc) : 'ตำแหน่งห้องจะแจ้งให้ทราบ'}</span></span>
          </span>
          <span class="ml-auto flex gap-2">
            ${plan ? `<button class="rounded-lg bg-gold-500 px-2.5 py-1.5 text-xs font-bold text-navy-950 hover:bg-gold-400" data-show-map="${h(room.id)}">ดูผัง</button>` : ''}
            <button class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-navy-900 hover:bg-slate-50" data-open-room="${h(room.id)}">ทั้งห้อง</button>
          </span>
        </div>
        <ol class="divide-y divide-slate-100">
          ${items.map((x, i) => `
            <li class="flex items-center gap-3 px-4 py-2.5">
              <span class="w-6 shrink-0 text-right text-xs text-slate-400">${th(i + 1)}</span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-semibold text-navy-900">${h(publicName(x.student))}${x.student.note ? ` <span class="text-gold-600">${h(x.student.note)}</span>` : ''}</span>
                <span class="block text-xs text-slate-500">${formatNo(x.no)}${x.student.wat ? ` · ${h(x.student.wat)}` : ''}</span>
              </span>
            </li>`).join('')}
        </ol>
      </div>`;
    }).join('');
}

/** ข้อความรายชื่อทั้งโรงเรียน สำหรับส่งต่อในไลน์ / กลุ่มผู้ปกครอง */
function schoolShareText(name) {
  const hits = schoolHits(name);
  const lines = [`รายชื่อนักเรียน${th(name)} สอบธรรมศึกษา ๒๕๖๙ (${th(hits.length)} คน)`];
  for (const { room, items } of schoolGroups(hits)) {
    const loc = roomLoc(room);
    lines.push('', `▸ ${roomShort(room)}${loc ? ` — ${loc}` : ''} (${th(items.length)} คน)`);
    items.forEach((x, i) => lines.push(`${th(i + 1)}. ${publicName(x.student)} (${formatNo(x.no)})`));
  }
  return lines.join('\n');
}

function selectSchool(name) {
  state.school = { name, filter: '' };
  renderSchoolPicker();
}

/* ---------- พิมพ์บัญชีรายชื่อ (A4 · นามสกุลปิดบางส่วนเหมือนบนเว็บ) ---------- */

const LOGO_PRINT = 'https://res.cloudinary.com/djkbdwnsc/image/upload/f_png,q_auto,h_240/v1786978522/next-fullStack/Logo-thaingam_1_k2iec7.png';

function printHeader(title) {
  return `
    <div class="pr-head">
      <img src="${LOGO_PRINT}" alt="">
      <div>
        <h1>${h(title)}</h1>
        <p>สนามสอบธรรมศึกษา ประจำปี ๒๕๖๙ · สนามสอบจุดที่ ๔ โรงเรียนชุมชนวัดไทยงาม (รหัสสนาม ${h(th(state.config?.fieldCode || '๒๐๗๐๓๐'))})</p>
        ${state.config?.examDateText ? `<p>สอบ${h(th(state.config.examDateText))}</p>` : ''}
      </div>
    </div>`;
}

function printFooter() {
  const date = th(new Date().toLocaleDateString('th-TH', { dateStyle: 'long' }));
  return `<p class="pr-foot">พิมพ์เมื่อ ${date} จาก ${h(location.host + location.pathname)} · นามสกุลแสดงบางส่วนเพื่อคุ้มครองข้อมูลส่วนบุคคล · บัญชีฉบับจริงตรวจสอบได้ที่สนามสอบ</p>`;
}

function printProctors(room) {
  const list = (room.proctors || []).filter((p) => p.name);
  return list.length ? list.map((p) => `${h(p.role)} ${h(th(publicPersonName(p.name)))}`).join(' · ') : 'ยังไม่ระบุ';
}

function printTable(students, withSchool = true) {
  if (!students.length) return '<p class="pr-empty">รอประกาศรายชื่อผู้เข้าสอบ</p>';
  return `
    <table class="pr-table">
      <thead><tr><th class="c">ที่</th><th class="c">เลขที่สอบ</th><th>ชื่อ – นามสกุล</th><th class="nw">สังกัดวัด</th>${withSchool ? '<th class="nw">สถานศึกษา</th>' : ''}<th style="width:13%">หมายเหตุ</th></tr></thead>
      <tbody>${students.map((s, i) => `
        <tr>
          <td class="c">${th(i + 1)}</td>
          <td class="c">${formatNo(s.no)}</td>
          <td>${h(publicName(s))}${s.note ? ` ${h(s.note)}` : ''}</td>
          <td class="nw">${h(th(s.wat || '-'))}</td>
          ${withSchool ? `<td class="nw">${h(th(s.school || '-'))}</td>` : ''}
          <td></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

const sortedStudents = (list) => [...(list || [])].sort((a, b) => a.no.localeCompare(b.no));

/** บัญชีรายชื่อ ๑ ห้อง = ๑ หน้า (ใช้ติดหน้าห้องสอบได้) */
function roomPrintPage(room) {
  const students = sortedStudents(room.students);
  const loc = roomLoc(room);
  return `
    <section class="pr-page">
      ${printHeader('บัญชีรายชื่อผู้เข้าสอบ')}
      <div class="pr-sec">
        <h2>${h(roomTitle(room))}</h2>
        <p class="pr-meta">${loc ? `<b>สถานที่:</b> ${h(loc)} · ` : ''}<b>ผู้เข้าสอบ</b> ${th(students.length)} คน<br><b>กรรมการกำกับห้องสอบ:</b> ${printProctors(room)}</p>
        ${printTable(students)}
      </div>
      ${printFooter()}
    </section>`;
}

/** บัญชีรายชื่อนักเรียนของโรงเรียน แยกตามห้องสอบ (ต่อเนื่องกัน ไม่ขึ้นหน้าใหม่ทุกห้อง) */
function schoolPrintPage(name) {
  const hits = schoolHits(name);
  return `
    <section class="pr-page">
      ${printHeader(`บัญชีรายชื่อนักเรียน${th(name)}`)}
      <p class="pr-meta" style="margin-top:6pt">ผู้เข้าสอบรวม <b>${th(hits.length)}</b> คน · แยกตามห้องสอบ</p>
      ${schoolGroups(hits).map(({ room, items }) => {
        const loc = roomLoc(room);
        return `
        <div class="pr-sec">
          <h2>${h(roomTitle(room))} <span style="font-size:10.5pt;font-weight:400">(${th(items.length)} คน)</span></h2>
          <p class="pr-meta">${loc ? `<b>สถานที่:</b> ${h(loc)} · ` : ''}<b>กรรมการกำกับห้องสอบ:</b> ${printProctors(room)}</p>
          ${printTable(items.map((x) => x.student), false)}
        </div>`;
      }).join('')}
      ${printFooter()}
    </section>`;
}

async function printDoc(html, title) {
  const area = $('#printArea');
  area.innerHTML = html;
  // รอตราโรงเรียนโหลด (ไม่เกิน ๒ วินาที) ไม่งั้นภาพจะหายจากหน้าที่พิมพ์
  await Promise.race([
    Promise.all([...area.querySelectorAll('img')].map((img) => img.decode().catch(() => {}))),
    new Promise((r) => setTimeout(r, 2000)),
  ]);
  const oldTitle = document.title;
  document.title = title;                      // ใช้เป็นชื่อไฟล์ตอน "บันทึกเป็น PDF"
  document.body.classList.add('printing');
  const cleanup = () => {
    document.body.classList.remove('printing');
    document.title = oldTitle;
    area.innerHTML = '';
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  window.print();
}

function printRoom(roomId) {
  const room = roomById(roomId);
  if (room) printDoc(roomPrintPage(room), `บัญชีรายชื่อ ${roomShort(room)}`);
}

function printAllRooms() {
  const rooms = state.rooms.filter((r) => (r.students || []).length);
  printDoc(rooms.map(roomPrintPage).join(''), 'บัญชีรายชื่อผู้เข้าสอบ ทุกห้อง');
}

$('#modeSchool').addEventListener('click', async (e) => {
  const pick = e.target.closest('[data-school]');
  if (pick) { selectSchool(pick.dataset.school); return; }
  if (e.target.closest('[data-school-print]') && state.school.name) {
    printDoc(schoolPrintPage(state.school.name), `บัญชีรายชื่อ ${state.school.name}`);
    return;
  }
  const shareBtn = e.target.closest('[data-school-share]');
  if (shareBtn && state.school.name) {
    const text = schoolShareText(state.school.name);
    const url = schoolUrl(state.school.name);
    try {
      if (navigator.share) await navigator.share({ title: 'รายชื่อนักเรียนสอบธรรมศึกษา', text, url });
      else { await navigator.clipboard.writeText(`${text}\n\n${url}`); shareBtn.lastChild.textContent = ' คัดลอกแล้ว'; }
    } catch { /* ผู้ใช้กดยกเลิก */ }
  }
});
let schoolTimer;
$('#modeSchool').addEventListener('input', (e) => {
  if (e.target.id !== 'schoolFilter') return;
  state.school.filter = e.target.value;
  clearTimeout(schoolTimer);
  schoolTimer = setTimeout(renderSchoolList, 120);
});
$('#modeSchool').addEventListener('keydown', (e) => {
  if (e.target.id === 'schoolFilter' && e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
});

/* ---------- ปุ่มต่าง ๆ ในผลค้นหา (delegation) ---------- */

document.addEventListener('click', async (e) => {
  const mapBtn = e.target.closest('[data-show-map]');
  if (mapBtn) { focusMapRoom(mapBtn.dataset.showMap); return; }
  const printBtn = e.target.closest('[data-print-room]');
  if (printBtn) { printRoom(printBtn.dataset.printRoom); return; }
  if (e.target.closest('[data-print-all]')) { printAllRooms(); return; }
  const roomBtn = e.target.closest('[data-open-room]');
  if (roomBtn) { openRoomView(roomBtn.dataset.openRoom); return; }
  const shareBtn = e.target.closest('[data-share]');
  if (shareBtn) {
    const hit = state.index.find((x) => x.student.no === shareBtn.dataset.share);
    if (!hit) return;
    const url = `${location.origin}${location.pathname}?q=${encodeURIComponent(hit.no)}`;
    const text = `${publicName(hit.student)} เลขที่สอบ ${formatNo(hit.no)}\n${roomTitle(hit.room)}${roomLoc(hit.room) ? `\n📍 ${roomLoc(hit.room)}` : ''}`;
    try {
      if (navigator.share) await navigator.share({ title: 'ห้องสอบธรรมศึกษา', text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); shareBtn.lastChild.textContent = ' คัดลอกแล้ว'; }
    } catch { /* ผู้ใช้กดยกเลิก */ }
  }
});

/* ------------------------------------------------------------------ สถิติ */

function renderStats() {
  const s = computeStats(state.rooms);
  const box = $('#statsBody');
  if (!s.total && !s.rooms) { box.innerHTML = '<p class="text-sm text-slate-500">ยังไม่มีข้อมูล</p>'; return; }
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const wats = Object.entries(s.byWat).sort((a, b) => b[1] - a[1]);
  const maxWat = Math.max(...wats.map((w) => w[1]), 1);
  box.innerHTML = `
    <div class="grid grid-cols-3 gap-2 sm:gap-4">
      ${[[s.total, 'ผู้เข้าสอบทั้งหมด', 'คน'], [s.rooms, 'ห้องสอบ', 'ห้อง'], [s.proctors, 'กรรมการกำกับห้อง', 'รูป/คน']].map(([v, label, unit], i) => `
        <div class="rounded-2xl ${i === 0 ? 'bg-navy-900 text-white' : 'card'} p-3 text-center sm:p-5">
          <p class="font-display text-3xl leading-none sm:text-5xl ${i === 0 ? 'text-gold-300' : 'text-navy-900'}">${th(v)}</p>
          <p class="mt-1.5 text-[11px] leading-tight sm:text-sm ${i === 0 ? 'text-white/75' : 'text-slate-500'}">${label}<br class="sm:hidden"> <span class="opacity-70">(${unit})</span></p>
        </div>`).join('')}
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-3">
      ${LEVEL_ORDER.map((lv) => {
        const d = s.byLevel[lv];
        const c = LEVEL_COLOR[lv];
        return `
        <div class="card overflow-hidden">
          <div class="flex items-center justify-between px-4 pt-4">
            <p class="font-display text-xl text-navy-900">ชั้น${LEVELS[lv]}</p>
            <span class="rounded-full px-2.5 py-0.5 text-xs font-bold" style="background:${c.soft};color:${lv === 'tri' ? '#7A5A00' : c.bg}">${th(d.rooms)} ห้อง</span>
          </div>
          <p class="px-4 font-display text-4xl text-navy-900">${th(d.total)} <span class="text-base text-slate-500">คน</span></p>
          <div class="mx-4 mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div style="width:${pct(d.p, d.total)}%;background:${c.bg}"></div>
            <div style="width:${pct(d.m, d.total)}%;background:${c.bg};opacity:.45"></div>
          </div>
          <div class="grid grid-cols-2 divide-x divide-slate-100 px-1 py-3 text-center">
            <div><p class="text-xs text-slate-500"><span class="mr-1 inline-block h-2 w-2 rounded-full" style="background:${c.bg}"></span>ประถมศึกษา</p><p class="font-display text-xl text-navy-900">${th(d.p)}</p></div>
            <div><p class="text-xs text-slate-500"><span class="mr-1 inline-block h-2 w-2 rounded-full" style="background:${c.bg};opacity:.45"></span>มัธยมศึกษา</p><p class="font-display text-xl text-navy-900">${th(d.m)}</p></div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="mt-3 grid gap-3 sm:grid-cols-2">
      <div class="card p-4">
        <p class="font-display text-lg text-navy-900">แยกตามสังกัดวัด</p>
        <ul class="mt-3 space-y-2.5">
          ${wats.map(([w, n]) => `
            <li>
              <div class="flex justify-between text-sm"><span class="text-navy-900">${h(w)}</span><b class="text-navy-900">${th(n)} <span class="font-normal text-slate-500">คน</span></b></div>
              <div class="mt-1 h-2 rounded-full bg-slate-100"><div class="h-2 rounded-full bg-gradient-to-r from-gold-500 to-gold-300" style="width:${pct(n, maxWat)}%"></div></div>
            </li>`).join('')}
        </ul>
      </div>
      <div class="card p-4">
        <p class="font-display text-lg text-navy-900">ชาย / หญิง</p>
        <div class="mt-3 flex h-4 overflow-hidden rounded-full bg-slate-100">
          <div class="bg-navy-800" style="width:${pct(s.gender.male, s.total)}%"></div>
          <div class="bg-gold-400" style="width:${pct(s.gender.female, s.total)}%"></div>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 text-center">
          <div class="rounded-xl bg-cream p-3"><p class="text-xs text-slate-500"><span class="mr-1 inline-block h-2 w-2 rounded-full bg-navy-800"></span>ชาย</p><p class="font-display text-2xl text-navy-900">${th(s.gender.male)}</p><p class="text-xs text-slate-500">${th(pct(s.gender.male, s.total))}%</p></div>
          <div class="rounded-xl bg-cream p-3"><p class="text-xs text-slate-500"><span class="mr-1 inline-block h-2 w-2 rounded-full bg-gold-400"></span>หญิง</p><p class="font-display text-2xl text-navy-900">${th(s.gender.female)}</p><p class="text-xs text-slate-500">${th(pct(s.gender.female, s.total))}%</p></div>
        </div>
        ${s.biggest ? `<p class="mt-3 text-xs text-slate-500">ห้องที่มีผู้เข้าสอบมากที่สุด: <b class="text-navy-900">${h(roomShort(s.biggest))}</b> (${th((s.biggest.students || []).length)} คน)</p>` : ''}
      </div>
    </div>`;
}

/* ------------------------------------------------------------------ ตารางสอบ */

function renderSchedule() {
  const c = state.config || {};
  const items = c.schedule || [];
  $('#scheduleBody').innerHTML = `
    <div class="card overflow-hidden">
      <div class="flex items-center gap-3 bg-navy-900 px-4 py-3 text-white">
        <svg class="h-6 w-6 text-gold-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>
        <p class="font-display text-lg">${h(th(c.examDateText || ''))}</p>
      </div>
      <ol class="relative space-y-1 p-4">
        ${items.map((it, i) => `
          <li class="relative flex gap-4 pb-4 ${i < items.length - 1 ? 'before:absolute before:left-[2.6rem] before:top-12 before:h-[calc(100%-2.5rem)] before:w-0.5 before:bg-gold-300' : ''}">
            <span class="grid h-12 w-[5.2rem] shrink-0 place-items-center rounded-xl bg-gold-100 font-display text-lg text-navy-900 ring-1 ring-gold-300">${h(th(it.time))} น.</span>
            <span class="pt-2.5 font-semibold text-navy-900">${h(th(it.subject))}</span>
          </li>`).join('') || '<li class="text-sm text-slate-500">ยังไม่ประกาศตารางสอบ</li>'}
      </ol>
    </div>`;
}

/* ------------------------------------------------------------------ แผนผัง */
// ๑) ผังรวมโรงเรียน (config.mapUrl) — ภาพเดียว บอกว่าใช้อาคารใดสอบบ้าง
// ๒) ผังห้องสอบรายอาคาร — วาดด้วย canvas จาก floorplans.js ห้องที่ค้นหาเจอจะกระพริบ

let planCtl = null;      // ผังในหน้าเว็บ
let planFullCtl = null;  // ผังในหน้าต่างเต็มจอ

const roomsMap = () => new Map(state.rooms.map((r) => [r.id, r]));
const planRooms = (plan) => plan.floors.flatMap((f) => f.rooms.filter((r) => r.room && roomById(r.room)).map((r) => roomById(r.room)));

function mapFactsHtml() {
  const c = state.config || {};
  const facts = [
    c.examBuildings && ['school', 'อาคารที่ใช้สอบ', c.examBuildings],
    c.assemblyPoint && ['megaphone', 'จุดรวมแถวและแจกข้อสอบ', c.assemblyPoint],
  ].filter(Boolean);
  if (!facts.length) return '';
  return `<div class="mb-3 grid gap-2 sm:grid-cols-2">${facts.map(([name, label, text]) => `
    <div class="flex items-start gap-3 rounded-2xl bg-navy-900 p-3.5 text-white">
      <span class="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold-500/20 text-gold-300">${icon(name, 'h-5 w-5')}</span>
      <span class="min-w-0"><span class="block text-xs text-gold-300">${label}</span><span class="block font-semibold">${h(th(text))}</span></span>
    </div>`).join('')}</div>`;
}

function campusButtons() {
  const cls = 'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold sm:flex-none';
  return `<div class="flex shrink-0 gap-2">
    <button data-share-campus class="${cls} bg-gold-500 text-navy-950 hover:bg-gold-400">${ICON.share} <span data-label>แชร์ภาพ</span></button>
    <button data-full-campus class="${cls} bg-navy-900 text-white hover:bg-navy-800">${ICON.expand} ขยายเต็มจอ</button>
  </div>`;
}

/* ---------- แชร์ผังเป็นไฟล์ภาพ (ส่งเข้าไลน์ / บันทึกลงเครื่องได้) ---------- */

const SHARE_TITLE = 'สนามสอบธรรมศึกษา ๒๕๖๙ · โรงเรียนชุมชนวัดไทยงาม';
const shareFiles = new Map();   // เก็บไฟล์ที่สร้างแล้ว — แตะซ้ำแชร์ได้ทันที

function setLabel(btn, text, revertMs) {
  const el = btn.querySelector('[data-label]');
  if (!el) return;
  const original = el.dataset.original || (el.dataset.original = el.textContent);
  el.textContent = text;
  if (revertMs) setTimeout(() => { el.textContent = original; }, revertMs);
}

function downloadFile(file) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function shareImage(btn, key, makeFile) {
  let file = shareFiles.get(key);
  try {
    if (!file) {
      btn.disabled = true;
      setLabel(btn, 'กำลังเตรียมภาพ…');
      file = await makeFile();
      shareFiles.set(key, file);
      btn.disabled = false;
      setLabel(btn, btn.querySelector('[data-label]')?.dataset.original || '');
    }
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: SHARE_TITLE });
    } else {
      downloadFile(file);                         // คอมพิวเตอร์ที่แชร์ไฟล์ไม่ได้ → ดาวน์โหลดแทน
      setLabel(btn, 'ดาวน์โหลดแล้ว', 2500);
    }
  } catch (err) {
    btn.disabled = false;
    if (err.name === 'AbortError') return;        // ผู้ใช้กดยกเลิกหน้าต่างแชร์
    if (err.name === 'NotAllowedError' && file) { // iPhone: รอโหลดภาพนานจนหมดสิทธิ์แชร์ → ให้แตะอีกครั้ง
      setLabel(btn, 'ภาพพร้อมแล้ว แตะอีกครั้ง');
      return;
    }
    console.error(err);
    if (file) downloadFile(file);
    else setLabel(btn, 'แชร์ไม่สำเร็จ', 2500);
  }
}

/** ภาพผังรวมโรงเรียน (ขนาดพอดีส่งไลน์ ~๓๐๐KB) */
async function campusImageFile(url) {
  const res = await fetch(cloudinaryVariant(url, 'f_jpg,q_auto,w_1600'), { mode: 'cors' });
  if (!res.ok) throw new Error(`โหลดภาพไม่ได้ (${res.status})`);
  const blob = await res.blob();
  return new File([blob], 'thaingam-exam-map-2569.jpg', { type: blob.type || 'image/jpeg' });
}

function fitText(ctx, text, maxW, size, weight, family) {
  while (size > 10) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 1;
  }
  return size;
}

/** ภาพผังห้องสอบรายอาคาร: หัวภาพ (ชื่ออาคาร + สนามสอบ) + ห้องที่เลือก + ผังที่ห้องนั้นไฮไลต์ บนพื้นขาว */
async function planImageFile(plan, room) {
  const src = planCtl.snapshot();
  const W = src.width;
  const u = W / 40;                                // หน่วยขนาดตัวอักษรตามความกว้างภาพ
  const pad = Math.round(u * 1.2);
  const headH = Math.round(u * 4.4);
  const roomH = room ? Math.round(u * 2.6) : 0;
  const footH = Math.round(u * 1.8);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = headH + roomH + pad + src.height + footH;
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, out.width, out.height);
  // header ของธีมเป็น CSS linear-gradient → ดึงสีออกมาทำ gradient ของ canvas
  const stops = String(planTheme(plan).header).match(/#[0-9a-f]{3,8}/gi) || ['#0B1F3A'];
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  stops.forEach((c, i) => grad.addColorStop(stops.length > 1 ? i / (stops.length - 1) : 0, c));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, headH);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  const title = th(`แผนผัง${plan.name} (${plan.subtitle.replace(/^อาคาร/, '')})`);
  fitText(ctx, title, W - pad * 2, Math.round(u * 1.5), 700, 'Pridi, Sarabun, serif');
  ctx.fillText(title, pad, headH * 0.4);
  fitText(ctx, SHARE_TITLE, W - pad * 2, Math.round(u * 0.9), 500, 'Sarabun, sans-serif');
  ctx.globalAlpha = 0.9;
  ctx.fillText(SHARE_TITLE, pad, headH * 0.76);
  ctx.globalAlpha = 1;
  if (room) {
    ctx.fillStyle = '#FBF1D0';
    ctx.fillRect(0, headH, W, roomH);
    ctx.fillStyle = '#0B1F3A';
    const line = `📍 ${roomTitle(room)}${roomLoc(room) ? ` · ${roomLoc(room)}` : ''}`;
    fitText(ctx, line, W - pad * 2, Math.round(u * 1.05), 700, 'Sarabun, sans-serif');
    ctx.fillText(line, pad, headH + roomH / 2);
  }
  ctx.drawImage(src, 0, headH + roomH + pad / 2);
  ctx.fillStyle = '#64748B';
  const foot = th(plan.note ? `หมายเหตุ: ${plan.note}` : 'ห้องสีทองคือห้องสอบ');
  fitText(ctx, foot, W - pad * 2, Math.round(u * 0.8), 500, 'Sarabun, sans-serif');
  ctx.fillText(foot, pad, out.height - footH / 2);
  const blob = await new Promise((ok, fail) => out.toBlob((b) => (b ? ok(b) : fail(new Error('สร้างภาพไม่ได้'))), 'image/png'));
  return new File([blob], `thaingam-${plan.id}${room ? `-${room.id}` : ''}-2569.png`, { type: 'image/png' });
}

function renderMap() {
  const box = $('#mapBody');
  const campus = mapUrl();
  if (!FLOORPLANS.some((p) => p.id === state.buildingId)) state.buildingId = FLOORPLANS[0]?.id || null;
  const plan = FLOORPLANS.find((p) => p.id === state.buildingId);
  const rooms = plan ? planRooms(plan) : [];
  const active = rooms.find((r) => r.id === state.mapRoomId);

  box.innerHTML = `
    ${mapFactsHtml()}
    ${campus ? `
    <figure class="card overflow-hidden">
      <div class="relative">
        <img src="${h(cloudinaryVariant(campus, MAP_INLINE))}" alt="แผนผังสถานที่สอบธรรมศึกษา ๒๕๖๙ สนามสอบโรงเรียนชุมชนวัดไทยงาม" class="block w-full" loading="lazy">
      </div>
      <figcaption class="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center">
        <p class="min-w-0 flex-1"><b class="text-navy-900">ผังรวมโรงเรียน</b> · การสอบใช้หลายอาคาร หมุดสีแดงคืออาคารที่ใช้สอบ — ดูผังห้องสอบของแต่ละอาคารได้ด้านล่าง</p>
        ${campusButtons()}
      </figcaption>
    </figure>` : ''}

    ${plan ? `
    <div id="buildingMaps" class="mt-8">
      <h3 class="font-display text-xl text-navy-900">ผังห้องสอบแต่ละอาคาร</h3>
      <p class="mt-1 text-sm text-slate-500">เลือกอาคาร แล้วแตะห้องสอบเพื่อดูรายละเอียด</p>
      <div class="mt-3 grid gap-2" style="grid-template-columns:repeat(${Math.min(FLOORPLANS.length, 3)},minmax(0,1fr))">
        ${FLOORPLANS.map((p) => `
          <button class="chip ${p.id === plan.id ? 'active' : ''}" data-building="${h(p.id)}">
            <span class="block">${h(th(p.name))}</span>
            <span class="block text-xs font-normal opacity-75">${th(planRooms(p).length)} ห้องสอบ</span>
          </button>`).join('')}
      </div>
      <div class="card mt-3 overflow-hidden">
        <div class="flex items-center gap-3 px-4 py-3 text-white" style="background:${planTheme(plan).header}">
          <img src="assets/img/favicon.svg" alt="" class="h-8 w-8">
          <p class="min-w-0 flex-1 font-display text-lg leading-tight">แผนผัง${h(th(plan.name))} <span class="text-sm opacity-90">(${h(plan.subtitle.replace(/^อาคาร/, ''))})</span></p>
          <button data-share-plan class="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-navy-900/80 px-3 py-1.5 text-xs font-semibold hover:bg-navy-900" aria-label="แชร์ภาพผังอาคาร">${ICON.share}<span data-label class="hidden sm:inline">แชร์ภาพ</span></button>
          <button data-full-plan class="shrink-0 rounded-lg bg-navy-900/80 px-3 py-1.5 text-xs font-semibold hover:bg-navy-900" aria-label="ขยายเต็มจอ">${ICON.expand}</button>
        </div>
        <div id="planHost" class="px-2 py-3 sm:px-4"></div>
        ${plan.note ? `<p class="px-4 pb-3 text-xs font-semibold text-slate-500">หมายเหตุ: ${h(th(plan.note))}</p>` : ''}
        <div class="flex flex-wrap gap-2 border-t border-slate-100 px-4 py-3">
          ${rooms.map((r) => `<button class="rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${r.id === state.mapRoomId ? 'bg-navy-900 text-gold-300 ring-navy-900' : 'bg-white text-navy-900 ring-slate-200'}" data-plan-room="${h(r.id)}">${h(roomShort(r))}</button>`).join('')}
        </div>
        <div id="mapInfo" class="${active ? '' : 'hidden'} border-t border-slate-100 bg-cream p-4">${active ? mapInfoHtml(active) : ''}</div>
      </div>
    </div>` : ''}`;

  box.querySelector('[data-full-campus]')?.addEventListener('click', () => openImageDialog(campus, 'ผังรวมโรงเรียน'));
  box.querySelector('[data-share-campus]')?.addEventListener('click', (e) =>
    shareImage(e.currentTarget, `campus:${campus}`, () => campusImageFile(campus)));
  if (!plan) return;
  planCtl?.destroy();
  planCtl = mountFloorPlan($('#planHost'), { plan, rooms: roomsMap(), activeId: state.mapRoomId, onSelect: selectPlanRoom });
  box.querySelector('[data-full-plan]').addEventListener('click', () => openPlanDialog(plan));
  box.querySelector('[data-share-plan]').addEventListener('click', (e) => {
    const room = active || null;
    shareImage(e.currentTarget, `plan:${plan.id}:${room?.id || ''}:${$('#planHost canvas')?.width}`, () => planImageFile(plan, room));
  });
  $('#buildingMaps').addEventListener('click', (e) => {
    const b = e.target.closest('[data-building]');
    if (b) { state.buildingId = b.dataset.building; state.mapRoomId = null; renderMap(); return; }
    const r = e.target.closest('[data-plan-room]');
    if (r) selectPlanRoom(r.dataset.planRoom);
  });
}

function selectPlanRoom(roomId) {
  state.mapRoomId = state.mapRoomId === roomId ? null : roomId;
  renderMap();
}

function mapInfoHtml(room) {
  return `
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <p class="font-display text-lg text-navy-900">${h(roomTitle(room))}</p>
        <p class="text-sm text-slate-600">${keep(`${roomLoc(room) || 'ยังไม่ระบุตำแหน่ง'} · ผู้เข้าสอบ ${(room.students || []).length} คน`)}</p>
      </div>
      <button class="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-navy-900 hover:bg-slate-50" data-open-room="${h(room.id)}">รายชื่อ</button>
    </div>`;
}

/** จากผลค้นหา → ไปที่ผังอาคารของห้องนั้น และให้ห้องกระพริบ */
function focusMapRoom(roomId) {
  const found = findPlan(roomId);
  if (!found) return;
  state.buildingId = found.plan.id;
  state.mapRoomId = roomId;
  renderMap();
  $('#buildingMaps').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- เต็มจอ + ซูม ---------- */

const ZOOMS = [1, 1.5, 2, 3];
function renderZoom() {
  $('#mapZoomBox').style.width = `${ZOOMS[state.zoom] * 100}%`;
  $('#zoomLabel').textContent = `${th(ZOOMS[state.zoom] * 100)}%`;
}
function openDialog(title, zoom) {
  state.zoom = zoom;
  $('#mapDialogTitle').textContent = th(title);
  renderZoom();
  $('#mapDialog').showModal();
}
function openImageDialog(url, title) {
  if (!url) return;
  $('#mapZoomBox').innerHTML = `<img src="${h(cloudinaryVariant(url, MAP_FULL))}" alt="${h(title)}" class="block w-full">`;
  openDialog(title, window.innerWidth < 768 ? 2 : 0);
}
function openPlanDialog(plan) {
  const box = $('#mapZoomBox');
  box.innerHTML = '<div class="bg-white p-3"></div>';
  openDialog(`ผังห้องสอบ ${plan.name}`, window.innerWidth < 768 ? 2 : 0);
  planFullCtl?.destroy();
  planFullCtl = mountFloorPlan(box.firstElementChild, {
    plan, rooms: roomsMap(), activeId: state.mapRoomId,
    onSelect: (id) => { $('#mapDialog').close(); selectPlanRoom(id); },
  });
}
document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
  state.zoom = Math.min(ZOOMS.length - 1, Math.max(0, state.zoom + Number(b.dataset.zoom)));
  renderZoom();
}));
$('#mapClose').addEventListener('click', () => $('#mapDialog').close());
$('#mapDialog').addEventListener('close', () => { planFullCtl?.destroy(); planFullCtl = null; $('#mapZoomBox').innerHTML = ''; });

/* ------------------------------------------------------------------ ระเบียบ */

function renderRules() {
  const rules = state.config?.rules || [];
  $('#rulesBody').innerHTML = rules.length ? `
    <ol class="grid gap-3 sm:grid-cols-2">
      ${rules.map((r, i) => `
        <li class="card flex items-start gap-3 p-4">
          <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-900 font-display text-gold-300">${th(i + 1)}</span>
          <p class="pt-1.5 text-[15px] text-navy-900">${h(th(r))}</p>
        </li>`).join('')}
    </ol>` : '<p class="text-sm text-slate-500">ยังไม่ประกาศ</p>';
}

/* ------------------------------------------------------------------ คณะกรรมการ */

function personRows(list) {
  return `<ul class="divide-y divide-slate-100">${(list || []).map((p, i) => `
    <li class="flex items-start gap-3 px-4 py-2.5">
      <span class="w-6 shrink-0 pt-0.5 text-right text-xs text-slate-400">${th(i + 1)}</span>
      <span class="min-w-0 flex-1 text-sm"><b class="block text-navy-900">${h(th(publicPersonName(p.name)))}</b>${p.position ? `<span class="text-slate-500">${h(th(p.position))}</span>` : ''}</span>
      ${p.role ? `<span class="shrink-0 rounded-md bg-gold-100 px-2 py-0.5 text-[11px] font-bold text-navy-900">${h(p.role)}</span>` : ''}
    </li>`).join('')}</ul>`;
}

function accordion(title, count, body, open = false) {
  return `
    <details class="card overflow-hidden" ${open ? 'open' : ''}>
      <summary class="flex items-center gap-3 px-4 py-4">
        <span class="flex-1 font-display text-lg text-navy-900">${title}</span>
        <span class="rounded-full bg-navy-900 px-2.5 py-0.5 text-xs font-bold text-gold-300">${th(count)}</span>
        ${ICON.chev}
      </summary>
      <div class="border-t border-slate-100">${body}</div>
    </details>`;
}

function renderCommittee() {
  if (!state.loaded.committee || !state.loaded.rooms) return;
  const c = state.committee || {};
  const roomsWithProctors = state.rooms.filter((r) => (r.proctors || []).some((p) => p.name));
  const proctorBody = `<div class="divide-y divide-slate-100">${roomsWithProctors.map((r) => `
    <div class="px-4 py-3">
      <p class="mb-2 text-sm font-bold text-navy-800">${h(roomTitle(r))}</p>
      ${proctorList(r)}
    </div>`).join('')}</div>`;
  $('#committeeBody').innerHTML = `
    ${c.orderTitle ? `
      <div class="mb-4 rounded-2xl border border-gold-300 bg-gold-100/60 p-4 text-sm text-navy-900">
        <p class="font-display text-base">${h(th(c.orderTitle))}</p>
        <p>เรื่อง ${h(th(c.orderSubject || ''))}</p>
        <p class="text-xs text-slate-600">สั่ง ณ วันที่ ${h(th(c.orderDate || ''))}${c.signer ? ` · ${h(th(c.signer))}` : ''}</p>
      </div>` : ''}
    <div class="space-y-3">
      ${c.executive?.length ? accordion('คณะกรรมการดำเนินการ', c.executive.length, personRows(c.executive)) : ''}
      ${roomsWithProctors.length ? accordion('กรรมการกำกับห้องสอบ', roomsWithProctors.length + ' ห้อง', proctorBody) : ''}
      ${c.secretariat?.length ? accordion('กองงานเลขานุการ', c.secretariat.length, personRows(c.secretariat)) : ''}
    </div>`;
}

/* ------------------------------------------------------------------ แบบประเมิน */

function renderFeedback() {
  const open = state.config?.surveyOpen !== false;
  const btn = $('#feedbackBtn');
  btn.classList.toggle('pointer-events-none', !open);
  btn.classList.toggle('opacity-50', !open);
  btn.textContent = open ? 'ทำแบบประเมิน →' : 'ปิดรับแบบประเมินแล้ว';
  if (!open) btn.removeAttribute('href'); else btn.setAttribute('href', 'survey/');
}

/* ------------------------------------------------------------------ footer + เมนู */

function renderFooter() {
  if (state.config?.developer) $('#devName').textContent = state.config.developer;
  const times = [state.config?.updatedAt, ...state.rooms.map((r) => r.updatedAt)]
    .map((t) => (t?.toMillis ? t.toMillis() : 0)).filter(Boolean);
  if (times.length) {
    const d = new Date(Math.max(...times));
    $('#lastUpdate').textContent = `ปรับปรุงข้อมูลล่าสุด ${th(d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }))} น.`;
  }
}

// ไฮไลต์เมนูล่างตามส่วนที่กำลังดู
const navLinks = document.querySelectorAll('#bottomNav [data-sec]');
const observer = new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (en.isIntersecting) navLinks.forEach((a) => a.classList.toggle('active', a.dataset.sec === en.target.id));
  }
}, { rootMargin: '-45% 0px -50% 0px' });
['search', 'stats', 'schedule', 'map', 'committee'].forEach((id) => observer.observe(document.getElementById(id)));

/* ------------------------------------------------------------------ ลิงก์ตรง ?q= / #room= */

function applyDeepLink() {
  const params = new URLSearchParams(location.search);
  const q = params.get('q');
  if (q) {
    $('#q').value = q;
    runSearch();
    setTimeout(() => $('#search').scrollIntoView({ behavior: 'smooth' }), 300);
  }
  const school = params.get('school');
  if (school && state.index.some((x) => x.school === school)) {
    setMode('school');
    selectSchool(school);
    setTimeout(() => $('#search').scrollIntoView({ behavior: 'smooth' }), 300);
  }
  const m = location.hash.match(/^#room=([\w-]+)$/);
  if (m) openRoomView(m[1]);
}
