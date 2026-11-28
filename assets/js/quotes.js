// สุภาษิตธรรม (พุทธศาสนสุภาษิต) — แสดงสุ่มบนหน้าเว็บ ด้วยฟอนต์ Thasadith
// admin แก้ได้ที่แท็บ "ภาษิตธรรม" → เก็บใน dhamma_site/config.quotes
//   { active: true, interval: 15, items: [{ pali, thai, ref }] }
// ถ้ายังไม่เคยบันทึก หรือรายการว่าง → ใช้ชุดเริ่มต้นด้านล่าง

export const DEFAULT_QUOTES = [
  { pali: 'ททมาโน ปิโย โหติ', thai: 'ผู้ให้ ย่อมเป็นที่รัก' },
  { pali: 'อตฺตา หิ อตฺตโน นาโถ', thai: 'ตนแล เป็นที่พึ่งแห่งตน' },
  { pali: 'วิริเยน ทุกฺขมจฺเจติ', thai: 'คนจะล่วงทุกข์ได้ เพราะความเพียร' },
  { pali: 'สุสฺสูสํ ลภเต ปญฺญํ', thai: 'ผู้ฟังด้วยดี ย่อมได้ปัญญา' },
  { pali: 'นตฺถิ ปญฺญาสมา อาภา', thai: 'แสงสว่างเสมอด้วยปัญญา ไม่มี' },
  { pali: 'ปญฺญา นรานํ รตนํ', thai: 'ปัญญา เป็นรัตนะของนรชน' },
  { pali: 'อปฺปมาโท อมตํ ปทํ', thai: 'ความไม่ประมาท เป็นทางไม่ตาย' },
  { pali: 'สติ โลกสฺมิ ชาครา', thai: 'สติ เป็นเครื่องตื่นในโลก' },
  { pali: 'สจฺจํ เว อมตา วาจา', thai: 'คำสัตย์แล เป็นวาจาไม่ตาย' },
  { pali: 'ธมฺมจารี สุขํ เสติ', thai: 'ผู้ประพฤติธรรม ย่อมอยู่เป็นสุข' },
  { pali: 'สนฺตุฏฺฐี ปรมํ ธนํ', thai: 'ความสันโดษ เป็นทรัพย์อย่างยิ่ง' },
  { pali: 'สุขา สงฺฆสฺส สามคฺคี', thai: 'ความพร้อมเพรียงของหมู่ ให้เกิดสุข' },
];

export const DEFAULT_INTERVAL = 15;   // วินาทีต่อหนึ่งบท (0 = ไม่เปลี่ยนเอง)

// บรรทัดละบท: "บาลี | คำแปล | ที่มา (ถ้ามี)" — ไม่มี | ถือว่าเป็นคำแปลภาษาไทยอย่างเดียว
export function parseQuoteLines(text) {
  return String(text || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const parts = l.split('|').map((p) => p.trim());
    if (parts.length === 1) return { pali: '', thai: parts[0], ref: '' };
    const [pali, thai = '', ...ref] = parts;
    return { pali, thai, ref: ref.join(' | ') };
  }).filter((q) => q.pali || q.thai).slice(0, 100);
}

export function quoteLines(items) {
  return (items || []).map((q) => [q.pali, q.thai, q.ref].filter((x, i) => i < 2 || x).join(' | ')).join('\n');
}

// ค่าที่หน้าเว็บใช้จริง
export function effectiveQuotes(cfg) {
  const q = cfg?.quotes || {};
  const items = (q.items || []).filter((x) => x && (x.pali || x.thai));
  return {
    active: q.active !== false,
    interval: Number.isFinite(q.interval) ? q.interval : DEFAULT_INTERVAL,
    items: items.length ? items : DEFAULT_QUOTES,
  };
}
