// /webhooks/processUnsubscribe.js
const { User, GroupUser } = require("../models");
const { sendSmsToNumber } = require("../utils/smsUtils");
const normalizePhoneNumber = require("../utils/normalizePhoneNumber");

/**
 * processUnsubscribe(messageText, fromNumber)
 * - If message is "stop", "unsubscribe", => opt-out
 */
async function processUnsubscribe(messageText, fromNumber) {
  try {
    const normalizedNumber = normalizePhoneNumber(fromNumber);
    
    // Ensure the message is a valid unsubscribe command
    const cleanedText = messageText.replace(/[^a-z]/gi, "").toLowerCase();
    if (!["stop", "unsubscribe"].includes(cleanedText)) {
      return { status: 400, message: "Invalid unsubscribe command" };
    }

    // Check if the user exists in the system
    const user = await User.findOne({ where: { phone: normalizedNumber } });

    if (user) {
      // Mark user as unsubscribed
      user.isUnsubscribed = true;
      await user.save();

      // Remove user from all groups
      await GroupUser.destroy({ where: { userId: user.id } });

      // Send confirmation message
      await sendSmsToNumber(normalizedNumber, "You have unsubscribed from GroupText and will no longer receive messages.");
      
      console.log(`[Unsubscribe] User ${normalizedNumber} unsubscribed successfully.`);
      return { status: 200, message: "User unsubscribed successfully." };
    }

    // If user not found, still confirm unsubscribed
    await sendSmsToNumber(normalizedNumber, "You have unsubscribed from GroupText and will no longer receive messages.");
    return { status: 200, message: "User unsubscribed (user not found in DB)." };
    
  } catch (error) {
    console.error(`[Unsubscribe] Error processing unsubscribe request: ${error.message}`);
    return { status: 500, message: "Error processing unsubscribe request." };
  }
}

module.exports = processUnsubscribe;
