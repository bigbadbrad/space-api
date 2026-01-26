// /utils/doubleCardSheet.js
const puppeteer       = require('puppeteer');
const sharp           = require('sharp');
const path            = require('path');
const { PDFDocument } = require('pdf-lib');
const { uploadBuffer } = require('./uploadBuffer');   // 👉 new helper

/* ── 300 DPI constants ── */
const DPI      = 300;
const SHEET_W  = Math.round(8.5 * DPI);  // 2550 px
const SHEET_H  = Math.round(11  * DPI);  // 3300 px

const CARD_W_PORTRAIT  = Math.round(5 * DPI);  // 1500 px
const CARD_H_PORTRAIT  = Math.round(7 * DPI);  // 2100 px
const CARD_W_LANDSCAPE = CARD_H_PORTRAIT;      // 2100 px
const CARD_H_LANDSCAPE = CARD_W_PORTRAIT;      // 1500 px

const MARGIN_Y = Math.round((SHEET_H - CARD_H_LANDSCAPE * 2) / 3); // 100 px
const MARGIN_X = Math.round((SHEET_W - CARD_W_LANDSCAPE)   / 2);   // 225 px

/* crop‑mark spec */
const MARK_LEN   = Math.round(0.25 * DPI); // 75 px
const MARK_THICK = 2;
const MARK_OFF   = 18;

async function generateDoubleCardSheet(slug) {
  const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

  /* 1 ─ screenshot portrait 5×7 */
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1700, height: 2500, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();
  await page.goto(`${FRONTEND_URL}/card/${slug}/magazine-print`, {
    waitUntil: 'networkidle0',
  });

  const cardEl = await page.$('#cardScreenshot');
  if (!cardEl) {
    await browser.close();
    throw new Error('#cardScreenshot not found');
  }
  const portraitPng = await cardEl.screenshot({ type: 'png' });
  await browser.close();

  /* 2 ─ rotate to landscape */
  const landscapePng = await sharp(portraitPng)
    .rotate(90)
    .resize(CARD_W_LANDSCAPE, CARD_H_LANDSCAPE, { fit: 'cover' })
    .png()
    .toBuffer();

  /* 3 ─ compose on 8½×11″ canvas */
  const comps = [
    { input: landscapePng, left: MARGIN_X, top: MARGIN_Y },
    { input: landscapePng, left: MARGIN_X, top: MARGIN_Y * 2 + CARD_H_LANDSCAPE },
  ];

  /* crop lines */
  const hLine = await sharp({
    create: { width: MARK_LEN, height: MARK_THICK, channels: 3, background: '#000' },
  }).png().toBuffer();
  const vLine = await sharp({
    create: { width: MARK_THICK, height: MARK_LEN, channels: 3, background: '#000' },
  }).png().toBuffer();

  const cutYs = [
    MARGIN_Y,
    MARGIN_Y + CARD_H_LANDSCAPE,
    MARGIN_Y * 2 + CARD_H_LANDSCAPE,
    MARGIN_Y * 2 + CARD_H_LANDSCAPE * 2,
  ];
  const cutXs = [MARGIN_X, MARGIN_X + CARD_W_LANDSCAPE];

  cutYs.forEach((y) => {
    comps.push(
      { input: hLine, left: MARK_OFF,                     top: y },
      { input: hLine, left: SHEET_W - MARK_OFF - MARK_LEN, top: y },
    );
  });
  cutXs.forEach((x) => {
    comps.push(
      { input: vLine, left: x, top: MARK_OFF },
      { input: vLine, left: x, top: SHEET_H - MARK_OFF - MARK_LEN },
    );
  });

  const sheetPng = await sharp({
    create: { width: SHEET_W, height: SHEET_H, channels: 3, background: '#FFF' },
  })
    .composite(comps)
    .png()
    .toBuffer();

  /* 4 ─ PNG → single‑page PDF */
  const pdfDoc = await PDFDocument.create();
  const pdfPage = pdfDoc.addPage([SHEET_W, SHEET_H]);
  const pngRef  = await pdfDoc.embedPng(sheetPng);
  pdfPage.drawImage(pngRef, { x: 0, y: 0, width: SHEET_W, height: SHEET_H });
  const pdfBuf = await pdfDoc.save();

  /* 5 ─ upload to S3 */
  const s3Key = path.posix.join('card-sheets', `${slug}-portrait-double-5x7.pdf`);
  const pdfUrl = await uploadBuffer(pdfBuf, s3Key, 'application/pdf');

  return pdfUrl;
}

module.exports = { generateDoubleCardSheet };
