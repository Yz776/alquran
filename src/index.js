const API_BASE = 'https://equran.id/api/v2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors }
  });
}

function page() {
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Al-Qur'an Digital</title>
<style>
body{margin:0;font-family:system-ui,Arial;background:#f3f4f6;color:#1f2937}.nav{background:linear-gradient(135deg,#15803d,#22c55e);color:#fff;padding:16px 22px;position:sticky;top:0;z-index:5;box-shadow:0 2px 12px #16a34a55}.brand{font-weight:800;font-size:20px}.sub{font-size:12px;opacity:.85}.wrap{max-width:1180px;margin:auto;padding:20px}.search{width:100%;padding:13px 16px;border:1px solid #ddd;border-radius:14px;margin:8px 0 18px;font-size:15px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:16px;text-decoration:none;color:inherit;box-shadow:0 1px 5px #00000012}.card:hover{border-color:#22c55e;transform:translateY(-1px)}.num{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#dcfce7;color:#15803d;font-weight:800}.arab{font-family:serif;font-size:28px;color:#15803d;text-align:right;direction:rtl}.latin{font-weight:800}.meta{font-size:12px;color:#6b7280}.hero{background:linear-gradient(135deg,#15803d,#22c55e);color:#fff;text-align:center;padding:32px 20px}.hero .arab{color:#fff;font-size:48px;text-align:center}.ayat{max-width:820px;margin:16px auto;background:#fff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden}.ayat-head{background:#f9fafb;padding:10px 14px;border-bottom:1px solid #eee}.ayat-body{padding:18px}.ayat .arab{font-size:36px;color:#111;line-height:2}.terj{line-height:1.7}.back{color:#fff;text-decoration:none;font-weight:700}.err,.load{text-align:center;padding:40px}.audio{max-width:820px;margin:16px auto}audio{width:100%}@media(max-width:520px){.ayat .arab{font-size:32px}.hero .arab{font-size:40px}}
</style>
</head>
<body><div id="app" class="load">Memuat...</div>
<script>
const app=document.getElementById('app');
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const clean=s=>String(s||'').normalize('NFC').replace(/\uFFFD/g,'').replace(/[\u08D6]+/g,'').replace(/\u0640/g,'').replace(/[\u0000-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g,'').trim();
async function j(u){let r=await fetch(u);if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}
function nav(){return '<div class="nav"><div class="brand">📖 Al-Qur\'an Digital</div><div class="sub">Cloudflare Worker • 114 Surah • Terjemahan Indonesia</div></div>'}
async function home(){try{let data=await j('/api/surat');app.className='';app.innerHTML=nav()+'<main class="wrap"><input id="q" class="search" placeholder="Cari surah, misal Al-Fatihah..."><div class="grid">'+data.map(s=>'<a class="card" href="/surah/'+s.nomor+'"><span class="num">'+s.nomor+'</span><div class="arab">'+esc(clean(s.nama))+'</div><div class="latin">'+esc(s.namaLatin)+'</div><div class="meta">'+esc(s.arti)+' • '+s.jumlahAyat+' ayat • '+esc(s.tempatTurun)+'</div></a>').join('')+'</div></main>';q.oninput=()=>{let k=q.value.toLowerCase();document.querySelectorAll('.card').forEach(c=>c.style.display=c.textContent.toLowerCase().includes(k)?'':'none')}}catch(e){app.innerHTML='<p class="err">Gagal memuat data: '+esc(e.message)+'</p>'}}
async function detail(n){try{let d=await j('/api/surat/'+n);app.className='';app.innerHTML='<div class="nav"><a class="back" href="/">← Daftar Surah</a></div><section class="hero"><div class="arab">'+esc(clean(d.nama))+'</div><h1>'+esc(d.namaLatin)+'</h1><p>'+esc(d.arti)+' • '+d.jumlahAyat+' ayat • '+esc(d.tempatTurun)+'</p></section><div class="audio"><audio controls src="'+esc((d.audioFull&&d.audioFull['05'])||'')+'"></audio></div>'+d.ayat.map(a=>'<article class="ayat"><div class="ayat-head">Ayat ke-'+a.nomorAyat+'</div><div class="ayat-body"><div class="arab">'+esc(clean(a.teksArab))+'</div><hr><p><i>'+esc(a.teksLatin)+'</i></p><p class="terj">'+esc(a.teksIndonesia)+'</p></div></article>').join('')}catch(e){app.innerHTML='<p class="err">Gagal memuat surah: '+esc(e.message)+'</p>'}}
let m=location.pathname.match(/^\/surah\/(\d+)/);m?detail(m[1]):home();
</script></body></html>`;
}

async function quranApi(pathname) {
  const match = pathname.match(/^\/api\/surat\/?(\d+)?$/);
  if (!match) return null;
  const nomor = match[1];
  const target = nomor ? `${API_BASE}/surat/${nomor}` : `${API_BASE}/surat`;
  const upstream = await fetch(target, { headers: { Accept: 'application/json' } });
  if (!upstream.ok) return json({ error: 'Gagal mengambil data Al-Quran', status: upstream.status }, upstream.status);
  const payload = await upstream.json();
  return json(payload.data || payload);
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname === '/health' || url.pathname === '/api/health') return json({ ok: true, app: 'alquran', runtime: 'cloudflare-worker' });
    const api = await quranApi(url.pathname);
    if (api) return api;
    return new Response(page(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
};
