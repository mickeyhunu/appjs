const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'basic-database.ctq24wi4608y.us-east-2.rds.amazonaws.com',
  user: 'master',
  password: 'lsh09844**',
  database: 'chatBot_DB',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;


