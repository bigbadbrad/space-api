// /webhooks/viewPollResults.js
const { User, GroupText, Poll, PollChoice, PollVote } = require("../models");
const { sendConfirmationMessage, sendSmsToNumber } = require("../utils/smsUtils");
const normalizePhoneNumber = require("../utils/normalizePhoneNumber");

/**
 * viewPollResults(messageText, fromNumber)
 * 
 * If a user sends "poll results", "viewpollresults", etc. we fetch the latest poll
 * and tally the votes. Then we send them a summary.
 */
async function viewPollResults(messageText, fromNumber) {
  if (!["pollresults", "pollresult"].includes(messageText.replace(/[^a-z]/gi, ""))) {
    return { status: 200, message: "No poll results command" };
  }

  const normalizedPhone = normalizePhoneNumber(fromNumber);
  const theUser = await User.findOne({
    where: { phone: normalizedPhone },
    order: [["createdAt", "DESC"]],
  });
  if (!theUser) {
    console.error("User not found for poll results");
    return { status: 200, message: "No user found" };
  }

  // find the latest GroupText for a poll
  const latestGroupText = await GroupText.findOne({
    where: { contentType: "poll" },
    order: [["createdAt", "DESC"]],
  });
  if (!latestGroupText) {
    console.error("No poll groupText found");
    return { status: 200, message: "No poll found" };
  }

  const poll = await Poll.findOne({
    where: { id: latestGroupText.contentId },
    include: [{ model: PollChoice, as: "choices" }],
  });
  if (!poll) {
    console.error("No poll found to show results for");
    return { status: 200, message: "No poll found" };
  }

  // gather votes
  const votes = await PollVote.findAll({
    where: { pollId: poll.id },
  });

  // Tally
  const counts = {};
  for (const choice of poll.choices) {
    counts[choice.id] = 0;
  }
  for (const vote of votes) {
    if (counts[vote.pollChoiceId] !== undefined) {
      counts[vote.pollChoiceId]++;
    }
  }

  // Build a string with question & each choice's count
  let responseMessage = `Poll: "${poll.question}"\nResults so far:\n\n`;
  for (let i = 0; i < poll.choices.length; i++) {
    const choice = poll.choices[i];
    const letter = String.fromCharCode(65 + i); // A,B,C...
    responseMessage += `${letter}) ${choice.choiceText}: ${counts[choice.id] || 0} vote(s)\n`;
  }
  responseMessage += `\nThanks for checking the poll results.`;

  // Send them the results
  await sendSmsToNumber(normalizedPhone, responseMessage);

  return { status: 200, message: "Poll results sent to user" };
}

module.exports = viewPollResults;
