// /workers/reminderWorker.js
const { Worker } = require('bullmq');
const Redis = require('ioredis');
const { Appointment, Business, User, Website, Staff } = require('../models');
const { sendReminderText } = require('../utils/telnyxUtils'); // or Twilio
const { Op } = require('sequelize');
const { fireTrialExpired } = require('../utils/marketingEvents');

const connection = new Redis(process.env.REDIS_URL, {
    retryStrategy: times => Math.min(times * 50, 2000),
    maxRetriesPerRequest: null, // 👈 REQUIRED for BullMQ to work properly
}); 

const worker = new Worker('appointment-reminders', async (job) => {
  if (job.name === 'send-reminder') {
    const { appointmentId } = job.data;

    const appt = await Appointment.findByPk(appointmentId, {
      include: [
        { model: Business, include: [{ model: Website }] },
        { model: User, as: 'user' },
        { model: Staff, as: 'staff' },
      ]
    });

    if (!appt || appt.status === 'cancelled') return;
    await sendReminderText(appt);
  }

  if (job.name === 'expire-trials') {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  // find *all* users switching status in one query
  const expiredUsers = await User.findAll({
    where: {
      status: 'claimed',
      createdAt: { [Op.lt]: cutoff },
    },
  });

  if (expiredUsers.length === 0) return;

  // set status → trial-expired
  await User.update(
    { status: 'trial-expired' },
    { where: { id: expiredUsers.map(u => u.id) } }
  );

  console.log(`⏳ Expired ${expiredUsers.length} trials`);

  // fire marketing events in the background
  for (const u of expiredUsers) {
    fireTrialExpired(u).catch(console.error);
  }
}

}, { connection });

worker.on('completed', job => {
  console.log(`✅ Job completed: ${job.name}`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job failed: ${job.name}`, err.message);
});

console.log('🚀 Reminder + Trial expiration worker started...');