// /messages/buildAppointmentData.js
const dayjs = require('dayjs');
const utc   = require('dayjs/plugin/utc');
const tz    = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(tz);

/* -------------------------------------------------
 * Clock‑emoji helpers
 * ------------------------------------------------- */
const clockEmojis = {
  '1:00': '🕐', '1:30': '🕜', '2:00': '🕑', '2:30': '🕝',
  '3:00': '🕒', '3:30': '🕞', '4:00': '🕓', '4:30': '🕟',
  '5:00': '🕔', '5:30': '🕠', '6:00': '🕕', '6:30': '🕡',
  '7:00': '🕖', '7:30': '🕢', '8:00': '🕗', '8:30': '🕣',
  '9:00': '🕘', '9:30': '🕤', '10:00': '🕙', '10:30': '🕥',
  '11:00': '🕚', '11:30': '🕦', '12:00': '🕛', '12:30': '🕧',
};

function getClockEmoji(time24h) {
  const dateTime = dayjs(`2000-01-01 ${time24h}`);
  const h = dateTime.hour() % 12 || 12;
  const m = dateTime.minute();
  const roundedMin = m < 15 ? '00' : m < 45 ? '30' : '00';
  const adjHour = roundedMin === '00' && m >= 45 ? (h % 12) + 1 : h;
  return clockEmojis[`${adjHour}:${roundedMin}`] || '🕛';
}

/* -------------------------------------------------
 * Build RCS/Telnyx payload for an appointment
 * ------------------------------------------------- */
function buildAppointmentData({
  appointment,
  business,
  customer,
  staff,
  imageUrl = null,  
  includeReplyLine = false,
  mode = 'confirmation',
}) {
  const tzName = business?.timezone || 'UTC';

  // convert UTC → local
  const startLocal = dayjs
    .tz(`${appointment.appointment_date} ${appointment.start_time}`, 'YYYY-MM-DD HH:mm', 'UTC')
    .tz(tzName);
  const endLocal = dayjs
    .tz(`${appointment.appointment_date} ${appointment.end_time}`, 'YYYY-MM-DD HH:mm', 'UTC')
    .tz(tzName);

  const dateStr = startLocal.format('ddd, MMM D, YYYY');
  const timeRange = `${startLocal.format('h:mm A')} – ${endLocal.format('h:mm A')}`;
  const timeEmoji = getClockEmoji(startLocal.format('H:mm'));

  let parsedServices = [];

  try {
    parsedServices = JSON.parse(appointment.services);
  } catch (err) {
    parsedServices = [];
  }

const serviceStr = Array.isArray(parsedServices) && parsedServices.length > 0
  ? parsedServices.join(', ')
  : 'Service';

  // new way
  const msgLines = [
  business?.name ? `${business.name}` : null,
  '',
  `🗓 ${dateStr}`,
  `${timeEmoji} ${timeRange}`,
  `💼 ${serviceStr}`,
  // staff?.name ? `👤 Staff: ${staff.name}` : null,
  customer ? `🙋 Customer: ${customer.name || customer.phone}` : null,
  // customer?.phone ? `📞 ${customer.phone}` : null,
  // appointment.notes ? `🗒 Notes: ${appointment.notes}` : null,

  ].filter(Boolean);

  // old way that works better
  let messageText = '';
  messageText = `${business.name}
${dateStr}
${timeRange}

${serviceStr}
Customer: ${customer.name}
                        
${mode === 'reminder' ? 'Reminder. See you soon!' : 'Booked!'}
Reply STOP to opt-out.
Powered by the Dog Ranch
`;

/* ---------------------------------------------
   * Image URL comes straight from Website row
   * ------------------------------------------- */

  const messageData = {
    // new way
    // text: msgLines.join('\n'),

    // old way
    text: messageText, // ✅ use the string directly
    // Keeping image slot for future templates / branding
    ...(imageUrl ? { media_urls: [imageUrl] } : {}),
  };

  return messageData;
}

module.exports = buildAppointmentData;
