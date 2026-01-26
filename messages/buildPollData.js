// /messages/buildPollData.js
const dayjs = require('dayjs');

/**
 * buildPollData(poll, identity, includeReplyLine, pollId, groupTextId, userId)
 *
 * Now we always show question + enumerated choices in both preview & final.
 * If `includeReplyLine` is true, we also show "Reply with letter" and RCS suggestions, etc.
 * Additionally, we attach poll.imageUrl plus any choice images as media URLs
 * so the user actually sees the images in the message (similar to viewPhotos).
 */
function buildPollData(poll, identity, includeReplyLine, pollId, groupTextId, userId) {
  const lines = [];

  // The poll question
  lines.push(`${poll.question}`);
  lines.push('');

  // Example: "Poll from Nury"
  lines.push(`From ${identity.displayName || '@' + identity.handle}`);

  // If there's a pollEndTime
  if (poll.pollEndTime) {
    const endTime = dayjs(poll.pollEndTime).format('MMM D, YYYY h:mm A');
    lines.push(`Ends: ${endTime}`);
  }

  // If there's a "hero" image, we note that in the text
  if (poll.imageUrl) {
    lines.push('[Hero Image Attached]');
  }

  // Always list choices
  // lines.push('');
  // if (poll.choices && poll.choices.length > 0) {
  //   poll.choices.forEach((choice, idx) => {
  //     const letter = String.fromCharCode(65 + idx); // A, B, C...
  //     const imageNote = choice.imageUrl ? '[Choice image attached]' : '';
  //     lines.push(`${letter}) ${choice.choiceText} ${imageNote}`);
  //   });
  // } else {
  //   lines.push('(No choices found...)');
  // }

  // Only add the "Reply with A/B/C" line if final broadcast:
  if (includeReplyLine) {
    lines.push('');
    lines.push('Reply with the digit (1, 2, 3...) to vote!');
  }

  // Build optional RCS suggestions for final broadcast
  const suggestions = [];
  if (includeReplyLine && poll.choices && poll.choices.length > 0) {
    poll.choices.forEach((choice, idx) => {
      // e.g., A or B or C
      const letter = String.fromCharCode(65 + idx);
      suggestions.push({
        reply: {
          display_text: choice.choiceText,
          postback_data: `RESPONSE_POLL_${pollId}_${idx}`, 
        },
      });
    });
  }

  // Collect images in the same style as "viewPhotos" => array of media_urls
  const mediaUrls = [];
  if (poll.imageUrl) {
    mediaUrls.push(poll.imageUrl);
  }
  if (poll.choices && poll.choices.length > 0) {
    poll.choices.forEach((choice) => {
      if (choice.imageUrl) {
        mediaUrls.push(choice.imageUrl);
      }
    });
  }

  // Construct the final messageData
  const messageData = {
    text: lines.join('\n'),
  };

  // If we have any images, attach them:
  if (mediaUrls.length > 0) {
    messageData.media_urls = mediaUrls;
  }

  // If you want RCS suggestions
  if (suggestions.length > 0) {
    messageData.rcs_message = {
      suggestions,
    };
  }

  return messageData;
}

module.exports = buildPollData;
