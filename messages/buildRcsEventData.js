// /messages/buildRcsEventData.js

const dayjs = require('dayjs');

// Mapping of clock emojis based on hour and minute
const clockEmojis = {
  '1:00': '🕐', '1:30': '🕜',
  '2:00': '🕑', '2:30': '🕝',
  '3:00': '🕒', '3:30': '🕞',
  '4:00': '🕓', '4:30': '🕟',
  '5:00': '🕔', '5:30': '🕠',
  '6:00': '🕕', '6:30': '🕡',
  '7:00': '🕖', '7:30': '🕢',
  '8:00': '🕗', '8:30': '🕣',
  '9:00': '🕘', '9:30': '🕤',
  '10:00': '🕙', '10:30': '🕥',
  '11:00': '🕚', '11:30': '🕦',
  '12:00': '🕛', '12:30': '🕧'
};

// Function to round time to nearest hour or half-hour
function getClockEmoji(time) {
  const dateTime = dayjs(`2000-01-01 ${time}`); // Dummy date to extract time
  const hour = dateTime.hour() % 12 || 12; // Convert 24-hour format to 12-hour
  const minute = dateTime.minute();

  // Round to closest valid key (hour:00 or hour:30)
  const roundedMinute = minute < 15 ? '00' : minute < 45 ? '30' : '00';
  const adjustedHour = roundedMinute === '00' && minute >= 45 ? hour + 1 : hour;

  return clockEmojis[`${adjustedHour}:${roundedMinute}`] || '🕛'; // Default to 12:00 if missing
}

// Function to build event data
function buildEventData(content, identity, template, includeReplyLine, eventId, groupTextId, memberId) {
    // Combine date and time into a single DateTime object first
    const dateTime = dayjs(`${content.date} ${content.time}`);
  
    // Format the date and time
    const formattedDate = dateTime.format('ddd, MMM D, YYYY'); // e.g., "Monday, January 1, 2024"
    const formattedTime = dateTime.format('h:mm A'); // e.g., "3:00 PM"
    const formattedDateTime = dayjs(`${content.date} ${content.time}`).format('ddd, MMM D, YYYY [at] h:mm a');
    const timeEmoji = getClockEmoji(content.time); 
  
    // Construct the message text
    let messageText = '';
  
    if (content.description && content.additionalInfo) {
      messageText = `${content.title}
🥳 By ${identity.displayName}

${content.description}
🗓 ${formattedDate}
${timeEmoji} ${formattedTime}
🌎 ${content.location}
🗒 ${content.additionalInfo}
`;
    } else if (content.description && !content.additionalInfo) {
      messageText = `${content.title}
🥳 By ${identity.displayName}

${content.description}
🗓 ${formattedDate}
${timeEmoji} ${formattedTime}
🌎 ${content.location}
`;
    } else if (!content.description && content.additionalInfo) {
      messageText = `${content.title}
🥳 By ${identity.displayName}

🗓 ${formattedDate}
${timeEmoji} ${formattedTime}
🌎 ${content.location}
🗒 ${content.additionalInfo}
`;
    } else {
      messageText = `${content.title}
🥳 By ${identity.displayName}

🗓 ${formattedDate}
${timeEmoji} ${formattedTime}
🌎 ${content.location}
`;
    }

// Construct the final object
const messageData = {
text: messageText,
imageUrl: content.imageUrl || 'https://grouptext.co/templates/holiday/birds1.png',
title: content.title || '',
description: '',
suggestions: []
};

// Optionally add a "Reply" line & suggestions
if (includeReplyLine) {
    messageData.text += `
Powered by GroupText.co
Reply YES, NO, or MAYBE  `;

    if (groupTextId && memberId) {
      messageData.suggestions = [
        {
          reply: {
            text: 'YES',
            postback_data: `RESPONSE_YES_${groupTextId}_${memberId}`
          }
        },
        {
          reply: {
            text: 'NO',
            postback_data: `RESPONSE_NO_${groupTextId}_${memberId}`
          }
        },
        {
          reply: {
            text: 'MAYBE',
            postback_data: `RESPONSE_MAYBE_${groupTextId}_${memberId}`
          }
        }
      ];
    }
  }
  
    return messageData;
  }

module.exports = buildEventData;
