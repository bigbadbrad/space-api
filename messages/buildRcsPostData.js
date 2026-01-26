// /messages/buildRcsPostData.js

function buildPostData(content, identity, includeReplyLine, contentId, groupTextId, memberId) {
    let messageText = '';
  
    // If there's a name, show it, otherwise start with the identity
    if (content.name) {
      messageText += `${content.name}\n${identity.displayName}\n\n`;
    } else {
      messageText += `${identity.displayName}\n\n`;
    }
  
    if (content.description) {
      messageText += `${content.description}\n`;
    }
  
    // Build the messageData for RCS
    const messageData = {
      text: messageText,
      imageUrl: content.imageUrl || '',
      title: content.name || '',
      description: '',
      suggestions: []
    };
  
    // If user is meant to reply, add instructions & suggestions
    if (includeReplyLine) {
      messageData.text += `
  Reply LIKE, COMMENT, or SHARE
  Reply STOP to opt-out
  Powered by GroupText.co
  `;
  
      if (groupTextId && memberId) {
        messageData.suggestions = [
          {
            reply: {
              text: 'LIKE',
              postback_data: `RESPONSE_LIKE_${groupTextId}_${memberId}`
            }
          },
          {
            reply: {
              text: 'COMMENT',
              postback_data: `RESPONSE_COMMENT_${groupTextId}_${memberId}`
            }
          },
          {
            reply: {
              text: 'SHARE',
              postback_data: `RESPONSE_SHARE_${groupTextId}_${memberId}`
            }
          }
        ];
      }
    }
  
    return messageData;
  }
  
  module.exports = buildPostData;
  