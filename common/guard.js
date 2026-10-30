// Middleware yang dipasang di SETIAP service (Service Nilai & Service Transkrip).
// Prinsip zero trust: service tidak percaya begitu saja pada gateway.
//   1) X-Gateway-Secret harus benar  -> service tidak bisa diakses langsung
//   2) Access token / token service harus valid (tanda tangan + masa berlaku)
const jwt = require('jsonwebtoken');
const { gatewaySecret, jwtSecret } = require('./config');
const { safeEqual } = require('./util');

function gatewayGuard(req, res, next) {
  const secret = req.get('X-Gateway-Secret');
  if (!secret || !safeEqual(secret, gatewaySecret)) {
    return res.status(403).json({ message: 'Ditolak: X-Gateway-Secret tidak ada/tidak valid (akses langsung ke service dilarang)' });
  }

  const [scheme, token] = (req.get('Authorization') || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Ditolak: token tidak ada' });
  }
  try {
    req.auth = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
  } catch (e) {
    return res.status(401).json({
      message: e.name === 'TokenExpiredError' ? 'Ditolak: token kedaluwarsa' : 'Ditolak: token tidak valid',
    });
  }
  next();
}

module.exports = { gatewayGuard };
