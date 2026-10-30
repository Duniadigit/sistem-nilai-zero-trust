const mysql = require('mysql2/promise');
const { db } = require('./config');

// Satu database bersama untuk kedua service (sesuai Tabel 2)
module.exports = mysql.createPool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database,
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
  dateStrings: true,
});
