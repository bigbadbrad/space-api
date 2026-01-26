// /utils/reminder/scheduleReminder.js
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const tz = require('dayjs/plugin/timezone');
const reminderQueue = require('../queues/reminderQueue');

dayjs.extend(utc);
dayjs.extend(tz);

async function scheduleReminder(appointment, businessTimezone = 'UTC') {
  const apptDate = appointment.appointment_date;   // e.g., '2025-05-01'
  const apptTime = appointment.start_time;         // e.g., '22:00:00'
  const tz = businessTimezone || 'UTC';

  // Treat time as UTC, convert to business local time
  const utcTime = dayjs.utc(`${apptDate}T${apptTime}`); // parsed as 10:00 PM UTC
  const localTime = utcTime.tz(tz);                      // converts to 3:00 PM PST

  // reminder time is 1 day before
//   const reminderTime = localTime.subtract(30, 'minute');
  const reminderTime = localTime.subtract(1, 'day');

  const delay = reminderTime.diff(dayjs(), 'milliseconds');

  console.log(`🕒 UTC time: ${utcTime.format()} → Local time: ${localTime.format()} (${tz})`);
  console.log(`🔔 Reminder scheduled for: ${reminderTime.format()} (${delay}ms from now)`);

  if (delay > 0) {
    await reminderQueue.add(
      'send-reminder',
      { appointmentId: appointment.id },
      {
        delay,
        jobId: `reminder-${appointment.id}`,
      }
    );
    console.log(`✅ Reminder job queued for appointment ${appointment.id}`);
  } else {
    console.warn(`⚠️ Skipped reminder — time already passed for appointment ${appointment.id}`);
  }
}

module.exports = scheduleReminder;