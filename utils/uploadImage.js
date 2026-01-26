// utils/uploadImage.js
const sharp = require('sharp');
const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const s3 = new AWS.S3();

async function uploadImage(file, folder = 'businesses', resizeWidth = 600) {
  if (!file) return null;

  const ext = file.originalname.split('.').pop().toLowerCase();
  const key = `${folder}/${Date.now()}_${file.originalname}`;

  let transformer = sharp(file.buffer).resize({ width: resizeWidth });

  switch (ext) {
    case 'png':
      transformer = transformer.png();
      break;
    case 'webp':
      transformer = transformer.webp();
      break;
    case 'jpeg':
    case 'jpg':
      transformer = transformer.jpeg({ quality: 80 });
      break;
    default:
      transformer = transformer.jpeg({ quality: 80 }); // fallback
  }

  const buffer = await transformer.toBuffer();

  const uploadRes = await s3.upload({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: file.mimetype,   // ✅ Preserve correct content-type (png, jpeg, etc.)
  }).promise();

  return uploadRes.Location;
}

module.exports = { uploadImage };
