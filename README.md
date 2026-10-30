# Sistem Nilai - Zero Trust Security
Tugas Praktikum Individu - Keamanan Informasi (KP70065004) - Informatika Universitas Siliwangi

Stack: Node.js + Express, `http-proxy-middleware`, `jsonwebtoken`, `bcryptjs`, MySQL/MariaDB (Laragon), diuji dengan Postman.

## Arsitektur
```
Client (Postman) --token + X-Device-ID--> API Gateway :3000 (PEP + Policy Engine/Admin + Audit Log)
                                              |-- jika allow + X-Gateway-Secret --> Service Nilai     :3001
                                              |-- jika allow + X-Gateway-Secret --> Service Transkrip :3002
Service Nilai --(token service, lewat gateway)--> POST /transkrip/sinkron
Semua komponen memakai satu database MySQL: sistem_nilai
```

## 1. Prasyarat
1. **Laragon** terpasang, klik **Start All** (MySQL/MariaDB harus berjalan). Default Laragon: user `root`, password kosong.
2. **Node.js 18+** (cek `node -v`). Fitur `fetch` bawaan dipakai untuk panggilan antar-service.
3. **VS Code** + ekstensi **Postman** (publisher: Postman).

## 2. Menjalankan
Buka folder proyek di VS Code, buka Terminal (Ctrl+`), lalu:
```bash
npm install        # sekali saja
npm run setup      # membuat database, tabel, dan data awal (boleh diulang = reset data)
npm start          # menjalankan gateway :3000, service nilai :3001, service transkrip :3002
```
Jika password MySQL Laragon Anda tidak kosong atau user bukan root, ubah `DB_USER` dan `DB_PASSWORD` di file `.env`.

## 3. Data awal (seed)
Password semua akun: `password123`

| Username | Role | NIM | X-Device-ID |
|---|---|---|---|
| admin  | admin     | -        | DEV-ADMIN-01 |
| dosen1 | dosen     | -        | DEV-DOSEN1-01 |
| dosen2 | dosen     | -        | DEV-DOSEN2-01 |
| mhs1   | mahasiswa | 09021001 | DEV-MHS1-01 |
| mhs2   | mahasiswa | 09021002 | DEV-MHS2-01 |
| mhs3   | mahasiswa | 09021003 | DEV-MHS3-01 |

Kelas 1 (id=1, Keamanan Informasi) diampu **dosen1**; Kelas 2 (id=2, Basis Data) diampu **dosen2**.
ID nilai: 1-3 milik kelas 1, 4-6 milik kelas 2.

Kredensial service (untuk `POST /auth/service`): `client_id = service-nilai`, `client_secret = rahasia-client-service-nilai` (diatur di `.env`).

## 4. Pengujian dengan Postman (di VS Code)
1. Klik ikon Postman di sidebar VS Code, lalu sign in.
2. **Import** file `postman/sistem-nilai.postman_collection.json`.
3. Klik kanan koleksi **Sistem Nilai - Zero Trust** -> **Run collection**. Folder 1-5 berjalan berurutan; token tersimpan otomatis di variabel koleksi.
4. Hasil yang benar: 38 request, 41 assertion lulus.
5. Untuk mengulang dari awal (nilai kembali belum final): `npm run setup`, lalu Run collection lagi.

Header wajib pada request user: `Authorization: Bearer <token>` dan `X-Device-ID: <device>`.

## 5. Mengubah jam akses (untuk demo)
Di `.env`:
```
ACCESS_HOUR_START=7
ACCESS_HOUR_END=21
```
Perubahan dan finalisasi nilai hanya diizinkan pada rentang itu (jam komputer). Untuk mendemokan penolakan, ubah jadi `0` dan `0`, lalu restart `npm start`. Untuk menonaktifkan pembatasan, pakai `0` dan `24`.
Pastikan zona waktu Windows sudah WIB.

## 6. Peta kebutuhan -> kode (untuk video demo)
| Kebutuhan | File / bagian |
|---|---|
| 4.1 Access token JWT 10 menit (`sub`, `role`) | `gateway/auth.js` -> `signAccess`, route `/login` |
| 4.1 Refresh token 1 hari di DB, dapat dicabut; logout mencabut | `gateway/auth.js` -> `/login`, `/refresh`, `/logout`; tabel `refresh_tokens` |
| 4.1 Token service 5 menit, `role: service` | `gateway/auth.js` -> `/service`; dipakai di `service-nilai/index.js` -> `getServiceToken` |
| 4.1 Gateway secret (`X-Gateway-Secret`) | ditambahkan di `gateway/index.js` (langkah d), dicek di `common/guard.js` |
| 4.1 Verifikasi ulang token di service | `common/guard.js` (dipakai kedua service) |
| 4.2 Kebijakan akses (Tabel 3) + atribut dari DB | `gateway/policy.js` -> `decide()` (default deny) |
| 4.3 Device terdaftar | `gateway/index.js` (langkah b), `gateway/auth.js` (`/login`); tabel `devices` |
| 4.3 Jam akses dapat dikonfigurasi | `gateway/policy.js` -> `withinAccessHours`, `.env` |
| 4.4 Audit log | `gateway/audit.js`; tabel `audit_log` |
| PEP terpisah dari service | `gateway/index.js` (middleware `pep` + proxy) |
| Finalisasi -> sinkron transkrip via gateway | `service-nilai/index.js` -> `POST /kelas/:id/finalisasi` |
| Service tidak bisa diakses langsung | `common/guard.js`; folder Postman "4. Bypass Gateway" |

Lihat audit log di Laragon (HeidiSQL/phpMyAdmin): `SELECT * FROM audit_log ORDER BY id DESC;`

## 7. Saran alur video demo (6-9 menit)
1. (0:30) Arsitektur singkat, `npm start`, tampilkan tabel seed.
2. (1:30) Autentikasi: login berhasil, device salah ditolak, refresh, token service, logout lalu refresh ditolak. Tunjukkan `gateway/auth.js`.
3. (2:00) Gateway sebagai PEP: tunjukkan `pep()` di `gateway/index.js` dan `policy.js`. Demo mahasiswa melihat nilai orang lain (deny), dosen mengubah kelas dosen lain (deny).
4. (1:30) Konteks: device milik orang lain (deny); ubah jam akses di `.env` lalu PUT ditolak.
5. (1:30) Finalisasi kelas 1 -> sinkron transkrip lewat gateway; mahasiswa melihat transkrip; token user ke `/transkrip/sinkron` ditolak.
6. (1:00) Bypass: akses langsung `:3001` ditolak; `X-Gateway-Secret` tanpa token tetap ditolak. Tunjukkan `common/guard.js`.
7. (0:30) Tunjukkan isi tabel `audit_log`.

## 8. Masalah umum
| Gejala | Solusi |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL Laragon belum Start All |
| `Access denied for user 'root'` | Isi `DB_PASSWORD` di `.env` sesuai Laragon |
| `EADDRINUSE` port 3000/3001/3002 | Ada proses lain; hentikan atau ubah port di `.env` |
| Postman 401 "token kedaluwarsa" | Access token hanya 10 menit; jalankan ulang request login |
| Finalisasi ditolak "di luar jam akses" | Atur `ACCESS_HOUR_START/END` di `.env`, restart |
