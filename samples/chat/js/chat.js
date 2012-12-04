function $(id) {
  return document.getElementById(id);
}

document.addEventListener('DOMContentLoaded', function() {
  $('createGame').style.display = lobby.serverCapable() ? 'block' : 'none';
  $('createGameBtn').addEventListener('click', function() {
    var cs = new ChatServer(new Host($('lobbyUrl').value));
    var cc = new ChatClient(new LocalClient(cs));
  });
});

function ChatServer(connection) {
  this.connection_ = connection;
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
}

ChatServer.prototype = {
  onMessageReceived: function(message) {
    // Rebroadcast all messages to all clients
    for (var i in this.connection_.clients) {
      this.connection_.send(i, message);
    }
  }
};

function ChatClient(rootNode, connection) {
  this.connection_ = connection;
  this.rootNode_ = rootNode;
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
}

ChatClient.prototype = {
  onMessageReceived: function(message) {
    console.log('Message received: ' + message.text);
  },

  sendMessage: function(message) {
    this.connection_.send({text: message});
  }
};
