// /utils/midjourneyBot.js
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

/**
 * Sends a prompt to MidJourney and returns the URL of the generated composite image.
 *
 * If you see "Used disallowed intents," you must enable "Message Content Intent"
 * in Discord Developer Portal for this bot. Under "Privileged Gateway Intents,"
 * turn ON "Message Content Intent" and (if required) "Presence Intent" or others.
 *
 * @param {string} prompt - The prompt to send to MidJourney.
 * @returns {Promise<string>} - The URL of the generated 2x2 composite from MidJourney.
 */
function generateMidJourneyImage(prompt) {
  return new Promise((resolve, reject) => {
    let imageCaptured = false;

    // Create the client with the required GatewayIntents
    // Make sure you've toggled "MESSAGE CONTENT INTENT" on in your Discord dev portal
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, 
      ],
    });

    // Listen for MidJourney's response
    client.on('messageCreate', async (message) => {
      try {
        // MidJourney's bot username could be "Midjourney Bot" or similar.
        // Adjust if needed. Check if message includes attachments from MJ
        if (
          message.author.username === 'Midjourney' && // update if name differs
          !imageCaptured &&
          message.attachments.size > 0
        ) {
          // We'll just use the first attachment
          const attachment = message.attachments.first();
          if (attachment) {
            console.log(`[midjourneyBot] Generated Image URL: ${attachment.url}`);
            imageCaptured = true;
            resolve(attachment.url); // Return the URL of the composite image
            // We can log out the bot or destroy the client if we wish:
            client.destroy();
          }
        }
      } catch (error) {
        console.error('[midjourneyBot] Error capturing MidJourney response:', error);
        reject(error);
      }
    });

    // Once the client is ready, we send the imagine prompt
    client.once('ready', async () => {
      try {
        const channelId = process.env.MIDJOURNEY_CHANNEL_ID;
        const channel = await client.channels.fetch(channelId);

        if (!channel) throw new Error('MidJourney channel not found! Check the ID or perms.');
        
        // MidJourney uses slash commands: /imagine prompt:
        // If your server/bot uses a different approach, adjust accordingly
        await channel.send(`/imagine prompt: ${prompt} --ar 16:9 --v 4 --style raw`);

        console.log(`[midjourneyBot] Prompt sent to MidJourney: "${prompt}" (Relax mode recommended)`);
      } catch (error) {
        console.error('[midjourneyBot] Error sending prompt to MidJourney:', error);
        reject(error);
      }
    });

    // Login to Discord
    client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
      console.error('[midjourneyBot] Error logging in to Discord:', error);
      reject(error);
    });
  });
}

module.exports = { generateMidJourneyImage };
