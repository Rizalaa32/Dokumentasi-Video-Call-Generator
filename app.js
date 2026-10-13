/* =========================================================
   Video Call Documentation Generator — app.js
   100% client-side HTML5 Canvas compositor.

   Layer order (bottom → top):
     L2  Main photo (full screen, behind status bar)
     L1  Android status bar (built-in vector render or custom image)
     L3  PiP selfie (rounded, bordered)
         Android 3-button navigation bar

   All geometry uses "dp" units where 1dp = canvasWidth / 360,
   so the preview and the 720p / 1080p export are pixel-proportional (WYSIWYG).
   ========================================================= */
(() => {
  'use strict';

  /* ---------------- Helpers ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const pad2 = (n) => String(n).padStart(2, '0');
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => {
    const ks = p.split('.');
    const last = ks.pop();
    ks.reduce((a, k) => a[k], o)[last] = v;
  };

  const FONT = 'Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const LIMITS = { main: { min: 20, max: 250 }, pip: { min: 50, max: 300 } };
  const RES = {
    fhd_20_9: [1080, 2400],
    hd_20_9: [720, 1600],
    fhd_19_5: [1080, 2340],
    fhd_16_9: [1080, 1920]
  };

  /* ---------------- State ---------------- */
  const nowHHMM = (sep = '.') => {
    const d = new Date();
    return pad2(d.getHours()) + sep + pad2(d.getMinutes());
  };

  const defaults = () => ({
    main: { zoom: 100, x: 0, y: 0, blurBg: true },
    pip: {
      zoom: 100, x: 0, y: 0, pos: 'br', size: 24, radius: 14, border: 0,
      borderColor: '#ffffff', shadow: true, mirror: false, showYouTag: false, visible: true
    },
    status: {
      mode: 'builtin', time: '09.00', sep: '.', live: false,
      battery: 53, charging: false, batteryStyle: 'pill',
      network: '4G', signal: 4, wifi: false, wifiLevel: 3, speed: '221 K/s',
      notif: { whatsapp: true, telegram: true, sms: false, email: false },
      notifStyle: 'color', alarm: false, vibrate: false, bg: 'overlay', shade: false
    },
    nav: { visible: true, type: '3buttons', bg: 'transparent', style: 'lines', order: 'rhb' },
    export: { res: 'fhd_20_9', format: 'jpg', quality: 92 }
  });

  let state = defaults();
  // Image layers kept separately so "Reset" keeps uploaded photos.
  const layers = {
    main: { img: null, src: '', name: '' },
    pip: { img: null, src: '', name: '' },
    status: { img: null, src: '', name: '' }
  };

  /* ---------------- DOM ---------------- */
  const canvas = $('#preview');
  const ctxPreview = canvas.getContext('2d');
  const phone = $('#phone');
  const screen = $('#phoneScreen');

  let lastLayout = null;
  let hover = null;
  const drag = { active: false, target: null, x: 0, y: 0, id: null };

  /* =========================================================
     LAYOUT
     ========================================================= */
  function computeLayout(W, H) {
    const u = W / 360;
    const statusH = 28 * u;
    const navH = state.nav.visible ? (state.nav.type === 'gesture' ? 24 * u : 40 * u) : 0;
    const solidStatus = state.status.mode === 'builtin' && state.status.bg !== 'overlay';
    const solidNav = state.nav.visible && state.nav.bg === 'solid';
    const photoTop = solidStatus ? statusH : 0;
    const photoBottom = solidNav ? navH : 0;
    // Foto utama memenuhi 100% layar (edge-to-edge) saat nav transparan!
    const photo = { x: 0, y: photoTop, w: W, h: H - photoBottom - photoTop };

    const p = state.pip;
    const pw = (W * p.size) / 100;
    const ph = (pw * 4) / 3;
    const m = 12 * u;
    const right = p.pos.includes('r');
    const bottom = p.pos[0] === 'b';
    const bottomGap = state.nav.visible ? (solidNav ? navH + m : 34 * u) : m;
    const pip = {
      x: right ? W - m - pw : m,
      y: bottom ? H - bottomGap - ph : statusH + m,
      w: pw,
      h: ph
    };
    return { W, H, u, statusH, navH, photo, pip };
  }

  /* Geometry for drawing an image "cover"-fitted into rect, then zoomed & offset.
     Offsets are % of the rect size. */
  function imageGeom(img, r, zoom, ox, oy) {
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    const s = Math.max(r.w / iw, r.h / ih) * zoom;
    const dw = iw * s;
    const dh = ih * s;
    const cx = r.x + r.w / 2 + (ox / 100) * r.w;
    const cy = r.y + r.h / 2 + (oy / 100) * r.h;
    return { dx: cx - dw / 2, dy: cy - dh / 2, dw, dh, cx, cy };
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* =========================================================
     RENDER PIPELINE
     ========================================================= */
  function render(ctx, W, H, opts = {}) {
    const L = computeLayout(W, H);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    drawMain(ctx, L);
    if (state.status.mode === 'custom' && layers.status.img) drawCustomStatus(ctx, L);
    else drawStatusBar(ctx, L);
    if (state.pip.visible) drawPip(ctx, L, opts);
    if (state.nav.visible) drawNav(ctx, L);

    if (opts.preview && hover === 'main' && !drag.active) {
      // subtle hint frame for the main photo area
      ctx.strokeStyle = 'rgba(52,211,153,0.35)';
      ctx.lineWidth = 1.5 * (W / 360) * 0.5;
      ctx.setLineDash([6 * L.u, 4 * L.u]);
      ctx.strokeRect(L.photo.x + L.u, L.photo.y + L.u, L.photo.w - 2 * L.u, L.photo.h - 2 * L.u);
      ctx.setLineDash([]);
    }
    ctx.restore();
    return L;
  }

  /* ---------- Layer 2 : main photo ---------- */
  function drawMain(ctx, L) {
    const r = L.photo;
    const m = state.main;
    const img = layers.main.img;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();

    if (!img) {
      const g = ctx.createLinearGradient(0, r.y, r.w, r.y + r.h);
      g.addColorStop(0, '#0f172a');
      g.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = g;
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(226,232,240,0.75)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 ${15 * L.u}px ${FONT}`;
      ctx.fillText('Unggah foto utama kegiatan', r.w / 2, r.y + r.h / 2 - 8 * L.u);
      ctx.font = `400 ${11 * L.u}px ${FONT}`;
      ctx.fillStyle = 'rgba(148,163,184,0.85)';
      ctx.fillText('tarik & lepas gambar ke sini', r.w / 2, r.y + r.h / 2 + 12 * L.u);
      ctx.restore();
      return;
    }

    const g = imageGeom(img, r, m.zoom / 100, m.x, m.y);
    const covers =
      g.dx <= r.x + 0.5 && g.dy <= r.y + 0.5 &&
      g.dx + g.dw >= r.x + r.w - 0.5 && g.dy + g.dh >= r.y + r.h - 0.5;

    if (!covers) {
      ctx.fillStyle = '#0b0b0c';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      if (m.blurBg) {
        const bg = imageGeom(img, r, 1.15, 0, 0);
        ctx.filter = `blur(${Math.round(16 * L.u)}px)`;
        ctx.drawImage(img, bg.dx, bg.dy, bg.dw, bg.dh);
        ctx.filter = 'none';
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
    }
    ctx.drawImage(img, g.dx, g.dy, g.dw, g.dh);
    ctx.restore();
  }

  /* ---------- Layer 3 : PiP selfie ---------- */
  function drawPip(ctx, L, opts) {
    const p = state.pip;
    const r = L.pip;
    const u = L.u;
    const rad = Math.min(p.radius * u, r.w / 2);
    const bw = p.border * u;
    const img = layers.pip.img;

    if (p.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 10 * u;
      ctx.shadowOffsetY = 2 * u;
      rr(ctx, r.x, r.y, r.w, r.h, rad);
      ctx.fillStyle = '#1b1b1b';
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    rr(ctx, r.x, r.y, r.w, r.h, rad);
    ctx.clip();
    ctx.fillStyle = '#202124';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    if (img) {
      const g = imageGeom(img, r, p.zoom / 100, p.x, p.y);
      if (p.mirror) {
        ctx.translate(g.cx, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, g.dx - g.cx, g.dy, g.dw, g.dh);
      } else {
        ctx.drawImage(img, g.dx, g.dy, g.dw, g.dh);
      }
    } else {
      // placeholder silhouette
      ctx.fillStyle = '#3c4043';
      ctx.beginPath();
      ctx.arc(r.x + r.w / 2, r.y + r.h * 0.4, r.w * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(r.x + r.w / 2, r.y + r.h * 0.95, r.w * 0.42, r.h * 0.3, 0, Math.PI, 0);
      ctx.fill();
    }
    ctx.restore();

    if (bw > 0.05) {
      ctx.save();
      ctx.lineWidth = bw;
      ctx.strokeStyle = p.borderColor;
      rr(ctx, r.x + bw / 2, r.y + bw / 2, r.w - bw, r.h - bw, Math.max(0, rad - bw / 2));
      ctx.stroke();
      ctx.restore();
    }

    if (p.showYouTag) {
      ctx.save();
      rr(ctx, r.x, r.y, r.w, r.h, rad);
      ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      const tagW = 28 * u, tagH = 13 * u;
      rr(ctx, r.x + 5 * u, r.y + r.h - tagH - 5 * u, tagW, tagH, 3 * u);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 ${8 * u}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('YOU', r.x + 5 * u + tagW / 2, r.y + r.h - tagH / 2 - 4.5 * u);
      ctx.restore();
    }

    if (opts.preview && (hover === 'pip' || drag.target === 'pip')) {
      ctx.save();
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 1.2 * u;
      ctx.setLineDash([4 * u, 3 * u]);
      rr(ctx, r.x - 3 * u, r.y - 3 * u, r.w + 6 * u, r.h + 6 * u, rad + 3 * u);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- Layer 1 : custom status bar image ---------- */
  function drawCustomStatus(ctx, L) {
    const img = layers.status.img;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    ctx.drawImage(img, 0, 0, L.W, (L.W * ih) / iw);
  }

  /* ---------- Layer 1 : built-in Android status bar ---------- */
  function drawStatusBar(ctx, L) {
    const s = state.status;
    const u = L.u;
    const W = L.W;
    const H = L.statusH;
    const color = s.bg === 'white' ? '#15171a' : '#ffffff';

    ctx.save();
    if (s.bg === 'black') {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
    } else if (s.bg === 'white') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
    } else if (s.shade) {
      const g = ctx.createLinearGradient(0, 0, 0, H * 1.9);
      g.addColorStop(0, 'rgba(0,0,0,0.38)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.14)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 1.9);
    }

    const cy = H / 2 + 0.6 * u;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    if (s.bg === 'overlay') {
      ctx.shadowColor = 'rgba(0,0,0,0.25)';
      ctx.shadowBlur = 2 * u;
    }

    /* --- left: clock + notification icons --- */
    let x = 16 * u;
    ctx.font = `500 ${12.5 * u}px ${FONT}`;
    const t = formatTime(s.time, s.sep);
    ctx.fillText(t, x, cy);
    x += ctx.measureText(t).width + 7 * u;
    ['whatsapp', 'telegram', 'sms', 'email'].forEach((k) => {
      if (s.notif[k]) x += drawAppIcon(ctx, k, x, cy, u, s.notifStyle === 'mono', color) + 4 * u;
    });

    /* --- right (drawn right → left) --- */
    let rx = W - 14 * u;
    rx -= drawBattery(ctx, rx, cy, u, color, s) + 5 * u;
    if (s.wifi) rx -= drawWifi(ctx, rx, cy, u, color, s.wifiLevel) + 4 * u;
    rx -= drawSignal(ctx, rx, cy, u, color, s.signal) + 3 * u;
    if (s.network !== 'none') rx -= drawNetLabel(ctx, rx, cy, u, color, s.network) + 5 * u;
    if (s.speed && s.speed.trim()) rx -= drawSpeed(ctx, rx, cy, u, color, s.speed.trim()) + 5 * u;
    if (s.alarm) rx -= drawAlarm(ctx, rx, cy, u, color) + 5 * u;
    if (s.vibrate) drawVibrate(ctx, rx, cy, u, color);
    ctx.restore();
  }

  function formatTime(raw, sep) {
    const str = String(raw || '').trim();
    const m = str.match(/^(\d{1,2})\s*[:.\-\s]?\s*(\d{2})$/);
    if (!m) return str || '00' + sep + '00';
    const h = clamp(parseInt(m[1], 10), 0, 23);
    const mi = clamp(parseInt(m[2], 10), 0, 59);
    return pad2(h) + sep + pad2(mi);
  }
  const isValidTime = (raw) => /^(\d{1,2})\s*[:.\-\s]?\s*(\d{2})$/.test(String(raw || '').trim());

  /* --- status icons (each returns its drawn width) --- */
  function drawAppIcon(ctx, type, x, cy, u, mono, color) {
    const s = 11 * u;
    const cx = x + s / 2;
    const brand = { whatsapp: '#25D366', telegram: '#2AABEE', sms: '#1a73e8', email: '#EA4335' }[type];
    const glyph = mono ? color : '#ffffff';
    ctx.save();
    if (!mono) {
      ctx.shadowColor = 'transparent';
      rr(ctx, x, cy - s / 2, s, s, 2.6 * u);
      ctx.fillStyle = brand;
      ctx.fill();
    }
    ctx.fillStyle = glyph;
    ctx.strokeStyle = glyph;
    ctx.lineWidth = 1 * u;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (type === 'whatsapp') {
      ctx.beginPath();
      ctx.arc(cx, cy - 0.2 * u, 3.4 * u, Math.PI * 0.78, Math.PI * 0.62 + Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 2.3 * u, cy + 2.2 * u);
      ctx.lineTo(cx - 3.7 * u, cy + 3.7 * u);
      ctx.lineTo(cx - 1.1 * u, cy + 3.1 * u);
      ctx.closePath();
      ctx.fill();
      // handset
      ctx.lineWidth = 1.05 * u;
      ctx.beginPath();
      ctx.moveTo(cx - 1.3 * u, cy - 1.5 * u);
      ctx.quadraticCurveTo(cx - 1.2 * u, cy + 1.1 * u, cx + 1.4 * u, cy + 1.3 * u);
      ctx.stroke();
    } else if (type === 'telegram') {
      ctx.beginPath();
      ctx.moveTo(cx - 3.7 * u, cy - 0.1 * u);
      ctx.lineTo(cx + 3.6 * u, cy - 3.1 * u);
      ctx.lineTo(cx + 2.3 * u, cy + 3.3 * u);
      ctx.lineTo(cx - 0.2 * u, cy + 1.3 * u);
      ctx.lineTo(cx - 0.9 * u, cy + 3 * u);
      ctx.lineTo(cx - 1.2 * u, cy + 0.9 * u);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'sms') {
      rr(ctx, cx - 3.7 * u, cy - 3.1 * u, 7.4 * u, 5.6 * u, 1.5 * u);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 2.6 * u, cy + 2 * u);
      ctx.lineTo(cx - 3.2 * u, cy + 4 * u);
      ctx.lineTo(cx - 0.6 * u, cy + 2.2 * u);
      ctx.closePath();
      ctx.fill();
      if (!mono) {
        ctx.fillStyle = brand;
        [-1.8, 0, 1.8].forEach((d) => {
          ctx.beginPath();
          ctx.arc(cx + d * u, cy - 0.3 * u, 0.65 * u, 0, Math.PI * 2);
          ctx.fill();
        });
      }
    } else if (type === 'email') {
      rr(ctx, cx - 3.7 * u, cy - 2.7 * u, 7.4 * u, 5.4 * u, 0.9 * u);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 3.3 * u, cy - 2.1 * u);
      ctx.lineTo(cx, cy + 0.5 * u);
      ctx.lineTo(cx + 3.3 * u, cy - 2.1 * u);
      ctx.stroke();
    }
    ctx.restore();
    return s;
  }

  function drawBolt(ctx, cx, cy, h) {
    ctx.beginPath();
    ctx.moveTo(cx + 0.12 * h, cy - 0.5 * h);
    ctx.lineTo(cx - 0.32 * h, cy + 0.08 * h);
    ctx.lineTo(cx - 0.02 * h, cy + 0.08 * h);
    ctx.lineTo(cx - 0.12 * h, cy + 0.5 * h);
    ctx.lineTo(cx + 0.32 * h, cy - 0.08 * h);
    ctx.lineTo(cx + 0.02 * h, cy - 0.08 * h);
    ctx.closePath();
    ctx.fill();
  }

  function drawBattery(ctx, xr, cy, u, color, s) {
    const lvl = clamp(Math.round(s.battery), 1, 100);
    const low = lvl <= 15 && !s.charging;
    ctx.save();
    if (s.batteryStyle === 'pill') {
      // ColorOS / Realme-style pill with the number inside
      const w = 23 * u, h = 11.5 * u, capW = 1.6 * u, gap = 0.7 * u;
      const x = xr - w - gap - capW;
      const y = cy - h / 2;
      const rad = h / 2.6;
      ctx.save();
      rr(ctx, x, y, w, h, rad);
      ctx.clip();
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = s.charging ? '#22c55e' : low ? '#ef4444' : color;
      ctx.globalAlpha = s.charging || low ? 0.85 : 0.3;
      ctx.fillRect(x, y, (w * lvl) / 100, h);
      ctx.restore();
      ctx.lineWidth = 1 * u;
      ctx.globalAlpha = 0.9;
      rr(ctx, x + 0.5 * u, y + 0.5 * u, w - u, h - u, rad - 0.5 * u);
      ctx.stroke();
      rr(ctx, x + w + gap, cy - 2.2 * u, capW, 4.4 * u, 0.8 * u);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = `700 ${7.6 * u}px ${FONT}`;
      ctx.textAlign = 'center';
      const txt = String(lvl);
      if (s.charging) {
        const tw = ctx.measureText(txt).width;
        const total = tw + 4.2 * u;
        const sx = x + w / 2 - total / 2;
        drawBolt(ctx, sx + 1.6 * u, cy, 6.6 * u);
        ctx.fillText(txt, sx + 4.2 * u + tw / 2, cy + 0.3 * u);
      } else {
        ctx.fillText(txt, x + w / 2, cy + 0.3 * u);
      }
      ctx.restore();
      return w + gap + capW;
    }

    // Stock Android: "53%" + vertical battery
    ctx.font = `500 ${11 * u}px ${FONT}`;
    const txt = lvl + '%';
    const tw = ctx.measureText(txt).width;
    const bw = 7.4 * u, bh = 12.6 * u, capH = 1.4 * u;
    const bx = xr - bw;
    const by = cy - bh / 2 + capH / 2;
    ctx.textAlign = 'left';
    ctx.fillText(txt, bx - 3.5 * u - tw, cy);
    ctx.globalAlpha = 0.35;
    rr(ctx, bx, by, bw, bh, 1.4 * u);
    ctx.fill();
    ctx.globalAlpha = 1;
    rr(ctx, bx + bw * 0.28, by - capH, bw * 0.44, capH + 0.5 * u, 0.5 * u);
    ctx.fill();
    ctx.save();
    rr(ctx, bx, by, bw, bh, 1.4 * u);
    ctx.clip();
    ctx.fillStyle = s.charging ? '#22c55e' : low ? '#ef4444' : color;
    const fh = (bh * lvl) / 100;
    ctx.fillRect(bx, by + bh - fh, bw, fh);
    ctx.restore();
    if (s.charging) {
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = color === '#ffffff' ? '#111' : '#fff';
      drawBolt(ctx, bx + bw / 2, by + bh / 2, 8 * u);
    }
    ctx.restore();
    return bw + 3.5 * u + tw;
  }

  function drawWifi(ctx, xr, cy, u, color, level) {
    const R = 9.6 * u;
    const w = 2 * R * Math.SQRT1_2;
    const cx = xr - w / 2;
    const by = cy + 5 * u;
    const wedge = (r) => {
      ctx.beginPath();
      ctx.moveTo(cx, by);
      ctx.arc(cx, by, r, -Math.PI * 0.75, -Math.PI * 0.25);
      ctx.closePath();
      ctx.fill();
    };
    ctx.save();
    ctx.globalAlpha = 0.32;
    wedge(R);
    ctx.globalAlpha = 1;
    wedge(R * [0.45, 0.72, 1][clamp(level, 1, 3) - 1]);
    ctx.restore();
    return w;
  }

  function drawSignal(ctx, xr, cy, u, color, level) {
    const bw = 2.2 * u, gap = 1.1 * u;
    const hs = [3.6, 6, 8.5, 11];
    const w = 4 * bw + 3 * gap;
    const x0 = xr - w;
    const bottom = cy + 5.5 * u;
    ctx.save();
    hs.forEach((h, i) => {
      ctx.globalAlpha = i < level ? 1 : 0.3;
      rr(ctx, x0 + i * (bw + gap), bottom - h * u, bw, h * u, 0.5 * u);
      ctx.fill();
    });
    ctx.restore();
    return w;
  }

  function drawNetLabel(ctx, xr, cy, u, color, label) {
    ctx.save();
    ctx.font = `700 ${7.4 * u}px ${FONT}`;
    ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width;
    const w = Math.max(tw, 7 * u);
    const cx = xr - w / 2;
    ctx.fillText(label, cx, cy - 2.1 * u);
    // tiny up/down data arrows
    const a = 1.4 * u, ay = cy + 3.9 * u;
    ctx.beginPath();
    ctx.moveTo(cx - 2.6 * u, ay - a);
    ctx.lineTo(cx - 2.6 * u - a, ay + a * 0.6);
    ctx.lineTo(cx - 2.6 * u + a, ay + a * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 2.6 * u, ay + a);
    ctx.lineTo(cx + 2.6 * u - a, ay - a * 0.6);
    ctx.lineTo(cx + 2.6 * u + a, ay - a * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return w;
  }

  function drawSpeed(ctx, xr, cy, u, color, text) {
    const parts = text.split(/\s+/);
    ctx.save();
    ctx.textAlign = 'center';
    let w;
    if (parts.length > 1) {
      const a = parts[0];
      const b = parts.slice(1).join(' ').toUpperCase();
      ctx.font = `700 ${6.4 * u}px ${FONT}`;
      w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      ctx.fillText(a, xr - w / 2, cy - 3.1 * u);
      ctx.fillText(b, xr - w / 2, cy + 3.7 * u);
    } else {
      ctx.font = `700 ${7.4 * u}px ${FONT}`;
      w = ctx.measureText(text).width;
      ctx.fillText(text, xr - w / 2, cy);
    }
    ctx.restore();
    return w;
  }

  function drawAlarm(ctx, xr, cy, u, color) {
    const w = 11 * u;
    const cx = xr - w / 2;
    const c = cy + 0.7 * u;
    ctx.save();
    ctx.lineWidth = 1.2 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, c, 4.1 * u, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, c - 2.3 * u);
    ctx.lineTo(cx, c);
    ctx.lineTo(cx + 1.7 * u, c + 1 * u);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 5 * u, c - 3.3 * u);
    ctx.lineTo(cx - 3.2 * u, c - 5 * u);
    ctx.moveTo(cx + 5 * u, c - 3.3 * u);
    ctx.lineTo(cx + 3.2 * u, c - 5 * u);
    ctx.stroke();
    ctx.restore();
    return w;
  }

  function drawVibrate(ctx, xr, cy, u, color) {
    const w = 13 * u;
    const cx = xr - w / 2;
    ctx.save();
    ctx.lineWidth = 1.1 * u;
    ctx.lineCap = 'round';
    rr(ctx, cx - 2.3 * u, cy - 4.6 * u, 4.6 * u, 9.2 * u, 1 * u);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 4.2 * u, cy - 2.6 * u); ctx.lineTo(cx - 4.2 * u, cy + 2.6 * u);
    ctx.moveTo(cx + 4.2 * u, cy - 2.6 * u); ctx.lineTo(cx + 4.2 * u, cy + 2.6 * u);
    ctx.moveTo(cx - 6 * u, cy - 1.4 * u); ctx.lineTo(cx - 6 * u, cy + 1.4 * u);
    ctx.moveTo(cx + 6 * u, cy - 1.4 * u); ctx.lineTo(cx + 6 * u, cy + 1.4 * u);
    ctx.stroke();
    ctx.restore();
    return w;
  }

  /* ---------- Bottom navigation bar ---------- */
  function drawNav(ctx, L) {
    if (!state.nav.visible) return;
    const u = L.u;
    const y0 = L.H - L.navH;
    const cy = y0 + L.navH / 2;
    ctx.save();
    if (state.nav.bg === 'solid') {
      ctx.fillStyle = '#000000'; // 100% solid black, tanpa opacity/transparansi
      ctx.fillRect(0, y0, L.W, L.navH);
    }
    // Jika 'transparent', tidak ada bar hitam, tombol mengambang di atas foto

    if (state.nav.type === 'gesture') {
      // Modern Android gesture bar: pill putih halus mengambang
      const gw = 106 * u;
      const gh = 3.4 * u;
      const gx = L.W / 2 - gw / 2;
      const gy = L.H - 12 * u;
      ctx.shadowColor = 'rgba(0,0,0,0.45)';
      ctx.shadowBlur = 3 * u;
      ctx.fillStyle = '#ffffff';
      rr(ctx, gx, gy, gw, gh, gh / 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 3 * u;
      ctx.lineWidth = 1.6 * u;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const order = state.nav.order === 'rhb' ? ['recents', 'home', 'back'] : ['back', 'home', 'recents'];
      order.forEach((key, i) => {
        const cx = L.W * (0.25 + i * 0.25);
        ctx.beginPath();
        if (key === 'recents') {
          if (state.nav.style === 'lines') {
            for (let k = -1; k <= 1; k++) {
              ctx.moveTo(cx - 5.4 * u, cy + k * 3.6 * u);
              ctx.lineTo(cx + 5.4 * u, cy + k * 3.6 * u);
            }
          } else {
            rr(ctx, cx - 5.3 * u, cy - 5.3 * u, 10.6 * u, 10.6 * u, 1.8 * u);
          }
        } else if (key === 'home') {
          ctx.arc(cx, cy, 6.2 * u, 0, Math.PI * 2);
        } else {
          ctx.moveTo(cx + 4.4 * u, cy - 5.4 * u);
          ctx.lineTo(cx - 4.6 * u, cy);
          ctx.lineTo(cx + 4.4 * u, cy + 5.4 * u);
          ctx.closePath();
        }
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  /* =========================================================
     PREVIEW CANVAS
     ========================================================= */
  let rafId = 0;
  function scheduleRender() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      lastLayout = render(ctxPreview, canvas.width, canvas.height, { preview: true });
    });
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const [targetW, targetH] = RES[state.export.res] || [1080, 2400];
    const aspect = targetH / targetW;
    screen.style.setProperty('--phone-ratio', `${targetW} / ${targetH}`);
    const cssW = screen.clientWidth;
    if (!cssW) return;
    const w = Math.round(cssW * dpr);
    const h = Math.round(w * aspect);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    scheduleRender();
  }
  new ResizeObserver(resizeCanvas).observe(screen);

  /* =========================================================
     UI BINDINGS (data-bind="path.to.value")
     ========================================================= */
  function readEl(el) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'range' || el.type === 'number') return parseFloat(el.value);
    return el.value;
  }

  function initBindings() {
    $$('[data-bind]').forEach((el) => {
      const path = el.dataset.bind;
      const evt = el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        if (el.type === 'radio' && !el.checked) return;
        setPath(state, path, readEl(el));
        onChange(path, el);
      });
    });
  }

  function onChange(path, el) {
    if (path === 'export.res') {
      resizeCanvas();
    }
    if (path === 'status.time') {
      state.status.live = false;
      el && el.classList.toggle('invalid', !isValidTime(state.status.time));
    }
    if (path === 'status.live' && state.status.live) state.status.time = nowHHMM();
    if (path === 'status.sep') {
      if (isValidTime(state.status.time)) state.status.time = formatTime(state.status.time, state.status.sep);
    }
    syncUI(el);
    scheduleRender();
  }

  function fmtOutput(el) {
    const v = parseFloat(el.value);
    const unit = el.dataset.unit || '';
    if (el.dataset.signed) return (v > 0 ? '+' : '') + Math.round(v) + '%';
    const num = Number.isInteger(v) ? v : v.toFixed(v < 10 ? 2 : 1).replace(/\.?0+$/, '');
    return num + unit;
  }

  function updateRangeFill(el) {
    const min = parseFloat(el.min), max = parseFloat(el.max);
    el.style.setProperty('--p', ((parseFloat(el.value) - min) / (max - min)) * 100 + '%');
  }

  function syncUI(skipEl) {
    $$('[data-bind]').forEach((el) => {
      const v = getPath(state, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.type === 'radio') el.checked = String(v) === el.value;
      else if (el !== skipEl || el.type === 'range') {
        if (el !== document.activeElement || el.type === 'range' || el.type === 'color') el.value = v;
      }
      if (el.type === 'range') updateRangeFill(el);
    });
    $$('output[data-for]').forEach((o) => {
      const src = document.getElementById(o.dataset.for);
      if (src) o.textContent = fmtOutput(src);
    });
    // contextual visibility
    $('#statusBuiltin').hidden = state.status.mode !== 'builtin';
    $('#statusCustom').hidden = state.status.mode !== 'custom';
    $('#wifiLevelField').hidden = !state.status.wifi;
    $('#shadeToggle').hidden = state.status.bg !== 'overlay';
    $('#qualityField').hidden = state.export.format !== 'jpg';
    if ($('#recentsStyleField')) $('#recentsStyleField').hidden = !state.nav.visible || state.nav.type === 'gesture';
    if ($('#navOrderField')) $('#navOrderField').hidden = !state.nav.visible || state.nav.type === 'gesture';
    const [W, H] = RES[state.export.res] || [1080, 2400];
    const ratioStr = (W === 1080 && H === 2400) || (W === 720 && H === 1600) ? '20:9' : (W === 1080 && H === 2340) ? '19.5:9' : '16:9';
    $('#exportInfo').textContent = `${W} × ${H} px (${ratioStr})`;
    $('#downloadBtn span').textContent = `Unduh Gambar (${W}×${H} ${state.export.format.toUpperCase()})`;
  }

  /* =========================================================
     IMAGE LOADING
     ========================================================= */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = src;
    });
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(file);
    });
  }

  async function loadFileInto(file, target) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('File bukan gambar. Gunakan JPG, PNG, atau WebP.', 'error');
      return;
    }
    try {
      const src = await readFile(file); // data URL → never taints the canvas
      const img = await loadImage(src);
      setLayer(target, img, src, file.name);
      if (target === 'status') state.status.mode = 'custom';
      toast(
        { main: 'Foto utama diperbarui', pip: 'Foto petugas diperbarui', status: 'Status bar kustom diterapkan' }[target]
      );
    } catch (e) {
      toast('Gagal membaca gambar: ' + e.message, 'error');
    }
  }

  function setLayer(target, img, src, name) {
    layers[target] = { img, src, name };
    if (target === 'main' || target === 'pip') Object.assign(state[target], { zoom: 100, x: 0, y: 0 });
    updateThumbs();
    syncUI();
    scheduleRender();
  }

  function updateThumbs() {
    ['main', 'pip', 'status'].forEach((t) => {
      const th = $('#' + t + 'Thumb');
      const nm = $('#' + t + 'Name');
      const l = layers[t];
      th.style.backgroundImage = l.src ? `url("${l.src}")` : '';
      th.classList.toggle('has-img', !!l.src);
      nm.textContent = l.name || '';
    });
  }

  /* ---------- Dropzones ---------- */
  function initDropzones() {
    $$('.dropzone').forEach((dz) => {
      const target = dz.dataset.target;
      const input = $('input[type=file]', dz);
      dz.addEventListener('click', () => input.click());
      dz.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.click();
        }
      });
      input.addEventListener('change', () => {
        loadFileInto(input.files[0], target);
        input.value = '';
      });
      ['dragenter', 'dragover'].forEach((ev) =>
        dz.addEventListener(ev, (e) => {
          e.preventDefault();
          dz.classList.add('is-over');
        })
      );
      ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove('is-over')));
      dz.addEventListener('drop', (e) => {
        e.preventDefault();
        loadFileInto(e.dataTransfer.files[0], target);
      });
    });

    // Drop directly onto the phone preview: PiP area → selfie, elsewhere → main photo
    let dragDepth = 0;
    screen.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragDepth++;
      phone.classList.add('is-drop');
    });
    screen.addEventListener('dragover', (e) => {
      e.preventDefault();
      const t = hitTest(canvasPoint(e));
      $('#dropOverlay span').textContent = t === 'pip' ? 'Lepaskan → Foto Petugas (PiP)' : 'Lepaskan → Foto Utama';
    });
    screen.addEventListener('dragleave', () => {
      if (--dragDepth <= 0) {
        dragDepth = 0;
        phone.classList.remove('is-drop');
      }
    });
    screen.addEventListener('drop', (e) => {
      e.preventDefault();
      dragDepth = 0;
      phone.classList.remove('is-drop');
      const t = hitTest(canvasPoint(e)) === 'pip' ? 'pip' : 'main';
      loadFileInto(e.dataTransfer.files[0], t);
    });
    // prevent the browser from opening files dropped outside zones
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // Paste from clipboard
    document.addEventListener('paste', (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
      if (!item) return;
      e.preventDefault();
      loadFileInto(item.getAsFile(), hover === 'pip' ? 'pip' : 'main');
    });
  }

  /* =========================================================
     DIRECT MANIPULATION ON THE PREVIEW (drag / wheel / dblclick)
     ========================================================= */
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / r.width;
    return { x: (e.clientX - r.left) * k, y: (e.clientY - r.top) * k, k };
  }
  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  function hitTest(pt) {
    const L = lastLayout;
    if (!L) return null;
    if (state.pip.visible && inRect(pt, L.pip)) return 'pip';
    if (inRect(pt, L.photo)) return 'main';
    return null;
  }

  function initCanvasInteractions() {
    canvas.addEventListener('pointerdown', (e) => {
      const target = hitTest(canvasPoint(e));
      if (!target || !layers[target].img) return;
      drag.active = true;
      drag.target = target;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.id = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('is-grabbing');
      scheduleRender();
    });

    canvas.addEventListener('pointermove', (e) => {
      if (drag.active && e.pointerId === drag.id) {
        const k = canvas.width / canvas.getBoundingClientRect().width;
        const dx = (e.clientX - drag.x) * k;
        const dy = (e.clientY - drag.y) * k;
        drag.x = e.clientX;
        drag.y = e.clientY;
        const r = drag.target === 'pip' ? lastLayout.pip : lastLayout.photo;
        const o = state[drag.target];
        o.x = clamp(o.x + (dx / r.w) * 100, -100, 100);
        o.y = clamp(o.y + (dy / r.h) * 100, -100, 100);
        syncUI();
        scheduleRender();
        return;
      }
      const t = hitTest(canvasPoint(e));
      if (t !== hover) {
        hover = t;
        canvas.classList.toggle('is-idle', !t);
        canvas.title = t === 'pip' ? 'Foto petugas — seret / scroll / klik 2× untuk ganti' : t === 'main' ? 'Foto utama — seret / scroll / klik 2× untuk ganti' : '';
        scheduleRender();
      }
    });

    const end = (e) => {
      if (!drag.active || e.pointerId !== drag.id) return;
      drag.active = false;
      drag.target = null;
      canvas.classList.remove('is-grabbing');
      scheduleRender();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => {
      if (!drag.active && hover) {
        hover = null;
        scheduleRender();
      }
    });

    canvas.addEventListener(
      'wheel',
      (e) => {
        const t = hitTest(canvasPoint(e));
        if (!t || !layers[t].img) return;
        e.preventDefault();
        const o = state[t];
        const f = Math.exp(-e.deltaY * 0.0015);
        o.zoom = clamp(Math.round(o.zoom * f * 10) / 10, LIMITS[t].min, LIMITS[t].max);
        syncUI();
        scheduleRender();
      },
      { passive: false }
    );

    canvas.addEventListener('dblclick', (e) => {
      const t = hitTest(canvasPoint(e));
      if (t) $('#' + t + 'File').click();
    });
  }

  /* =========================================================
     ACTIONS
     ========================================================= */
  function initActions() {
    $('#mainCover').addEventListener('click', () => {
      Object.assign(state.main, { zoom: 100, x: 0, y: 0 });
      syncUI();
      scheduleRender();
    });
    $('#mainFit').addEventListener('click', () => {
      const img = layers.main.img;
      if (!img || !lastLayout) return;
      const r = lastLayout.photo;
      const iw = img.naturalWidth || img.width;
      const ih = img.naturalHeight || img.height;
      const contain = Math.min(r.w / iw, r.h / ih);
      const cover = Math.max(r.w / iw, r.h / ih);
      state.main.zoom = clamp(Math.floor((contain / cover) * 1000) / 10, LIMITS.main.min, 100);
      state.main.x = 0;
      state.main.y = 0;
      syncUI();
      scheduleRender();
    });
    $('#mainCenter').addEventListener('click', () => {
      state.main.x = 0;
      state.main.y = 0;
      syncUI();
      scheduleRender();
    });

    $('#nowBtn').addEventListener('click', () => {
      state.status.time = nowHHMM(state.status.sep);
      $('#timeInput').classList.remove('invalid');
      syncUI();
      scheduleRender();
    });

    $('#swapBtn').addEventListener('click', swapPhotos);
    $('#resetBtn').addEventListener('click', () => {
      state = defaults();
      if (layers.status.img) state.status.mode = 'builtin';
      $('#timeInput').classList.remove('invalid');
      syncUI();
      scheduleRender();
      toast('Pengaturan dikembalikan ke awal (foto tetap).', 'info');
    });
    $('#downloadBtn').addEventListener('click', exportImage);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        exportImage();
      }
    });

    // Live clock: refresh every 5 s when enabled
    setInterval(() => {
      if (!state.status.live) return;
      const t = nowHHMM(state.status.sep);
      if (t !== state.status.time) {
        state.status.time = t;
        syncUI();
        scheduleRender();
      }
    }, 5000);
  }

  function swapPhotos() {
    const a = layers.main;
    layers.main = layers.pip;
    layers.pip = a;
    Object.assign(state.main, { zoom: 100, x: 0, y: 0 });
    Object.assign(state.pip, { zoom: 100, x: 0, y: 0 });
    updateThumbs();
    syncUI();
    scheduleRender();
    phone.classList.remove('pulse');
    void phone.offsetWidth;
    phone.classList.add('pulse');
    toast('Foto utama & foto petugas ditukar 🔄');
  }

  /* =========================================================
     EXPORT
     ========================================================= */
  async function exportImage() {
    const btn = $('#downloadBtn');
    if (btn.classList.contains('is-busy')) return;
    btn.classList.add('is-busy');
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const [W, H] = RES[state.export.res];
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      render(c.getContext('2d'), W, H, { preview: false });

      const isPng = state.export.format === 'png';
      const blob = await new Promise((resolve, reject) => {
        try {
          c.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas kosong'))), isPng ? 'image/png' : 'image/jpeg', state.export.quality / 100);
        } catch (err) {
          reject(err);
        }
      });

      const d = new Date();
      const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
      const name = `dokumentasi_videocall_${stamp}.${isPng ? 'png' : 'jpg'}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(`Tersimpan: ${name} (${W}×${H}, ${(blob.size / 1024).toFixed(0)} KB)`);
    } catch (err) {
      if (err && err.name === 'SecurityError') {
        toast(
          'Browser memblokir ekspor karena gambar contoh dimuat dari file:// . Unggah foto Anda sendiri, atau jalankan lewat server lokal: python -m http.server',
          'error',
          8000
        );
      } else {
        toast('Gagal mengekspor: ' + (err && err.message), 'error');
      }
    } finally {
      btn.classList.remove('is-busy');
    }
  }

  /* =========================================================
     TOASTS
     ========================================================= */
  function toast(msg, type = 'success', ms = 2800) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, ms);
  }

  /* =========================================================
     DEFAULT SAMPLE ASSETS
     Tries assets/sample-*.jpg first; falls back to procedurally drawn
     samples so the app always works with zero external files.
     ========================================================= */
  function proceduralMain() {
    const W = 900, H = 1600;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    // wall
    let gr = g.createLinearGradient(0, 0, 0, 1150);
    gr.addColorStop(0, '#f3f5f6'); gr.addColorStop(1, '#d4d9dc');
    g.fillStyle = gr; g.fillRect(0, 0, W, 1150);
    // ceiling lights
    g.fillStyle = '#ffffff';
    [[90, 70], [560, 120], [300, 260]].forEach(([x, y]) => { g.shadowColor = '#fff'; g.shadowBlur = 40; g.fillRect(x, y, 230, 34); });
    g.shadowBlur = 0;
    // wall panel seams
    g.strokeStyle = 'rgba(0,0,0,0.06)'; g.lineWidth = 3;
    [150, 450, 780].forEach((x) => { g.beginPath(); g.moveTo(x, 380); g.lineTo(x, 1150); g.stroke(); });
    // floor
    gr = g.createLinearGradient(0, 1150, 0, H);
    gr.addColorStop(0, '#1f8f55'); gr.addColorStop(1, '#0f6b3c');
    g.fillStyle = gr; g.fillRect(0, 1150, W, H - 1150);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 1150, W, 12);
    // floor reflection
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.ellipse(470, 1350, 330, 50, 0, 0, Math.PI * 2); g.fill();

    const steel = (x0, x1) => {
      const s = g.createLinearGradient(x0, 0, x1, 0);
      s.addColorStop(0, '#7f878e'); s.addColorStop(0.18, '#dfe4e7'); s.addColorStop(0.35, '#9aa3aa');
      s.addColorStop(0.55, '#f6f8f9'); s.addColorStop(0.78, '#a2abb2'); s.addColorStop(1, '#6d757c');
      return s;
    };
    // legs / frame
    g.fillStyle = steel(200, 740);
    g.fillRect(230, 1050, 26, 260); g.fillRect(680, 1050, 26, 260);
    g.fillRect(200, 1150, 540, 18);
    // lower cone
    g.fillStyle = steel(280, 660);
    g.beginPath(); g.moveTo(250, 920); g.lineTo(690, 920); g.lineTo(560, 1110); g.lineTo(380, 1110); g.closePath(); g.fill();
    // main cylinder
    g.fillStyle = steel(250, 690);
    g.fillRect(250, 430, 440, 500);
    // top dome
    g.beginPath(); g.ellipse(470, 430, 220, 46, 0, Math.PI, 0); g.fill();
    // rings
    g.fillStyle = steel(240, 700);
    [[600, 22], [910, 26]].forEach(([y, h]) => g.fillRect(240, y, 460, h));
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    [600, 622, 910, 936].forEach((y) => { g.beginPath(); g.moveTo(240, y); g.lineTo(700, y); g.stroke(); });
    // sight glass
    g.fillStyle = '#5b6168'; g.beginPath(); g.arc(380, 760, 40, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9fb3c2'; g.beginPath(); g.arc(380, 760, 28, 0, Math.PI * 2); g.fill();
    // exhaust duct
    g.fillStyle = steel(410, 530);
    g.fillRect(430, 140, 80, 260);
    // control panel
    g.fillStyle = steel(720, 860);
    g.fillRect(720, 640, 140, 220);
    g.fillStyle = '#2a2f35'; g.fillRect(740, 665, 100, 50);
    ['#ef4444', '#22c55e', '#facc15'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(752 + i * 38, 760, 11, 0, Math.PI * 2); g.fill(); });
    // label plate
    g.fillStyle = '#1e3a8a'; g.fillRect(520, 470, 140, 34);
    g.fillStyle = '#fff'; g.font = 'bold 18px sans-serif'; g.fillText('FLUID BED', 538, 494);
    // subtle noise / vignette for photo feel
    const v = g.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 1000);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    return c;
  }

  function proceduralSelfie() {
    const W = 600, H = 800;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#eef0f1'); gr.addColorStop(1, '#c9ced2');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // AC unit
    g.fillStyle = '#fafafa'; g.shadowColor = 'rgba(0,0,0,0.15)'; g.shadowBlur = 16;
    g.fillRect(340, 60, 230, 70); g.shadowBlur = 0;
    g.fillStyle = '#d0d4d7'; g.fillRect(350, 112, 210, 6);
    // body (khaki uniform)
    gr = g.createLinearGradient(0, 560, 0, H);
    gr.addColorStop(0, '#a89468'); gr.addColorStop(1, '#8a7a52');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(40, H); g.quadraticCurveTo(60, 590, 300, 570); g.quadraticCurveTo(540, 590, 560, H); g.closePath(); g.fill();
    // collar
    g.fillStyle = '#b8a678';
    g.beginPath(); g.moveTo(240, 575); g.lineTo(300, 660); g.lineTo(210, 640); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(360, 575); g.lineTo(300, 660); g.lineTo(390, 640); g.closePath(); g.fill();
    // neck
    g.fillStyle = '#b07a52'; g.fillRect(262, 470, 76, 110);
    // head
    gr = g.createRadialGradient(285, 360, 20, 300, 380, 140);
    gr.addColorStop(0, '#d29a6c'); gr.addColorStop(1, '#a8714a');
    g.fillStyle = gr; g.beginPath(); g.ellipse(300, 380, 105, 130, 0, 0, Math.PI * 2); g.fill();
    // hair
    g.fillStyle = '#1f1f22';
    g.beginPath(); g.ellipse(300, 290, 110, 70, 0, Math.PI, 0); g.fill();
    g.fillRect(190, 285, 220, 30);
    // soft camera vignette
    const v = g.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 520);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    return c;
  }

  async function loadSample(target, path, fallback) {
    try {
      const img = await loadImage(path);
      setLayer(target, img, path, 'Contoh — ' + path.split('/').pop());
    } catch {
      const c = fallback();
      setLayer(target, c, c.toDataURL('image/jpeg', 0.8), 'Contoh (sampel bawaan)');
    }
  }

  /* =========================================================
     INIT
     ========================================================= */
  function init() {
    initBindings();
    initDropzones();
    initCanvasInteractions();
    initActions();
    syncUI();
    resizeCanvas();
    loadSample('main', 'assets/sample-main.jpg', proceduralMain);
    loadSample('pip', 'assets/sample-selfie.jpg', proceduralSelfie);
    // Re-render once web fonts (Roboto) are ready so canvas text uses them
    if (document.fonts) {
      document.fonts.load(`500 12px Roboto`).then(scheduleRender).catch(() => {});
      document.fonts.load(`700 12px Roboto`).then(scheduleRender).catch(() => {});
      document.fonts.ready.then(scheduleRender);
    }
  }

  init();
})();
