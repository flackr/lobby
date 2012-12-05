function $(id) {
  return document.getElementById(id);
}

document.addEventListener('DOMContentLoaded', function() {
  $('createGame').style.display = lobby.serverCapable() ? 'block' : 'none';
  $('createGameBtn').addEventListener('click', function() {
    window.cs = new ChatServer(window.host = new lobby.Host($('lobbyUrl').value));
    window.cc = new ChatClient(null, window.host = new lobby.Client('ws://localhost:9998/'));
  });
});

function ChatServer(connection) {
  this.connection_ = connection;
  this.connection_.addEventListener('message', this.onMessageReceived.bind(this));
}

ChatServer.prototype = {
  onMessageReceived: function(clientIndex, message) {
    console.log('Server received '+message+' from client '+clientIndex);
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
