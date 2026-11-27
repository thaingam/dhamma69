// แบบประเมินความพึงพอใจ — ใช้ร่วมกันทั้งหน้าแบบประเมิน (survey/) และหน้า admin
// ถ้าเพิ่ม/ลบข้อคำถาม ต้องแก้รายการ q1..qN ใน validDhammaSurvey() ของ firestore.rules ให้ตรงกันด้วย

export const COL_SURVEYS = 'dhamma_surveys';
export const SURVEY_VERSION = 1;
export const TEXT_MAX = 1000;

export const GROUPS = [
  { id: 'monk', label: 'พระภิกษุ / พระกรรมการ', icon: 'wheel' },
  { id: 'teacher', label: 'ครู / กรรมการคุมสอบ', icon: 'teacher' },
  { id: 'student', label: 'นักเรียนผู้เข้าสอบ', icon: 'student' },
  { id: 'helper', label: 'นักเรียนผู้ช่วยกรรมการ', icon: 'helper' },
  { id: 'other', label: 'ผู้ปกครอง / อื่น ๆ', icon: 'users' },
];

export const SECTIONS = [
  {
    title: 'ด้านสถานที่สอบ',
    items: [
      { id: 'q1', text: 'ห้องสอบสะอาด เป็นระเบียบเรียบร้อย' },
      { id: 'q2', text: 'ห้องสอบมีแสงสว่าง อากาศถ่ายเท โต๊ะ-เก้าอี้เหมาะสม' },
      { id: 'q3', text: 'ป้ายบอกทางและผังห้องสอบชัดเจน หาห้องสอบได้ง่าย' },
      { id: 'q4', text: 'ห้องน้ำ น้ำดื่ม และสิ่งอำนวยความสะดวกเพียงพอ' },
      { id: 'q5', text: 'สถานที่ปลอดภัย การเดินทางและที่จอดรถสะดวก' },
    ],
  },
  {
    title: 'ด้านการดำเนินงานของคณะกรรมการ',
    items: [
      { id: 'q6', text: 'การประชาสัมพันธ์และแจ้งข้อมูลก่อนวันสอบ' },
      { id: 'q7', text: 'การจัดแถว แจกและเก็บข้อสอบ ตรงตามเวลา' },
      { id: 'q8', text: 'ความพร้อมและการอำนวยความสะดวกของคณะกรรมการ' },
      { id: 'q9', text: 'การคุมสอบเป็นไปด้วยความเรียบร้อย ยุติธรรม' },
      { id: 'q10', text: 'การต้อนรับ ความมีน้ำใจของคณะครูและบุคลากร' },
    ],
  },
  {
    title: 'ด้านเว็บไซต์สนามสอบ',
    items: [
      { id: 'q11', text: 'ค้นหาห้องสอบได้สะดวก รวดเร็ว' },
      { id: 'q12', text: 'ข้อมูลบนเว็บไซต์ถูกต้อง ครบถ้วน เป็นประโยชน์' },
    ],
  },
  {
    title: 'ภาพรวม',
    items: [
      { id: 'q13', text: 'ความพึงพอใจโดยรวมต่อการจัดสอบธรรมศึกษา ณ สนามสอบแห่งนี้' },
    ],
  },
];

export const QUESTIONS = SECTIONS.flatMap((s) => s.items);

export const SCALE = [
  { v: 5, label: 'มากที่สุด', face: 'face5' },
  { v: 4, label: 'มาก', face: 'face4' },
  { v: 3, label: 'ปานกลาง', face: 'face3' },
  { v: 2, label: 'น้อย', face: 'face2' },
  { v: 1, label: 'น้อยที่สุด', face: 'face1' },
];

/** แปลผลค่าเฉลี่ย (เกณฑ์มาตรฐาน ๕ ระดับ) */
export function levelOf(mean) {
  if (!mean) return '-';
  if (mean >= 4.51) return 'มากที่สุด';
  if (mean >= 3.51) return 'มาก';
  if (mean >= 2.51) return 'ปานกลาง';
  if (mean >= 1.51) return 'น้อย';
  return 'น้อยที่สุด';
}

export function meanSd(values) {
  const n = values.length;
  if (!n) return { n: 0, mean: 0, sd: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  return { n, mean, sd };
}
