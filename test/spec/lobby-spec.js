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
    installWebRTCMock();
    lobbyApi = new lobby.LobbyApi('ws://localhost:'+testPort);
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
    var hostDataChannel;
    var hostDataChannelReady;

    beforeEach(function(done) {
      hostDataChannelReady = function() {};
      hostDataChannel = null;
      callback = null;
      session = lobbyApi.createSession(function(callback) {
        hostRtcConnection = new RTCPeerConnection(configuration, null);
        hostRtcConnection.ondatachannel = function(e) {
          hostDataChannel = e.channel;
          if (hostDataChannel.readyState == 'open') {
            hostDataChannelReady();
          } else {
            hostDataChannel.onopen = function() {
              hostDataChannelReady();
            }
          }
        };
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
      
      beforeEach(function(done) {
        clientRtcPeerConnection = new RTCPeerConnection(configuration, null);
        var client = lobbyApi.joinSession(sessionId, clientRtcPeerConnection);
        clientDataChannel = clientRtcPeerConnection.createDataChannel("data", {reliable: false});
        clientDataChannel.onopen = function() {
          client.close();
          expect(hostRtcConnection).toBeTruthy();
          if (!hostDataChannel || hostDataChannel.readyState != 'open') {
            hostDataChannelReady = function() {
              hostDataChannelReady = null;
              done();
            };
          } else {
            done();
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

        hostDataChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(clientMsg);
          hostDataChannel.send(serverMsg);
        });

        clientDataChannel.send(clientMsg);
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