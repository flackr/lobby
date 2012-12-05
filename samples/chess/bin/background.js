chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('index.html?lobby=zymurgy.wat.corp.google.com:9999', {
    width: 800,
    height: 600,
    minWidth: 200,
    minHeight: 200,
  });
});
