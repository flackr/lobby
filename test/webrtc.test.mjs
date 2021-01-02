import test from 'ava';
import MockClock from './helpers/mock_clock.mjs';
import MockWebRTC from './helpers/mock_webrtc.mjs';

test.beforeEach(t => {
  t.context.clock = new MockClock(t.context.globals = {});
  t.context.clock.autoAdvance = true;
  t.context.mockRTC = new MockWebRTC(t.context.globals);
  t.context.mockRTC.install();
});

test.afterEach(t => {
  const clock = t.context.clock;
  t.assert(clock.finish() == false);
  t.context.mockRTC.uninstall();
  clock.uninstall();
  t.context.clock = null;
  t.context.mockRTC = null;
})

test('connects a datachannel', async (t) => {
  const globals = t.context.globals;
  const clock = t.context.clock;
  const configuration = {iceServers: [{urls: 'stuns:stun.example.org'}]};
  let pc1 = new t.context.globals.RTCPeerConnection(configuration);
  let dc1 = pc1.createDataChannel('sendChannel');
  let pc2 = new t.context.globals.RTCPeerConnection(configuration);
  let dc2 = null;
  pc1.onicecandidate = ({candidate}) => {
    pc2.addIceCandidate(candidate);
  };
  pc2.onicecandidate = ({candidate}) => {
    pc1.addIceCandidate(candidate);
  };

  let connected = new Promise((resolve) => {
    pc2.ondatachannel = ({channel}) => {
      dc2 = channel;
      resolve();
    };
  });

  await pc1.setLocalDescription(await pc1.createOffer());
  await pc2.setRemoteDescription(pc1.localDescription);
  await pc2.setLocalDescription(await pc2.createAnswer());
  await pc1.setRemoteDescription(pc2.localDescription);
  await connected;

  let message = 'test';
  let receivePromise = new Promise((resolve) => {
    dc2.onmessage = (evt) => {
      dc2.onmessage = undefined;
      resolve(evt.data);
    }
  });
  dc1.send(message);
  let received = await receivePromise;
  t.assert(received == message);
});
