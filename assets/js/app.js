// หน้า landing สาธารณะ — อ่านข้อมูลจาก Firestore (อ่านอย่างเดียว ไม่ต้องล็อกอิน)
import { db, COL_ROOMS, COL_SITE } from './firebase.js';
import {
  collection, doc, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import {
  th, formatNo, LEVELS, LEVEL_ORDER, STAGES, STAGE_SHORT, LEVEL_COLOR, levelTitle, roomTitle, roomShort,
  roomPinLabel, locationText, sortRooms, fullName, buildIndex, search, escapeHtml as h, safeImageUrl, computeStats,
} from './utils.js';

const $ = (sel, root = document) => root.querySelector(sel);

const state = {
  rooms: [],
  index: [],
  config: null,
  committee: null,
  loaded: { rooms: false, config: false, committee: false },
  mode: 'name',
  pick: { level: 'tri', stage: 'p', roomId: null },
  mapRoomId: null,
  zoom: 1,
};

const ICON = {
  pin: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  list: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  share: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg>',
  chev: '<svg class="chev h-5 w-5 shrink-0 text-slate-400 transition" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
  expand: '<svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>',
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

// ?preview=seed : ดูหน้าเว็บด้วยข้อมูลจากไฟล์ data/seed-2569.json (ไว้ตรวจก่อนนำเข้า Firestore)
if (new URLSearchParams(location.search).get('preview') === 'seed') {
  fetch('data/seed-2569.json', { cache: 'no-store' }).then((r) => r.json()).then((seed) => {
    setRooms(seed.rooms);
    state.config = { ...seed.config, announcement: { active: true, tone: 'info', text: 'โหมดตัวอย่าง: แสดงข้อมูลจากไฟล์ตั้งต้น ยังไม่ใช่ข้อมูลจริงจากฐานข้อมูล' } };
    state.committee = seed.committee;
    state.loaded.config = true;
    state.loaded.committee = true;
    renderAll();
  }).catch(onError);
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
  renderFooter();
  if (firstRender) { firstRender = false; applyDeepLink(); }
}

const roomById = (id) => state.rooms.find((r) => r.id === id);
const mapUrl = () => safeImageUrl(state.config?.mapUrl);

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
  if (c.venue) $('#heroSub').textContent = `${th(c.subtitle || '')} · ${th(c.venue)} ${th(c.address || '')}`.replace(/^ · /, '');
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
}

function proctorList(room) {
  const list = (room.proctors || []).filter((p) => p.name);
  if (!list.length) return '<p class="text-sm text-slate-500">ยังไม่ระบุ</p>';
  return `<ul class="space-y-2">${list.map((p) => `
    <li class="flex items-start gap-3">
      <span class="mt-0.5 shrink-0 rounded-md ${p.role === 'หัวหน้า' ? 'bg-navy-900 text-gold-300' : 'bg-gold-100 text-navy-900'} px-2 py-0.5 text-[11px] font-bold">${h(p.role)}</span>
      <span class="min-w-0 text-sm"><b class="block text-navy-900">${h(th(p.name))}</b><span class="text-slate-500">${h(th(p.affiliation))}</span></span>
    </li>`).join('')}</ul>`;
}

function roomBanner(room) {
  const c = LEVEL_COLOR[room.level];
  const loc = locationText(room.location);
  return `
    <div class="relative overflow-hidden rounded-2xl bg-navy-900 p-4 text-white">
      <div class="dot-pattern absolute inset-0 opacity-30"></div>
      <div class="relative flex items-center gap-4">
        <div class="grid h-20 w-20 shrink-0 place-items-center rounded-2xl text-center" style="background:${c.bg};color:${c.fg}">
          <div><p class="text-[11px] font-bold leading-none">ห้องสอบที่</p><p class="font-display text-4xl leading-none">${th(room.roomNo)}</p></div>
        </div>
        <div class="min-w-0">
          <p class="font-display text-lg leading-snug text-gold-300">${h(levelTitle(room))}</p>
          <p class="mt-1 flex items-start gap-1 text-sm text-white/85">${ICON.pin}<span>${loc ? h(loc) : 'ตำแหน่งห้องจะแจ้งให้ทราบ'}</span></p>
          ${room.location?.note ? `<p class="mt-0.5 text-xs text-white/60">${h(th(room.location.note))}</p>` : ''}
        </div>
      </div>
    </div>`;
}

function actionButtons(room, student) {
  const canMap = room.pin && mapUrl();
  return `
    <div class="flex flex-wrap gap-2">
      ${canMap ? `<button class="inline-flex items-center gap-1.5 rounded-xl bg-gold-500 px-3.5 py-2 text-sm font-bold text-navy-950 hover:bg-gold-400" data-show-map="${h(room.id)}">${ICON.pin} ดูบนแผนผัง</button>` : ''}
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
          <span class="block truncate font-semibold text-navy-900">${h(fullName(s))}${s.note ? ` <span class="text-gold-600">${h(s.note)}</span>` : ''}</span>
          <span class="block truncate text-xs text-slate-500">${formatNo(s.no)} · ${h(roomShort(room))}</span>
        </span>
        ${ICON.chev}
      </summary>
      <div class="space-y-4 border-t border-slate-100 p-3.5">
        ${roomBanner(room)}
        <dl class="grid grid-cols-2 gap-3 text-sm">
          <div class="rounded-xl bg-cream p-3"><dt class="text-xs text-slate-500">เลขที่สอบ</dt><dd class="font-display text-lg text-navy-900">${formatNo(s.no)}</dd></div>
          <div class="rounded-xl bg-cream p-3"><dt class="text-xs text-slate-500">ชั้น / ช่วงชั้น</dt><dd class="font-semibold text-navy-900">${LEVELS[room.level]} · ${STAGES[room.stage]}</dd></div>
          <div class="rounded-xl bg-cream p-3"><dt class="text-xs text-slate-500">สังกัดวัด</dt><dd class="font-semibold text-navy-900">${h(s.wat || '-')}</dd></div>
          <div class="rounded-xl bg-cream p-3"><dt class="text-xs text-slate-500">องค์กร/สถานศึกษา</dt><dd class="font-semibold text-navy-900">${h(s.school || '-')}</dd></div>
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
        <div class="rounded-xl bg-cream p-3"><p class="text-lg">🔎</p>พิมพ์ชื่อหรือเลขที่สอบ</div>
        <div class="rounded-xl bg-cream p-3"><p class="text-lg">🏫</p>รู้ห้องสอบ + ตำแหน่ง</div>
        <div class="rounded-xl bg-cream p-3"><p class="text-lg">📍</p>ดูหมุดบนแผนผัง</div>
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
        </div>
        <div class="rounded-2xl border border-slate-200">
          <p class="border-b border-slate-100 px-4 py-3 text-sm font-bold text-navy-900">รายชื่อผู้เข้าสอบ ${th(students.length)} คน</p>
          ${students.length ? `<ol class="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
            ${students.map((s, i) => `
              <li class="flex items-center gap-3 px-4 py-2.5">
                <span class="w-6 shrink-0 text-right text-xs text-slate-400">${th(i + 1)}</span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-semibold text-navy-900">${h(fullName(s))}${s.note ? ` <span class="text-gold-600">${h(s.note)}</span>` : ''}</span>
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

/* ---------- ปุ่มต่าง ๆ ในผลค้นหา (delegation) ---------- */

document.addEventListener('click', async (e) => {
  const mapBtn = e.target.closest('[data-show-map]');
  if (mapBtn) { focusMapRoom(mapBtn.dataset.showMap); return; }
  const roomBtn = e.target.closest('[data-open-room]');
  if (roomBtn) { openRoomView(roomBtn.dataset.openRoom); return; }
  const shareBtn = e.target.closest('[data-share]');
  if (shareBtn) {
    const hit = state.index.find((x) => x.student.no === shareBtn.dataset.share);
    if (!hit) return;
    const url = `${location.origin}${location.pathname}?q=${encodeURIComponent(hit.no)}`;
    const text = `${fullName(hit.student)} เลขที่สอบ ${formatNo(hit.no)}\n${roomTitle(hit.room)}${locationText(hit.room.location) ? `\n📍 ${locationText(hit.room.location)}` : ''}`;
    try {
      if (navigator.share) await navigator.share({ title: 'ห้องสอบธรรมสนามหลวง', text, url });
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

function pinsHtml(activeId) {
  return state.rooms.filter((r) => r.pin).map((r) => {
    const c = LEVEL_COLOR[r.level];
    const active = r.id === activeId;
    return `<button class="map-pin ${active ? 'is-active pin-pulse' : ''}" data-pin="${h(r.id)}" style="left:${r.pin.x}%;top:${r.pin.y}%;background:${c.bg};color:${c.fg}" aria-label="${h(roomShort(r))}">${h(roomPinLabel(r))}</button>`;
  }).join('');
}

function renderMap() {
  const url = mapUrl();
  const box = $('#mapBody');
  if (!url) {
    box.innerHTML = `<div class="card grid min-h-48 place-items-center p-6 text-center">
      <div><p class="text-4xl">🗺️</p><p class="mt-2 font-semibold text-navy-900">แผนผังอาคารจะประกาศเร็ว ๆ นี้</p></div></div>`;
    return;
  }
  const active = roomById(state.mapRoomId);
  box.innerHTML = `
    <div class="card overflow-hidden">
      <div class="relative">
        <div id="mapBox" class="relative">
          <img src="${h(url)}" alt="แผนผังอาคารสนามสอบโรงเรียนชุมชนวัดไทยงาม" class="block w-full" loading="lazy">
          ${pinsHtml(state.mapRoomId)}
        </div>
        <button id="mapFull" class="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-xl bg-navy-900/85 px-3 py-2 text-xs font-semibold text-white backdrop-blur hover:bg-navy-900">${ICON.expand} ขยายเต็มจอ</button>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-3 text-xs text-slate-600">
        ${LEVEL_ORDER.map((lv) => `<span class="inline-flex items-center gap-1.5"><span class="h-3 w-3 rounded-full" style="background:${LEVEL_COLOR[lv].bg}"></span>ชั้น${LEVELS[lv]}</span>`).join('')}
        <span class="text-slate-400">· ป = ประถม ม = มัธยม · แตะหมุดเพื่อดูห้อง</span>
      </div>
      <div id="mapInfo" class="${active ? '' : 'hidden'} border-t border-slate-100 p-4">${active ? mapInfoHtml(active) : ''}</div>
    </div>`;
  $('#mapFull').onclick = openMapDialog;
  $('#mapBox').onclick = (e) => {
    const pin = e.target.closest('[data-pin]');
    if (pin) { state.mapRoomId = pin.dataset.pin; renderMap(); }
  };
}

function mapInfoHtml(room) {
  return `
    <div class="flex items-start gap-3">
      <div class="min-w-0 flex-1">
        <p class="font-display text-lg text-navy-900">${h(roomTitle(room))}</p>
        <p class="text-sm text-slate-600">${h(locationText(room.location) || 'ยังไม่ระบุตำแหน่ง')} · ผู้เข้าสอบ ${th((room.students || []).length)} คน</p>
      </div>
      <button class="shrink-0 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-navy-900 hover:bg-slate-50" data-open-room="${h(room.id)}">รายชื่อ</button>
    </div>`;
}

function focusMapRoom(roomId) {
  state.mapRoomId = roomId;
  renderMap();
  $('#map').scrollIntoView({ behavior: 'smooth' });
}

/* ---------- เต็มจอ + ซูม ---------- */

const ZOOMS = [1, 1.5, 2, 3];
function renderZoom() {
  const box = $('#mapZoomBox');
  box.style.width = `${ZOOMS[state.zoom] * 100}%`;
  $('#zoomLabel').textContent = `${th(ZOOMS[state.zoom] * 100)}%`;
}
function openMapDialog() {
  const url = mapUrl();
  if (!url) return;
  state.zoom = window.innerWidth < 768 ? 2 : 0;
  $('#mapZoomBox').innerHTML = `<img src="${h(url)}" alt="แผนผังอาคาร" class="block w-full">${pinsHtml(state.mapRoomId)}`;
  renderZoom();
  $('#mapDialog').showModal();
  const active = $('#mapZoomBox .is-active');
  if (active) setTimeout(() => active.scrollIntoView({ block: 'center', inline: 'center' }), 50);
}
document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => {
  state.zoom = Math.min(ZOOMS.length - 1, Math.max(0, state.zoom + Number(b.dataset.zoom)));
  renderZoom();
}));
$('#mapClose').addEventListener('click', () => $('#mapDialog').close());
$('#mapZoomBox').addEventListener('click', (e) => {
  const pin = e.target.closest('[data-pin]');
  if (!pin) return;
  $('#mapDialog').close();
  state.mapRoomId = pin.dataset.pin;
  renderMap();
});

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
      <span class="min-w-0 flex-1 text-sm"><b class="block text-navy-900">${h(th(p.name))}</b>${p.position ? `<span class="text-slate-500">${h(th(p.position))}</span>` : ''}</span>
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
  const m = location.hash.match(/^#room=([\w-]+)$/);
  if (m) openRoomView(m[1]);
}
