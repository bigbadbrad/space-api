// /utils/photoPaginationUtils.js
const Redis = require('ioredis');
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redisClient.on('connect', () => {
  console.log('Connected to Redis for photo pagination.');
});

redisClient.on('error', (err) => {
  console.error('Redis error in photoPaginationUtils:', err);
});

/**
 * Retrieve the current photo offset for a given phoneNumber and businessId.
 * @param {string} phoneNumber - The members's normalized phone number.
 * @param {number} businessId - The ID of the event.
 * @returns {number|null} The current offset, or null if none is stored.
 */
async function getPhotoOffset(phoneNumber, businessId) {
  const key = `photo_offset:${phoneNumber}:${businessId}`;
  const offset = await redisClient.get(key);
  return offset ? parseInt(offset, 10) : null;
}

/**
 * Set the photo offset for a given phoneNumber and businessId.
 * @param {string} phoneNumber - The member's normalized phone number.
 * @param {number} businessId - The ID of the event.
 * @param {number} offset - The offset to set.
 */
async function setPhotoOffset(phoneNumber, businessId, offset) {
  const key = `photo_offset:${phoneNumber}:${businessId}`;
  await redisClient.set(key, offset);
}

/**
 * Reset the photo offset for a given phoneNumber and businessId.
 * @param {string} phoneNumber - The member's normalized phone number.
 * @param {number} businessId - The ID of the event.
 */
async function resetPhotoOffset(phoneNumber, businessId) {
  const key = `photo_offset:${phoneNumber}:${businessId}`;
  await redisClient.del(key);
}

module.exports = {
  getPhotoOffset,
  setPhotoOffset,
  resetPhotoOffset
};
