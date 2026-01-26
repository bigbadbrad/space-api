// websocket.js
const WebSocket = require('ws');
const Redis = require('ioredis');

let wss;

function initWebSocketServer(server) {
  wss = new WebSocket.Server({ server });

  // Create separate Redis clients for Pub/Sub
  const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const subClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  // Subscribe to the Redis channel for chat messages
  subClient.subscribe('chat_messages', (err, count) => {
    if (err) {
      console.error('Failed to subscribe to Redis channel:', err);
    } else {
      console.log(`Subscribed to ${count} Redis channel(s).`);
    }
  });

  // Handle incoming messages from Redis
  subClient.on('message', (channel, message) => {
    const parsedMessage = JSON.parse(message);
    const { threadId, data } = parsedMessage;

    // Broadcast the message to all clients connected to the same threadId
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.threadId === threadId) {
        client.send(JSON.stringify(data));
      }
    });
  });

  wss.on('connection', (ws, req) => {
    const url = req.url;
    const threadId = url.split('/').pop();

    console.log(`WebSocket connected for thread: ${threadId}`);

    ws.threadId = threadId;

    ws.on('message', (message) => {
      console.log(`Received message for thread ${threadId}:`, message);

      // Publish the message to Redis
      const messagePayload = JSON.stringify({
        threadId,
        data: JSON.parse(message), // Assuming message is a JSON string
      });

      pubClient.publish('chat_messages', messagePayload);
    });

    ws.on('close', () => {
      console.log(`Connection closed for thread: ${threadId}`);
    });
  });
}

function getWebSocketServer() {
  return wss;
}

function broadcastMessage(threadId, messageData) {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN && client.threadId === String(threadId)) {
        client.send(JSON.stringify(messageData));
      }
    });
  }

module.exports = { initWebSocketServer, getWebSocketServer, broadcastMessage };
