// my-api/services/introductionService.js
const { Message } = require('../models'); // Import Message model for database operations
const { sendSmsToUser, sendMmsToUser, sendRcsToUser } = require('../utils/smsUtils');

// Function to send the intro message with an image and create the message in the database
async function sendIntroMessage(userId, threadId) {
  const messageData = {
    text: "Welcome to Group Text! We're excited to have you.  You may text STOP to opt-out at any time.",
    rcs: {
      rich_card: {
        standalone_card: {
          card_content: {
            title: "Welcome to Group Text! Interactive multimedia text messaging for every group occasion.",
            description: "Create, customize, and send event invitations directly through your messaging app.",
            media: {
              height: "MEDIUM",
              content_info: {
                file_url: "https://grouptext.co/branding-logo.png",
                thumbnail_url: "https://grouptext.co/vcard.png",
                content_description: "Group Text Logo",
                media_type: "image/png",
              },
            },
            suggestions: [
              {
                reply: {
                  display_text: "Create Event",
                  postback_data: "CREATE_EVENT",
                },
              },
              {
                reply: {
                  display_text: "Learn More",
                  postback_data: "LEARN_MORE",
                },
              },
            ],
          },
        },
      },
    },
  };

  // Send the message via RCS
  await sendRcsToUser(userId, messageData);
}

// Function to send vCard.  I know that sendMmsToUser works for the vCard - so we should probably keep it here...
async function sendVCard(userId) {
  const mediaUrl = 'https://grouptext.co/grouptext.vcf'; // URL to the vCard file
  await sendMmsToUser(userId, null, mediaUrl);
}

// Function to send "Text Types" carousel message and create it in the database
async function sendProductsCarouselMessage(userId, threadId) {
  const messageData = {
    text: "Text Types",
    rcs: {
      rich_card: {
        carousel_card: {
          card_width: "MEDIUM",
          card_contents: [
            {
              title: "Event Invitations",
              description: "Create, customize, and send event invitations directly through your text messaging app.",
              media: {
                height: "MEDIUM_HEIGHT",
                content_info: {
                  file_url: "https://grouptext.co/assets/how1.png",
                  thumbnail_url: "https://grouptext.co/assets/how1.png",
                  content_description: "Step 1 Image",
                  media_type: "image/png",
                },
              },
            },
            {
              title: "Interactive Polls & Surveys",
              description: "Create polls within the chat for quick group decisions. Anonymous voting is optional to encourage honesty. Results are displayed real-time as members vote.",
              media: {
                height: "MEDIUM_HEIGHT",
                content_info: {
                  file_url: "https://grouptext.co/assets/how2.png",
                  thumbnail_url: "https://grouptext.co/assets/how2.png",
                  content_description: "Step 2 Image",
                  media_type: "image/png",
                },
              },
            },
            {
              title: "Reminders & Notifications",
              description: "Send automatic notifications for approaching deadlines or events. Set custom reminders for group-related tasks.",
              media: {
                height: "MEDIUM_HEIGHT",
                content_info: {
                  file_url: "https://grouptext.co/assets/how3.png",
                  thumbnail_url: "https://grouptext.co/assets/how3.png",
                  content_description: "Step 3 Image",
                  media_type: "image/png",
                },
              },
            },
          ],
        },
      },
    },
  };

  // Send the message via RCS
  await sendRcsToUser(userId, messageData);
}

// Function to send "How It Works" carousel message and create it in the database
async function sendHowCarouselMessage(userId, threadId) {
  const messageData = {
    text: "How It Works",
    rcs: {
      rich_card: {
        carousel_card: {
          card_width: "MEDIUM",
          card_contents: [
            {
              title: "Event Invitations",
              description: "Create, customize, and send event invitations directly through your text messaging app.",
              media: {
                height: "MEDIUM_HEIGHT",
                content_info: {
                  file_url: "https://grouptext.co/assets/how1.png",
                  thumbnail_url: "https://grouptext.co/assets/how1.png",
                  content_description: "Step 1 Image",
                  media_type: "image/png",
                },
              },
            },
            {
              title: "Interactive Polls & Surveys",
              description: "Create polls within the chat for quick group decisions. Anonymous voting is optional to encourage honesty. Results are displayed real-time as members vote.",
              media: {
                height: "MEDIUM_HEIGHT",
                content_info: {
                  file_url: "https://grouptext.co/assets/how2.png",
                  thumbnail_url: "https://grouptext.co/assets/how2.png",
                  content_description: "Step 2 Image",
                  media_type: "image/png",
                },
              },
            },
            {
              title: "Reminders & Notifications",
              description: "Send automatic notifications for approaching deadlines or events. Set custom reminders for group-related tasks.",
              media: {
                height: "MEDIUM_HEIGHT",
                content_info: {
                  file_url: "https://grouptext.co/assets/how3.png",
                  thumbnail_url: "https://grouptext.co/assets/how3.png",
                  content_description: "Step 3 Image",
                  media_type: "image/png",
                },
              },
            },
          ],
        },
      },
    },
  };

  // Send the message via RCS
  // await sendRcsToUser(userId, messageData);

}

// Function to send the menu message 
async function sendMenuMessage(userId, threadId) {
  const messageData = {
    text: "Let's make a Group Text! What type do you want to send?",
    rcs: {
      rich_card: {
        standalone_card: {
          card_content: {
            title: "Let's make a Group Text! What type do you want to send?",
            description: "Create, customize, and send event invitations directly through your messaging app.",
            media: {
              height: "MEDIUM",
              content_info: {
                file_url: "https://grouptext.co/branding-logo.png",
                thumbnail_url: "https://grouptext.co/vcard.png",
                content_description: "Group Text Logo",
                media_type: "image/png",
              },
            },
            suggestions: [
              {
                reply: {
                  display_text: "Create Event",
                  postback_data: "CREATE_EVENT",
                },
              },
              {
                reply: {
                  display_text: "Learn More",
                  postback_data: "LEARN_MORE",
                },
              },
            ],
          },
        },
      },
    },
  };

  // Send the message via RCS
  // await sendRcsToUser(userId, messageData);

  // Create the menu message in the database
  await Message.create({
    threadId: threadId, // 
    author: 'bot',
    body: messageData.text,
    response_type: 'menu',
    contentType: 'text',
  });
}

module.exports = {
  sendIntroMessage,
  sendVCard,
  sendProductsCarouselMessage,
  sendHowCarouselMessage,
  sendMenuMessage
};
