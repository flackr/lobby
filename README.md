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

## Establishing a leader

Everyone upon joining sends an announce message. The announce message with
the earliest server origin timestamp is the leader. However, because a leader
can disconnect, everyone will assume they are the leader until they receive
an offer from a user with an earlier announce message.

All matrix messages will be posted with the origin server timestamp of the
original announce message that started that group. This means, when
recovering history any messages with a greater origin timestamp can be
ignored as they were temporary sessions before they established a connection
to the true leader.

When a current leader receives an offer from an earlier leader, they must
help all of their connected clients to connect to the new leader, and erase
all history they committed to the state. They may attempt to replay messages
on top of the new leader's state except if there is a reset message.

Fully connected
Regularly exchange pings, track ping + packet loss.
Master accepts all connections, facilitates peer connections
Typing notifications to indicate people are still there
When races occur, origin_server_ts disambiguates
Netsplits prefer greatest number of players, then origin_server_ts. This means people who end up in the wrong group may lose state.
Can regularly renegotiate master
Games can support either offline continuation or not (no matrix side backup)

### To do

* Test support for disconnections.