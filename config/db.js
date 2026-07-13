require('dotenv').config({ quiet: true });

const mysql = require('mysql2/promise');

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readRequiredEnv(name) {
  const value = process.env[name];

  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`[DB_CONFIG_ERROR] ${name} 환경변수가 설정되지 않았습니다.`);
  }

  return value.trim();
}

const pool = mysql.createPool({
    host: process.env.DB_HOST?.trim() || 'basic-database.ctq24wi4608y.us-east-2.rds.amazonaws.com',
  port: toPositiveInt(process.env.DB_PORT, 3306),
  user: readRequiredEnv('DB_USER'),
  password: readRequiredEnv('DB_PASSWORD'),
  database: readRequiredEnv('DB_NAME'),
  waitForConnections: true,
  connectionLimit: toPositiveInt(process.env.DB_CONNECTION_LIMIT, 10),
  queueLimit: toPositiveInt(process.env.DB_QUEUE_LIMIT, 0),
  connectTimeout: toPositiveInt(process.env.DB_CONNECT_TIMEOUT_MS, 10000),
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

module.exports = pool;
