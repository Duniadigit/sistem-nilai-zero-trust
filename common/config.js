require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

const ports = {
  gateway: num(process.env.GATEWAY_PORT, 3000),
  nilai: num(process.env.NILAI_PORT, 3001),
  transkrip: num(process.env.TRANSKRIP_PORT, 3002),
};

module.exports = {
  ports,
  urls: {
    gateway: `http://127.0.0.1:${ports.gateway}`,
    nilai: `http://127.0.0.1:${ports.nilai}`,
    transkrip: `http://127.0.0.1:${ports.transkrip}`,
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: num(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sistem_nilai',
  },
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret',
  gatewaySecret: process.env.GATEWAY_SECRET || 'dev-gateway-secret',
  service: {
    clientId: process.env.SERVICE_CLIENT_ID || 'service-nilai',
    clientSecret: process.env.SERVICE_CLIENT_SECRET || 'rahasia-client-service-nilai',
  },
  token: { accessTtl: '10m', serviceTtl: '5m', serviceTtlSeconds: 300, refreshDays: 1 },
  accessHours: {
    start: num(process.env.ACCESS_HOUR_START, 7),
    end: num(process.env.ACCESS_HOUR_END, 21),
  },
};
