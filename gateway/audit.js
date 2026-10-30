// Audit Log: mencatat SETIAP keputusan akses (waktu, subjek, endpoint, device, hasil, alasan)
const pool = require('../common/db');

async function audit({ subjek, endpoint, device, hasil, alasan }) {
  console.log(`[AUDIT] ${hasil.toUpperCase().padEnd(5)} | ${subjek} | ${endpoint} | device=${device || '-'} | ${alasan}`);
  try {
    await pool.query(
      'INSERT INTO audit_log (subjek, endpoint, device, hasil, alasan) VALUES (?,?,?,?,?)',
      [subjek, endpoint, device || null, hasil, String(alasan).slice(0, 255)]
    );
  } catch (e) {
    console.error('[AUDIT] gagal menulis ke database:', e.message);
  }
}

module.exports = { audit };
