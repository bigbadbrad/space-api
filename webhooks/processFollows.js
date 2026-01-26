// /webhooks/processFollows.js
const { User, Identity, Group, GroupUser } = require("../models");
const normalizePhoneNumber = require("../utils/normalizePhoneNumber");
const {
  sendConfirmationMessage,
  sendSmsToNumber,
  sendMmsToUser
} = require("../utils/smsUtils");
const {
  sendIntroMessage,
  sendVCard
} = require("../services/introductionService");

/**
 * processFollows(messageText, fromNumber)
 * - If message is "join", "sign up", "signup" => sign up user if not exist => send intro
 * - If message starts with "follow"/"join"/"unfollow" (with or without @),
 *   => parse handle => add/remove user from identity’s public-group
 */
async function processFollows(messageText, fromNumber) {
  try {
    // 1) Trim and normalize spacing
    const fullText = messageText.trim();
    // Also, create a version with no spaces for quick comparisons
    const lowerTextNoSpaces = fullText.toLowerCase().replace(/\s+/g, "");

    // A) Check for simple "join" / "signup"
    if (
      lowerTextNoSpaces === "join" ||
      lowerTextNoSpaces === "signup" ||
      lowerTextNoSpaces === "signup"  // (typo repeated: "signup")
    ) {
      const normalized = normalizePhoneNumber(fromNumber);

      // Check if user already exists
      const user = await User.findOne({ where: { phone: normalized } });
      if (user) {
        // User already signed up
        await sendConfirmationMessage(
          user.id,
          "You are already signed up! Enjoy the Group Text service."
        );
        return { status: 200, message: "User already signed up." };
      }

      // Create new user if not found
      const newUser = await findOrCreateUser(fromNumber);

      // Send intro message only for new users
      await sendIntroMessage(newUser.id, null);
      await new Promise(r => setTimeout(r, 300));
      await sendVCard(newUser.id);
      return { status: 200, message: "New user signed up with no handle." };
    }

    // B) Possibly "follow"/"join"/"unfollow" with extra words
    //    e.g. "follow funfacts", "follow fun facts", "unfollow @funfacts"
    // 2) Split on whitespace
    const parts = fullText.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const firstWord = parts[0].toLowerCase();
      if (["follow", "join", "unfollow"].includes(firstWord)) {
        // This is our command
        const command = firstWord;

        // Combine EVERYTHING after the first word into the handle
        // Remove any leading '@'
        const remainingWords = parts.slice(1).join("");
        const handle = remainingWords.replace(/^@/, "").toLowerCase();

        // If we have a handle, do the DB logic
        if (handle) {
          return await processFollowUnfollow(command, handle, fromNumber);
        }
      }
    }

    // If none matched, do nothing special
    return {
      status: 200,
      message: "No recognized follow/join/unfollow command",
    };
  } catch (err) {
    console.error("Error in processFollows:", err);
    return { status: 500, message: `Error: ${err.message}` };
  }
}

/**
 * Actually do the follow/unfollow logic once we know the command + handle.
 */
async function processFollowUnfollow(command, handle, fromNumber) {
  // 1) Check if handle (identity) exists
  const identity = await Identity.findOne({ where: { handle } });
  if (!identity) {
    await sendSmsToNumber(
      fromNumber,
      `Sorry, the handle @${handle} does not exist.`
    );
    return { status: 200, message: `Handle @${handle} not found.` };
  }

  // 2) find or create user
  const [user, created] = await User.findOrCreate({
    where: { phone: normalizePhoneNumber(fromNumber) },
    defaults: {
      phone: normalizePhoneNumber(fromNumber),
      email: null,
      name: "",
      password: "",
    },
  });

  // If brand new user, do the intro + vCard
  if (created) {
    await sendIntroMessage(user.id, null);
    await new Promise(r => setTimeout(r, 300));
    await sendVCard(user.id);
    await new Promise(r => setTimeout(r, 1000));
  }

  // 3) find or create identity's 'public-group'
  let group = await Group.findOne({
    where: {
      identityId: identity.id,
      name: "public-group",
    },
  });
  if (!group) {
    group = await Group.create({
      identityId: identity.id,
      name: "public-group",
      type: "open",
      contentPolicy: "Anyone can post",
    });
  }

  // 4) If "unfollow", remove the user
  if (command === "unfollow") {
    const destroyed = await GroupUser.destroy({
      where: {
        groupId: group.id,
        userId: user.id,
      },
    });
    if (destroyed) {
      await sendConfirmationMessage(
        user.id,
        `You have unfollowed @${handle}.`
      );
      return { status: 200, message: `User unfollowed @${handle}` };
    } else {
      await sendConfirmationMessage(
        user.id,
        `You were not following @${handle}, so nothing to do.`
      );
      return {
        status: 200,
        message: `User was not in group for @${handle}.`,
      };
    }
  }

  // 5) Otherwise "follow" or "join"
  await GroupUser.findOrCreate({
    where: { groupId: group.id, userId: user.id },
  });

  const msg = `You are now following @${handle}`;
  const imageUrl = identity.profileImageUrl || identity.avatarImageUrl || null;

  if (imageUrl) {
    await sendMmsToUser(user.id, msg, imageUrl);
  } else {
    await sendConfirmationMessage(user.id, msg);
  }

  return {
    status: 200,
    message: `User joined public-group of @${handle}`,
  };
}

/**
 * findOrCreateUser(fromNumber)
 * Helper that ensures there's a user record for the given fromNumber
 */
async function findOrCreateUser(fromNumber) {
  const normalized = normalizePhoneNumber(fromNumber);
  const [user] = await User.findOrCreate({
    where: { phone: normalized },
    defaults: {
      phone: normalized,
      email: null,
      name: "",
      password: "",
    },
  });
  return user;
}

module.exports = processFollows;
