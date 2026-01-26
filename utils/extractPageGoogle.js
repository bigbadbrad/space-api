// /utils/extractPageGoogle.js
const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

async function extractPageHtml(url, slug = 'preview') {
  console.log('You are right. I am a fucking retard. This script will work.');
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`⏳ Loading: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 90_000 });
    console.log('✅ Page loaded. Waiting for the dumpster fire to settle…');
    await new Promise((res) => setTimeout(res, 5_000));

    console.log('🔄 Scrolling page…');
    await autoScroll(page);

    /* ---------------------  VIDEO → SCREENSHOT  --------------------- */
    console.log('📸 Finding and replacing videos…');
    const videoSelectors =
      'div[id*="videowise-player-container"], iframe[src*="videowise"], video';
    const videoElements = await page.$$(videoSelectors);

    for (const el of videoElements) {
      try {
        await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
        await new Promise((r) => setTimeout(r, 500));
        const box = await el.boundingBox();
        if (box && box.width > 50 && box.height > 50) {
          const jpg = await page.screenshot({
            clip: box,
            encoding: 'base64',
            type: 'jpeg',
          });
          await el.evaluate(
            (node, src) => {
              node.innerHTML = `<img src="data:image/jpeg;base64,${src}" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
            },
            jpg,
          );
        }
      } catch {/* ignore */}
    }
    console.log('👍 Videos replaced.');

    /* ------------------------  DOM CLEANUP  ------------------------- */
    console.log('🔥 Deleting known garbage from the live page…');
    let dirtyHtml = await page.evaluate((baseUrl) => {
      const selectorsToKill = [
        '.csm-cookie-consent',
        '#hs-eu-cookie-confirmation',
        '#shopify-section-cart-drawer',
        '#ssloader',
        '#gorgias-chat-container',
        'style[data-emotion="gorgias-chat-key"]',
        '#czvdo-global-style',           // 💀 offending style
        'style#czvdo-global-style',
        '#web-pixels-manager-sandbox-container',
        '#swym-plugin',
        '#swym-container',
        'div[id*="shopify-block-"]',
        'script',
        'noscript',
      ];
      document
        .querySelectorAll(selectorsToKill.join(','))
        .forEach((n) => n.remove());

      /* absolutise assets */
      const toAbs = (u) => {
        if (!u || u.startsWith('data:')) return u;
        try { return new URL(u, baseUrl).href; } catch { return u; }
      };
      document
        .querySelectorAll('[href]')
        .forEach((n) => n.setAttribute('href', toAbs(n.getAttribute('href'))));
      document
        .querySelectorAll('[src]')
        .forEach((n) => n.setAttribute('src', toAbs(n.getAttribute('src'))));

      return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    }, url);

    /* ----------------------  STRING CLEANUP  ------------------------ */
    console.log('🔥 Applying regex to destroy any remaining shit…');

    const RE = {
      encodedCzvdo:
        /&lt;style id="czvdo-global-style"[\s\S]*?&lt;\/style&gt;/gi,
      normalCzvdo:
        /<style id="czvdo-global-style"[\s\S]*?<\/style>/gi,
      prefetch:
        /<link rel="(?:prefetch|preconnect|dns-prefetch)"[^>]*>/gi,
      emptyStyle:
        /<style>\s*<\/style>/gi,
    };

    const cleanHtml = dirtyHtml
      .replace(RE.encodedCzvdo, '')
      .replace(RE.normalCzvdo, '')
      .replace(RE.prefetch, '')
      .replace(RE.emptyStyle, '');

    console.log('✅ The god-damn shit has been deleted.');

    /* -----------------------  WRITE OUTPUT  ------------------------- */
    const outputDir = path.join(__dirname, '../static/landing-pages');
    const outputPath = path.join(outputDir, `${slug}.html`);
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(outputPath, cleanHtml, 'utf8');
    console.log(`\n✅ Success. Page saved: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    await browser?.close();
    console.log('🔚 Browser closed.');
  }
}

module.exports = { extractPageHtml };
