// /utils/extractPageHtml.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,1080'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    console.log(`⏳ Loading: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 90000 });
    console.log('✅ Page loaded. Waiting for the dumpster fire to settle...');
    await new Promise(res => setTimeout(res, 5000));

    console.log('🔄 Scrolling page...');
    await autoScroll(page);

    // --- Screenshot videos ---
    console.log('📸 Finding and replacing videos...');
    const videoSelectors = 'div[id*="videowise-player-container"], iframe[src*="videowise"], video';
    const videoElements = await page.$$(videoSelectors);

    for (const elHandle of videoElements) {
        try {
            await elHandle.evaluate(el => el.scrollIntoView({ block: 'center' }));
            await new Promise(res => setTimeout(res, 500));
            const boundingBox = await elHandle.boundingBox();
            if (boundingBox && boundingBox.width > 50 && boundingBox.height > 50) {
                const screenshotBase64 = await page.screenshot({ clip: boundingBox, encoding: 'base64', type: 'jpeg' });
                await elHandle.evaluate((el, src) => {
                    el.innerHTML = `<img src="data:image/jpeg;base64,${src}" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
                }, screenshotBase64);
            }
        } catch (err) { /* Ignore errors */ }
    }
    console.log('👍 Videos replaced.');

    // --- BRUTAL CLEANUP: PART 1 (In Browser DOM) ---
    console.log('🔥 Deleting known garbage from the live page...');
    let dirtyHtml = await page.evaluate((baseUrl) => {
      // Create a kill list of all known garbage selectors
      const selectorsToKill = [
        '.csm-cookie-consent',             // The CORRECT cookie banner
        '#hs-eu-cookie-confirmation',      // Old cookie banner
        '#shopify-section-cart-drawer',    // The "My Cart" drawer
        '#ssloader',                       // Loading spinner
        '#gorgias-chat-container',          // Chat widget
        '#web-pixels-manager-sandbox-container',
        '#swym-plugin',                    // Wishlist plugin
        '#swym-container',
        'div[id*="shopify-block-"]',       // All shopify app blocks
        'style[id="czvdo-global-style"]',  // The specific problematic style tag
        'script',                          // ALL scripts
        'noscript'
      ];
      document.querySelectorAll(selectorsToKill.join(', ')).forEach(el => el.remove());
      
      const toAbsoluteUrl = (url) => {
        if (!url || url.startsWith('data:')) return url;
        try { return new URL(url, baseUrl).href; } catch { return url; }
      };
      document.querySelectorAll('[href]').forEach(el => el.setAttribute('href', toAbsoluteUrl(el.getAttribute('href'))));
      document.querySelectorAll('[src]').forEach(el => el.setAttribute('src', toAbsoluteUrl(el.getAttribute('src'))));

      return `<!DOCTYPE html>\n` + document.documentElement.outerHTML;
    }, url);

    // --- CLEANUP: Remove only unwanted visible elements ---
    console.log('🔥 Applying targeted cleanup...');
    
    // Only remove truly unwanted elements - keep functional CSS
    const cleanupPatterns = [
      // Kill ALL prefetch/preconnect/dns-prefetch links
      /<link\s+rel=["'](?:prefetch|preconnect|dns-prefetch)["'][^>]*>/gi,
      // Kill ANY useless empty style tags
      /<style>\s*<\/style>/gi,
      // Kill any remaining script tags that might have slipped through
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi
    ];

    let cleanHtml = dirtyHtml;
    cleanupPatterns.forEach((pattern, index) => {
      const before = cleanHtml.length;
      cleanHtml = cleanHtml.replace(pattern, '');
      const after = cleanHtml.length;
      if (before !== after) {
        console.log(`🗑️  Pattern ${index + 1} removed ${before - after} characters`);
      }
    });

    // --- TARGETED FIX: Remove only the VISIBLE text problem ---
    console.log('🎯 Removing visible style tag text from body...');
    
    // The issue is the style tag is showing up as VISIBLE TEXT in the body
    // We need to remove it only if it's appearing as text, not as a proper <style> tag
    // Look for the literal text appearing in the body content
    const visibleStyleText = 'style id="czvdo-global-style" type="text/css">.lbx-iframe-show {transition: all .2s ease-out;display:block;}.lbx-iframe-hide {transition: all .2s ease-out;display:none;}</style>';
    
    if (cleanHtml.includes(visibleStyleText)) {
      cleanHtml = cleanHtml.replace(visibleStyleText, '');
      console.log('🎯 Removed visible style text from page content');
    }
    
    console.log('✅ Cleanup complete - functional CSS preserved.');

    const outputDir = path.join(__dirname, '../static/landing-pages');
    const outputPath = path.join(outputDir, `${slug}.html`);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, cleanHtml, 'utf8');
    console.log(`\n✅ Success. Page saved: ${outputPath}`);
    return outputPath;
  } catch (err) {
    console.error('❌ Error:', err.message);
    throw err;
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔚 Browser closed.');
    }
  }
}

module.exports = { extractPageHtml };