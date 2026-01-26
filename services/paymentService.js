// /services/paymentService.js

const smsUtils = require('../utils/smsUtils');

async function sendSmsReceipt(userId, amount) {
  const message = `Thank you for your payment of $${amount.toFixed(2)}. Your membership is now active.`;
  try {
    await smsUtils.sendSmsToUser(userId, message);
    console.log('SMS receipt sent successfully.');
  } catch (error) {
    console.error('Error sending SMS receipt:', error);
  }
}

module.exports = {
  sendSmsReceipt,
};
