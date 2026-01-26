/******************************
 * File: /agents/agentService.js
 ******************************/
require('dotenv').config();
const { Identity, GroupText, Group } = require('../models');
const { sendGroupTextToGuest } = require('../utils/telnyxUtils');

// Helpers for each type of content
const { createPoll } = require('./helpers/pollHelper');
const { createPost } = require('./helpers/postHelper');
const { createEvent } = require('./helpers/eventHelper');

/**
 * createAgentContent
 *
 * 1) Finds the Identity by handle (e.g. "dankmemes", "memehustler", etc.).
 * 2) Finds (or creates) the group. Often "public-group" or a custom group name.
 * 3) Creates a GroupText row with contentType.
 * 4) Depending on contentType, calls the relevant helper function to create the content record.
 * 5) Updates groupText.contentId to link the new content.
 * 6) Sends the final message to all group members (like "/send-final").
 * 7) Marks groupText.status='sent'.
 *
 * @param {Object} agentOptions
 * @param {string} agentOptions.handle       - The handle of the identity, e.g. "memehustler"
 * @param {string} agentOptions.groupName    - The name of the group, e.g. "public-group"
 * @param {string} agentOptions.contentType  - "poll" | "post" | "event" (extend as needed)
 * @param {Object} agentOptions.contentData  - The data needed to create the content
 *     e.g. { question, choices } for poll, { body, title? } for post, etc.
 */
async function createAgentContent(agentOptions) {
  const {
    handle,
    groupName,
    contentType,
    contentData
  } = agentOptions;

  try {
    console.log('[agentService] Creating agent content for handle:', handle, ' type:', contentType);

    // 1) Find the Identity
    const identity = await Identity.findOne({ where: { handle } });
    if (!identity) {
      console.error(`[agentService] Identity not found for handle: ${handle}`);
      return null;
    }

    // 2) Find or create the group
    let group = await Group.findOne({
      where: {
        identityId: identity.id,
        name: groupName
      }
    });
    if (!group) {
      group = await Group.create({
        identityId: identity.id,
        name: groupName,
        type: (groupName === 'public-group') ? 'open' : 'closed',
        contentPolicy: (groupName === 'public-group') ? 'Anyone can post' : 'Host-only posts'
      });
    }

    // 3) Create a GroupText row
    const groupText = await GroupText.create({
      identityId: identity.id,
      groupId: group.id,
      contentType,
      active: 'yes',
      status: 'new',
      title: contentData.name || null,
    });

    // 4) Create the actual content (poll, post, event)
    let newContent;
    if (contentType === 'poll') {
      newContent = await createPoll({
        userId: identity.userId,
        groupTextId: groupText.id,
        question: contentData.question,
        coverImageUrl: contentData.coverImageUrl || null,
        pollEndTime: contentData.pollEndTime || null,
        choices: contentData.choices || []
      });
    } else if (contentType === 'post') {
      newContent = await createPost({
        userId: identity.userId,
        groupTextId: groupText.id,
        name: contentData.name || null,
        description: contentData.description,
        imageUrl: contentData.imageUrl || null
      });
    } else if (contentType === 'event') {
      newContent = await createEvent({
        userId: identity.userId,
        groupTextId: groupText.id,
        title: contentData.title,
        description: contentData.description,
        date: contentData.date,
        time: contentData.time,
        templateId: contentData.templateId
      });
    } else {
      console.error(`[agentService] Unknown contentType: ${contentType}`);
      return null;
    }

    // 5) Link the content record to the GroupText
    await groupText.update({ contentId: newContent.id });

    // 6) Send the final broadcast to all group members
    const members = await group.getUsers();
    if (!members || members.length === 0) {
      console.error('[agentService] No members in group, so no final send performed.');
    } else {
      for (const member of members) {
        await sendGroupTextToGuest(member.id, groupText.id, contentType, identity);
      }
    }

    // 7) Mark as 'sent'
    await groupText.update({ status: 'sent' });

    console.log(`[agentService] Successfully created + sent ${contentType} for handle ${handle}.`);
    return { groupText, content: newContent };
  } catch (error) {
    console.error('[agentService] Error creating agent content:', error);
    return null;
  }
}

module.exports = {
  createAgentContent
};
