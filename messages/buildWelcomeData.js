// /messages/buildWelcomeData.js

function buildWelcomeData(imageUrl) {
  const messageData = {
    text: `Welcome to the pack!\n\nAdd the Contact Card above to your contacts, then you can text photos to appear on the site.\n\nReply STOP to opt-out.\nPowered by the Dog Ranch`
  };

  if (imageUrl) {
    messageData.media_urls = [imageUrl];
  }

  return messageData;
}

module.exports = buildWelcomeData;