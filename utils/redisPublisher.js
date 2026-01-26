// utils/redisPublisher.js
const Redis = require('ioredis');
const publisher = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

function publishMessageToRedis(threadId, messageData, action = 'new') {
  const messagePayload = JSON.stringify({
    threadId: String(threadId),
    data: messageData,
    action: action, // Include the action
  });
  publisher.publish('chat_messages', messagePayload);
}

module.exports = {
  publishMessageToRedis,
};
