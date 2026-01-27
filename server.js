// /server.js:  
const express = require("express");
const routes = require("./controllers");
const cors = require("cors");
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

sequelize.sync({ force: false }).then(() => {
  server.listen(PORT, () => {
    console.log(`App listening on port ${PORT}!`);
  });
});
