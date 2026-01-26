/******************************
 * File: /agents/helpers/eventHelper.js
 ******************************/
const { Event } = require('../../models/event');

/**
 * Creates an Event record.
 *
 * @param {object} options
 * @param {number} options.userId        - The userId who owns this event
 * @param {number} options.groupTextId   - The ID of the GroupText associated with this event
 * @param {string} options.title         - Event title
 * @param {string} [options.description] - Event description
 * @param {Date}   [options.date]        - Event date
 * @param {string} [options.time]        - Event time (as a string, e.g. '13:00:00')
 * @param {number} [options.templateId]  - Optional template ID
 *
 * @returns {Promise<Event>} The newly created Event instance.
 */
async function createEvent(options) {
  const {
    userId,
    groupTextId,
    title,
    description,
    date,
    time,
    templateId
  } = options;

  const newEvent = await Event.create({
    userId,
    threadId: null,  // or any logic needed
    templateId: templateId || null,
    title,
    description: description || null,
    date: date || null,
    time: time || null,
    groupTextId
  });

  return newEvent;
}

module.exports = { createEvent };
