// /messages/viewPhotos.js

const { User, Appointment, Image , Business } = require("../models");
const {
  sendPhotosMessage,
  sendConfirmationMessage,
} = require("../utils/smsUtils");
const {
  getPhotoOffset,
  setPhotoOffset,
} = require("../utils/photoPaginationUtils");

/**
 * Entry point for “photos” — show first page of images
 */
async function viewPhotos(fromNumber) {
  return await viewPhotosWithOffset(fromNumber, 0, true);
}

/**
 * Entry point for “more” — show next page of images
 */
async function viewMorePhotos(fromNumber) {
  const { user, businessId } = await getUserAndBusiness(fromNumber);

  if (!user || !businessId) {
    if (user) {
      await sendConfirmationMessage(
        user.id,
        "No business found or user not found."
      );
    }
    return { status: 200, message: "No business/user found" };
  }

  const currentOffset = await getPhotoOffset(user.phone, businessId);
  if (currentOffset === null) {
    await sendConfirmationMessage(user.id, "Please type 'photos' first.");
    return { status: 200, message: "No initial request made" };
  }

  return await viewPhotosWithOffset(fromNumber, currentOffset, false);
}

/**
 * Core logic that fetches and sends images at a given offset
 */
async function viewPhotosWithOffset(fromNumber, offset, isInitial) {
  try {
    const { user, businessId } = await getUserAndBusiness(fromNumber);
    if (!user || !businessId) {
      if (user) {
        await sendConfirmationMessage(user.id, "No business found.");
      }
      return { status: 200, message: "No business found for user" };
    }

    // Grab the business record so we can interpolate its name
    const business = await Business.findByPk(businessId);
    const bizName = business?.name || "Your Business";

    // fetch up to 5 images, descending by creation date
    const images = await Image.findAll({
      where: { businessId },
      limit: 5,
      offset,
      order: [["createdAt", "DESC"]],
    });

    if (images.length === 0) {
      if (isInitial) {
        await sendConfirmationMessage(
          user.id,
          "No photos available for this business."
        );
        return { status: 200, message: "No photos to send" };
      } else {
        await sendConfirmationMessage(user.id, "No more photos.");
        return { status: 200, message: "No more photos" };
      }
    }

    // build MMS payload
    const { text, imageUrls } = buildPhotoList(bizName, images);
    const messageText = `${text}\n\nReply 'more' to see more photos.`;
    await sendPhotosMessage(user.id, messageText, imageUrls);

    // advance offset for next “more”
    await setPhotoOffset(user.phone, businessId, offset + images.length);

    return { status: 200, message: "Photos sent to user" };
  } catch (error) {
    console.error("Error fetching photos:", error);
    return { status: 500, message: "Error fetching photos" };
  }
}

/**
 * Find the User by phone, then grab their latest Appointment → businessId
 */
async function getUserAndBusiness(fromNumber) {
  const user = await User.findOne({
    where: { phone: fromNumber },
  });
  if (!user) return { user: null, businessId: null };

  const latestAppt = await Appointment.findOne({
    where: { user_id: user.id },
    order: [["createdAt", "DESC"]],
  });
  if (latestAppt) {
    return { user, businessId: latestAppt.business_id };
  }

  // fallback: no appointment (owner case, optional)
  const biz = await Business.findOne({
    where: { user_id: user.id },
    order: [["createdAt", "DESC"]],
  });
  return { user, businessId: biz?.id || null };
}

/**
 * Convert an array of Image instances into MMS text & URL array
 */
function buildPhotoList(businessName, images) {
  const responseMessage = `${businessName} Photo Gallery`;
  const imageUrls = images.map((img) => img.url);
  return { text: responseMessage, imageUrls };
}

module.exports = { viewPhotos, viewMorePhotos };
