// หน้าแบบประเมินความพึงพอใจ — ไม่ต้องล็อกอิน ส่งได้อย่างเดียว (อ่านผลได้เฉพาะ admin)
import { db, COL_SITE } from '../assets/js/firebase.js';
import {
  collection, addDoc, doc, getDoc, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/13.4.0/firebase-firestore.js';
import { th, escapeHtml as h } from '../assets/js/utils.js';
import {
  COL_SURVEYS, SURVEY_VERSION, TEXT_MAX, GROUPS, SECTIONS, QUESTIONS, SCALE,
} from '../assets/js/survey-questions.js';

const $ = (s, r = document) => r.querySelector(s);
const DONE_KEY = 'dhamma69-survey-done';
const PREVIEW = new URLSearchParams(location.search).has('preview');   // ?preview : ทดสอบหน้าตา ไม่บันทึกจริง

const state = { group: '', ans: {}, like: '', suggest: '' };

function answeredCount() {
  return QUESTIONS.filter((q) => state.ans[q.id]).length + (state.group ? 1 : 0);
}
const TOTAL = QUESTIONS.length + 1;

function updateBar() {
  const n = answeredCount();
  $('#progressText').textContent = n === TOTAL ? 'ตอบครบแล้ว พร้อมส่ง ✓' : `ตอบแล้ว ${th(n)} จาก ${th(TOTAL)} ข้อ`;
  $('#progressBar').style.width = `${(n / TOTAL) * 100}%`;
  $('#btnSubmit').disabled = n !== TOTAL;
}

function renderForm() {
  $('#bar').classList.remove('hidden');
  let no = 0;
  $('#app').innerHTML = `
    <section class="card p-4 sm:p-6">
      <p class="text-xs font-bold tracking-widest text-gold-600">ตอนที่ ๑</p>
      <h2 class="font-display text-xl text-navy-900">ผู้ตอบแบบประเมิน</h2>
      <div class="mt-3 grid gap-2 sm:grid-cols-2" id="groups">
        ${GROUPS.map((g) => `
          <button class="grp ${state.group === g.id ? 'on' : ''}" data-group="${g.id}">
            <span class="text-2xl">${g.icon}</span><span>${h(g.label)}</span>
          </button>`).join('')}
      </div>
    </section>

    <section class="card mt-4 p-4 sm:p-6">
      <p class="text-xs font-bold tracking-widest text-gold-600">ตอนที่ ๒</p>
      <h2 class="font-display text-xl text-navy-900">ระดับความพึงพอใจ</h2>
      <p class="mt-1 text-sm text-slate-500">แตะเลือกระดับความพึงพอใจของแต่ละข้อ (๕ = มากที่สุด · ๑ = น้อยที่สุด)</p>
      ${SECTIONS.map((sec) => `
        <h3 class="mt-6 rounded-xl bg-navy-900 px-3 py-2 font-display text-gold-300">${h(sec.title)}</h3>
        <ol class="mt-2 space-y-3">
          ${sec.items.map((q) => { no += 1; return `
            <li class="rounded-2xl border border-slate-200 p-3" id="row-${q.id}">
              <p class="text-[15px] font-semibold text-navy-900"><span class="text-gold-600">${th(no)}.</span> ${h(q.text)}</p>
              <div class="mt-2.5 grid grid-cols-5 gap-1.5" role="radiogroup" aria-label="${h(q.text)}">
                ${SCALE.map((s) => `
                  <button class="opt ${state.ans[q.id] === s.v ? 'on' : ''}" data-q="${q.id}" data-v="${s.v}" role="radio" aria-checked="${state.ans[q.id] === s.v}">
                    <span class="text-lg leading-none">${s.emoji}</span>
                    <span class="font-display text-lg leading-none">${th(s.v)}</span>
                    <span class="text-[10px] leading-tight opacity-80">${s.label}</span>
                  </button>`).join('')}
              </div>
            </li>`; }).join('')}
        </ol>`).join('')}
    </section>

    <section class="card mt-4 space-y-4 p-4 sm:p-6">
      <div>
        <p class="text-xs font-bold tracking-widest text-gold-600">ตอนที่ ๓</p>
        <h2 class="font-display text-xl text-navy-900">ความคิดเห็นเพิ่มเติม <span class="text-sm font-normal text-slate-500">(ไม่บังคับ)</span></h2>
        <p class="mt-1 text-xs text-slate-500">🔒 แบบประเมินไม่เก็บชื่อผู้ตอบ โปรดอย่าพิมพ์ชื่อ เบอร์โทร หรือข้อมูลส่วนตัวในช่องนี้ · ผลใช้เพื่อปรับปรุงการจัดสอบ และลบภายใน ๒๕ ก.พ. ๒๕๗๐ ·
          <a href="../privacy/" class="font-semibold text-navy-700 underline decoration-gold-400 underline-offset-2">ประกาศความเป็นส่วนตัว</a></p>
      </div>
      <div><label class="mb-1 block text-sm font-semibold text-navy-800" for="like">สิ่งที่ประทับใจ</label>
        <textarea id="like" maxlength="${TEXT_MAX}" rows="3" class="w-full rounded-xl border border-slate-300 p-3 text-base focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300/60">${h(state.like)}</textarea></div>
      <div><label class="mb-1 block text-sm font-semibold text-navy-800" for="suggest">ข้อเสนอแนะเพื่อการปรับปรุง</label>
        <textarea id="suggest" maxlength="${TEXT_MAX}" rows="3" class="w-full rounded-xl border border-slate-300 p-3 text-base focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-300/60">${h(state.suggest)}</textarea></div>
      <p id="formError" class="hidden rounded-xl bg-red-50 p-3 text-sm text-red-700"></p>
    </section>`;

  $('#groups').onclick = (e) => {
    const b = e.target.closest('[data-group]');
    if (!b) return;
    state.group = b.dataset.group;
    document.querySelectorAll('[data-group]').forEach((x) => x.classList.toggle('on', x === b));
    updateBar();
  };
  $('#app').addEventListener('click', (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    state.ans[b.dataset.q] = Number(b.dataset.v);
    b.parentElement.querySelectorAll('[data-q]').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-checked', String(x === b));
    });
    $(`#row-${b.dataset.q}`).classList.remove('ring-2', 'ring-red-400');
    updateBar();
  });
  $('#like').oninput = (e) => { state.like = e.target.value; };
  $('#suggest').oninput = (e) => { state.suggest = e.target.value; };
  updateBar();
}

function renderMessage(icon, title, body, again = false) {
  $('#bar').classList.add('hidden');
  $('#app').innerHTML = `
    <div class="card p-6 text-center sm:p-10">
      <p class="text-5xl">${icon}</p>
      <h2 class="mt-3 font-display text-2xl text-navy-900">${title}</h2>
      <p class="mx-auto mt-2 max-w-md text-slate-600">${body}</p>
      <div class="mt-6 flex flex-wrap justify-center gap-2">
        <a href="../" class="rounded-2xl bg-navy-900 px-5 py-3 font-bold text-gold-300">กลับหน้าหลัก</a>
        ${again ? '<button id="again" class="rounded-2xl border border-slate-300 px-5 py-3 font-semibold text-navy-900">ประเมินอีกครั้ง (ใช้เครื่องร่วมกัน)</button>' : ''}
      </div>
    </div>`;
  $('#again')?.addEventListener('click', () => {
    localStorage.removeItem(DONE_KEY);
    Object.assign(state, { group: '', ans: {}, like: '', suggest: '' });
    renderForm();
    window.scrollTo({ top: 0 });
  });
}

function thanks() {
  renderMessage('🙏', 'ขออนุโมทนาและขอบคุณ',
    'ที่สละเวลาร่วมประเมิน ความคิดเห็นของท่านจะนำไปพัฒนาการจัดสอบธรรมศึกษาของสนามสอบโรงเรียนชุมชนวัดไทยงามให้ดียิ่งขึ้น', true);
}

$('#btnSubmit').addEventListener('click', async () => {
  const missing = QUESTIONS.filter((q) => !state.ans[q.id]);
  if (!state.group || missing.length) {
    const first = !state.group ? $('#groups') : $(`#row-${missing[0].id}`);
    missing.forEach((q) => $(`#row-${q.id}`).classList.add('ring-2', 'ring-red-400'));
    first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const btn = $('#btnSubmit');
  btn.disabled = true;
  btn.textContent = 'กำลังส่ง…';
  const data = {
    group: state.group,
    ans: Object.fromEntries(QUESTIONS.map((q) => [q.id, state.ans[q.id]])),
    text: { like: state.like.trim().slice(0, TEXT_MAX), suggest: state.suggest.trim().slice(0, TEXT_MAX) },
    v: SURVEY_VERSION,
    createdAt: serverTimestamp(),
  };
  try {
    if (PREVIEW) {
      console.info('preview: ไม่บันทึกจริง', data);
    } else {
      // ถ้าสัญญาณหลุด Firestore จะเก็บไว้แล้วส่งให้เองเมื่อกลับมาออนไลน์ — ไม่ต้องให้ผู้ตอบรอนาน
      await Promise.race([
        addDoc(collection(db, COL_SURVEYS), data),
        new Promise((resolve) => setTimeout(resolve, 15000)),
      ]);
    }
    localStorage.setItem(DONE_KEY, new Date().toISOString());
    thanks();
    window.scrollTo({ top: 0 });
  } catch (err) {
    console.error(err);
    const msg = String(err?.code || '').includes('permission-denied')
      ? 'ขณะนี้ปิดรับแบบประเมินแล้ว หรือข้อมูลไม่ครบถ้วน'
      : 'ส่งไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง';
    $('#formError').textContent = msg;
    $('#formError').classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'ส่งแบบประเมิน';
  }
});

// เริ่มต้น: ตรวจว่าเปิดรับอยู่หรือไม่ และเครื่องนี้ส่งไปแล้วหรือยัง
(async () => {
  let open = true;
  if (!PREVIEW) {
    try {
      const snap = await getDoc(doc(db, COL_SITE, 'config'));
      open = !snap.exists() || snap.data().surveyOpen !== false;
    } catch { /* อ่านไม่ได้ ให้ลองส่ง แล้วให้ rules เป็นผู้ตัดสิน */ }
  }
  if (!open) {
    renderMessage('📋', 'ปิดรับแบบประเมินแล้ว', 'ขออนุโมทนาและขอบคุณทุกท่านที่ให้ความสนใจ');
  } else if (localStorage.getItem(DONE_KEY)) {
    thanks();
  } else {
    renderForm();
  }
})();
