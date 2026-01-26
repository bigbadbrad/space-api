// /messages/buildPostData.js

// For posts, we only show the name, optional description, and an image.
function buildPostData(content, identity, includeReplyLine, contentId, groupTextId, memberId) {
    // Construct the message text for a post
    let messageText = '';

    // If there's a name, show it first, otherwise, start with the identity
    if (content.name) {
      messageText += `${content.name}\n${identity.displayName}\n\n`;
    } else {
        messageText += `${identity.displayName}\n\n`;
    }
  
    messageText += `${content.description}\n`;
  
    const messageData = {
      text: messageText,
    };

    let imageUrl = content.imageUrl;

    // If we do have a valid image URL, set media_urls
    if (imageUrl) {
      messageData.media_urls = [imageUrl];
    }

//     if (includeReplyLine) {
//       messageData.text += `
// Reply LIKE, COMMENT, or FOLLOW`;
//       messageData.rcs_message = {
//         suggestions: [
//           {
//             reply: {
//               display_text: 'LIKE',
//               postback_data: `RESPONSE_LIKE_${groupTextId}_${userId}`,
//             },
//           },
//           {
//             reply: {
//               display_text: 'COMMENT',
//               postback_data: `RESPONSE_COMMENT_${groupTextId}_${userId}`,
//             },
//           },
//           {
//             reply: {
//               display_text: 'FOLLOW',
//               postback_data: `RESPONSE_FOLLOW_${groupTextId}_${userId}`,
//             },
//           },
//         ],
//       };
//     }

    if (includeReplyLine) {
      messageData.text += `
Reply STOP to opt-out
Powered by GroupText.co
`;
    }
  
    return messageData;
  }
  
  module.exports = buildPostData;
  