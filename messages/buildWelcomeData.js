// /messages/buildWelcomeData.js

function buildWelcomeData(imageUrl) {
  const messageData = {
    text: `Welcome to the Space GTM!\n\nThe first ABM platform built for missions, not just leads.\n\nReply STOP to opt-out.`
  };

  if (imageUrl) {
    messageData.media_urls = [imageUrl];
  }

  return messageData;
}

module.exports = buildWelcomeData;