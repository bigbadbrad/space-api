// /utils/rcsUtils.js
require('dotenv').config();
const axios = require('axios');
const { User, Event, Template, GroupText, Post, Poll, PollChoice } = require('../models');
const dayjs = require('dayjs');
const buildEventData = require('../messages/buildRcsEventData');
const buildPostData = require('../messages/buildRcsPostData');
const buildPollData = require('../messages/buildPollData');

async function sendRcsMessage(phoneNumber, messageData, fromNumber, messagingProfileId) {
  try {
    // Ensure +E.164 format
    phoneNumber = phoneNumber.trim();
    if (!phoneNumber.startsWith('+')) {
      phoneNumber = `+1${phoneNumber}`;
    }

    // The Telnyx RCS API enforces exactly ONE of: text, rich_card, content_info, etc.
    // So, if we have an imageUrl or card content (title/description/suggestions),
    // we must only define rich_card, not text. Otherwise we can just define text.
    const hasCardContent =
      messageData.imageUrl ||
      messageData.title ||
      messageData.description ||
      (messageData.suggestions && messageData.suggestions.length > 0);

    // Prepare the content_message object based on whether we need a rich card or just text
    let contentMessage = {};

    if (hasCardContent) {
      // Build the standalone_card
      contentMessage.rich_card = {
        standalone_card: {
          card_orientation: 'HORIZONTAL',
          thumbnail_image_alignment: 'LEFT',
          card_content: {
            // Put the user’s entire multi‐line text (with emojis & line‐breaks) in description
            // So we do not also define top-level text in content_message
            title: messageData.title || '',
            description: messageData.text || '',
            media: undefined,
            suggestions: []
          }
        }
      };

      // If there's an image URL, place it in the card media
      if (messageData.imageUrl) {
        contentMessage.rich_card.standalone_card.card_content.media = {
          height: 'MEDIUM',
          content_info: {
            file_url: messageData.imageUrl,
            force_refresh: true
          }
        };
      }

      // If there's suggestions
      if (messageData.suggestions && messageData.suggestions.length > 0) {
        contentMessage.rich_card.standalone_card.card_content.suggestions =
          messageData.suggestions;
      }
    } else {
      // No image or card data => plain text message
      contentMessage.text = messageData.text || '';
    }

    // Build the new RCS payload
    const payload = {
      agent_id: process.env.TELNYX_AGENT_ID,
      to: phoneNumber,
      messaging_profile_id: messagingProfileId,
      type: 'RCS',
      webhook_url: process.env.webhook_url,
      agent_message: {
        content_message: contentMessage
      }
    };

    console.log('RCS Payload being sent to Telnyx:', JSON.stringify(payload, null, 2));
    // Make the request and capture the full response
    const response = await axios.post(
      'https://api.telnyx.com/v2/messages/rcs', 
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // Log the Telnyx response
    console.log(
      'Telnyx RCS POST response:',
      response.status,
      response.statusText,
      JSON.stringify(response.data, null, 2)
    );

    console.log(`RCS Message sent to ${phoneNumber}`);
  } catch (error) {
    console.error('Failed to send RCS message:', error.response ? error.response.data : error);
    throw error;
  }
}

// Send GroupText preview to the group creator (the user)
async function sendAppointmentToUser(userId, groupTextId, contentType, identity) {
  try {
    const user = await User.findByPk(userId);
    const groupText = await GroupText.findByPk(groupTextId);

    if (!user || !user.phone || !groupText) {
      console.error('User or GroupText not found, or user cell phone missing');
      return;
    }

    let content;
    let template;
    let messageData;

    switch (contentType) {
      case 'event':
        content = await Event.findByPk(groupText.contentId);
        if (!content) {
          console.error('Event content not found for GroupText');
          return;
        }
        if (content.templateId) {
          template = await Template.findByPk(content.templateId);
        }
        // (includeReplyLine = false) for the owner preview
        messageData = buildEventData(content, identity, template, false, content.id);
        break;

      case 'post':
        content = await Post.findByPk(groupText.contentId);
        if (!content) {
          console.error('Post content not found for GroupText');
          return;
        }
        // Posts do not have templates
        messageData = buildPostData(content, identity, false, content.id);
        break;

      case 'poll':
        content = await Poll.findOne({
          where: { id: groupText.contentId },
          include: [{ model: PollChoice, as: 'choices' }],
        });
        if (!content) {
          console.error('Poll content not found for GroupText');
          return;
        }
        // (includeReplyLine = false) for the user preview
        messageData = buildPollData(content, identity, false, content.id);
        break;

      default:
        console.error(`Unsupported contentType: ${contentType}`);
        return;
    }

    // Optionally add a “(Preview)” suffix:
    messageData.text += `\n(Preview)                                                `;

    // Send it out
    await sendRcsMessage(
      user.phone.trim(),
      messageData,
      process.env.TELNYX_NUMBER, // 'fromNumber' unused in RCS
      process.env.TELNYX_ADMIN_PROFILE_ID
    );

    console.log(`GroupText preview sent to user ${userId} for groupText ${groupTextId}`);
  } catch (error) {
    console.error('Failed to send GroupText preview:', error);
    throw error;
  }
}

// Send GroupText to a final recipient in the group
async function sendAppointmentToCustomer(userId, groupTextId, contentType, identity) {
  try {
    const member = await User.findByPk(userId);
    const groupText = await GroupText.findByPk(groupTextId);
    if (!member || !member.phone || !groupText) {
      console.error('User or GroupText not found');
      return;
    }

    let content;
    let template;
    let messageData;

    switch (contentType) {
      case 'event':
        content = await Event.findByPk(groupText.contentId);
        if (!content) {
          console.error('Event content not found');
          return;
        }
        if (content.templateId) {
          template = await Template.findByPk(content.templateId);
        }
        // final broadcast = includeReplyLine=true
        messageData = buildEventData(
          content,
          identity,
          template,
          true,
          content.id,
          groupTextId,
          member.id
        );
        break;

      case 'post':
        content = await Post.findByPk(groupText.contentId);
        if (!content) {
          console.error('Post content not found');
          return;
        }
        messageData = buildPostData(
          content,
          identity,
          true,
          content.id,
          groupTextId,
          member.id
        );
        break;

      case 'poll':
        content = await Poll.findOne({
          where: { id: groupText.contentId },
          include: [{ model: PollChoice, as: 'choices' }],
        });
        if (!content) {
          console.error('Poll content not found for GroupText');
          return;
        }
        // final broadcast = includeReplyLine=true so user can text A/B
        messageData = buildPollData(
          content,
          identity,
          true,
          content.id,
          groupTextId,
          member.id
        );
        break;

      default:
        console.error(`Unsupported contentType: ${contentType}`);
        return;
    }

    // Send
    await sendRcsMessage(
      member.phone.trim(),
      messageData,
      process.env.TELNYX_NUMBER, // 'fromNumber' unused in RCS
      process.env.TELNYX_ADMIN_PROFILE_ID
    );

    console.log(`GroupText sent to user ${userId} for groupText ${groupTextId}`);
  } catch (error) {
    console.error('Failed to send GroupText:', error);
    throw error;
  }
}

module.exports = {
  sendRcsMessage,
  sendAppointmentToUser,
  sendAppointmentToCustomer,
};
