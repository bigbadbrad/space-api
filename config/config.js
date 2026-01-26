// /config/config.js:
require('dotenv').config(); // assuming you have dotenv installed

console.log(process.env.JAWSDB_URL);

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: "localhost",
    dialect: 'mysql',
    port: process.env.DB_PORT || 3306 // if DB_PORT is not defined, it will default to 3306
  },
  test: {
    dialect: 'mysql',
  },
  production: {
    use_env_variable: "JAWSDB_URL",
    dialect: 'mysql',
    // in a PaaS like Heroku, the port might be included in the connection URL, 
    // so it doesn't need to be specified separately.
  }
};
