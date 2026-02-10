// /utils/telnyxUtils.js
require('dotenv').config();
const axios = require('axios');
const dayjs = require('dayjs');
const utc   = require('dayjs/plugin/utc');
const tz    = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(tz);

const { Op } = require('sequelize');

const { User, Appointment, Business, Staff, Website, Subscription, BoardingReservation, Dog } = require('../models');
const { sendMmsToUser } = require('./smsUtils');
const { whitelistedPhoneNumbers } = require('../config/whitelist');
const buildAppointmentData = require('../messages/buildAppointmentData');
const buildWelcomeData = require('../messages/buildWelcomeData');

/* -------------------------------------------------
 * Helper: does the given user have permission
 *         to send customer‑facing messages?
 * ------------------------------------------------- */
async function hasCustomerMessaging(userId) {
  const user = await User.findByPk(userId);
  if (!user) return false;

  const normalize = (p) => (p || '').replace(/\D/g, '');
  const userPhone = normalize(user.phone || user.phone || '');

  // 1) Whitelist
  if (whitelistedPhoneNumbers.map(normalize).includes(userPhone)) return true;

  // 2) Active subscription
  const sub = await Subscription.findOne({
    where: {
      userId,
      status: 'active',
      endDate: { [Op.gt]: new Date() },
    },
  });

  return !!sub;
}

/* -------------------------------------------------
 * Low‑level RCS sender (unchanged)
 * ------------------------------------------------- */
async function sendRcsMessage(phoneNumber, messageData, fromNumber, messagingProfileId) {
  try {
    phoneNumber = phoneNumber.trim();
    if (!phoneNumber.startsWith('+')) phoneNumber = `+1${phoneNumber}`;

    const payload = {
      ...messageData,
      from: fromNumber,
      to: phoneNumber,
      messaging_profile_id: messagingProfileId,
    };

    console.log('Payload being sent to Telnyx:', JSON.stringify(payload, null, 2));
    await axios.post('https://api.telnyx.com/v2/messages', payload, {
      headers: {
        Authorization: `Bearer ${process.env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    console.log(`Message sent to ${phoneNumber}`);
  } catch (err) {
    console.error('Failed to send message:', err.response ? err.response.data : err);
    throw err;
  }
}

/* -------------------------------------------------
 * Send welcome text to a new user
 * ------------------------------------------------- */
async function sendWelcomeToUser(userId) {
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      console.error(`User ${userId} not found for welcome`);
      return;
    }
    if (!user.phone) {
      console.error(`User ${userId} has no phone for welcome`);
      return;
    }

    const imageUrl = `https://assets.ranch.dog/space-gtm/space-gtm-text-message7.png`;

    const messageData = buildWelcomeData(imageUrl);

    await sendRcsMessage(
      user.phone.trim(),
      messageData,
      process.env.TELNYX_NUMBER,
      process.env.TELNYX_ADMIN_PROFILE_ID
    );

    console.log(`✅ Welcome text sent to ${user.phone} with logo ${imageUrl}`);
  } catch (err) {
    console.error('Failed to send welcome text', err);
    throw err;
  }
}

// Function to send vCard.  I know that sendMmsToUser works for the vCard - so we should probably keep it here...
async function sendVCard(userId, areaCode) {
  const mediaUrl = `https://assets.ranch.dog/vcards/${areaCode}.vcf`; // URL to the vCard file
  await sendMmsToUser(userId, null, mediaUrl);
}



/* -------------------------------------------------
 * 1️⃣  Send preview of the newly‑created appointment
 *     to the authenticated business user
 * ------------------------------------------------- */
async function sendAppointmentToUser(userId, appointmentId, businessId) {
  try {
    // fetch everything we need in one go
    const [owner, appointment, business] = await Promise.all([
      User.findByPk(userId),
      Appointment.findByPk(appointmentId, {
        include: [
          { model: User,  as: 'user',  attributes: ['id', 'name', 'phone'] }, // the customer
          { model: Staff, as: 'staff', attributes: ['id', 'name'] },
        ],
      }),
      Business.findByPk(businessId, {
        include: [{ model: Website, attributes: ['text_image_url'] }],
      }),
    ]);

    const imageUrl = business.Website?.text_image_url || null;

    if (!owner || !appointment || !business) {
      console.error('Owner, appointment, or business not found');
      return;
    }
    if (!owner.phone && !owner.phone) {
      console.error('Owner has no phone number on file');
      return;
    }

    const messageData = buildAppointmentData({
      appointment,
      business,
      customer: appointment.user,
      staff:    appointment.staff,
      imageUrl,
      includeReplyLine: false,
      mode: 'confirmation',
    });

    await sendRcsMessage(
      (owner.phone || owner.phone).trim(),
      messageData,
      process.env.TELNYX_NUMBER,
      process.env.TELNYX_ADMIN_PROFILE_ID
    );

    console.log(
      `Appointment preview sent to owner ${userId} for appointment ${appointmentId}`
    );
  } catch (err) {
    console.error('Failed to send appointment preview:', err);
    throw err;
  }
}

/* -------------------------------------------------
 * 2️⃣  SEND THE APPOINTMENT TO THE CUSTOMER
 *     
 * ------------------------------------------------- */
async function sendAppointmentToCustomer(appointmentId) {
  try {
    const appointment = await Appointment.findByPk(appointmentId, {
      include: [
        { model: User,  as: 'user',  attributes: ['id', 'name', 'phone'] }, // customer
        { model: Business, include: [{ model: Website, attributes: ['text_image_url'] }] },
        { model: Staff,    as: 'staff', attributes: ['id', 'name'] },
      ],
    });

    if (!appointment) {
      console.error('Appointment not found');
      return;
    }

    const { user: customer, Business: business } = appointment;
    const ownerUserId = business.user_id || business.userId;
    const imageUrl = business.Website?.text_image_url || null;

    if (!customer?.phone) {
      console.error('Customer has no phone number');
      return;
    }

    const messageData = buildAppointmentData({
      appointment,
      business,
      customer,
      staff: appointment.staff,
      imageUrl,
      includeReplyLine: true,
      mode: 'confirmation',
    });

    await sendRcsMessage(
      customer.phone.trim(),
      messageData,
      process.env.TELNYX_NUMBER,
      process.env.TELNYX_ADMIN_PROFILE_ID
    );

    console.log(`Appointment sent to customer ${customer.id}`);
  } catch (err) {
    console.error('Failed to send appointment to customer:', err);
    throw err;
  }
}

async function sendReminderText(appointment) {
  try {
    const { user: customer, Business: business } = appointment;

    if (!customer?.phone) {
      console.error('No phone on appointment user');
      return;
    }

    const ownerUserId = business.user_id || business.userId;
    if (!(await hasCustomerMessaging(ownerUserId))) {
      console.log(
        `Owner ${ownerUserId} has no subscription/whitelist – skipping reminder SMS`
      );
      return;
    }

    const imageUrl = business.Website?.text_image_url || null;

    const messageData = buildAppointmentData({
      appointment,
      business,
      customer,
      staff: appointment.staff,
      imageUrl,
      includeReplyLine: false,
      mode: 'reminder',
    });

    await sendRcsMessage(
      customer.phone.trim(),
      messageData,
      process.env.TELNYX_NUMBER,
      process.env.TELNYX_ADMIN_PROFILE_ID
    );

    console.log(`Reminder text sent to ${customer.phone}`);
  } catch (err) {
    console.error('Failed to send reminder text:', err);
  }
}


/* -------------------------------------------------
 * 3️⃣  SEND THE BOARDING RESERVATION TO THE CUSTOMER
 *     
 * ------------------------------------------------- */
async function sendBoardingReservationToCustomer(reservationId) {
  try {
    const reservation = await BoardingReservation.findByPk(reservationId, {
      include: [
        { model: User,  as: 'user',  attributes: ['id', 'name', 'phone'] }, // customer
        { model: Business, include: [{ model: Website, attributes: ['text_image_url'] }] },
        { model: Dog, as: 'dog', attributes: ['id', 'name'] }, // dog info
      ],
    });

    if (!reservation) {
      console.error('Boarding reservation not found');
      return;
    }

    const { user: customer, Business: business } = reservation;
    const ownerUserId = business.user_id || business.userId;
    const imageUrl = business.Website?.text_image_url || null;

    if (!customer?.phone) {
      console.error('Customer has no phone number');
      return;
    }

    // Create adapter object to map boarding reservation fields to appointment fields
    const appointmentAdapter = {
      appointment_date: dayjs(reservation.check_in_utc).format('YYYY-MM-DD'),
      start_time: dayjs(reservation.check_in_utc).format('HH:mm'),
      end_time: dayjs(reservation.check_out_utc).format('HH:mm'),
      services: JSON.stringify(['Boarding']),
      notes: reservation.notes
    };

    const messageData = buildAppointmentData({
      appointment: appointmentAdapter,
      business,
      customer,
      staff: null,
      imageUrl,
      includeReplyLine: true,
      mode: 'confirmation',
    });

    await sendRcsMessage(
      customer.phone.trim(),
      messageData,
      process.env.TELNYX_NUMBER,
      process.env.TELNYX_ADMIN_PROFILE_ID
    );

    console.log(`Boarding reservation sent to customer ${customer.id}`);
  } catch (err) {
    console.error('Failed to send boarding reservation to customer:', err);
    throw err;
  }
}


module.exports = {
  sendRcsMessage,
  sendAppointmentToUser,
  sendAppointmentToCustomer,
  sendWelcomeToUser,
  sendVCard,
  sendReminderText,
  sendBoardingReservationToCustomer
};
