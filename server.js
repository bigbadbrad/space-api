// /server.js:  
const express = require("express");
const routes = require("./controllers");
const cors = require("cors");
const cron = require("node-cron");
const http = require('http');
const { initWebSocketServer } = require('./websocket'); // Import WebSocket init function
const sequelize = require("./config/connection");

const app = express();
const PORT = process.env.PORT || 3005;

const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(routes);

const server = http.createServer(app);

// Initialize WebSocket server after creating the HTTP server
initWebSocketServer(server); // This initializes the WebSocket server

// In production, do NOT run sequelize.sync() on boot — it can run many ALTERs and
// exceed Heroku's ~30s boot timeout, causing SIGKILL and H10. Use migrations instead.
const isProduction = process.env.NODE_ENV === 'production';

function startHttpServer() {
  server.listen(PORT, () => {
    console.log(`App listening on port ${PORT}!`);
  });

  cron.schedule('0 2 * * *', () => {
    const { runProcurementIngests } = require('./jobs/scheduleProcurement');
    runProcurementIngests().catch((e) =>
      console.error('Procurement ingests failed:', e)
    );
  });
}

if (isProduction) {
  sequelize
    .authenticate()
    .then(() => {
      console.log('Database connection OK. Starting HTTP server...');
      startHttpServer();
    })
    .catch((err) => {
      console.error('Database connection failed:', err);
      process.exit(1);
    });
} else {
  console.log('Starting Sequelize sync...');
  sequelize
    .sync({ force: false, alter: false })
    .then(() => {
      console.log('Sequelize sync completed. Starting HTTP server...');
      startHttpServer();
    })
    .catch((err) => {
      console.error('Failed to sync Sequelize or start server:', err);
      process.exit(1);
    });
}
