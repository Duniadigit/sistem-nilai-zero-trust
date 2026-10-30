// POLICY ENGINE (PE) - memutuskan allow/deny berdasarkan Tabel 3 + atribut dari database.
// Prinsip: DEFAULT DENY. Jika tidak ada aturan yang cocok, request ditolak.
// Mengembalikan { allow: boolean, reason: string, status?: number }
const pool = require('../common/db');
const { accessHours } = require('../common/config');

const allow = (reason) => ({ allow: true, reason });
const deny = (reason, status = 403) => ({ allow: false, reason, status });

// Konteks jam akses (4.3) - rentang dapat diatur di .env
function withinAccessHours(now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return minutes >= accessHours.start * 60 && minutes < accessHours.end * 60;
}
const jamTeks = () => `${String(accessHours.start).padStart(2, '0')}.00-${String(accessHours.end).padStart(2, '0')}.00`;

async function getNim(userId) {
  const [rows] = await pool.query('SELECT nim FROM users WHERE id = ?', [userId]);
  return rows[0] ? rows[0].nim : null;
}

async function decide({ user, method, path, query = {}, now = new Date() }) {
  try {
    path = path.replace(/\/+$/, '') || '/';
    const role = user.role;

    // ---- Token service (hanya satu endpoint yang boleh) ----
    if (role === 'service') {
      if (method === 'POST' && path === '/transkrip/sinkron') {
        return allow('Token service valid untuk sinkron transkrip');
      }
      return deny('Role service hanya boleh POST /transkrip/sinkron');
    }

    // ---- POST /transkrip/sinkron : HANYA token service, token user mana pun ditolak ----
    if (method === 'POST' && path === '/transkrip/sinkron') {
      return deny(`Role ${role} tidak boleh sinkron transkrip (hanya token service)`);
    }

    // ---- GET /nilai : mahasiswa (nilai sendiri), dosen (kelas yang diampu) ----
    if (method === 'GET' && path === '/nilai') {
      if (role === 'mahasiswa') {
        const nim = await getNim(user.sub);
        if (!nim) return deny('Akun mahasiswa tidak memiliki NIM');
        if (query.nim && query.nim !== nim) return deny('Mahasiswa hanya boleh melihat nilai miliknya sendiri');
        return allow('Mahasiswa melihat nilai sendiri');
      }
      if (role === 'dosen') {
        if (query.kelas_id) {
          const [rows] = await pool.query('SELECT dosen_id FROM kelas WHERE id = ?', [query.kelas_id]);
          if (!rows[0]) return deny('Kelas tidak ditemukan', 404);
          if (rows[0].dosen_id !== user.sub) return deny('Dosen bukan pengampu kelas ini');
        }
        return allow('Dosen melihat nilai kelas yang diampu');
      }
      return deny(`Role ${role} tidak boleh melihat nilai`);
    }

    // ---- PUT /nilai/:id : dosen, kelas diampu, belum final, dalam jam akses ----
    let m = path.match(/^\/nilai\/(\d+)$/);
    if (method === 'PUT' && m) {
      if (role !== 'dosen') return deny(`Role ${role} tidak boleh mengubah nilai`);
      const [rows] = await pool.query(
        'SELECT n.final, k.dosen_id FROM nilai n JOIN kelas k ON k.id = n.kelas_id WHERE n.id = ?', [m[1]]);
      if (!rows[0]) return deny('Data nilai tidak ditemukan', 404);
      if (rows[0].dosen_id !== user.sub) return deny('Dosen bukan pengampu kelas dari nilai ini');
      if (rows[0].final) return deny('Nilai sudah final, tidak boleh diubah');
      if (!withinAccessHours(now)) return deny(`Di luar jam akses (${jamTeks()})`);
      return allow('Dosen pengampu mengubah nilai (belum final, dalam jam akses)');
    }

    // ---- POST /kelas/:id/finalisasi : dosen, kelas diampu, dalam jam akses ----
    m = path.match(/^\/kelas\/(\d+)\/finalisasi$/);
    if (method === 'POST' && m) {
      if (role !== 'dosen') return deny(`Role ${role} tidak boleh memfinalisasi nilai`);
      const [rows] = await pool.query('SELECT dosen_id FROM kelas WHERE id = ?', [m[1]]);
      if (!rows[0]) return deny('Kelas tidak ditemukan', 404);
      if (rows[0].dosen_id !== user.sub) return deny('Dosen bukan pengampu kelas ini');
      if (!withinAccessHours(now)) return deny(`Di luar jam akses (${jamTeks()})`);
      return allow('Dosen pengampu memfinalisasi kelas (dalam jam akses)');
    }

    // ---- GET /transkrip/:nim : mahasiswa (NIM sendiri), admin (semua) ----
    m = path.match(/^\/transkrip\/([^/]+)$/);
    if (method === 'GET' && m) {
      let nimTarget;
      try { nimTarget = decodeURIComponent(m[1]); } catch { return deny('NIM tidak valid', 400); }
      if (role === 'admin') return allow('Admin melihat transkrip semua mahasiswa');
      if (role === 'mahasiswa') {
        const nim = await getNim(user.sub);
        if (nim && nim === nimTarget) return allow('Mahasiswa melihat transkrip sendiri');
        return deny('Mahasiswa hanya boleh melihat transkrip dengan NIM sendiri');
      }
      return deny(`Role ${role} tidak boleh melihat transkrip`);
    }

    return deny('Tidak ada kebijakan yang mengizinkan endpoint ini (default deny)');
  } catch (e) {
    console.error('[POLICY] error:', e.message);
    return deny('Policy engine error (fail-closed)', 500);
  }
}

module.exports = { decide, withinAccessHours };
