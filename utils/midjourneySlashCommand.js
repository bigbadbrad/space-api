/******************************
 * File: /utils/midjourneySlashCommand.js
 ******************************/
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ApplicationCommandOptionType,
  InteractionType,
} = require('discord.js');

/**
 * 1) We connect as a bot with privileged Gateway Intents
 * 2) We attempt to "register" a slash command in your server
 * 3) We send an "interaction" that calls MidJourney's /imagine command
 *
 *  PLEASE NOTE:
 *  - MidJourney may not allow slash command injections from other bots
 *  - This is a partial or hacky approach. Officially, you must manually type /imagine
 */

/**
 * Attempt to register a "fake" slash command referencing MidJourney's /imagine
 * Then we attempt to send an interaction that calls it
 *
 * @param {string} prompt - The text you want to feed into MJ
 * @returns {Promise<string>} - Possibly the final URL if you detect it, or a success message
 */
async function sendImagineSlashCommand(prompt) {
  const token = process.env.DISCORD_BOT_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID; // your bot's Application (client) ID
  const guildId = process.env.MIDJOURNEY_GUILD_ID; // The server ID where both your bot & MJ reside
  const mjAppId = process.env.MIDJOURNEY_APP_ID;   // Possibly the MidJourney app ID. See disclaimers

  // 1) Create a new Discord client
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  // 2) Create a REST instance to register slash commands
  const rest = new REST({ version: '10' }).setToken(token);

  try {
    // 2a) We first attempt to see if we can create a custom slash command that references MJ
    // This is a shot in the dark—MJ might not allow bridging. We'll do it anyway for demonstration.

    const commands = [
      {
        name: 'imagine-proxy',
        description: 'Proxy command to call MidJourney imagine with user prompt',
        options: [
          {
            name: 'prompt',
            description: 'Prompt to feed MJ',
            type: ApplicationCommandOptionType.String,
            required: true,
          },
        ],
      },
    ];

    // Register the command in a specific guild
    // Or you can do a global registration, but that takes an hour+ to sync
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: commands,
    });
    console.log('[midjourneySlashCommand] Registered the slash command "imagine-proxy" in guild', guildId);

    // 3) Now we attempt to log in so we can watch for MJ's response
    await client.login(token);

    return new Promise((resolve, reject) => {
      // 3a) Listen for messages from the MJ bot, or an interaction event
      // We'll do the basic approach used before
      let imageCaptured = false;

      client.on('messageCreate', async (message) => {
        try {
          if (
            message.author.username === 'Midjourney Bot' &&
            !imageCaptured &&
            message.attachments.size > 0
          ) {
            const attachment = message.attachments.first();
            if (attachment) {
              console.log(`[midjourneySlashCommand] Captured MJ image: ${attachment.url}`);
              imageCaptured = true;
              resolve(attachment.url);
              client.destroy();
            }
          }
        } catch (err) {
          console.error('[midjourneySlashCommand] Error capturing MJ response:', err);
          reject(err);
          client.destroy();
        }
      });

      // 3b) Once ready, we try to "fake" an interaction call to MJ
      client.once('ready', async () => {
        try {
          console.log('[midjourneySlashCommand] Bot client ready. Attempting slash command injection...');

          // We attempt to create an "interaction" for MidJourney's command (with ID or name).
          // But realistically, you'd need the actual command ID that MidJourney uses, etc.

          // The typical approach: we call "imagine-proxy" we just registered, but it won't automatically trigger MJ's /imagine. 
          // If we want to directly call MJ's command by ID, we'd have to know it. 
          // We'll do a simpler approach: we call our own "imagine-proxy" command, 
          // hoping to pass the data to MJ. This often fails unless MJ devs allow bridging.

          // Example slash command creation:
          const channel = await client.channels.fetch(process.env.MIDJOURNEY_CHANNEL_ID);
          if (!channel) throw new Error(`No channel found for ID ${process.env.MIDJOURNEY_CHANNEL_ID}`);

          // Pseudo-step: we create an interaction. 
          // But Discord typically doesn't let you do direct interaction calls to another app. 
          // We'll do a partial approach: we "send" a slash command mention

          // *** There's no simple official method to programmatically call another bot's slash command
          // The below is a partial/hacky approach: we mention our slash command with the argument
          await channel.send(`/imagine-proxy prompt: ${prompt}`);

          console.log('[midjourneySlashCommand] Slash command message posted.');
            
// Now waiting for MJ (which likely will not respond)...
// (If you have a custom bridging approach, you'd implement it here.)

        } catch (error) {
          console.error('[midjourneySlashCommand] Error injecting slash command:', error);
          reject(error);
          client.destroy();
        }
      });
    });
  } catch (err) {
    console.error('[midjourneySlashCommand] Overall error:', err);
    throw err;
  }
}

module.exports = { sendImagineSlashCommand };
