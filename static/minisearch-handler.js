// MiniSearch static search handler
(function(){
  // Wait for MiniSearch to be loaded
  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }
  ready(async function(){
    var script = document.currentScript || (function(){
      var scripts = document.getElementsByTagName('script');
      return scripts[scripts.length-1];
    })();
    var indexFile = script.getAttribute('data-index');
    if (!window.MiniSearch || !indexFile) return;
    // Load the index
    const res = await fetch(indexFile);
    const indexJson = await res.text();
    const miniSearch = window.MiniSearch.loadJSON(indexJson, { fields: ["title", "description"], storeFields: ["title", "url", "description"] });
    // Find the search input
    var input = document.querySelector('input[type=search], input[placeholder*="earch" i], input[id*="earch" i], input[class*="earch" i]');
    if (!input) return;
    // Create results dropdown
    var resultsDiv = document.createElement('div');
    resultsDiv.style.position = 'absolute';
    resultsDiv.style.background = '#fff';
    resultsDiv.style.border = '1px solid #ccc';
    resultsDiv.style.zIndex = 9999;
    resultsDiv.style.width = (input.offsetWidth || 300) + 'px';
    resultsDiv.style.maxHeight = '300px';
    resultsDiv.style.overflowY = 'auto';
    resultsDiv.style.display = 'none';
    resultsDiv.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
    input.parentNode.appendChild(resultsDiv);
    function showResults(results) {
      if (!results.length) { resultsDiv.style.display = 'none'; return; }
      resultsDiv.innerHTML = results.map(function(r){ return '<div style="padding:8px;cursor:pointer" tabindex="0" onmousedown="window.location.href=\'' + r.url + '\'">' + r.title + '</div>'; }).join('');
      var rect = input.getBoundingClientRect();
      resultsDiv.style.left = rect.left + 'px';
      resultsDiv.style.top = (rect.bottom + window.scrollY) + 'px';
      resultsDiv.style.display = 'block';
    }
    input.addEventListener('input', function(e){
      var val = input.value.trim();
      if (!val) { resultsDiv.style.display = 'none'; return; }
      var results = miniSearch.search(val, { prefix: true, fuzzy: 0.2 });
      showResults(results.slice(0,10));
    });
    input.addEventListener('blur', function(){ setTimeout(function(){resultsDiv.style.display='none';}, 200); });
    if (input.form) {
      input.form.addEventListener('submit', function(e){
        var val = input.value.trim();
        if (!val) return;
        var results = miniSearch.search(val, { prefix: true, fuzzy: 0.2 });
        if (results.length) { window.location.href = results[0].url; e.preventDefault(); }
      });
    }
  });
})(); 