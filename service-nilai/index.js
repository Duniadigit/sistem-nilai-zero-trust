// SERVICE NILAI (port 3001) - resource: data nilai & kelas.
// Hanya menerima request dari gateway (X-Gateway-Secret) DAN dengan token yang valid.
const express = require('express');
const pool = require('../common/db');
const { gatewayGuard } = require('../common/guard');
const { ports, urls, service } = require('../common/config');

const app = express();
app.use(express.json());
app.use(gatewayGuard); // verifikasi ulang di service (4.1)

// ---- Ambil token service dari gateway (cache sampai hampir kedaluwarsa) ----
let cache = { token: null, exp: 0 };
async function getServiceToken() {
  if (cache.token && Date.now() < cache.exp - 30000) return cache.token;
  const r = await fetch(`${urls.gateway}/auth/service`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: service.clientId, client_secret: service.clientSecret }),
  });
  if (!r.ok) throw new Error(`gagal mengambil token service (HTTP ${r.status})`);
  const d = await r.json();
  cache = { token: d.access_token, exp: Date.now() + d.expires_in * 1000 };
  return cache.token;
}

const SELECT_NILAI =
  'SELECT n.id, n.kelas_id, k.kode_mk, k.nama_mk, n.nim, n.nilai, n.final ' +
  'FROM nilai n JOIN kelas k ON k.id = n.kelas_id';

// GET /nilai  (mahasiswa: nilai sendiri | dosen: kelas yang diampu)
app.get('/nilai', async (req, res) => {
  try {
    const { sub, role } = req.auth;
    if (role === 'mahasiswa') {
      const [u] = await pool.query('SELECT nim FROM users WHERE id = ?', [sub]);
      if (!u[0] || !u[0].nim) return res.status(403).json({ message: 'Akun tidak memiliki NIM' });
      const [rows] = await pool.query(`${SELECT_NILAI} WHERE n.nim = ? ORDER BY n.id`, [u[0].nim]);
      return res.json(rows);
    }
    if (role === 'dosen') {
      let sql = `${SELECT_NILAI} WHERE k.dosen_id = ?`;
      const params = [sub];
      if (req.query.kelas_id) { sql += ' AND n.kelas_id = ?'; params.push(req.query.kelas_id); }
      if (req.query.nim) { sql += ' AND n.nim = ?'; params.push(req.query.nim); }
      const [rows] = await pool.query(sql + ' ORDER BY n.id', params);
      return res.json(rows);
    }
    res.status(403).json({ message: `Role ${role} tidak boleh melihat nilai` });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Kesalahan server' });
  }
});

// PUT /nilai/:id  body: { "nilai": 0-100 }
app.put('/nilai/:id', async (req, res) => {
  try {
    const { sub, role } = req.auth;
    if (role !== 'dosen') return res.status(403).json({ message: 'Hanya dosen yang boleh mengubah nilai' });
    const nilai = Number(req.body && req.body.nilai);
    if (!Number.isFinite(nilai) || nilai < 0 || nilai > 100) {
      return res.status(400).json({ message: 'nilai harus angka 0-100' });
    }
    const [rows] = await pool.query(
      'SELECT n.id, n.final, k.dosen_id FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Data nilai tidak ditemukan' });
    if (rows[0].dosen_id !== sub) return res.status(403).json({ message: 'Bukan kelas yang Anda ampu' });
    if (rows[0].final) return res.status(409).json({ message: 'Nilai sudah final' });
    await pool.query('UPDATE nilai SET nilai = ? WHERE id = ?', [nilai, req.params.id]);
    const [updated] = await pool.query(`${SELECT_NILAI} WHERE n.id = ?`, [req.params.id]);
    res.json({ message: 'Nilai diperbarui', data: updated[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Kesalahan server' });
  }
});

// POST /kelas/:id/finalisasi -> finalisasi nilai, lalu sinkron ke Service Transkrip VIA GATEWAY
app.post('/kelas/:id/finalisasi', async (req, res) => {
  try {
    const { sub, role } = req.auth;
    if (role !== 'dosen') return res.status(403).json({ message: 'Hanya dosen yang boleh memfinalisasi' });
    const [k] = await pool.query('SELECT * FROM kelas WHERE id = ?', [req.params.id]);
    if (!k[0]) return res.status(404).json({ message: 'Kelas tidak ditemukan' });
    if (k[0].dosen_id !== sub) return res.status(403).json({ message: 'Bukan kelas yang Anda ampu' });

    const [rows] = await pool.query('SELECT nim, nilai FROM nilai WHERE kelas_id = ?', [k[0].id]);
    if (rows.length === 0) return res.status(422).json({ message: 'Kelas belum memiliki data nilai' });
    if (rows.some((r) => r.nilai === null)) return res.status(422).json({ message: 'Masih ada nilai yang kosong' });

    await pool.query('UPDATE nilai SET final = 1 WHERE kelas_id = ?', [k[0].id]);

    // Panggilan antar-service: lewat gateway, memakai token service
    const payload = { kelas_id: k[0].id, kode_mk: k[0].kode_mk, nama_mk: k[0].nama_mk, items: rows };
    let sync;
    try {
      const token = await getServiceToken();
      sync = await fetch(`${urls.gateway}/transkrip/sinkron`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return res.status(502).json({ message: 'Nilai sudah final, tetapi sinkron transkrip gagal. Ulangi finalisasi.', detail: e.message });
    }
    if (!sync.ok) {
      const detail = await sync.text();
      return res.status(502).json({ message: 'Nilai sudah final, tetapi sinkron transkrip ditolak. Ulangi finalisasi.', status: sync.status, detail });
    }
    res.json({ message: 'Kelas difinalisasi dan transkrip berhasil disinkronkan', kelas_id: k[0].id, jumlah_nilai: rows.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Kesalahan server' });
  }
});

app.listen(ports.nilai, '127.0.0.1', () => console.log(`[SERVICE NILAI] berjalan di http://127.0.0.1:${ports.nilai}`));
