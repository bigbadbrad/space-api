/******************************
 * File: /utils/splitMidJourneyImage.js
 ******************************/
const sharp = require('sharp');
const axios = require('axios');
const AWS = require('aws-sdk');
require('dotenv').config();

// Configure AWS S3
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

/**
 * Splits a MidJourney composite image (2x2 grid) into four individual images,
 * resizes them, and uploads each to S3. Returns an array of the S3 URLs.
 *
 * @param {string} imageUrl - The URL of the composite image (4-up from MidJourney).
 * @returns {Promise<string[]>} - Array of S3 URLs for the extracted quadrant images.
 */
async function splitMidJourneyImage(imageUrl) {
  try {
    // Download the composite image from the given URL
    const response = await axios({
      url: imageUrl,
      method: 'GET',
      responseType: 'arraybuffer',
    });
    const imageBuffer = Buffer.from(response.data);

    // Retrieve the image dimensions
    const { width, height } = await sharp(imageBuffer).metadata();
    if (!width || !height) {
      throw new Error('Unable to retrieve image metadata');
    }

    // Calculate the dimensions of each quadrant
    const quadrantWidth = Math.floor(width / 2);
    const quadrantHeight = Math.floor(height / 2);

    // Define regions for each quadrant (top-left, top-right, bottom-left, bottom-right)
    const regions = [
      { name: '1', left: 0, top: 0 }, 
      { name: '2', left: quadrantWidth, top: 0 }, 
      { name: '3', left: 0, top: quadrantHeight }, 
      { name: '4', left: quadrantWidth, top: quadrantHeight },
    ];

    const uploadedUrls = [];

    // For each quadrant: extract, resize, upload to S3
    for (const region of regions) {
      // Extract the quadrant
      const quadrantBuffer = await sharp(imageBuffer)
        .extract({
          left: region.left,
          top: region.top,
          width: quadrantWidth,
          height: quadrantHeight,
        })
        .resize({ width: 600 })     // Reduce size as in postRoutes
        .jpeg({ quality: 80 })      // Compress
        .toBuffer();

      // Upload to S3
      const fileName = `mj-quadrants/${Date.now()}_${region.name}.jpg`;
      const s3Result = await s3
        .upload({
          Bucket: process.env.S3_BUCKET_NAME,
          Key: fileName,
          Body: quadrantBuffer,
          ContentType: 'image/jpeg',
        })
        .promise();

      uploadedUrls.push(s3Result.Location);

      console.log(`Saved quadrant ${region.name} to S3 at: ${s3Result.Location}`);
    }

    return uploadedUrls; // Return the S3 URLs of the extracted images
  } catch (error) {
    console.error('Error splitting the MidJourney composite image:', error);
    throw error;
  }
}

module.exports = { splitMidJourneyImage };
