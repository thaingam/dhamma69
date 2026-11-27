// ไอคอนเส้น (stroke) ชุดเดียวกันทั้งเว็บ — ใช้แทนอีโมจิ ให้หน้าตาเรียบ สม่ำเสมอ และแสดงผลเหมือนกันทุกเครื่อง
// icon('school', 'h-5 w-5') → <svg …> สีตาม currentColor

const P = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  school: '<path d="M3 21h18M5 21V9l7-5 7 5v12"/><path d="M10 21v-5h4v5M9 11h.01M15 11h.01"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  megaphone: '<path d="M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1Z"/><path d="M16 9a4 4 0 0 1 0 6M18.8 6.2a8 8 0 0 1 0 11.6"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 2.5h6V6H9zM9 11h6M9 15h6M9 19h3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
  wheel: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M12 3.5V10M12 14v6.5M3.5 12H10M14 12h6.5M6 6l4.6 4.6M13.4 13.4 18 18M18 6l-4.6 4.6M10.6 13.4 6 18"/>',
  teacher: '<rect x="3" y="3.5" width="18" height="12" rx="1.5"/><path d="M7 20l2.5-4.5M17 20l-2.5-4.5M7.5 8h6M7.5 11h4"/>',
  student: '<path d="m2 9 10-5 10 5-10 5Z"/><path d="M6 11v4.5c0 1.6 2.7 3 6 3s6-1.4 6-3V11M22 9v5"/>',
  helper: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="m16 11.5 2 2 4-4.5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z"/>',
  phone: '<rect x="6.5" y="2" width="11" height="20" rx="2.2"/><path d="M11 18.5h2"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"/><path d="M9 4v14M15 6v14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  print: '<path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
  // หน้าความพึงพอใจ ๕ ระดับ (มาก → น้อย)
  face5: '<circle cx="12" cy="12" r="9"/><path d="M8.6 9.6h.01M15.4 9.6h.01"/><path d="M7.5 13.5q4.5 5.5 9 0Z"/>',
  face4: '<circle cx="12" cy="12" r="9"/><path d="M9 9.6h.01M15 9.6h.01M8.3 14q3.7 3.6 7.4 0"/>',
  face3: '<circle cx="12" cy="12" r="9"/><path d="M9 9.6h.01M15 9.6h.01M8.8 14.8q3.2 1.6 6.4 0"/>',
  face2: '<circle cx="12" cy="12" r="9"/><path d="M9 9.6h.01M15 9.6h.01M9 15.2h6"/>',
  face1: '<circle cx="12" cy="12" r="9"/><path d="M9 9.6h.01M15 9.6h.01M8.5 16.5q3.5-3.2 7 0"/>',
};

export function icon(name, cls = 'h-5 w-5', width = 2) {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
