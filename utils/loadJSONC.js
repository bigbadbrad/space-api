// /utils/loadJSONC.js
const fs = require('fs');

function loadJSONC(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');

  // remove BOM if present
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  // strip /* block comments */
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');

  // strip // line comments, but don't kill URLs like https:// or paths like C:\\
  // keep the char before // if it's not : or \
  text = text.replace(/(^|[^:\\])\/\/.*$/gm, '$1');

  // NOTE: avoid trailing commas in your JSONC to keep this simple

  return JSON.parse(text);
}

module.exports = loadJSONC;
