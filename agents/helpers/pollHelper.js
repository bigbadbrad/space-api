/******************************
 * File: /agents/helpers/pollHelper.js
 ******************************/
const { Poll, PollChoice } = require('../../models');

/**
 * Creates a Poll record with any number of choices.
 * 
 * @param {object} options
 * @param {number} options.userId        - The userId who owns this poll
 * @param {number} options.groupTextId   - The ID of the GroupText associated with this poll
 * @param {string} options.question      - Poll question
 * @param {string} [options.coverImageUrl] - Optional single cover image
 * @param {Date}   [options.pollEndTime]   - Optional end time
 * @param {Array}  options.choices       - Array of { choiceText, imageUrl? }
 *
 * @returns {Promise<Poll>} The newly created Poll instance (with no joined choices).
 */
async function createPoll(options) {
  const {
    userId,
    groupTextId,
    question,
    coverImageUrl,
    pollEndTime,
    choices,
  } = options;

  // 1) Create the poll row
  const newPoll = await Poll.create({
    userId,
    groupTextId,
    question,
    imageUrl: coverImageUrl || null,
    pollEndTime: pollEndTime || null
  });

  // 2) Create PollChoice rows
  for (let i = 0; i < (choices || []).length; i++) {
    const { choiceText, imageUrl } = choices[i];
    await PollChoice.create({
      pollId: newPoll.id,
      choiceText,
      imageUrl: imageUrl || null
    });
  }

  return newPoll;
}

module.exports = { createPoll };
