// ผังห้องสอบรายอาคาร — ถอดจากภาพผังที่โรงเรียนส่งมา แล้ววาดใหม่ด้วย canvas (floorplan-canvas.js)
//
// พิกัดเป็นพิกเซลจากภาพต้นฉบับ วัดจากมุมซ้ายบนของแถบอาคารแต่ละชั้น
//   band: { w, h } ขนาดแถบอาคาร (ค่าเริ่มต้น 1430 × 408)
//   rooms: { x, y, w, h, room?: 'id ห้องสอบใน dhamma_rooms', label?: 'ชื่อห้องอื่น', short?: 'ชื่อย่อบนจอแคบ' }
//          kind: 'assembly' = จุดรวมแถว (วาดเครื่องหมาย ✱ สีแดง)
//   stairs: { x, y, w, h } — ยื่นออกนอกแถบได้ (ตามภาพจริง)
//   toilets: [{ x, y, w, h }] — ห้องน้ำ
//   theme: สีของอาคาร (ตามสีอาคารในผังรวมโรงเรียน)
// floors เรียงจากชั้นบนลงล่าง (เหมือนภาพผัง)

export const BAND_W = 1430;
export const BAND_H = 408;

export const THEMES = {
  gold: { band: '#F2DE8A', bandStroke: '#D9B84A', idle: '#E3C963', idleText: '#7A6420', header: 'linear-gradient(90deg,#B88A1B,#C9A227)' },
  blue: { band: '#CDE7FB', bandStroke: '#7CC0EE', idle: '#96D2E3', idleText: '#164E63', header: 'linear-gradient(90deg,#0284C7,#38BDF8)' },
  green: { band: '#D3EFC8', bandStroke: '#86C76D', idle: '#A6D98F', idleText: '#2F5A1F', header: 'linear-gradient(90deg,#3F8F2B,#6BBF4E)' },
};

export const FLOORPLANS = [
  {
    id: 'b2',
    name: 'อาคาร ๒',
    subtitle: 'อาคารชำนาญเพ็ญชาติ',
    theme: 'gold',
    floors: [
      {
        no: 2,
        rooms: [
          { x: 41, y: 35, w: 272, h: 312, room: 'tri-p-1' },
          { x: 343, y: 35, w: 272, h: 312, room: 'tri-p-2' },
          { x: 642, y: 35, w: 272, h: 312, room: 'tri-p-3' },
          { x: 942, y: 35, w: 272, h: 312 },
        ],
        stairs: { x: 1205, y: 317, w: 225, h: 182 },
      },
      {
        no: 1,
        rooms: [
          { x: 27, y: 50, w: 272, h: 312, room: 'tri-p-4' },
          { x: 337, y: 50, w: 599, h: 312 },
          { x: 974, y: 50, w: 272, h: 312 },
        ],
      },
    ],
  },
  {
    id: 'b3',
    name: 'อาคาร ๓',
    subtitle: 'อาคารอำนวยการ',
    theme: 'blue',
    note: 'ชั้น ๑ ไม่มีห้องสอบ',
    band: { w: 1841, h: 408 },
    floors: [
      {
        no: 3,
        rooms: [
          { x: 61, y: 0, w: 272, h: 312 },
          { x: 351, y: 0, w: 272, h: 312 },
          { x: 641, y: 0, w: 272, h: 312 },
          { x: 932, y: 0, w: 272, h: 312, room: 'tho-p-3' },
          { x: 1221, y: 0, w: 272, h: 312, room: 'tho-p-2' },
          { x: 1510, y: 0, w: 272, h: 312, room: 'tho-m-1' },
        ],
      },
      {
        no: 2,
        rooms: [
          { x: 61, y: 0, w: 272, h: 312, label: 'ห้องผู้อำนวยการ', short: 'ห้อง ผอ.' },
          { x: 351, y: 0, w: 272, h: 312, label: 'ห้องประชุม', short: 'ประชุม' },
          { x: 641, y: 0, w: 272, h: 312, label: 'ห้องธุรการ', short: 'ธุรการ' },
          { x: 932, y: 0, w: 272, h: 312, room: 'ek-m-2' },
          { x: 1221, y: 0, w: 272, h: 312, room: 'ek-m-1' },
          { x: 1510, y: 0, w: 272, h: 312, room: 'tho-p-1' },
        ],
      },
    ],
  },
  {
    id: 'b4',
    name: 'อาคาร ๔',
    subtitle: 'อาคารสีเขียว',
    theme: 'green',
    band: { w: 1842, h: 408 },
    floors: [
      {
        no: 2,
        rooms: [
          { x: 62, y: 0, w: 272, h: 312, room: 'ek-p-1' },
          { x: 352, y: 0, w: 272, h: 312, room: 'tho-p-4' },
          { x: 642, y: 0, w: 272, h: 312, room: 'tho-p-5' },
          { x: 932, y: 0, w: 272, h: 312, room: 'tho-p-6' },
          { x: 1221, y: 0, w: 272, h: 312 },
          { x: 1511, y: 0, w: 272, h: 312, room: 'tri-m-1' },
        ],
      },
      {
        no: 1,
        rooms: [
          { x: 180, y: 48, w: 1441, h: 312, kind: 'assembly', label: 'จุดรวมแถวและรับข้อสอบ', short: 'จุดรวมแถว/รับข้อสอบ' },
        ],
        toilets: [
          { x: 14, y: 210, w: 150, h: 180 },
          { x: 1678, y: 210, w: 150, h: 180 },
        ],
      },
    ],
  },
];

export const planBand = (plan) => ({ w: BAND_W, h: BAND_H, ...(plan.band || {}) });
export const planTheme = (plan) => THEMES[plan.theme] || THEMES.gold;

/** หาผังและชั้นของห้องสอบ */
export function findPlan(roomId) {
  for (const plan of FLOORPLANS) {
    for (const floor of plan.floors) {
      if (floor.rooms.some((r) => r.room === roomId)) return { plan, floor };
    }
  }
  return null;
}

/** ตำแหน่งที่ใช้แสดงผล: อาคาร/ชั้นจากผัง (ถ้ามี) + ชื่อห้องจริง/หมายเหตุที่ admin กรอก */
export function effectiveLocation(room) {
  const loc = { building: '', floor: '', roomName: '', note: '', ...(room?.location || {}) };
  const found = room && findPlan(room.id);
  if (found) {
    loc.building = `${found.plan.name} (${found.plan.subtitle.replace(/^อาคาร/, '')})`;
    loc.floor = String(found.floor.no);
  }
  return loc;
}
