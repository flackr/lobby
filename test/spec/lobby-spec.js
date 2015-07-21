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
    
    it("should be able to connect a client", function(done) {
      var clientMsg = 'ping';
      var serverMsg = 'pong';
      var clientRtcPeerConnection = new RTCPeerConnection(configuration, null);
      var client = lobbyApi.joinSession(sessionId, clientRtcPeerConnection);
      var clientDataChannel = clientRtcPeerConnection.createDataChannel("data", {reliable: false});
      var hostDataChannel;

      clientDataChannel.onopen = function() {
        client.close();
        clientDataChannel.addEventListener('message', function(e) {
          expect(e.data).toBe(serverMsg);
          done();
        });
        clientDataChannel.send(clientMsg);
        expect(hostRtcConnection).toBeTruthy();
        hostRtcConnection.ondatachannel = function(e) {
          hostDataChannel = e.channel;
          hostDataChannel.addEventListener('message', function(e) {
            expect(e.data).toBe(clientMsg);
            hostDataChannel.send(serverMsg);
          })
        };
      };
    })
      
  }); 

});