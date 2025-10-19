export type EventListenerOptions = undefined | boolean | { capture?: boolean, once?: boolean };
export type WebSocketEvents = {
  open: Event;
  message: MessageEvent;
  close: Event;
};
export type WebSocketInterface = {
  addEventListener<K extends keyof WebSocketEvents>(type: K, callback: (event: WebSocketEvents[K]) => void | null, options?: boolean | EventListenerOptions | undefined): void;
  removeEventListener<K extends keyof WebSocketEvents>(type: K, callback: (event: WebSocketEvents[K]) => void | null): void;
  send(data: string | Buffer) : void;
  close() : void;
  get readyState(): 0 | 1 | 2 | 3;
};
export type RTCPeerConnectionEvents = {
  datachannel: RTCDataChannelEvent;
  icecandidate: RTCPeerConnectionIceEvent;
  connectionstatechange: Event;
}
export type RTCPeerConnectionInterface = {
  get remoteDescription(): RTCSessionDescriptionInit | null;
  get localDescription(): RTCSessionDescriptionInit | null;
  addEventListener<K extends keyof RTCPeerConnectionEvents>(type: K, callback: (event: RTCPeerConnectionEvents[K]) => void | null, options?: boolean | EventListenerOptions | undefined): void;
  removeEventListener<K extends keyof RTCPeerConnectionEvents>(type: K, callback: (event: RTCPeerConnectionEvents[K]) => void | null): void;
  setLocalDescription(description: RTCSessionDescriptionInit | null) : Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit | null) : Promise<void>;
  createOffer() : Promise<RTCSessionDescriptionInit>;
  createAnswer() : Promise<RTCSessionDescriptionInit>;
  createDataChannel(label: string, dataChannelDict?: RTCDataChannelInit) : RTCDataChannelInterface;
  addIceCandidate(candidate: RTCIceCandidateInit) : Promise<void>;
  get connectionState(): 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';
  close(): void;
};
export type RTCDataChannelInterface = {
  addEventListener<K extends keyof WebSocketEvents>(type: K, callback: (event: WebSocketEvents[K]) => void | null, options?: boolean | EventListenerOptions | undefined): void;
  get readyStaet(): string;
  send(data: string | Buffer) : void;
  close() : void;
};
