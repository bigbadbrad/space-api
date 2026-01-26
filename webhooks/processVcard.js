// /webhooks/processVcard.js

const axios = require("axios");
const VCF = require("vcf");
const { User, Identity, Group, GroupUser } = require("../models");
const normalizePhoneNumber = require("../utils/normalizePhoneNumber");
const { sendUserConfirmationMessage } = require("../utils/smsUtils");

/**
 * processVcard(media, fromNumber)
 * - media: array of objects from Telnyx or your provider with { url, content_type }
 * - fromNumber: the phone number sending the vCard
 *
 * Steps:
 *  1) Find the "hostUser" by fromNumber (the person sending the vCard).
 *  2) For each vCard in media, parse the contact name/phone.
 *  3) Create/find an inviteeUser by cell phone (and set email=null to avoid duplicates).
 *  4) Find earliest Identity for hostUser, then find the 'private-group' for that Identity.
 *  5) Add inviteeUser to the hostUser's private-group via GroupUser.
 *  6) Send a confirmation message to the hostUser.
 */
async function processVcard(media, fromNumber) {
  for (const mediaItem of media) {
    // Only process if it's a vCard
    if (!["text/vcard", "text/x-vcard"].includes(mediaItem.content_type)) {
      continue;
    }

    const vcardUrl = mediaItem.url;
    // Fetch raw vCard data from the URL
    const response = await axios.get(vcardUrl);
    // Parse the vCard
    const card = new VCF().parse(response.data);

    // Extract relevant fields
    const contactName = card.get("fn")?.valueOf() || "Unknown";
    const contactPhoneRaw = card.get("tel")?.valueOf() || null;
    const contactPhone = normalizePhoneNumber(contactPhoneRaw);

    // 1) The host user is the one sending fromNumber
    const hostUser = await User.findOne({ 
      where: { phone: normalizePhoneNumber(fromNumber) } 
    });
    if (!hostUser) {
      throw new Error("Host user not found for incoming vCard");
    }

    // If no phone for the vCard contact, skip
    if (!contactPhone) {
      console.log(`No phone found in vCard for '${contactName}', skipping.`);
      continue;
    }

    // 2) Create/find the inviteeUser record for the shared contact
    //    We explicitly set email: null to avoid collisions with unique email=''
    const [inviteeUser] = await User.findOrCreate({
      where: { phone: contactPhone },
      defaults: { 
        name: contactName, 
        email: null   // ensure we do NOT insert empty string for email
      },
    });

    // 3) Get the earliest Identity for the host user
    const earliestIdentity = await Identity.findOne({
      where: { userId: hostUser.id },
      order: [["createdAt", "ASC"]],
    });
    if (!earliestIdentity) {
      throw new Error("No Identity found for the host user");
    }

    // 4) Find the 'private-group' that belongs to that earliest identity
    const privateGroup = await Group.findOne({
      where: {
        identityId: earliestIdentity.id,
        name: "private-group",
      },
      order: [["createdAt", "ASC"]],
    });
    if (!privateGroup) {
      throw new Error("No 'private-group' found for this user's earliest identity");
    }

    // 5) Link the inviteeUser to that privateGroup
    await GroupUser.findOrCreate({
      where: {
        groupId: privateGroup.id,
        userId: inviteeUser.id,
      },
      // defaults: { role: 'member' },
    });

    console.log(`User '${inviteeUser.name}' added to group '${privateGroup.name}'`);

    // 6) Send a confirmation message to the host user
    await sendUserConfirmationMessage(hostUser.id, `👍`);
  }

  return { status: 200, message: "vCard processed" };
}

module.exports = processVcard;
