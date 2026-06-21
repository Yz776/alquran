/**
 * app.js — Al-Qur'an Digital
 *
 * Semua data dibaca dari SATU file JSON (lokal atau URL VPS storage).
 * Tidak ada panggilan ke API eksternal saat user membuka halaman.
 *
 * Konfigurasi:
 *   DATA_SOURCE — path file lokal ATAU URL https ke quran-data.json di VPS storage kamu
 *
 * Contoh:
 *   const DATA_SOURCE = './quran-data.json';           // file lokal
 *   const DATA_SOURCE = 'https://storage.example.com/quran-data.json'; // VPS/CDN
 */

'use strict';

require('dotenv').config();

const express      = require('express');
const securexpress = require('securexpress');
const https        = require('https');
const http         = require('http');
const fs           = require('fs');
const path         = require('path');

const app  = express();
const PORT = process.env.PORT || 8989;

app.disable('x-powered-by');

// ─────────────────────────────────────────────
// KONFIGURASI — sesuaikan URL ini
// ─────────────────────────────────────────────
const DATA_SOURCE = process.env.QURAN_DATA_URL || 'https://storage.example.com/quran-data.json';
// Jika pakai file lokal, ganti dengan: const DATA_SOURCE = './quran-data.json';
// ─────────────────────────────────────────────

// ── Body parser (SEBELUM securexpress) ───────
app.use(express.json({
  limit: process.env.BODY_LIMIT || '1mb',
  strict: true,
}));

app.use(express.urlencoded({
  extended: true,
  limit: process.env.BODY_LIMIT || '1mb',
}));

// ── Securexpress ─────────────────────────────
app.use(securexpress({
  preset: process.env.SECUREXPRESS_PRESET || 'balanced',
  trustProxy: process.env.TRUST_PROXY !== 'false',

  requestId: true,
  headers: true,
  compression: true,
  bodyGuard: true,
  ddos: true,
  botGuard: process.env.BOT_GUARD === 'true',
  cache: true,

  cors: true,
  corsOptions: {
    origins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map(origin => origin.trim())
      .filter(Boolean),
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },

  bodyGuardOptions: {
    maxBodySize: process.env.BODY_LIMIT || '1mb',
    maxUrlLength: 2048,
    maxHeaderCount: 80,
    maxHeaderBytes: 16 * 1024,
    timeoutMs: 15000,
  },

  adaptiveRateLimit: {
    enabled: true,
    rules: [
      { path: '/api/surah', windowMs: 60 * 1000, limit: 180 },
      { path: '/surah',     windowMs: 60 * 1000, limit: 180 },
      { path: '/',          windowMs: 60 * 1000, limit: 120 },
    ],
  },

  staticShield: { enabled: true },
  honeypot:     { enabled: true },

  inputSanitizer: {
    enabled: true,
    trim: true,
    nullBytes: true,
    stripScript: true,
    blockMongoOperators: true,
  },

  responseTime: { enabled: true },
  requestLogger: {
    enabled: process.env.REQUEST_LOGGER !== 'false',
    format: 'tiny',
  },
  securityLogger: {
    enabled: true,
    slowMs: 2000,
  },

  stats: {
    enabled: Boolean(process.env.SECUREXPRESS_STATS_KEY),
    path: '/securexpress/stats',
    key: process.env.SECUREXPRESS_STATS_KEY,
  },

  // OFF agar tidak merusak API JSON / halaman biasa.
  csrf:            { enabled: false },
  captchaGate:     { enabled: false },
  scriptInjection: { enabled: false },
  signedUrl:       { enabled: false },
  aiBotControl:    { enabled: false },
  realIpGuard:     { enabled: false },
  methodOverride:  { enabled: false },
  routeGuard:      { enabled: false },

  // Default OFF supaya tidak loop di panel/VPS yang belum benar header proxy-nya.
  httpsRedirect: {
    enabled: process.env.HTTPS_REDIRECT === 'true',
    exclude: ['/health', '/securexpress/health'],
  },
}));

// ── CSP: izinkan Google Fonts, audio, inline JS ──
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      "script-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https:",
      "connect-src 'self' https:",
      "manifest-src 'self'",
    ].join('; ')
  );
  next();
});

// ── Static files ─────────────────────────────
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',
  setHeaders(res, filePath) {
    if (/\.(woff2?|ttf|otf)$/i.test(filePath)) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    }
  },
}));

// ── Cache data di memori ─────────────────────
let quranCache = null;
let cacheTime  = 0;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 jam

function fetchRemoteJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib.get(url, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getData() {
  if (quranCache && Date.now() - cacheTime < CACHE_TTL) {
    return quranCache;
  }

  let data;
  if (DATA_SOURCE.startsWith('http')) {
    console.log('[data] Fetching dari URL:', DATA_SOURCE);
    data = await fetchRemoteJson(DATA_SOURCE);
  } else {
    console.log('[data] Membaca file lokal:', DATA_SOURCE);
    data = JSON.parse(fs.readFileSync(path.resolve(DATA_SOURCE), 'utf8'));
  }

  quranCache = data;
  cacheTime  = Date.now();
  console.log(`[data] Cache diperbarui — ${data.length} surah dimuat.`);
  return data;
}

// ── Helper functions ─────────────────────────
function cleanArabicText(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\uFFFD/g, '')
    .replace(/[\u08D6]+/g, '')
    .replace(/\u0640/g, '')
    .replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Template: CSS (HANYA style, tanpa script) ──
const CSS = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Amiri+Quran&family=Noto+Naskh+Arabic:wght@400;600;700&family=Noto+Sans+Arabic:wght@400;600;700&family=Scheherazade+New:wght@400;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Noto Sans Arabic',sans-serif;background:#f3f4f6;color:#1f2937;min-height:100vh}

/* ── Navbar ── */
.navbar{background:linear-gradient(135deg,#15803d,#16a34a 60%,#22c55e);padding:14px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(22,163,74,.3)}
.brand{display:flex;align-items:center;gap:10px}
.brand-icon{width:36px;height:36px;background:rgba(255,255,255,.2);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:18px}
.brand-name{color:#fff;font-size:18px;font-weight:600}
.brand-sub{color:rgba(255,255,255,.75);font-size:11px;display:block}
.nav-actions{display:flex;gap:8px}
.pill{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.25);padding:6px 14px;border-radius:99px;font-size:13px;font-weight:500;cursor:pointer;text-decoration:none;transition:background .2s}
.pill:hover{background:rgba(255,255,255,.3)}
.back-link{display:flex;align-items:center;gap:6px;color:rgba(255,255,255,.9);text-decoration:none;font-size:13px;font-weight:500;background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.22);padding:6px 14px;border-radius:99px;transition:background .2s}
.back-link:hover{background:rgba(255,255,255,.25)}
.navbar-title{color:rgba(255,255,255,.85);font-size:14px;font-weight:500}

/* ── Search ── */
.search-wrap{max-width:560px;margin:24px auto 0;padding:0 20px}
.search-box{position:relative}
.search-box input{width:100%;padding:11px 16px 11px 42px;border:1.5px solid #e5e7eb;border-radius:12px;font-size:14px;background:#fff;color:#1f2937;outline:none;box-shadow:0 1px 4px rgba(0,0,0,.06);transition:border-color .2s,box-shadow .2s}
.search-box input:focus{border-color:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.12)}
.search-icon{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:#9ca3af;font-size:15px;pointer-events:none}

/* ── Stats ── */
.stats-bar{max-width:1200px;margin:14px auto 0;padding:0 20px;display:flex;gap:8px;flex-wrap:wrap}
.stat-pill{background:#f0fdf4;border:1px solid #bbf7d0;color:#15803d;font-size:11px;font-weight:500;padding:3px 10px;border-radius:99px}

/* ── Bookmark panel ── */
.bm-panel{max-width:600px;margin:16px auto 0;padding:0 20px}
.bm-box{background:#fff;border:1px solid #fbbf24;border-radius:12px;padding:14px 18px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
.bm-box h2{font-size:13px;font-weight:600;color:#374151;margin-bottom:10px}
.bm-box ul{list-style:none}
.bm-box li{font-size:13px;color:#6b7280;padding:5px 0;border-bottom:1px solid #f3f4f6;display:flex;align-items:center;gap:7px}
.bm-box li:last-child{border-bottom:none}
.bm-dot{width:6px;height:6px;background:#f59e0b;border-radius:50%;flex-shrink:0}

/* ── Surah grid ── */
.surah-grid{max-width:1200px;margin:18px auto 40px;padding:0 20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.surah-card{display:block;text-decoration:none;color:inherit;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:16px 18px;box-shadow:0 1px 4px rgba(0,0,0,.05);transition:transform .18s,box-shadow .18s,border-color .18s;position:relative;overflow:hidden}
.surah-card::before{content:'';position:absolute;top:0;left:0;width:3px;height:100%;background:linear-gradient(to bottom,#22c55e,#15803d);opacity:0;transition:opacity .2s}
.surah-card:hover{transform:translateY(-2px);box-shadow:0 6px 16px rgba(0,0,0,.08);border-color:#bbf7d0}
.surah-card:hover::before{opacity:1}
.card-header{display:flex;gap:12px;align-items:flex-start;margin-bottom:10px}
.nomor-badge{min-width:34px;height:34px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#15803d;flex-shrink:0}
.card-names{flex:1;min-width:0}
.card-arab{font-family:'Amiri Quran','Noto Naskh Arabic','Scheherazade New','KFGQPC Uthman Taha Naskh','UthmanicHafs','Traditional Arabic','Times New Roman',serif;font-size:22px;color:#15803d;line-height:1.5;letter-spacing:0!important;word-spacing:0!important;font-kerning:normal;font-feature-settings:'liga' 1,'calt' 1,'rlig' 1,'kern' 1}
.card-latin{font-size:13px;font-weight:600;color:#1f2937}
.card-arti{font-size:12px;color:#6b7280}
.card-chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-size:11px;font-weight:500;padding:2px 9px;border-radius:99px}
.chip-ayat{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}
.chip-turun{background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb}

/* ── Detail hero ── */
.detail-hero{background:linear-gradient(135deg,#15803d,#16a34a 60%,#22c55e);padding:28px 24px 24px;text-align:center}
.hero-badge{display:inline-block;background:rgba(255,255,255,.18);color:rgba(255,255,255,.9);font-size:10px;font-weight:600;padding:3px 12px;border-radius:99px;letter-spacing:.5px;text-transform:uppercase;margin-bottom:8px}
.hero-arab{font-family:'Amiri Quran','Noto Naskh Arabic','Scheherazade New','KFGQPC Uthman Taha Naskh','UthmanicHafs','Traditional Arabic','Times New Roman',serif;font-size:46px;color:#fff;line-height:1.5;margin-bottom:4px;letter-spacing:0!important;word-spacing:0!important;font-feature-settings:'liga' 1,'calt' 1,'rlig' 1,'kern' 1}
.hero-latin{font-size:20px;font-weight:600;color:#fff;margin-bottom:2px}
.hero-arti{font-size:13px;color:rgba(255,255,255,.8);margin-bottom:12px}
.hero-chips{display:flex;justify-content:center;gap:8px}
.hero-chip{background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.25);color:rgba(255,255,255,.9);font-size:12px;padding:3px 13px;border-radius:99px}

/* ── Audio ── */
.audio-section{max-width:760px;margin:18px auto 0;padding:0 20px}
.audio-label{font-size:11px;font-weight:600;color:#6b7280;letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px}
audio{width:100%;border-radius:10px;outline:none}

/* ── Ayat ── */
.ayat-list{max-width:760px;margin:18px auto 0;padding:0 20px;display:flex;flex-direction:column;gap:12px}
.ayat-card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,.05);overflow:hidden}
.ayat-header{display:flex;align-items:center;justify-content:space-between;padding:9px 14px;background:#f9fafb;border-bottom:1px solid #f3f4f6}
.ayat-num-wrap{display:flex;align-items:center;gap:8px}
.ayat-badge{width:27px;height:27px;background:#16a34a;color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600}
.ayat-num-label{font-size:12px;color:#6b7280;font-weight:500}
.btn-bookmark{background:none;border:1px solid #e5e7eb;border-radius:7px;padding:4px 10px;font-size:12px;color:#6b7280;cursor:pointer;transition:all .2s}
.btn-bookmark:hover{background:#fffbeb;border-color:#fbbf24;color:#92400e}
.ayat-body{padding:16px 18px}
.ayat-arab{font-family:'Amiri Quran','Noto Naskh Arabic','Scheherazade New','KFGQPC Uthman Taha Naskh','UthmanicHafs','Traditional Arabic','Times New Roman',Arial,serif;font-size:36px;color:#111827;text-align:right;line-height:2.05;direction:rtl;unicode-bidi:isolate;margin-bottom:12px;letter-spacing:0!important;word-spacing:0!important;text-rendering:optimizeLegibility;-webkit-font-smoothing:antialiased;font-kerning:normal;font-variant-ligatures:normal;font-feature-settings:'liga' 1,'calt' 1,'rlig' 1,'kern' 1}
.ayat-divider{height:1px;background:#f3f4f6;margin-bottom:10px}
.ayat-latin{font-size:13px;color:#6b7280;font-style:italic;line-height:1.7;margin-bottom:6px}
.ayat-terjemah{font-size:14px;color:#374151;line-height:1.75}

/* ── Nav bottom ── */
.nav-bottom{max-width:760px;margin:20px auto 48px;padding:0 20px;display:flex;justify-content:space-between;gap:12px}
.btn-surah-nav{display:inline-flex;align-items:center;gap:7px;padding:11px 20px;border-radius:10px;font-size:13px;font-weight:500;text-decoration:none;transition:transform .15s,box-shadow .15s}
.btn-surah-nav:hover{transform:translateY(-1px);box-shadow:0 4px 10px rgba(0,0,0,.1)}
.btn-next{background:#16a34a;color:#fff}
.btn-prev{background:#fff;color:#374151;border:1px solid #e5e7eb}

/* ── Donation popup ── */
#kfai-donasi-popup{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:99999999;padding:20px;box-sizing:border-box}
#kfai-donasi-popup .popup-inner{position:relative;background:#fff;width:100%;max-width:420px;border-radius:20px;padding:24px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.25);font-family:system-ui,sans-serif}
#kfai-donasi-popup .popup-close{position:absolute;top:10px;right:10px;width:34px;height:34px;border:none;border-radius:50%;background:#f3f4f6;cursor:pointer;font-size:20px;line-height:1}
#kfai-donasi-popup .popup-close:hover{background:#e5e7eb}
#kfai-donasi-popup .popup-qr{width:100%;max-width:260px;border-radius:12px;margin-bottom:15px}
#kfai-donasi-popup .popup-title{margin:10px 0;color:#111827;font-size:18px}
#kfai-donasi-popup .popup-desc{color:#4b5563;line-height:1.6;margin:0}
#kfai-donasi-popup .popup-note{margin-top:15px;font-size:12px;color:#9ca3af}

@media(max-width:520px){
  .navbar{padding:12px 16px}
  .ayat-list{padding:0 14px;gap:14px}
  .ayat-body{padding:18px 16px}
  .ayat-arab{font-size:34px;line-height:2.15}
  .hero-arab{font-size:42px}
}
</style>
`;

// ── Template: Donation popup script (terpisah dari CSS) ──
const DONASI_SCRIPT = `
<script>
(function () {
  var KEY = 'kfai_donasi_v2';
  if (localStorage.getItem(KEY)) return;

  function closePopup() {
    localStorage.setItem(KEY, '1');
    var el = document.getElementById('kfai-donasi-popup');
    if (el) el.remove();
  }

  function createPopup() {
    var popup = document.createElement('div');
    popup.id = 'kfai-donasi-popup';
    popup.innerHTML =
      '<div class="popup-inner">' +
        '<button class="popup-close" id="kfai-close">&#10005;</button>' +
        '<img class="popup-qr" src="https://i.ibb.co/99S0mzBy/qr-ID1026536158821-21-06-26-1782048531-1782048531392.jpg" alt="QRIS">' +
        '<h2 class="popup-title">&#10084;&#65039; Dukung Server Kami</h2>' +
        '<p class="popup-desc">Jika layanan ini bermanfaat, Anda dapat memberikan dukungan seikhlasnya untuk membantu biaya server agar layanan tetap berjalan dan terus berkembang.</p>' +
        '<div class="popup-note">Donasi tidak wajib dan tidak memengaruhi akses layanan.</div>' +
      '</div>';
    document.body.appendChild(popup);
    document.getElementById('kfai-close').addEventListener('click', closePopup);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createPopup);
  } else {
    createPopup();
  }
})();
</script>
`;

// ── Template: HEAD wrapper ───────────────────
function renderHead(title) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title || "Al-Qur'an Digital"}</title>
  <link rel="manifest" href="/manifest.json">
  ${CSS}
</head>
<body>`;
}

function renderFoot() {
  return `${DONASI_SCRIPT}</body></html>`;
}

// ═══════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════

// ── Halaman utama ────────────────────────────
app.get('/', async (req, res) => {
  try {
    const suratList = await getData();

    const cards = suratList.map(s => `
      <a href="/surah/${s.nomor}" class="surah-card">
        <div class="card-header">
          <div class="nomor-badge">${s.nomor}</div>
          <div class="card-names">
            <div class="card-arab">${escapeHtml(cleanArabicText(s.nama))}</div>
            <div class="card-latin">${escapeHtml(s.namaLatin)}</div>
            <div class="card-arti">${escapeHtml(s.arti)}</div>
          </div>
        </div>
        <div class="card-chips">
          <span class="chip chip-ayat">${s.jumlahAyat} ayat</span>
          <span class="chip chip-turun">${s.tempatTurun}</span>
        </div>
      </a>`).join('');

    res.send(renderHead() + `
      <nav class="navbar">
        <div class="brand">
          <div class="brand-icon">&#128214;</div>
          <div>
            <span class="brand-name">Al-Qur'an Digital</span>
            <span class="brand-sub">114 Surah &bull; Terjemahan Indonesia</span>
          </div>
        </div>
        <div class="nav-actions">
          <button id="bmBtn" class="pill">&#128278; Bookmark</button>
        </div>
      </nav>

      <div class="search-wrap">
        <div class="search-box">
          <span class="search-icon">&#128269;</span>
          <input type="text" id="searchSurah" placeholder="Cari surah, misal: Al-Fatihah..." />
        </div>
      </div>

      <div class="stats-bar">
        <span class="stat-pill">114 Surah</span>
        <span class="stat-pill">6.236 Ayat</span>
        <span class="stat-pill">30 Juz</span>
        <span class="stat-pill">Data lokal — tanpa API eksternal</span>
      </div>

      <div class="bm-panel" id="bmPanel" style="display:none">
        <div class="bm-box">
          <h2>&#128204; Ayat yang Ditandai</h2>
          <ul id="bmList"></ul>
        </div>
      </div>

      <div class="surah-grid">${cards}</div>

      <script>
        document.getElementById('bmBtn').addEventListener('click', function(){
          var p = document.getElementById('bmPanel');
          var show = p.style.display === 'none';
          p.style.display = show ? 'block' : 'none';
          if (show) {
            var bm = JSON.parse(localStorage.getItem('bookmarks') || '[]');
            var ul = document.getElementById('bmList');
            ul.innerHTML = bm.length
              ? bm.map(function(b){ return '<li><span class="bm-dot"></span>' + b + '</li>'; }).join('')
              : '<li><span class="bm-dot"></span>Belum ada bookmark.</li>';
          }
        });
        document.getElementById('searchSurah').addEventListener('input', function(){
          var kw = this.value.toLowerCase();
          document.querySelectorAll('.surah-card').forEach(function(c){
            c.style.display = c.textContent.toLowerCase().includes(kw) ? '' : 'none';
          });
        });
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('/sw.js');
        }
      </script>
    ` + renderFoot());

  } catch (err) {
    console.error(err);
    res.status(500).send(renderHead() + `
      <nav class="navbar">
        <div class="brand"><span class="brand-name">Al-Qur'an Digital</span></div>
      </nav>
      <p style="text-align:center;color:red;padding:40px">
        Gagal memuat data. Pastikan DATA_SOURCE sudah benar dan file quran-data.json tersedia.<br>
        <small>${escapeHtml(err.message)}</small>
      </p>
    ` + renderFoot());
  }
});

// ── Detail surah ─────────────────────────────
app.get('/surah/:nomer', async (req, res) => {
  const nomer = parseInt(req.params.nomer, 10);
  if (isNaN(nomer) || nomer < 1 || nomer > 114) {
    return res.redirect('/');
  }

  try {
    const allData = await getData();
    const data = allData[nomer - 1];
    if (!data) return res.redirect('/');

    const audioUrl = data.audioFull['05'];

    const ayatCards = data.ayat.map(a => {
      const bmText = (data.namaLatin + ' - Ayat ' + a.nomorAyat).replace(/'/g, "\\'");
      return `
        <div class="ayat-card">
          <div class="ayat-header">
            <div class="ayat-num-wrap">
              <div class="ayat-badge">${a.nomorAyat}</div>
              <span class="ayat-num-label">Ayat ke-${a.nomorAyat}</span>
            </div>
            <button class="btn-bookmark" onclick="bookmarkAyat('${bmText}',this)">&#128278; Tandai</button>
          </div>
          <div class="ayat-body">
            <div class="ayat-arab">${escapeHtml(cleanArabicText(a.teksArab))}</div>
            <div class="ayat-divider"></div>
            <div class="ayat-latin">${escapeHtml(a.teksLatin)}</div>
            <div class="ayat-terjemah">${escapeHtml(a.teksIndonesia)}</div>
          </div>
        </div>`;
    }).join('');

    const prevBtn = data.suratSebelumnya
      ? `<a href="/surah/${data.suratSebelumnya.nomor}" class="btn-surah-nav btn-prev">&#8592; ${data.suratSebelumnya.namaLatin}</a>`
      : '<span></span>';
    const nextBtn = data.suratSelanjutnya
      ? `<a href="/surah/${data.suratSelanjutnya.nomor}" class="btn-surah-nav btn-next">${data.suratSelanjutnya.namaLatin} &#8594;</a>`
      : '<span></span>';

    res.send(renderHead(`${data.namaLatin} — Al-Qur'an Digital`) + `
      <nav class="navbar">
        <a href="/" class="back-link">&#8592; Daftar Surah</a>
        <span class="navbar-title">Surah ${data.nomor} / 114</span>
        <div style="width:110px"></div>
      </nav>

      <div class="detail-hero">
        <div class="hero-badge">Surah ke-${data.nomor}</div>
        <div class="hero-arab">${escapeHtml(cleanArabicText(data.nama))}</div>
        <div class="hero-latin">${escapeHtml(data.namaLatin)}</div>
        <div class="hero-arti">${escapeHtml(data.arti)}</div>
        <div class="hero-chips">
          <span class="hero-chip">${data.jumlahAyat} Ayat</span>
          <span class="hero-chip">${escapeHtml(data.tempatTurun)}</span>
        </div>
      </div>

      <div class="audio-section">
        <div class="audio-label">&#127925; Audio &mdash; Misyari Rasyid Al-Afasi</div>
        <audio controls>
          <source src="${audioUrl}" type="audio/mpeg">
          Browser tidak mendukung audio.
        </audio>
      </div>

      <div class="ayat-list">${ayatCards}</div>

      <div class="nav-bottom">
        ${prevBtn}
        ${nextBtn}
      </div>

      <script>
        function bookmarkAyat(text, btn) {
          var bm = JSON.parse(localStorage.getItem('bookmarks') || '[]');
          if (!bm.includes(text)) {
            bm.push(text);
            localStorage.setItem('bookmarks', JSON.stringify(bm));
          }
          btn.textContent = '\\u2714 Tersimpan';
          btn.style.cssText = 'background:#f0fdf4;border-color:#86efac;color:#166534';
          setTimeout(function(){
            btn.innerHTML = '&#128278; Tandai';
            btn.removeAttribute('style');
          }, 1800);
        }
      </script>
    ` + renderFoot());

  } catch (err) {
    console.error(err);
    res.status(500).send(renderHead() + `
      <nav class="navbar">
        <a href="/" class="back-link">&#8592; Kembali</a>
      </nav>
      <p style="text-align:center;color:red;padding:40px">
        Gagal memuat data surah.<br><small>${escapeHtml(err.message)}</small>
      </p>
    ` + renderFoot());
  }
});

// ── API: daftar surah ────────────────────────
app.get('/api/surah', async (req, res) => {
  try {
    const data = await getData();
    res.json(data.map(s => ({
      nomor: s.nomor,
      nama: s.nama,
      namaLatin: s.namaLatin,
      arti: s.arti,
      jumlahAyat: s.jumlahAyat,
      tempatTurun: s.tempatTurun,
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── API: detail surah ────────────────────────
app.get('/api/surah/:nomer', async (req, res) => {
  const nomer = parseInt(req.params.nomer, 10);
  try {
    const data = await getData();
    const surah = data[nomer - 1];
    if (!surah) return res.status(404).json({ error: 'Surah tidak ditemukan' });
    res.json(surah);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ─────────────────────────────
app.get('/securexpress/health', securexpress.health());

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    cached: !!quranCache,
    surahCount: quranCache ? quranCache.length : 0,
    cacheAge: quranCache ? Math.round((Date.now() - cacheTime) / 1000) + 's' : 'n/a',
    dataSource: DATA_SOURCE,
  });
});

// ── Handler akhir ────────────────────────────
app.use(securexpress.notFoundHandler);
app.use(securexpress.errorHandler({
  exposeInternal: false,
  exposeStack: false,
}));

// ── Start server ─────────────────────────────
app.listen(PORT, async () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
  console.log(`Data source: ${DATA_SOURCE}`);
  try {
    await getData();
    console.log('Data berhasil di-load ke cache.');
  } catch (err) {
    console.error('Gagal pre-load data:', err.message);
    console.error('Pastikan DATA_SOURCE sudah benar!');
  }
});
