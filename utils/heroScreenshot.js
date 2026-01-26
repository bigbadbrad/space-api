// /utils/heroScreenshot.js

/**
 * generateHeroScreenshot(slug)
 * --------------------------------------------
 * • Opens https://textsite.co/hero/:slug
 * • Captures #heroScreenshot at 1280×720
 * • Compresses to ≤ 400 KB JPEG
 * • Uploads to S3 and stores URL in Website.text_image_url
 * • Returns the S3 URL
 */
const { Business, Website } = require('../models');
const puppeteer = require('puppeteer');
const sharp = require('sharp');
const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const s3 = new AWS.S3();

async function generateHeroScreenshot(slug) {
  const business = await Business.findOne({
    where: { slug },
    include: [{ model: Website }],
  });
  if (!business || !business.Website) {
    throw new Error('Business or Website not found');
  }

  const heroUrl = `https://650.dog/hero/${slug}`;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: await puppeteer.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.goto(heroUrl, { waitUntil: 'networkidle2' });

    // Ensure web fonts have finished loading
    await page.evaluateHandle('document.fonts.ready');

    // Disable transitions and animations
    await page.addStyleTag({
      content: `* { transition: none !important; animation: none !important; }`,
    });

    // Allow any remaining layout/hydration to finish
    if (typeof page.waitForTimeout === 'function') {
      await page.waitForTimeout(1000);
    } else {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const element = await page.$('#heroScreenshot');
    if (!element) throw new Error('Element #heroScreenshot not found');

    const raw = await element.screenshot({ type: 'jpeg' });

    let quality = 80;
    let output = await sharp(raw)
      .resize({ width: 1280, height: 720 })
      .jpeg({ quality })
      .toBuffer();

    while (output.length > 400 * 1024 && quality > 40) {
      quality -= 5;
      output = await sharp(raw)
        .resize({ width: 1280, height: 720 })
        .jpeg({ quality })
        .toBuffer();
    }

    const key = `hero-images/${slug}_${Date.now()}.jpg`;
    const { Location } = await s3
      .upload({
        Bucket: process.env.S3_BUCKET_NAME,
        Key: key,
        Body: output,
        ContentType: 'image/jpeg',
      })
      .promise();

    const website = await Website.findOne({ where: { business_id: business.id } });
    if (website && website.text_image_url !== Location) {
      website.text_image_url = Location;
      await website.save();
      console.log('✅ Website updated with new screenshot URL');
    } else {
      console.log('⚠️ Skipped update: text_image_url was unchanged');
    }
    return Location;
  } finally {
    await browser.close();
  }
}

module.exports = { generateHeroScreenshot };
