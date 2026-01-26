// /utils/uploadBuffer.js
const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

/**
 * Upload any buffer to S3.
 * @param {Buffer} buffer          – content to upload
 * @param {string} key             – full S3 key  e.g. "card-sheets/foo.pdf"
 * @param {string} contentType     – MIME type    e.g. "application/pdf"
 * @returns {string} url           – public S3 URL
 */
async function uploadBuffer(buffer, key, contentType) {
  const { Location } = await s3
    .upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
    .promise();

  return Location;
}

module.exports = { uploadBuffer };
