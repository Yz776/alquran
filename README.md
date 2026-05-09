# Al-Qur'an Digital — Setup Guide

Semua data 114 surah + ayat disimpan dalam **satu file JSON** di VPS storage.
App tidak pernah memanggil API eksternal saat ada request user → lebih cepat & tidak bergantung pihak ketiga.

## Struktur file

```
alquran/
├── app.js              ← Express server (VPS utama)
├── generate-data.js    ← Script generate quran-data.json (jalankan sekali)
├── package.json
├── nginx-storage.conf  ← Contoh config nginx untuk VPS storage
├── public/
│   ├── manifest.json   ← (opsional, untuk PWA)
│   └── sw.js           ← (opsional, untuk PWA offline)
└── quran-data.json     ← DIHASILKAN oleh generate-data.js, upload ke VPS storage
```

---

## Langkah 1 — Generate file data (jalankan SEKALI)

Di komputer lokal atau VPS mana saja yang punya akses internet:

```bash
node generate-data.js
```

Proses ±5-10 menit (114 request ke equran.id dengan jeda 300ms).
Hasilkan file `quran-data.json` (~15-20 MB).

---

## Langkah 2 — Upload ke VPS storage

### Opsi A: Pakai nginx di VPS storage (direkomendasikan)

```bash
# Di VPS storage
mkdir -p /var/www/quran-storage
# Upload quran-data.json ke sana (pakai scp atau rsync)
scp quran-data.json user@vps-storage:/var/www/quran-storage/

# Setup nginx (lihat nginx-storage.conf)
cp nginx-storage.conf /etc/nginx/sites-available/quran-storage
ln -s /etc/nginx/sites-available/quran-storage /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

File akan bisa diakses di: `http://storage.example.com/quran-data.json`

### Opsi B: Pakai file lokal di VPS utama

Jika VPS hanya satu, letakkan `quran-data.json` di folder yang sama dengan `app.js`:

```bash
# Di app.js, ubah baris ini:
const DATA_SOURCE = './quran-data.json';
```

---

## Langkah 3 — Konfigurasi app.js

Edit satu baris di `app.js`:

```js
// Jika file di VPS storage (URL):
const DATA_SOURCE = 'https://storage.example.com/quran-data.json';

// Atau jika file lokal:
const DATA_SOURCE = './quran-data.json';

// Atau via environment variable:
// export QURAN_DATA_URL=https://storage.example.com/quran-data.json
```

---

## Langkah 4 — Jalankan server

```bash
cd alquran
npm install
npm start
# atau:
node app.js
```

Server berjalan di `http://localhost:8989`

Cek status: `curl http://localhost:8989/health`

---

## Cara kerja caching

- Saat server start, data langsung di-load ke memori (in-memory cache).
- Semua request user dilayani dari cache → tidak ada I/O disk atau network.
- Cache diperbarui otomatis setiap 24 jam.
- Restart server → cache di-reload dari `DATA_SOURCE`.

## Update data

Jika ingin update isi Al-Qur'an (misalnya koreksi terjemahan):

```bash
node generate-data.js        # generate ulang
scp quran-data.json user@vps-storage:/var/www/quran-storage/
# Cache akan diperbarui dalam 24 jam, atau restart app.js
```

---

## API Endpoint (bonus)

App juga menyediakan REST API jika dibutuhkan:

| Endpoint | Keterangan |
|---|---|
| `GET /` | Halaman daftar surah |
| `GET /surah/:n` | Halaman detail surah |
| `GET /api/surah` | JSON daftar 114 surah |
| `GET /api/surah/:n` | JSON detail surah (termasuk ayat) |
| `GET /health` | Status server dan cache |

---

## Securexpress Production Security

Project ini sudah ditambahkan **securexpress 2.2.7** sebagai lapisan keamanan Express.js untuk production.

Fitur yang aktif secara default:

- `requestId`, security headers, compression, body guard
- anti flood/DDOS ringan Layer 7
- bot guard
- static shield untuk blokir file sensitif seperti `.env`, `.git`, `.db`, `.log`
- honeypot scanner
- input sanitizer ringan
- response time header
- request logger dan security logger
- adaptive rate limit untuk `/`, `/surah`, dan `/api/surah`
- stats endpoint di `/securexpress/stats` jika `SECUREXPRESS_STATS_KEY` diisi

Fitur yang sengaja OFF agar tidak merusak halaman/API:

- `csrf`
- `captchaGate`
- `scriptInjection`
- `signedUrl`
- `aiBotControl`
- `realIpGuard`
- `methodOverride`
- `routeGuard`
- `httpsRedirect` default OFF

### Install dependency baru

```bash
npm install
```

Atau manual:

```bash
npm install securexpress dotenv express
```

### Buat file `.env`

```bash
cp .env.example .env
```

Generate key untuk stats:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Masukkan hasilnya ke:

```env
SECUREXPRESS_STATS_KEY=hasil_random_panjang
```

### Jalankan check

```bash
npm run check
npm start
```

### Test keamanan dasar

```bash
curl -i http://localhost:8989/health
curl -i http://localhost:8989/securexpress/health
curl -i http://localhost:8989/.env
curl -i http://localhost:8989/api/surah
curl -i http://localhost:8989/securexpress/stats -H "x-api-key: YOUR_STATS_KEY"
```

Expected:

- `/health` status 200
- `/securexpress/health` status 200
- `/.env` tidak boleh terbuka
- `/api/surah` tetap normal
- `/securexpress/stats` hanya bisa diakses pakai key

### Catatan Cloudflare/Nginx

Jika app berada di balik Cloudflare/Nginx, biarkan:

```env
TRUST_PROXY=true
```

Aktifkan HTTPS redirect hanya kalau domain dan proxy sudah benar:

```env
HTTPS_REDIRECT=true
```

Kalau terjadi redirect loop, ubah lagi:

```env
HTTPS_REDIRECT=false
```
