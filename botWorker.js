// botWorker.js
require('dotenv').config();
const cron = require('node-cron');
const redis = require('redis');
const { Op, fn, col, where } = require('sequelize');
const { User, GroupText, Response, Group, Event } = require('./models');
const { sendConfirmationMessage } = require('./utils/smsUtils');
const buildRsvpList = require('./messages/buildRsvpList');
const eventReminder = require('./messages/eventReminder');

// Create Redis client
const redisClient = redis.createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

// Connect to Redis and start watchers
(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');

    //-------------------------------------
    // RSVP Watcher
    //-------------------------------------
    const checkRsvps = async () => {
      console.log('Checking RSVPs...');
      try {
        const groupTexts = await GroupText.findAll();

        for (const groupText of groupTexts) {
          const groupTextId = groupText.id;
          const isProcessed = await redisClient.sIsMember('processedGroupTexts', groupTextId.toString());

          if (!isProcessed) {
            // Count how many responses have come in so far for this GroupText
            const totalResponses = await Response.count({ where: { groupTextId } });

            if (totalResponses >= 3) { // Adjust threshold as needed
              console.log(`GroupText ID ${groupTextId} has ${totalResponses} responses.`);

              // Fetch responses including user info (previously "guest")
              const responses = await Response.findAll({
                where: { groupTextId },
                include: [
                  {
                    model: User,
                    as: 'user',    // We assume Response.belongsTo(User, { as: 'user' })
                    attributes: ['name', 'phone'],
                  },
                ],
              });

              // Group the responses
              const groupedResponses = { yes: [], maybe: [], no: [] };
              responses.forEach((resp) => {
                const responseType = (resp.response || '').toLowerCase();
                // Use name or phone
                const userName = resp.user?.name || resp.user?.phone || 'Unknown';
                if (groupedResponses[responseType]) {
                  groupedResponses[responseType].push(userName);
                }
              });

              // Build RSVP list message
              const responseMessage = buildRsvpList(groupedResponses);

              // Get associated group and its users
              const group = await Group.findByPk(groupText.groupId, {
                include: [
                  {
                    model: User,
                    as: 'user', // We assume Group.belongsToMany(User, { as: 'user' })
                  },
                ],
              });

              if (!group) {
                console.error(`Group with ID ${groupText.groupId} not found.`);
                continue;
              }

              // Notify all users in that group
              const usersToNotify = group.user; // array of user objects
              for (const member of usersToNotify) {
                console.log(`Sending RSVP update to user ${member.id}`);
                await sendConfirmationMessage(member.id, responseMessage);
              }

              // Mark this GroupText as processed
              await redisClient.sAdd('processedGroupTexts', groupTextId.toString());
              console.log(`GroupText ID ${groupTextId} processed and added to Redis set.`);
            } else {
              console.log(`GroupText ID ${groupTextId} has only ${totalResponses} responses.`);
            }
          } else {
            console.log(`GroupText ID ${groupTextId} has already been processed.`);
          }
        }
      } catch (error) {
        console.error('Failed to check RSVPs:', error);
      }
    };

    // Run RSVP watcher every 5 minutes
    // cron.schedule('*/5 * * * *', () => {
    //   console.log('Running scheduled task: checkRsvps');
    //   checkRsvps();
    // });

    //-------------------------------------
    // Event Watcher
    //-------------------------------------
    const eventWatcher = async () => {
      console.log('Checking events for reminders...');
      try {
        // Example logic with time windows. Original code for PST example:
        const now = new Date();
        // Convert now (UTC) to PST by subtracting 8 hours
        const pstNow = new Date(now.getTime() - 8 * 60 * 60 * 1000);
        const oneHourFromNowPST = new Date(pstNow.getTime() + 60 * 60 * 1000);
        const oneHourFromNowPlusFivePST = new Date(oneHourFromNowPST.getTime() + 5 * 60 * 1000);

        // Combine date and time columns (for older logic)
        const events = await Event.findAll({
          where: {
            [Op.and]: [
              where(
                fn('TIMESTAMP', col('Event.date'), col('Event.time')),
                {
                  [Op.between]: [oneHourFromNowPST, oneHourFromNowPlusFivePST]
                }
              )
            ]
          },
          include: [
            { model: GroupText, as: 'groupTexts' },
            {
              model: User,
              as: 'user',
              attributes: ['name'], // replaced ['firstName'] with ['name']
            },
          ],
        });

        for (const event of events) {
          const isProcessed = await redisClient.sIsMember('processedEvents', event.id.toString());
          if (isProcessed) {
            console.log(`Event ID ${event.id} already processed for reminder.`);
            continue;
          }

          // Use event.user.name (instead of firstName)
          const userName = event.user?.name || 'Your';
          const eventDesc = event.description || 'special';

          for (const gt of event.groupTexts) {
            const group = await Group.findByPk(gt.groupId, {
              include: [
                {
                  model: User,
                  as: 'user', // we expect the group has .getUser() for the members
                },
              ],
            });

            if (!group) {
              console.error(`Group with ID ${gt.groupId} not found for event ${event.id}.`);
              continue;
            }

            const reminderMessage = eventReminder(userName, eventDesc);

            // Notify all users in the group
            for (const member of group.user) {
              console.log(`Sending event reminder to user ${member.id} for event ${event.id}`);
              await sendConfirmationMessage(member.id, reminderMessage);
            }
          }

          await redisClient.sAdd('processedEvents', event.id.toString());
          console.log(`Event ID ${event.id} reminder processed and added to Redis set.`);
        }
      } catch (error) {
        console.error('Failed to check events:', error);
      }
    };

    // Run Event watcher every minute (for demonstration)
    // cron.schedule('* * * * *', () => {
    //   console.log('Running scheduled task: eventWatcher');
    //   eventWatcher();
    // });


    //-------------------------------------
    // Agent Scheduler
    //-------------------------------------

    const { createDankMemesPoll } = require('./agents/dankMemesPollAgent');
    const { createMemeHustlerPost } = require('./agents/memeHustlerAgent');
    const { createBibleVersePost } = require('./agents/bibleVerseAgent');
    const { createHistoryPost } = require('./agents/dailyHistoryAgent');
    const { createFunFactPost } = require('./agents/funFactsAgent');
    const { createLovePost } = require('./agents/fromTheHeartAgent');
    const { createInspirationalPost } = require('./agents/inspirationDailyAgent');

    // Schedule createBibleVersePost to run daily at 10:20 PM PST/PDT
    // cron.schedule('20 22 * * *', async () => {

    // Schedule createBibleVersePost to run daily at 11 AM PST/PDT
    cron.schedule('0 11 * * *', async () => {
      console.log(`[${new Date().toISOString()}] Running Bible Verse Post at 11 AM PST/PDT...`);
      try {
        await createBibleVersePost();
        console.log(`[${new Date().toISOString()}] Bible Verse Post completed successfully.`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error in Bible Verse Post:`, err);
      }
    }, {
      timezone: 'America/Los_Angeles' // Ensures it runs at 11 AM PST/PDT
    });

    cron.schedule('02 11 * * *', async () => {
      console.log(`[${new Date().toISOString()}] Running Post at 11:02 AM PST/PDT...`);
      try {
        await createHistoryPost();
        console.log(`[${new Date().toISOString()}] Post completed successfully.`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error in Post:`, err);
      }
    }, {
      timezone: 'America/Los_Angeles' // Ensures it runs at 11 AM PST/PDT
    });

    cron.schedule('04 11 * * *', async () => {
      console.log(`[${new Date().toISOString()}] Running Post at 11:02 AM PST/PDT...`);
      try {
        await createFunFactPost();
        console.log(`[${new Date().toISOString()}] Post completed successfully.`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error in Post:`, err);
      }
    }, {
      timezone: 'America/Los_Angeles' // Ensures it runs at 11 AM PST/PDT
    });

    cron.schedule('4 12 * * *', async () => {
      console.log(`[${new Date().toISOString()}] Running Inspirational Post at 12 PM PST/PDT...`);
      try {
        await createInspirationalPost();
        console.log(`[${new Date().toISOString()}] Inspirational Post completed successfully.`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error in Inspirational Post:`, err);
      }
    }, {
      timezone: 'America/Los_Angeles' // Ensures it runs at 12 PM PST/PDT
    });

    cron.schedule('15 12 * * *', async () => {
      console.log(`[${new Date().toISOString()}] Running From The Heart Post at 12 PM PST/PDT...`);
      try {
        await createLovePost();
        console.log(`[${new Date().toISOString()}] From The Heart Post completed successfully.`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error in From The Heart Post:`, err);
      }
    }, {
      timezone: 'America/Los_Angeles' // Ensures it runs at 12 PM PST/PDT
    });
    

    
    console.log('Bot Worker started...');
  } catch (error) {
    console.error('Error connecting to Redis:', error);
  }
})();
