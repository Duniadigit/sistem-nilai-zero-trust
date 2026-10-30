// SERVICE TRANSKRIP (port 3002) - resource: data transkrip mahasiswa.
const express = require('express');
const pool = require('../common/db');
const { gatewayGuard } = require('../common/guard');
const { ports } = require('../common/config');

const app = express();
app.use(express.json());
app.use(gatewayGuard); // gateway secret + verifikasi token

const huruf = (n) => (n >= 85 ? 'A' : n >= 70 ? 'B' : n >= 55 ? 'C' : n >= 40 ? 'D' : 'E');

// POST /transkrip/sinkron  -> HANYA token service
app.post('/transkrip/sinkron', async (req, res) => {
  try {
    if (req.auth.role !== 'service') {
      return res.status(403).json({ message: 'Hanya token service yang boleh sinkron transkrip' });
    }
    const { kelas_id, kode_mk, nama_mk, items } = req.body || {};
    if (!kelas_id || !kode_mk || !nama_mk || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Body harus berisi kelas_id, kode_mk, nama_mk, items[]' });
    }
    for (const it of items) {
      const n = Number(it.nilai);
      if (!it.nim || !Number.isFinite(n) || n < 0 || n > 100) {
        return res.status(400).json({ message: 'Item tidak valid (nim/nilai)' });
      }
      await pool.query(
        'INSERT INTO transkrip (nim, kelas_id, kode_mk, nama_mk, nilai, huruf) VALUES (?,?,?,?,?,?) ' +
          'ON DUPLICATE KEY UPDATE nilai = VALUES(nilai), huruf = VALUES(huruf)',
        [it.nim, kelas_id, kode_mk, nama_mk, n, huruf(n)]
      );
    }
    res.json({ message: 'Transkrip disinkronkan', jumlah: items.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Kesalahan server' });
  }
});

// GET /transkrip/:nim  -> mahasiswa (NIM sendiri) | admin (semua)
app.get('/transkrip/:nim', async (req, res) => {
  try {
    const { sub, role } = req.auth;
    const nim = req.params.nim;
    if (role === 'mahasiswa') {
      const [u] = await pool.query('SELECT nim FROM users WHERE id = ?', [sub]);
      if (!u[0] || u[0].nim !== nim) return res.status(403).json({ message: 'Hanya boleh melihat transkrip sendiri' });
    } else if (role !== 'admin') {
      return res.status(403).json({ message: `Role ${role} tidak boleh melihat transkrip` });
    }
    const [mhs] = await pool.query('SELECT nama FROM users WHERE nim = ?', [nim]);
    if (!mhs[0]) return res.status(404).json({ message: 'Mahasiswa tidak ditemukan' });
    const [rows] = await pool.query(
      'SELECT kode_mk, nama_mk, nilai, huruf FROM transkrip WHERE nim = ? ORDER BY kode_mk', [nim]);
    res.json({ nim, nama: mhs[0].nama, transkrip: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Kesalahan server' });
  }
});

app.listen(ports.transkrip, '127.0.0.1', () => console.log(`[SERVICE TRANSKRIP] berjalan di http://127.0.0.1:${ports.transkrip}`));
