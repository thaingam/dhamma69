// วาดผังห้องสอบรายอาคารด้วย canvas — ปรับตามความกว้างจอ คมชัดบนจอ retina แตะห้องได้ และห้องที่เลือกจะกระพริบ
import { planBand, planTheme } from './floorplans.js';
import { th, LEVELS, LEVEL_COLOR } from './utils.js';

const C = {
  band: '#F2DE8A',
  bandStroke: '#D9B84A',
  idle: '#E3C963',
  idleText: '#8A7428',
  exam: '#FFFDF5',
  navy: '#0B1F3A',
  red: '#DC2626',
  gold: '#C9A227',
  goldLight: '#FBF1D0',
  muted: '#64748B',
  stairs: '#FFFFFF',
  stairsLine: '#475569',
};

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function star(ctx, cx, cy, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
}

/** เครื่องหมาย ✱ สีแดง (จุดรวมแถวตามผังต้นฉบับ) */
function asterisk(ctx, cx, cy, r) {
  ctx.save();
  ctx.strokeStyle = C.red;
  ctx.lineWidth = Math.max(2, r * 0.38);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    ctx.moveTo(cx - r * Math.cos(a), cy - r * Math.sin(a));
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.stroke();
  ctx.restore();
}

/** สัญลักษณ์ห้องน้ำชาย/หญิง แบบเรียบง่าย */
function drawToilet(ctx, cx, cy, size) {
  const u = size / 10;
  ctx.save();
  ctx.fillStyle = '#0284C7';
  for (const [dx, female] of [[-2.6, false], [2.6, true]]) {
    const x = cx + dx * u;
    ctx.beginPath();
    ctx.arc(x, cy - 3.6 * u, 1.3 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    if (female) {
      ctx.moveTo(x - 0.9 * u, cy - 2 * u);
      ctx.lineTo(x + 0.9 * u, cy - 2 * u);
      ctx.lineTo(x + 2 * u, cy + 1.6 * u);
      ctx.lineTo(x - 2 * u, cy + 1.6 * u);
    } else {
      ctx.rect(x - 1.3 * u, cy - 2 * u, 2.6 * u, 3.6 * u);
    }
    ctx.fill();
    ctx.fillRect(x - 1 * u, cy + 1.4 * u, 0.8 * u, 3.2 * u);
    ctx.fillRect(x + 0.2 * u, cy + 1.4 * u, 0.8 * u, 3.2 * u);
  }
  ctx.fillRect(cx - 0.15 * u, cy - 4.8 * u, 0.3 * u, 9.6 * u);
  ctx.restore();
}

/** จุดรวมแถว/รับข้อสอบ — พื้นที่สำคัญ ไม่ใช่ห้องสอบ (แตะไม่ได้) */
function drawAssembly(ctx, r, x, y, w, h, T) {
  roundRect(ctx, x, y, w, h, 8);
  ctx.fillStyle = T.idle;
  ctx.fill();
  ctx.save();
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = C.red;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 8);
  ctx.stroke();
  ctx.restore();
  const ar = Math.max(8, Math.min(h * 0.11, 26));
  asterisk(ctx, x + w / 2, y + h * 0.34, ar);
  let text = r.label;
  let size = fitFont(ctx, [text], w * 0.88, Math.round(Math.min(h / 5, 40)), 700, 'Sarabun, sans-serif');
  if (size < 12 && r.short) { text = r.short; size = fitFont(ctx, [text], w * 0.88, Math.round(Math.min(h / 5, 40)), 700, 'Sarabun, sans-serif'); }
  ctx.font = `700 ${size}px Sarabun, sans-serif`;
  ctx.fillStyle = C.navy;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h * 0.62);
}

/** ตัวอักษรใหญ่สุดที่ทุกบรรทัดยังพอดีความกว้าง */
function fitFont(ctx, lines, maxW, start, weight, family) {
  let size = start;
  while (size > 8) {
    ctx.font = `${weight} ${size}px ${family}`;
    if (lines.every((l) => ctx.measureText(l).width <= maxW)) break;
    size -= 1;
  }
  return size;
}

/**
 * สร้างผังใน host
 * @param {HTMLElement} host
 * @param {{ plan: object, rooms: Map<string, object>, activeId?: string, onSelect?: (roomId: string) => void }} opts
 */
export function mountFloorPlan(host, opts) {
  const canvas = document.createElement('canvas');
  canvas.className = 'block w-full touch-manipulation';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `ผังห้องสอบ ${opts.plan.name}`);
  host.replaceChildren(canvas);
  const ctx = canvas.getContext('2d');

  let activeId = opts.activeId || null;
  let hits = [];
  let width = 0;
  let raf = 0;
  let alive = true;
  let lastFrame = 0;
  const { w: BAND_W, h: BAND_H } = planBand(opts.plan);
  const T = planTheme(opts.plan);

  function layout(W) {
    const gutter = W >= 600 ? Math.min(150, W * 0.13) : 0;
    const pad = 6;
    const s = (W - gutter - pad * 2) / BAND_W;
    const labelH = gutter ? 0 : 30;
    const gap = W >= 600 ? 28 : 18;
    let y = pad;
    const floors = opts.plan.floors.map((f) => {
      const over = Math.max(0, ...(f.stairs ? [f.stairs.y + f.stairs.h - BAND_H] : [0])) * s;
      const top = y + labelH;
      const item = { f, labelY: y, top, left: pad + gutter, gutter };
      y = top + BAND_H * s + over + gap;
      return item;
    });
    return { s, floors, height: Math.ceil(y - gap + pad), W, compact: W < 600 };
  }

  function draw(t = 0) {
    const W = host.clientWidth;
    if (!W) return;
    const L = layout(W);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (width !== W || canvas.height !== Math.round(L.height * dpr)) {
      width = W;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(L.height * dpr);
      canvas.style.height = `${L.height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, L.height);
    hits = [];
    const pulse = 0.5 + 0.5 * Math.sin(t / 180);   // 0..1 ประมาณ 1.1 วินาทีต่อรอบ

    for (const { f, labelY, top, left, gutter } of L.floors) {
      const s = L.s;
      // ป้ายชั้น
      ctx.textBaseline = 'middle';
      if (gutter) {
        ctx.fillStyle = C.navy;
        ctx.font = `700 ${Math.round(Math.min(34, gutter / 4))}px Pridi, Sarabun, serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`ชั้นที่ ${th(f.no)}`, gutter / 2, top + (BAND_H * s) / 2);
      } else {
        const text = `ชั้นที่ ${th(f.no)}`;
        ctx.font = '700 14px Pridi, Sarabun, serif';
        const tw = ctx.measureText(text).width + 20;
        roundRect(ctx, left, labelY + 2, tw, 22, 11);
        ctx.fillStyle = C.navy;
        ctx.fill();
        ctx.fillStyle = '#E6C766';
        ctx.textAlign = 'center';
        ctx.fillText(text, left + tw / 2, labelY + 13.5);
      }

      // แถบอาคาร
      roundRect(ctx, left, top, BAND_W * s, BAND_H * s, 6);
      ctx.fillStyle = T.band;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = T.bandStroke;
      ctx.stroke();

      // บันได
      if (f.stairs) {
        const st = f.stairs;
        const x = left + st.x * s, y = top + st.y * s, w = st.w * s, h = st.h * s;
        ctx.fillStyle = C.stairs;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = C.stairsLine;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        ctx.beginPath();
        const steps = 8;
        for (let i = 1; i < steps; i++) {
          ctx.moveTo(x + (w * i) / steps, y + h * 0.5);
          ctx.lineTo(x + (w * i) / steps, y + h);
        }
        ctx.moveTo(x, y + h * 0.5);
        ctx.lineTo(x + w, y + h * 0.5);
        ctx.stroke();
        ctx.fillStyle = C.muted;
        ctx.font = `600 ${Math.max(9, Math.round(h * 0.2))}px Sarabun, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('บันได', x + w / 2, y + h * 0.26);
      }

      // ห้องน้ำ
      for (const t of f.toilets || []) {
        const x = left + t.x * s, y = top + t.y * s, w = t.w * s, h = t.h * s;
        roundRect(ctx, x, y, w, h, 6);
        ctx.fillStyle = '#E0F2FE';
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#38BDF8';
        ctx.stroke();
        drawToilet(ctx, x + w / 2, y + h * 0.42, Math.min(w, h) * 0.42);
        ctx.fillStyle = '#0369A1';
        ctx.font = `600 ${Math.max(8, Math.round(Math.min(w / 4.5, 16)))}px Sarabun, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('ห้องน้ำ', x + w / 2, y + h * 0.84);
      }

      // ห้อง
      for (const r of f.rooms) {
        const x = left + r.x * s, y = top + r.y * s, w = r.w * s, h = r.h * s;
        if (r.kind === 'assembly') { drawAssembly(ctx, r, x, y, w, h, T); continue; }
        const room = r.room ? opts.rooms.get(r.room) : null;
        if (!room) {
          roundRect(ctx, x, y, w, h, 4);
          ctx.fillStyle = T.idle;
          ctx.fill();
          if (r.label) {
            // ชื่อเต็มถ้าพอดี ไม่พอดีใช้ชื่อย่อ
            let text = r.label;
            let size = fitFont(ctx, [text], w * 0.88, Math.round(Math.min(w / 7, 22)), 600, 'Sarabun, sans-serif');
            if (size < 10 && r.short) {
              text = r.short;
              size = fitFont(ctx, [text], w * 0.88, Math.round(Math.min(w / 5, 22)), 600, 'Sarabun, sans-serif');
            }
            ctx.fillStyle = T.idleText;
            ctx.font = `600 ${size}px Sarabun, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(text, x + w / 2, y + h / 2);
          }
          continue;
        }

        const isActive = room.id === activeId;
        const lc = LEVEL_COLOR[room.level];
        ctx.save();
        if (isActive) {
          ctx.shadowColor = `rgba(220, 38, 38, ${0.35 + 0.5 * pulse})`;
          ctx.shadowBlur = 8 + 14 * pulse;
        }
        roundRect(ctx, x, y, w, h, 6);
        ctx.fillStyle = isActive ? (pulse > 0.5 ? '#FDE68A' : C.goldLight) : C.exam;
        ctx.fill();
        ctx.restore();
        roundRect(ctx, x, y, w, h, 6);
        ctx.lineWidth = isActive ? 3 + 2 * pulse : 2;
        ctx.strokeStyle = isActive ? C.red : lc.bg;
        ctx.stroke();

        // ป้ายดาว (สัญลักษณ์ห้องสอบตามผังต้นฉบับ) — ห้องแคบมากบนมือถือจะตัดป้ายออกให้ตัวหนังสือใหญ่ขึ้น
        const showBadge = w >= 62;
        const rBadge = showBadge ? Math.max(7, Math.min(w, h) * 0.13) : 0;
        const bx = x + w / 2, by = showBadge ? y + Math.max(rBadge + 6, h * 0.2) : y;
        if (showBadge) {
          ctx.beginPath();
          ctx.arc(bx, by, rBadge, 0, Math.PI * 2);
          ctx.fillStyle = '#fff';
          ctx.fill();
          ctx.lineWidth = Math.max(1.5, rBadge * 0.14);
          ctx.strokeStyle = C.red;
          ctx.stroke();
          star(ctx, bx, by, rBadge * 0.68, rBadge * 0.3);
          ctx.fillStyle = C.red;
          ctx.fill();
        }

        // ข้อความ
        const compact = w < 95;
        const lines = compact
          ? [LEVELS[room.level], `${room.stage === 'p' ? 'ป.' : 'ม.'}${th(room.roomNo)}`]
          : [`นักธรรม${LEVELS[room.level]}`, room.stage === 'p' ? 'ประถม' : 'มัธยม', `ห้องที่ ${th(room.roomNo)}`];
        const textTop = showBadge ? by + rBadge + 4 : y + 2;
        const avail = y + h - textTop - 6;
        const start = Math.min(28, Math.floor(avail / (lines.length * 1.25)));
        const size = fitFont(ctx, lines, w * 0.86, start, 700, 'Sarabun, sans-serif');
        ctx.font = `700 ${size}px Sarabun, sans-serif`;
        ctx.fillStyle = C.navy;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lh = size * 1.25;
        const blockH = lh * lines.length;
        let ty = textTop + (avail - blockH) / 2 + lh / 2;
        for (const line of lines) { ctx.fillText(line, x + w / 2, ty); ty += lh; }

        hits.push({ x, y, w, h, id: room.id });
      }
    }
  }

  function loop(t) {
    if (!alive) return;
    if (!canvas.isConnected) { destroy(); return; }
    if (t - lastFrame > 33) { draw(t); lastFrame = t; }
    raf = requestAnimationFrame(loop);
  }

  function restart() {
    cancelAnimationFrame(raf);
    if (activeId && opts.rooms.has(activeId)) raf = requestAnimationFrame(loop);
    else draw();
  }

  function hitAt(e) {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    return hits.find((hb) => px >= hb.x && px <= hb.x + hb.w && py >= hb.y && py <= hb.y + hb.h);
  }

  canvas.addEventListener('click', (e) => {
    const hit = hitAt(e);
    if (hit && opts.onSelect) opts.onSelect(hit.id);
  });
  canvas.addEventListener('mousemove', (e) => { canvas.style.cursor = hitAt(e) ? 'pointer' : 'default'; });

  const ro = new ResizeObserver(() => { if (host.clientWidth !== width) restart(); });
  ro.observe(host);
  document.fonts?.ready.then(() => alive && restart());
  restart();

  function destroy() {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
  }

  return {
    setActive(id) { activeId = id; restart(); },
    destroy,
  };
}
