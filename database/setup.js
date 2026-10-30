// Membuat database, tabel, dan data awal (seed). Aman dijalankan ulang (reset data).
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { db } = require('../common/config');

const PASSWORD = 'password123';

const USERS = [
  { username: 'admin',  nama: 'Admin Prodi',    role: 'admin',     nim: null,       device: 'DEV-ADMIN-01'  },
  { username: 'dosen1', nama: 'Dr. Budi Dosen', role: 'dosen',     nim: null,       device: 'DEV-DOSEN1-01' },
  { username: 'dosen2', nama: 'Dr. Sari Dosen', role: 'dosen',     nim: null,       device: 'DEV-DOSEN2-01' },
  { username: 'mhs1',   nama: 'Andi Mahasiswa', role: 'mahasiswa', nim: '09021001', device: 'DEV-MHS1-01'   },
  { username: 'mhs2',   nama: 'Beni Mahasiswa', role: 'mahasiswa', nim: '09021002', device: 'DEV-MHS2-01'   },
  { username: 'mhs3',   nama: 'Cici Mahasiswa', role: 'mahasiswa', nim: '09021003', device: 'DEV-MHS3-01'   },
];

(async () => {
  const conn = await mysql.createConnection({
    host: db.host, port: db.port, user: db.user, password: db.password, multipleStatements: true,
  });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${db.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${db.database}\``);
  await conn.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const hash = bcrypt.hashSync(PASSWORD, 10);
  const ids = {};
  for (const u of USERS) {
    const [r] = await conn.query(
      'INSERT INTO users (username, password_hash, nama, role, nim) VALUES (?,?,?,?,?)',
      [u.username, hash, u.nama, u.role, u.nim]
    );
    ids[u.username] = r.insertId;
    await conn.query('INSERT INTO devices (user_id, device_id) VALUES (?,?)', [r.insertId, u.device]);
  }

  // 2 kelas, diampu 2 dosen berbeda
  const [k1] = await conn.query('INSERT INTO kelas (kode_mk, nama_mk, dosen_id) VALUES (?,?,?)',
    ['KP70065004', 'Keamanan Informasi', ids.dosen1]);
  const [k2] = await conn.query('INSERT INTO kelas (kode_mk, nama_mk, dosen_id) VALUES (?,?,?)',
    ['KP70065005', 'Basis Data', ids.dosen2]);

  const nilaiAwal = {
    [k1.insertId]: [['09021001', 85], ['09021002', 78], ['09021003', 90]],
    [k2.insertId]: [['09021001', 80], ['09021002', 70], ['09021003', 88]],
  };
  for (const [kelasId, rows] of Object.entries(nilaiAwal)) {
    for (const [nim, n] of rows) {
      await conn.query('INSERT INTO nilai (kelas_id, nim, nilai, final) VALUES (?,?,?,0)', [kelasId, nim, n]);
    }
  }

  console.log('Database "%s" siap.', db.database);
  console.log('\nAkun seed (password semua: %s)', PASSWORD);
  console.table(USERS.map((u) => ({ username: u.username, role: u.role, nim: u.nim || '-', 'X-Device-ID': u.device })));
  console.log('Kelas 1 (id=%d) diampu dosen1, Kelas 2 (id=%d) diampu dosen2', k1.insertId, k2.insertId);
  await conn.end();
})().catch((e) => {
  console.error('Setup gagal:', e.message);
  process.exit(1);
});
