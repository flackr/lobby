describe("lobby.Lobby", function() {

  var lobbyApi;
  var testPort = '1234';
  var server;
  var configuration = {
    iceServers: [
        {urls: "stun:stun.l.google.com:19302"},
    ],
  };
  var originalTimeout;

  beforeEach(function() {
    // Mock out communication, then run server
    installWebSocketMock();
    lobbyApi = new lobby.LobbyApi(new lobby.WebSocketSignalingClient('ws://localhost:'+testPort));
    server = new Server(testPort);
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
  });
  
  afterEach(function() {
    uninstallWebSocketMock();
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;
  });

  describe("after creating a game", function() {

    var session;
    var sessionId;
    var hostRtcConnection;

    beforeEach(function(done) {
      session = lobbyApi.createSession(function(callback) {
        hostRtcConnection = new RTCPeerConnection(configuration, null);
        return hostRtcConnection;
      });
      session.addEventListener('open', function(id) {
        expect(id).toBeTruthy();
        sessionId = id;
        done();
      })
    });
    
    describe("after connecting a client", function() {
      
      var clientRtcPeerConnection;
      var clientDataChannel;
      var hostDataChannel;
      
      beforeEach(function(done) {
        clientRtcPeerConnection = new RTCPeerConnection(configuration, null);
        var client = lobbyApi.joinSession(sessionId, clientRtcPeerConnection);
        clientDataChannel = clientRtcPeerConnection.createDataChannel("data", {reliable: false});
        clientDataChannel.onopen = function() {
          client.close();
          expect(hostRtcConnection).toBeTruthy();
          hostRtcConnection.ondatachannel = function(e) {
            hostDataChannel = e.channel;
            hostDataChannel.onopen = done;
          }
        };
      });
      
      it("should be able to connect a client", function(done) {
        var clientMsg = 'ping';
        var serverMsg = 'pong';
        clientDataChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(serverMsg);
          done();
        });
        clientDataChannel.send(clientMsg);

        hostDataChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(clientMsg);
          hostDataChannel.send(serverMsg);
        });
      });
      
      it("should detect the client disconnecting", function(done) {
        hostDataChannel.addEventListener('close', function() {
          done();
        })
        clientRtcPeerConnection.close();
      });

      it("should detect the host disconnecting", function(done) {
        clientDataChannel.addEventListener('close', function() {
          done();
        })
        hostRtcConnection.close();
      });
    });
  }); 

});