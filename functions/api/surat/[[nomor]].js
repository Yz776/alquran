const API_BASE = 'https://equran.id/api/v2';

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

export async function onRequestGet(context) {
  const nomor = context.params.nomor;
  const url = nomor ? API_BASE + '/surat/' + encodeURIComponent(nomor) : API_BASE + '/surat';
  const upstream = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!upstream.ok) {
    return Response.json({ error: 'Gagal mengambil data Al-Quran', status: upstream.status }, { status: upstream.status });
  }
  const payload = await upstream.json();
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
  };
  return new Response(JSON.stringify(payload.data || payload), { status: 200, headers });
}
