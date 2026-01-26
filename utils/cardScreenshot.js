// /utils/cardScreenshot.js

const { Business, Website } = require('../models');
const puppeteer = require('puppeteer');
const AWS = require('aws-sdk');

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const s3 = new AWS.S3();

/**
 * generateCardScreenshotPDF(slug)
 * --------------------------------------------
 * • Renders https://textsite.co/card/:slug
 * • Captures full-page PDF (8.5x11 portrait)
 * • Uploads to S3 and stores URL in Website.card_pdf_url
 */
async function generateCardScreenshotPDF(slug) {
  const business = await Business.findOne({
    where: { slug },
    include: [{ model: Website }],
  });

  if (!business || !business.Website) throw new Error('Business or Website not found');

  const cardUrl = `https://textsite.co/card/${slug}`;
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: await puppeteer.executablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();

    // Set viewport to match 8.5x11 at 300 DPI (2550x3300)
    await page.setViewport({ width: 2550, height: 3300 });
    await page.goto(cardUrl, { waitUntil: 'networkidle2' });

    // Generate PDF (300 DPI, no margins)
    const pdfBuffer = await page.pdf({
      width: '8.5in',
      height: '11in',
      printBackground: true,
      margin: {
        top: '0in',
        bottom: '0in',
        left: '0in',
        right: '0in',
      },
    });

    const key = `card-pdfs/${slug}_${Date.now()}.pdf`;
    const { Location } = await s3.upload({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }).promise();

    await business.Website.update({ card_pdf_url: Location });
    return Location;
  } finally {
    await browser.close();
  }
}

module.exports = { generateCardScreenshotPDF };
