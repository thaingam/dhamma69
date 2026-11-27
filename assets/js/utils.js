// ฟังก์ชันช่วยที่ใช้ร่วมกันทั้ง landing และ admin

const TH_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

/** แปลงเลขอารบิกในข้อความเป็นเลขไทย */
export function th(value) {
  return String(value ?? '').replace(/[0-9]/g, (d) => TH_DIGITS[d]);
}

/** แปลงเลขไทยในข้อความเป็นเลขอารบิก */
export function toArabic(value) {
  return String(value ?? '').replace(/[๐-๙]/g, (d) => String(TH_DIGITS.indexOf(d)));
}

/** จัดรูปเลขที่สอบ '03010001' → '๐๓๐-๑๐๐๐๑' */
export function formatNo(no) {
  const s = toArabic(no).replace(/\D/g, '');
  return th(s.length > 3 ? `${s.slice(0, 3)}-${s.slice(3)}` : s);
}

export const LEVELS = { tri: 'ตรี', tho: 'โท', ek: 'เอก' };
export const LEVEL_ORDER = ['tri', 'tho', 'ek'];
export const STAGES = { p: 'ประถมศึกษา', m: 'มัธยมศึกษา' };
export const STAGE_SHORT = { p: 'ประถม', m: 'มัธยม' };

/** สีประจำชั้น (ใช้กับหมุดและป้าย) */
export const LEVEL_COLOR = {
  tri: { bg: '#C9A227', fg: '#0B1F3A', soft: '#FBF1D0' },
  tho: { bg: '#2563EB', fg: '#FFFFFF', soft: '#DBEAFE' },
  ek: { bg: '#B91C1C', fg: '#FFFFFF', soft: '#FEE2E2' },
};

export function levelTitle(room) {
  return `ธรรมศึกษาชั้น${LEVELS[room.level]} (${STAGES[room.stage]})`;
}
export function roomTitle(room) {
  return `${levelTitle(room)} ห้องสอบที่ ${th(room.roomNo)}`;
}
export function roomShort(room) {
  return `${LEVELS[room.level]} ${STAGE_SHORT[room.stage]} ห้อง ${th(room.roomNo)}`;
}
export function roomPinLabel(room) {
  return `${LEVELS[room.level]}${room.stage === 'p' ? 'ป' : 'ม'}${th(room.roomNo)}`;
}
export function locationText(loc) {
  if (!loc) return '';
  return [loc.building, loc.floor && `ชั้น ${th(loc.floor)}`, loc.roomName]
    .filter(Boolean).map((t) => th(t)).join(' · ');
}

export function sortRooms(rooms) {
  return [...rooms].sort((a, b) =>
    LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)
    || (a.stage === b.stage ? 0 : a.stage === 'p' ? -1 : 1)
    || a.roomNo - b.roomNo);
}

export function fullName(s) {
  return `${s.prefix || ''}${s.first || ''} ${s.last && s.last !== '-' ? s.last : ''}`.trim();
}

export function genderOf(prefix) {
  if (prefix === 'เด็กชาย' || prefix === 'นาย') return 'male';
  if (prefix === 'เด็กหญิง' || prefix === 'นางสาว' || prefix === 'นาง') return 'female';
  return 'other';
}

const QUERY_PREFIXES = ['เด็กชาย', 'เด็กหญิง', 'ด.ช.', 'ด.ญ.', 'ดช.', 'ดญ.', 'นางสาว', 'น.ส.', 'นาย'];

/** ทำข้อความให้อยู่ในรูปเดียวกันเพื่อเทียบตอนค้นหา */
export function normalize(text) {
  return toArabic(String(text ?? ''))
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/เเ/g, 'แ')
    .replace(/ํา/g, 'ำ')
    .toLowerCase()
    .replace(/[\s\-–.]/g, '');
}

/** เตรียมคำค้น: ตัดคำนำหน้าออก แยกว่าเป็นตัวเลขหรือชื่อ */
export function parseQuery(raw) {
  let q = toArabic(String(raw ?? '')).trim();
  for (const p of QUERY_PREFIXES) {
    if (q.startsWith(p)) { q = q.slice(p.length); break; }
  }
  const n = normalize(q);
  return { text: n, isNumber: /^\d+$/.test(n) };
}

/** สร้างดัชนีค้นหาจากห้องทั้งหมด */
export function buildIndex(rooms) {
  const list = [];
  for (const room of rooms) {
    for (const s of room.students || []) {
      list.push({
        student: s,
        room,
        no: toArabic(s.no).replace(/\D/g, ''),
        name: normalize(`${s.first}${s.last === '-' ? '' : s.last}`),
        first: normalize(s.first),
        last: normalize(s.last),
      });
    }
  }
  return list;
}

export function search(index, raw, limit = 50) {
  const { text, isNumber } = parseQuery(raw);
  if (!text || (!isNumber && text.length < 2) || (isNumber && text.length < 3)) return [];
  const hits = [];
  for (const item of index) {
    let score = -1;
    if (isNumber) {
      if (item.no === text || item.no.endsWith(text)) score = 0;
      else if (item.no.includes(text)) score = 1;
    } else if (item.first.startsWith(text) || item.last.startsWith(text)) score = 0;
    else if (item.name.includes(text)) score = 1;
    if (score >= 0) hits.push({ ...item, score });
  }
  hits.sort((a, b) => a.score - b.score || a.no.localeCompare(b.no));
  return hits.slice(0, limit);
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/** อนุญาตเฉพาะลิงก์ภาพ https (กันการใส่ javascript: ฯลฯ) */
export function safeImageUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' ? u.href : '';
  } catch {
    return '';
  }
}

export function computeStats(rooms) {
  const byLevel = {};
  for (const lv of LEVEL_ORDER) byLevel[lv] = { total: 0, p: 0, m: 0, rooms: 0 };
  const byWat = {};
  const gender = { male: 0, female: 0, other: 0 };
  let total = 0, proctors = 0, biggest = null;
  for (const r of rooms) {
    const n = (r.students || []).length;
    const lv = byLevel[r.level];
    if (lv) { lv.total += n; lv[r.stage] += n; lv.rooms += 1; }
    total += n;
    proctors += (r.proctors || []).filter((p) => p.name).length;
    if (!biggest || n > (biggest.students || []).length) biggest = r;
    for (const s of r.students || []) {
      byWat[s.wat || 'ไม่ระบุ'] = (byWat[s.wat || 'ไม่ระบุ'] || 0) + 1;
      gender[genderOf(s.prefix)] += 1;
    }
  }
  return { total, rooms: rooms.length, proctors, byLevel, byWat, gender, biggest };
}
