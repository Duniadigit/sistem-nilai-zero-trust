// POLICY ADMINISTRATOR (PA): login, refresh, logout, token service.
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../common/db');
const { jwtSecret, token: tokenCfg, service } = require('../common/config');
const { safeEqual, sha256 } = require('../common/util');
const { audit } = require('./audit');

const router = express.Router();

const signAccess = (u) =>
  jwt.sign({ sub: u.id, role: u.role, username: u.username }, jwtSecret, { algorithm: 'HS256', expiresIn: tokenCfg.accessTtl });

function log(req, subjek, hasil, alasan) {
  return audit({ subjek, endpoint: `${req.method} ${req.baseUrl}${req.path}`, device: req.get('X-Device-ID'), hasil, alasan });
}

// POST /auth/login  -> kredensial valid + device terdaftar
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  const device = req.get('X-Device-ID');
  if (!username || !password) {
    await log(req, `user:${username || 'anonymous'}`, 'deny', 'username/password tidak diisi');
    return res.status(400).json({ message: 'username dan password wajib diisi' });
  }
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE username = ?', [username]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
      await log(req, `user:${username}`, 'deny', 'Kredensial tidak valid');
      return res.status(401).json({ message: 'Kredensial tidak valid' });
    }
    if (!device) {
      await log(req, `user:${username}`, 'deny', 'Header X-Device-ID tidak ada');
      return res.status(403).json({ message: 'Header X-Device-ID wajib ada' });
    }
    const [dev] = await pool.query('SELECT id FROM devices WHERE user_id = ? AND device_id = ?', [user.id, device]);
    if (!dev[0]) {
      await log(req, `user:${username}`, 'deny', 'Device tidak terdaftar untuk user ini');
      return res.status(403).json({ message: 'Device tidak terdaftar untuk user ini' });
    }

    const refreshToken = crypto.randomBytes(48).toString('hex');
    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY))',
      [user.id, sha256(refreshToken), tokenCfg.refreshDays]
    );
    await log(req, `user:${username}`, 'allow', 'Login berhasil');
    res.json({
      access_token: signAccess(user),
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 600,
      user: { id: user.id, username: user.username, nama: user.nama, role: user.role },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Kesalahan server' });
  }
});

async function findValidRefresh(refreshToken) {
  const [rows] = await pool.query(
    'SELECT r.id, r.user_id, r.revoked, (r.expires_at < NOW()) AS expired, u.username, u.role ' +
      'FROM refresh_tokens r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ?',
    [sha256(refreshToken)]
  );
  return rows[0];
}

// POST /auth/refresh -> refresh token valid & belum dicabut
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ message: 'refresh_token wajib diisi' });
  const rt = await findValidRefresh(refresh_token);
  if (!rt) {
    await log(req, 'anonymous', 'deny', 'Refresh token tidak dikenal');
    return res.status(401).json({ message: 'Refresh token tidak valid' });
  }
  if (rt.revoked || rt.expired) {
    await log(req, `user:${rt.username}`, 'deny', rt.revoked ? 'Refresh token sudah dicabut' : 'Refresh token kedaluwarsa');
    return res.status(401).json({ message: rt.revoked ? 'Refresh token sudah dicabut' : 'Refresh token kedaluwarsa' });
  }
  await log(req, `user:${rt.username}`, 'allow', 'Access token baru diterbitkan');
  res.json({
    access_token: signAccess({ id: rt.user_id, role: rt.role, username: rt.username }),
    token_type: 'Bearer',
    expires_in: 600,
  });
});

// POST /auth/logout -> mencabut refresh token
router.post('/logout', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ message: 'refresh_token wajib diisi' });
  const rt = await findValidRefresh(refresh_token);
  if (!rt || rt.revoked || rt.expired) {
    await log(req, rt ? `user:${rt.username}` : 'anonymous', 'deny', 'Refresh token tidak valid');
    return res.status(401).json({ message: 'Refresh token tidak valid' });
  }
  await pool.query('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [rt.id]);
  await log(req, `user:${rt.username}`, 'allow', 'Logout: refresh token dicabut');
  res.json({ message: 'Logout berhasil, refresh token dicabut' });
});

// POST /auth/service -> token service (5 menit, role: service) untuk Service Nilai
router.post('/service', async (req, res) => {
  const { client_id, client_secret } = req.body || {};
  const ok = client_id && client_secret &&
    safeEqual(client_id, service.clientId) && safeEqual(client_secret, service.clientSecret);
  if (!ok) {
    await log(req, `service:${client_id || 'anonymous'}`, 'deny', 'Client ID/secret tidak valid');
    return res.status(401).json({ message: 'Client ID/secret tidak valid' });
  }
  const access_token = jwt.sign({ sub: service.clientId, role: 'service' }, jwtSecret, {
    algorithm: 'HS256', expiresIn: tokenCfg.serviceTtl,
  });
  await log(req, `service:${client_id}`, 'allow', 'Token service diterbitkan');
  res.json({ access_token, token_type: 'Bearer', expires_in: tokenCfg.serviceTtlSeconds });
});

module.exports = router;
