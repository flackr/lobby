chrome.app.runtime.onLaunched.addListener(function() {
  chrome.app.window.create('index.html', {
    width: 700,
    height: 600,
    minWidth: 500,
    minHeight: 400,
  });
});
