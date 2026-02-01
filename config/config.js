// /config/config.js:
require('dotenv').config(); // assuming you have dotenv installed

console.log(process.env.JAWSDB_URL);

module.exports = {
  development: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'space_db',
    host: process.env.DB_HOST || '127.0.0.1',
    dialect: 'mysql',
    port: process.env.DB_PORT || 3306,
  },
  test: {
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'space_db_test',
    host: process.env.DB_HOST || '127.0.0.1',
    dialect: 'mysql',
    port: process.env.DB_PORT || 3306,
  },
  production: {
    use_env_variable: "JAWSDB_URL",
    dialect: 'mysql',
    // in a PaaS like Heroku, the port might be included in the connection URL, 
    // so it doesn't need to be specified separately.
  }
};
