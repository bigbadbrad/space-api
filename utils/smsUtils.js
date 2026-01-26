// /utils/smsUtils.js
require('dotenv').config();
const axios = require('axios');
const { User } = require('../models'); // Import User model to get user's phone number
const dayjs = require('dayjs');
const buildEventData = require('../messages/buildAppointmentData');

// Function to send SMS to a user (Admin Number)
async function sendSmsToUser(userId, message) {
    try {
      // Get the user's cell phone number from the database
      const user = await User.findByPk(userId);
      if (!user || !user.phone) {
        console.error('User not found or cell phone number missing');
        return;
      }
  
      // Ensure phone number starts with '+1' for US-based numbers if it's missing
      let phoneNumber = user.phone.trim();
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = `+1${phoneNumber}`;
      }
  
      const payload = {
        from: process.env.TELNYX_NUMBER,
        to: phoneNumber,
        text: message,
      };
  
      await axios.post('https://api.telnyx.com/v2/messages', payload, {
        headers: {
          'Authorization': `Bearer ${process.env.TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
  
      console.log(`SMS sent to user ${userId}`);
    } catch (error) {
      console.error('Failed to send SMS:', error.response ? error.response.data : error);
    }
  }

  // Function to send MMS to a user
  async function sendMmsToUser(userId, messageText, mediaUrl) {
    try {
      // Get the user's cell phone number from the database
      const user = await User.findByPk(userId);
      if (!user || !user.phone) {
        console.error('User not found or cell phone number missing');
        return;
      }

      // Ensure phone number starts with '+1' for US-based numbers if it's missing
      let phoneNumber = user.phone.trim();
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = `+1${phoneNumber}`;
      }
  
      // Build the payload
      const payload = {
        from: process.env.TELNYX_NUMBER,
        to: phoneNumber,
        media_urls: [mediaUrl], // Array of media URLs
      };
  
      // Conditionally add message text only if provided
      if (messageText) {
        payload.text = messageText;
      }
  
      await axios.post('https://api.telnyx.com/v2/messages', payload, {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
  
      console.log(`MMS sent to user ${userId}`);
    } catch (error) {
      console.error('Failed to send MMS:', error.response ? error.response.data : error);
    }
  }



  async function sendRcsMessage(phoneNumber, messageData, fromNumber, messagingProfileId) {
    try {
      // Ensure phone number starts with '+1' for US-based numbers if it's missing
      phoneNumber = phoneNumber.trim();
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = `+1${phoneNumber}`;
      }
  
      // Build the payload
      const payload = {
        from: fromNumber,
        to: phoneNumber,
        messaging_profile_id: messagingProfileId,
        ...messageData,
      };
  
      // Log the payload for debugging
      console.log('Payload being sent to Telnyx:', JSON.stringify(payload, null, 2));
  
      await axios.post('https://api.telnyx.com/v2/messages', payload, {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
  
      console.log(`Message sent to ${phoneNumber}`);
    } catch (error) {
      console.error('Failed to send message:', error.response ? error.response.data : error);
      throw error;
    }
  }  

  async function sendRcsToUser(userId, messageData) {
    try {
      // Get the user's cell phone number from the database
      const user = await User.findByPk(userId);
      if (!user || !user.phone) {
        console.error('User not found or cell phone number missing');
        return;
      }
  
      const phoneNumber = user.phone;
  
      // Use the generic function
      await sendRcsMessage(
        phoneNumber,
        messageData,
        process.env.TELNYX_NUMBER, // Your Telnyx number
        process.env.TELNYX_ADMIN_PROFILE_ID // Your admin messaging profile ID
      );
  
      console.log(`RCS message sent to user ${userId}`);
    } catch (error) {
      console.error('Failed to send RCS message:', error.response ? error.response.data : error);
      throw error;
    }
  }

  /**
 * sendConfirmationMessage(userId, messageText)
 * For user-based confirmations (previously used "gruestId", now replaced with user).
 */
async function sendConfirmationMessage(userId, messageText) {
  try {
    const user = await User.findByPk(userId);
    if (!user || !user.phone) {
      console.error('User not found or phone number missing');
      return;
    }

    let phoneNumber = user.phone.trim();
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = `+1${phoneNumber}`;
    }

    const payload = {
      from: process.env.TELNYX_NUMBER,
      to: phoneNumber,
      messaging_profile_id: process.env.TELNYX_ADMIN_PROFILE_ID,
      text: messageText,
    };

    await axios.post('https://api.telnyx.com/v2/messages', payload, {
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Confirmation message sent to user ${userId}`);
  } catch (error) {
    console.error('Failed to send confirmation message:', error.response ? error.response.data : error);
    throw error;
  }
}

  async function sendUserConfirmationMessage(userId, messageText) {
    try {
      const user = await User.findByPk(userId);
      if (!user || !user.phone) {
        console.error('User not found or phone number missing');
        return;
      }
  
      let phoneNumber = user.phone.trim();
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = `+1${phoneNumber}`;
      }
  
      const payload = {
        from: process.env.TELNYX_NUMBER,
        to: phoneNumber,
        messaging_profile_id: process.env.TELNYX_ADMIN_PROFILE_ID,
        text: messageText,
      };
  
      await axios.post('https://api.telnyx.com/v2/messages', payload, {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
  
      console.log(`Confirmation message sent to user ${userId}`);
    } catch (error) {
      console.error('Failed to send confirmation message to user:', error.response ? error.response.data : error);
      throw error;
    }
  }


  async function sendSmsToNumber(phoneNumber, messageText) {
    try {
      // Ensure phone number starts with '+1' for US-based numbers if it's missing
      phoneNumber = phoneNumber.trim();
      if (!phoneNumber.startsWith('+')) {
        phoneNumber = `+1${phoneNumber}`;
      }
  
      // Build the payload
      const payload = {
        from: process.env.TELNYX_NUMBER,
        to: phoneNumber,
        messaging_profile_id: process.env.TELNYX_ADMIN_PROFILE_ID,
        text: messageText,
      };
  
      // Send SMS message
      await axios.post('https://api.telnyx.com/v2/messages', payload, {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
  
      console.log(`SMS sent to ${phoneNumber}`);
    } catch (error) {
      console.error('Failed to send SMS:', error.response ? error.response.data : error);
      throw error;
    }
  }

  /**
 * sendPhotosMessage(userId, messageText, mediaUrls = [])
 * For sending MMS with photos to a user by userId (previously used "gruest").
 */
async function sendPhotosMessage(userId, messageText, mediaUrls = []) {
  try {
    // 1) Load the user
    const user = await User.findByPk(userId);
    if (!user || !user.phone) {
      console.error('User not found or phone number missing');
      return;
    }

    let phoneNumber = user.phone.trim();
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = `+1${phoneNumber}`;
    }

    // 2) Build the message payload
    const messageData = {
      from: process.env.TELNYX_NUMBER,
      to: phoneNumber,
      messaging_profile_id: process.env.TELNYX_MESSAGING_PROFILE_ID,
      text: messageText,
      media_urls: mediaUrls, // Array of media URLs
    };

    console.log('Photo message data:', messageData);

    // 3) Send via Telnyx
    const response = await axios.post('https://api.telnyx.com/v2/messages', messageData, {
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`MMS message sent successfully to user ${userId}:`, response.data);
  } catch (error) {
    console.error('Failed to send MMS message:', error.response ? error.response.data : error);
    throw error;
  }
}
  

  module.exports = {
    sendSmsToUser,
    sendMmsToUser,
    sendRcsMessage,
    sendRcsToUser,
    sendConfirmationMessage,
    sendUserConfirmationMessage,
    sendSmsToNumber,
    sendPhotosMessage
  };
