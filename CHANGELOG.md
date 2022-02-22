# Changelog

## 0.6.0

- Renamed `OdinRoom.me` to `OdinRoom.ownPeer`.
- Renamed `OdinRoom.peers` to `OdinRoom.remotePeers`.
- Changed return type of `OdinRoom.connectionState` to `OdinConnectionState`.
- Changed internal event structure and added relevant interfaces to API exports.
- Fixed a bug where own peer user data was not up-to-date right after joining a room.
- Added `OdinRoom.flushDataUpdate` method to send room user data updates to the server.
- Added `OdinRoom.flushOwnPeerDataUpdate` method to send own peer user data updates to the server.
- Added npm `typedoc` script to create API documentation.

## 0.5.5

- Added npm `bundle` script to create standalone broser bundles.

## 0.5.4

- Added `OdinRoom.changeMediaStream` to allow replacing the microphone capture stream (e.g. when you want to change your input device).
- Fixed a bug where the internal connection state of `OdinClient` was set after the `ConnectionStateChanged` event was emitted.

## 0.5.3

- Initial public release
