/**
 * generate-data.js
 * Jalankan SEKALI untuk menghasilkan quran-data.json
 * Perintah: node generate-data.js
 *
 * File output: quran-data.json (~18MB)
 * Upload file ini ke VPS storage / CDN kamu.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_API = 'https://equran.id/api/v2';
const OUTPUT_FILE = path.join(__dirname, 'quran-data.json');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Parse error: ' + url)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('Mengambil daftar surah...');
  const listResp = await fetchJson(`${BASE_API}/surat`);
  const suratList = listResp.data;
  console.log(`Total ${suratList.length} surah ditemukan.`);

  const allData = [];

  for (let i = 0; i < suratList.length; i++) {
    const s = suratList[i];
    console.log(`[${i + 1}/114] Mengambil ${s.namaLatin}...`);
    try {
      const detail = await fetchJson(`${BASE_API}/surat/${s.nomor}`);
      const d = detail.data;
      allData.push({
        nomor: d.nomor,
        nama: d.nama,
        namaLatin: d.namaLatin,
        arti: d.arti,
        jumlahAyat: d.jumlahAyat,
        tempatTurun: d.tempatTurun,
        deskripsi: d.deskripsi || '',
        audioFull: d.audioFull,
        ayat: d.ayat.map(a => ({
          nomorAyat: a.nomorAyat,
          teksArab: a.teksArab,
          teksLatin: a.teksLatin,
          teksIndonesia: a.teksIndonesia,
        })),
        suratSebelumnya: d.suratSebelumnya
          ? { nomor: d.suratSebelumnya.nomor, namaLatin: d.suratSebelumnya.namaLatin }
          : null,
        suratSelanjutnya: d.suratSelanjutnya
          ? { nomor: d.suratSelanjutnya.nomor, namaLatin: d.suratSelanjutnya.namaLatin }
          : null,
      });
    } catch (err) {
      console.error(`  ERROR pada surah ${s.nomor}: ${err.message}`);
    }

    // Jeda 300ms agar tidak rate-limit
    await sleep(300);
  }

  console.log('\nMenyimpan ke quran-data.json...');
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allData), 'utf8');
  const sizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
  console.log(`Selesai! File: ${OUTPUT_FILE} (${sizeMB} MB)`);
  console.log('\nLangkah selanjutnya:');
  console.log('  1. Upload quran-data.json ke VPS storage / CDN kamu');
  console.log('  2. Set URL di app.js: DATA_URL = "https://storage.example.com/quran-data.json"');
  console.log('  3. Jalankan: node app.js');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
