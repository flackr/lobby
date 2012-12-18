var openConnections = {};

var nextId = 0;

chrome.app.runtime.onLaunched.addListener(function() {
  var callback = function(appWnd) {
    appWnd.onClosed.addListener(function(){
      closeSockets(appWnd.id);
    });
    appWnd.contentWindow.wrapperId = appWnd.id;
  };
  chrome.app.window.create('index.html', {
    width: 700,
    height: 600,
    minWidth: 500,
    minHeight: 400,
    id: ''+(nextId++),
  }, callback);

});

function addSocketConnection(windowId, socketId) {
  console.log('adding socket connection: ' + windowId + '/' + socketId);
  var list = openConnections[windowId];
  if (!list) {
    list = [];
    openConnections[windowId] = list;
  }
  list.push(socketId);
}

function removeSocketConnection(windowId, socketId) {
  console.log('removing socket connection: ' + windowId + '/' + socketId);
  var list = openConnections[windowId];
  if (!list)
    return;
  for (var i in list) {
    if (list[i] == socketId) {
      list.splice(i,1);
      break;
    }
  }
}

function closeSockets(windowId) {
  console.log('closing open sockets for window ' + windowId);
  var list = openConnections[windowId];
  if (!list)
    return;
  for (var i in list) {
    var connection = list[i];
    console.log('closing socket ' + connection);
    chrome.socket.disconnect(connection);
    chrome.socket.destroy(connection);
  }
}
