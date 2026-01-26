// /utils/messageUtils.js
const { Message, Thread } = require("../models");
const { publishMessageToRedis } = require("./redisPublisher");
const { sendSmsToUser } = require("../utils/smsUtils");

function determineShouldSendSms(responseType, messageBody) {
  const smsEligibleResponseTypes = ['appointment_confirmation', 'important_notification'];
  return smsEligibleResponseTypes.includes(responseType);
}

async function sendBotMessage(threadId, messageBody, responseType = 'open', additionalData = {}, userMessageSource = 'web') {
  try {
    let shouldSendSms = userMessageSource === 'sms' || 
      (userMessageSource === 'web' && determineShouldSendSms(responseType, messageBody));

    const botMessage = await Message.create({
      body: messageBody,
      threadId: parseInt(threadId, 10),
      author: 'bot',
      source: userMessageSource,
      response_type: responseType,
      additional_data: JSON.stringify(additionalData),
      should_send_sms: shouldSendSms,
    });

    const botMessageData = {
      id: botMessage.id,
      body: botMessage.body,
      author: 'bot',
      createdAt: botMessage.createdAt,
      responseType,
      additionalData,
    };

    publishMessageToRedis(threadId, botMessageData);

    if (shouldSendSms) {
      const thread = await Thread.findByPk(threadId);
      if (thread && thread.userId) {
        await sendSmsToUser(thread.userId, messageBody);
      }
    }
  } catch (error) {
    console.error("Error sending bot message:", error);
    throw error;
  }
}

module.exports = { sendBotMessage };
