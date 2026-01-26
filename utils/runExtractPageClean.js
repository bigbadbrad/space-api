const { extractPageHtml } = require('./extractPageClean');

async function main() {
  const [,, url, slug] = process.argv;
  if (!url || !slug) {
    console.log('Usage: node runExtractPageClean.js <url> <slug>');
    process.exit(1);
  }
  try {
    const outputPath = await extractPageHtml(url, slug);
    console.log(`\n✅ Extraction complete. Output: ${outputPath}`);
  } catch (err) {
    console.error('❌ Extraction failed:', err);
    process.exit(1);
  }
}

main(); 