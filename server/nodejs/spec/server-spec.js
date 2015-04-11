var lobby = require("../server.js");
var NodeWebSocket = require('ws');

describe('server', function() {

  var testPort = 9999;
  var server;
  var ws;
  
  function createLobbyServer(done) {
    expect(server).not.toBeDefined();
    console.log('creating server');
    server = new lobby.Server(++testPort);
    server.webSocketServer_.on('listening', function() {
      console.log('Awaiting connections on ' + testPort);
      done();
    });
  }
  
  beforeEach(function(done) {
    if (server)
      done();
    else
      createLobbyServer(done);
  })

  function connectWebsocket(path, done) {
    var ws = new NodeWebSocket('ws://localhost:' + testPort.toString() + path);
    console.log('connecting ws to ' + testPort);
    var onComplete = function() {
      expect(ws.onopen).toHaveBeenCalled();
      expect(ws.onerror).not.toHaveBeenCalled();
      ws.onopen = undefined;
      ws.onerror = undefined;
      done();
    }
    ws.onopen = function() {
      onComplete();
    };
    ws.onerror = function() {
      onComplete();
    };
    spyOn(ws, 'onopen').andCallThrough();
    spyOn(ws, 'onerror').andCallThrough();
    return ws;
  }
  
  describe('host', function() {
    beforeEach(function(done) {
      ws = connectWebsocket('/new', done);
    });
  
    it('accepts a websocket connection', function() {
    });
  });

  describe('client', function() {

    var host_ws;
    var hostId;

    beforeEach(function(done) {
      host_ws = connectWebsocket('/new', function() {
        console.log('host connected, awaiting message');
        host_ws.addEventListener('message', function(evt) {
          var data = JSON.parse(evt.data);
          expect(data.host).toBeDefined();
          hostId = data.host;
          ws = connectWebsocket('/' + hostId, done);
        });
      });
    });

    it('connects a client', function() {
    });

  });
  
  // This is a hack for lack of an afterAll function in jasmine-node.
  it('shuts down', function() {
    if (server) {
      server.shutdown();
      server = undefined;
    }
  });

});