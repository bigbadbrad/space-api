// /utils/extractPageHtml.js
const puppeteer = require('puppeteer');
const fs        = require('fs');
const path      = require('path');

/* ─ helpers ─ */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function autoScroll(page) {
  await page.evaluate(
    () =>
      new Promise((res) => {
        const step = 400;
        let pos = 0;
        const t = setInterval(() => {
          const { scrollHeight } = document.body;
          window.scrollBy(0, step);
          pos += step;
          if (pos >= scrollHeight) {
            clearInterval(t);
            res();
          }
        }, 250);
      }),
  );
}

/* ─ main ─ */
async function extractPageHtml(url, slug = 'preview') {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1920,1080',
    ],
  });

  /* ─ capture every .mp4 requested ─ */
  const clipIds = new Set(); // basename without ".mp4"
  await (async () => {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (/\.mp4(\?|$)/i.test(u)) {
        const base = u.split('/').pop().split('.mp4')[0]; // strip .mp4
        clipIds.add(base.replace(/_h264c$/i, ''));         // remove _h264c
        console.log('🎥  MP4:', base);
      }
      req.continue();
    });
    await page.close(); // just to attach listener early
  })();

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 });

    await autoScroll(page);
    await sleep(6000); // lazy loaders

    // Wait for <video> elements to appear (up to 10 seconds)
    try {
      await page.waitForSelector('video', {timeout: 10000});
      console.log('DEBUG: <video> element(s) appeared on the page.');
    } catch (e) {
      console.log('DEBUG: No <video> elements appeared after waiting.');
    }

    /* force hidden Videowise iframes visible */
    await page.addStyleTag({
      content:
        '.lbx-iframe-hide{display:block!important;opacity:1!important} .lbx-iframe-show{opacity:1!important}',
    });

    /* 1️⃣  tag every video widget we must freeze */
    const tagCount = await page.evaluate(() => {
      let idx = 0;
      document.querySelectorAll('.reeview-app-widget').forEach((el) => {
        el.setAttribute('data-freeze-target', `vw-${idx++}`);
      });
      return idx;
    });
    console.log(`🔎  Freeze targets tagged: ${tagCount}`);

    const targets = await page.$$('[data-freeze-target]');
    console.log(`🔍  Handles retrieved     : ${targets.length}`);

    const vpH = await page.evaluate(() => innerHeight);
    let replaced = 0;

    // Debug: Log number of <video> and <iframe> elements on the main page
    const debugVideoAndIframes = await page.evaluate(() => {
      const videos = document.querySelectorAll('video');
      const iframes = document.querySelectorAll('iframe');
      return {
        videoCount: videos.length,
        iframeCount: iframes.length,
        iframeSrcs: Array.from(iframes).map(f => f.src)
      };
    });
    console.log(`DEBUG: <video> count on main page: ${debugVideoAndIframes.videoCount}`);
    console.log(`DEBUG: <iframe> count on main page: ${debugVideoAndIframes.iframeCount}`);
    if (debugVideoAndIframes.iframeCount > 0) {
      for (let i = 0; i < debugVideoAndIframes.iframeSrcs.length; i++) {
        try {
          const frame = page.frames().find(f => f.url() === debugVideoAndIframes.iframeSrcs[i]);
          if (frame) {
            const frameVideoCount = await frame.evaluate(() => document.querySelectorAll('video').length);
            console.log(`DEBUG: <video> count in iframe[${i}] (${debugVideoAndIframes.iframeSrcs[i]}): ${frameVideoCount}`);
          } else {
            console.log(`DEBUG: Could not access iframe[${i}] (${debugVideoAndIframes.iframeSrcs[i]})`);
          }
        } catch (err) {
          console.log(`DEBUG: Error accessing iframe[${i}]: ${err.message}`);
        }
      }
    }

    // Log all elements with 'video' in tag, class, or id
    const videoLikeElements = await page.evaluate(() => {
      const matches = [];
      const all = document.querySelectorAll('*');
      all.forEach(el => {
        const tag = el.tagName.toLowerCase();
        const cls = (typeof el.className === 'string') ? el.className.toLowerCase() : '';
        const id = (typeof el.id === 'string') ? el.id.toLowerCase() : '';
        if (tag.includes('video') || cls.includes('video') || id.includes('video')) {
          matches.push({
            tag,
            class: el.className,
            id: el.id,
            outer: el.outerHTML.slice(0, 300) // first 300 chars for brevity
          });
        }
      });
      return matches;
    });
    console.log(`DEBUG: Found ${videoLikeElements.length} elements with 'video' in tag, class, or id.`);
    videoLikeElements.forEach((el, i) => {
      console.log(`  [${i}] <${el.tag}> id='${el.id}' class='${el.class}'\n    ${el.outer.replace(/\n/g, ' ')}`);
    });

    for (let i = 0; i < targets.length; i++) {
      const el = targets[i];
      try {
        // Deep inspection: log children and shadow roots
        const inspection = await el.evaluate((node) => {
          const info = {
            tag: node.tagName,
            class: node.className,
            id: node.id,
            children: [],
            shadowRoot: null
          };
          
          // Check for shadow root
          if (node.shadowRoot) {
            info.shadowRoot = {
              children: Array.from(node.shadowRoot.children).map(child => ({
                tag: child.tagName,
                class: child.className,
                id: child.id
              }))
            };
          }
          
          // Log direct children
          Array.from(node.children).forEach(child => {
            info.children.push({
              tag: child.tagName,
              class: child.className,
              id: child.id,
              hasChildren: child.children.length > 0
            });
          });
          
          return info;
        });
        
        console.log(`DEBUG: Container #${i + 1} inspection:`, JSON.stringify(inspection, null, 2));
        
        await el.evaluate((n) => n.scrollIntoView({ block: 'center' }));
        await sleep(600);

        let box = await el.boundingBox();
        if (!box || box.width < 50 || box.height < 50) {
          console.log(`  • Skip tiny/hidden #${i + 1}`);
          continue;
        }

        if (box.y + box.height > vpH) {
          await page.evaluate(
            (extra) => scrollBy(0, extra),
            box.y + box.height - vpH + 20,
          );
          await sleep(300);
          box = await el.boundingBox();
          if (!box) continue;
        }

        const jpeg64 = await page.screenshot({
          clip: box,
          type: 'jpeg',
          quality: 82,
          encoding: 'base64',
        });

        await el.evaluate((node, src) => {
          const img = document.createElement('img');
          img.src = `data:image/jpeg;base64,${src}`;
          img.style.cssText =
            'width:100%;height:auto;display:block;object-fit:cover;';
          node.replaceWith(img);
        }, jpeg64);

        replaced += 1;
        console.log(
          `  ✓ Replaced #${i + 1} (${Math.round(box.width)}×${Math.round(
            box.height,
          )})`,
        );
      } catch (err) {
        console.log(`  • Error on #${i + 1}: ${err.message}`);
      }
    }

    console.log(`🖼️  Total stills created: ${replaced}`);

    /* 2️⃣  scrub DOM – czvdo style nuked live */
    const raw = await page.evaluate((base) => {
      const kill = [
        '#czvdo-global-style',
        'style#czvdo-global-style',
        '.csm-cookie-consent',
        '#hs-eu-cookie-confirmation',
        '#shopify-section-cart-drawer',
        '#ssloader',
        '#gorgias-chat-container',
        'style[data-emotion="gorgias-chat-key"]',
        '#web-pixels-manager-sandbox-container',
        '#swym-plugin',
        '#swym-container',
        'div[id*="shopify-block-"]',
        'script',
        'noscript',
      ];
      kill.forEach((sel) => {
        document.querySelectorAll(sel).forEach((n) => n.remove());
      });

      const abs = (u) => {
        if (!u || u.startsWith('data:')) return u;
        try { return new URL(u, base).href; } catch { return u; }
      };
      document.querySelectorAll('[src]').forEach((n) =>
        n.setAttribute('src', abs(n.getAttribute('src'))),
      );
      document.querySelectorAll('[href]').forEach((n) =>
        n.setAttribute('href', abs(n.getAttribute('href'))),
      );

      return '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    }, url);

    /* 3️⃣ regex scrub – ensure czvdo style (encoded or literal) is gone */
    const clean = raw
      .replace(/<style id="czvdo-global-style"[\s\S]*?<\/style>/gi, '')
      .replace(/&lt;style id="czvdo-global-style"[\s\S]*?&lt;\/style&gt;/gi, '')
      .replace(/<link rel="(?:prefetch|preconnect|dns-prefetch)"[^>]*>/gi, '')
      .replace(/<style>\s*<\/style>/gi, '');

    /* 4️⃣ write */
    const outDir = path.join(__dirname, '../static/landing-pages');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `${slug}.html`);
    fs.writeFileSync(outFile, clean, 'utf8');
    console.log(`✅  Saved → ${outFile}`);
    return outFile;
  } catch (err) {
    console.error('❌  extractPageHtml error:', err.message);
    throw err;
  } finally {
    await browser.close();
    console.log('🔚  Browser closed.');
  }
}

module.exports = { extractPageHtml };
