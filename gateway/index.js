// API GATEWAY = Policy Enforcement Point (PEP). Satu-satunya pintu masuk (port 3000).
const express = require('express');
const jwt = require('jsonwebtoken');
const { createProxyMiddleware } = require('http-proxy-middleware');
const pool = require('../common/db');
const { ports, urls, jwtSecret, gatewaySecret } = require('../common/config');
const policy = require('./policy');
const authRouter = require('./auth');
const { audit } = require('./audit');

const app = express();
app.disable('x-powered-by');

// 1) Endpoint /auth/* ditangani sendiri oleh gateway (PE/PA). Body JSON hanya di-parse di sini,
//    sehingga body request ke service diteruskan apa adanya oleh proxy.
app.use('/auth', express.json(), authRouter);

// 2) PEP: setiap request selain /auth/* diperiksa sebelum diteruskan
async function pep(req, res, next) {
  const endpoint = `${req.method} ${req.path}`;
  const device = req.get('X-Device-ID') || null;
  const reject = async (status, subjek, alasan) => {
    await audit({ subjek, endpoint, device, hasil: 'deny', alasan });
    return res.status(status).json({ message: 'Akses ditolak', reason: alasan });
  };

  // a. Access token wajib dan harus valid (tanda tangan + masa berlaku)
  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) return reject(401, 'anonymous', 'Access token tidak ada');
  let user;
  try {
    user = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch (e) {
    return reject(401, 'anonymous', e.name === 'TokenExpiredError' ? 'Access token kedaluwarsa' : 'Access token tidak valid');
  }
  const isService = user.role === 'service';
  const subjek = isService ? `service:${user.sub}` : `user:${user.username || user.sub}`;

  // b. Verifikasi device terdaftar (hanya untuk user; service tidak punya device)
  if (!isService) {
    if (!device) return reject(403, subjek, 'Header X-Device-ID tidak ada');
    try {
      const [rows] = await pool.query('SELECT id FROM devices WHERE user_id = ? AND device_id = ?', [user.sub, device]);
      if (!rows[0]) return reject(403, subjek, 'Device tidak terdaftar untuk user ini');
    } catch (e) {
      return reject(500, subjek, 'Gagal memeriksa device (fail-closed)');
    }
  }

  // c. Minta keputusan ke Policy Engine
  const decision = await policy.decide({ user, method: req.method, path: req.path, query: req.query });
  if (!decision.allow) return reject(decision.status || 403, subjek, decision.reason);

  // d. ALLOW -> catat audit, tambahkan X-Gateway-Secret, teruskan ke service
  await audit({ subjek, endpoint, device, hasil: 'allow', alasan: decision.reason });
  req.headers['x-gateway-secret'] = gatewaySecret;
  next();
}
app.use(pep);

// 3) Proxy ke service (hanya tercapai kalau PEP mengizinkan)
const onError = (err, req, res) => {
  if (res && typeof res.writeHead === 'function' && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Service tidak dapat dihubungi', detail: err.message }));
  }
};
app.use(createProxyMiddleware({ target: urls.nilai, changeOrigin: true, pathFilter: ['/nilai', '/kelas'], on: { error: onError } }));
app.use(createProxyMiddleware({ target: urls.transkrip, changeOrigin: true, pathFilter: '/transkrip', on: { error: onError } }));

app.use((req, res) => res.status(404).json({ message: 'Endpoint tidak ditemukan' }));

app.listen(ports.gateway, () => console.log(`[GATEWAY] PEP berjalan di http://localhost:${ports.gateway}`));
