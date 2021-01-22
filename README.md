# Lobby

Lobby aims to provide a platform by which developers can easily connect clients.
Developers simply need to register the application / game and handle messages,
without worrying about connecting clients. Lobby is application agnostic, one
server can host a variety of games.

Want to try a demo: https://flackr.github.io/demo/chat/

## Matrix Backend

Lobby is built upon [matrix](https://matrix.org/). As Matrix is decentralized
and open and there are many public matrix server instances there are many
potential hosting locations for lobby games if you do not host your own matrix
server.

## Peer to peer

Lobby [used to be peer to peer](https://github.com/flackr/lobby/tree/archived),
and will be again, though the move to using the matrix infrastructure required
radical changes to the API. During the transition period, all messages are sent
through matrix. In the future, matrix will be used to establish peer to peer
connections.

Even when fully peer to peer, sending messages to matrix has several advantages:
* The state is backed up.
* The session persists even when no users are connected.
* Push notifications can be delivered when updates occur.

As such, even when peer to peer messaging is available, if your application
would benefit from these capabilities it's encouraged to send the minimum
necessary state to restore the session through matrix even if more rich or
frequent messages are available when connected directly.

Fully connected
Regularly exchange pings, track ping + packet loss.
Master accepts all connections, facilitates peer connections
Typing notifications to indicate people are still there
When races occur, origin_server_ts disambiguates
Netsplits prefer greatest number of players, then origin_server_ts. This means people who end up in the wrong group may lose state.
Can regularly renegotiate master
Games can support either offline continuation or not (no matrix side backup)

### To do

* Connect a single peer (connect others through master).
* Batch messages (i.e. icecandidates and offer).
* Nominate master to back messages up to matrix.
* Check log in state by querying turn server config.
* Use turn server config on RTC connections.
* Sync entire history.
* Test support for disconnections.
* Disconnections will have to be detected manually (iceconnectionstate disconnected happens periodically in Firefox, but no further state changes happen in chrome).
