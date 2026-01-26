// /messages/buildRsvpList.js

function buildRsvpList(groupedResponses) {
  const responseEmojis = {
    yes: '🤗',
    no: '🥲',
    maybe: '🤔',
  };

  let responseMessage = 'Here are the RSVPs\n';

  ['yes', 'maybe', 'no'].forEach((type) => {
    if (groupedResponses[type] && groupedResponses[type].length > 0) {
      responseMessage += `\n${responseEmojis[type]}\n`;
      responseMessage += groupedResponses[type].join('\n');
      responseMessage += '\n';
    }
  });

  // Append instructions and promotion
  responseMessage += "\nYou can text 'rsvp' to this number to view the latest list.";
  responseMessage += '\n\nFor your own invites, check out Group Text and sign up at:';
  responseMessage += '\nhttps://grouptext.co';

  return responseMessage.trim();
}

module.exports = buildRsvpList;
