// /webhooks/viewRsvps.js
const { User, GroupText, Response, GroupUser } = require("../models"); // Include GroupUser model
const { Op } = require("sequelize");
const { sendConfirmationMessage } = require("../utils/smsUtils");
const normalizePhoneNumber = require("../utils/normalizePhoneNumber");

async function viewRsvps(messageText, fromNumber) {
  // If user typed something like "rsvp", "rsvps", "view rsvps", etc.
  if (
    [
      "rsvp",
      "rsvps",
      "list rsvps",
      "view rsvp",
      "view rsvps",
      "see rsvp",
      "see rsvps",
      "whoscoming",
      "whoiscoming",
    ].includes(messageText.replace(/[^a-z]/gi, ""))
  ) {
    // 1) Find the user who typed this
    const normalizedPhone = normalizePhoneNumber(fromNumber);
    const theUser = await User.findOne({
      where: { phone: normalizedPhone },
      order: [["createdAt", "DESC"]],
    });
    if (!theUser) throw new Error("User not found for RSVP listing");

    // 2) Find the group IDs where this user is a member
    const groupUsers = await GroupUser.findAll({
      where: { userId: theUser.id },
      attributes: ["groupId"],
    });
    const userGroupIds = groupUsers.map((gu) => gu.groupId);
    if (userGroupIds.length === 0) {
      throw new Error("User is not part of any groups");
    }

    // 3) Find the latest GroupText with contentType 'event' whose groupId is in the user's groups
    const latestGroupText = await GroupText.findOne({
      where: {
        contentType: 'event',
        groupId: { [Op.in]: userGroupIds },
      },
      order: [["createdAt", "DESC"]],
    });
    if (!latestGroupText) {
      throw new Error("No active invitation found for your groups");
    }

    // 4) Fetch all responses for that GroupText
    const responses = await Response.findAll({
      where: { groupTextId: latestGroupText.id },
      include: [
        {
          association: "user", // Must match the 'as' used in the Response->User association
          attributes: ["name", "phone"],
        },
      ],
    });

    if (!responses || responses.length === 0) {
      // No responses yet
      await sendConfirmationMessage(theUser.id, "No one has responded yet.");
      return { status: 200, message: "No RSVPs found" };
    }

    // 5) Map responses to emojis
    const responseEmojis = {
      yes: "🤗",
      no: "🥲",
      maybe: "🤔",
    };

    // Group responses by type
    const groupedResponses = { yes: [], maybe: [], no: [] };
    for (const resp of responses) {
      const responseType = resp.response.toLowerCase();
      const displayName = resp.user.name || resp.user.phone;
      if (groupedResponses[responseType]) {
        groupedResponses[responseType].push(displayName);
      }
    }

    // 6) Build a message
    let responseMessage = "Here are the RSVPs\n";
    ["yes", "maybe", "no"].forEach((type) => {
      if (groupedResponses[type].length > 0) {
        responseMessage += `\n${responseEmojis[type]}\n`;
        responseMessage += groupedResponses[type].join("\n");
        responseMessage += "\n";
      }
    });

    // 7) Send the message
    await sendConfirmationMessage(theUser.id, responseMessage.trim());
    return { status: 200, message: "RSVP list sent to user" };
  }
}

module.exports = viewRsvps;
