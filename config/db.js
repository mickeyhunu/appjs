const mysql = require('mysql2/promise');

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'basic-database.ctq24wi4608y.us-east-2.rds.amazonaws.com',
  port: toPositiveInt(process.env.DB_PORT, 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: toPositiveInt(process.env.DB_CONNECTION_LIMIT, 10),
  queueLimit: toPositiveInt(process.env.DB_QUEUE_LIMIT, 0),
  connectTimeout: toPositiveInt(process.env.DB_CONNECT_TIMEOUT_MS, 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

module.exports = pool;
