# Changelog

## 0.9.0

- Renamed `OdinMedia.registered` to `OdinMedia.started` for convenience.
- Fixed an error when trying to decode an empty byte array.

## 0.8.1

- Removed debug logs.

## 0.8.0

- Changed the `OdinConnectionState` enum to a string union `'disconnected' | 'connecting' | 'connected' | 'error'`.
- Improved connection error handling.
- Renamed `OdinRoom.reset` to `OdinRoom.disconnect`. Note, that `OdinRoom.disconnect` also disconnects the active `OdinClient`.
- Added some helper functions for easy type conversion when working with `OdinPeer.userData` or `OdinRoom.userData`.

## 0.7.2

- Removed debug logs.
- Updated dependencies to fix a security vulnerability in minimist.

## 0.7.1

- Fixed a bug where audio playback nodes were not connected unless capture nodes were connected.
- Improved internal schema validation.

## 0.7.0

- Added `OdinClient.initRoom` and `OdinClient.initRooms`, which will authenticate using a specified room token and return `OdinRoom` instance(s). This allows registering event handlers before joining for more convenient room handling.
- Made `OdinRoom.join` a public function and added optional `userData` and `position` arguments to set initial values.
- Removed `OdinClient.joinRoom` in favor of the new init and join functions.
- Fixed a bug where the decoder of an `OdinMedia` wasn't stopped when the audio stream was removed from the room.
- Changed the behavior of `OdinRoom.addEventListener` for the following event types:
	- `OdinPeerJoinedLeftEvent` will now be emitted for all peers that join/leave the room, including those already in the room during join as well as your own peer.
	- `OdinMediaStartedStoppedEvent` will now be emitted for all medias that are added or removed, including those already in the room during join as well as your own medias.
- Updated example to reflect the latest API changes.

## 0.6.4

- Changed the behavior of remote medias to automatically stop them when the peer disconnects.

## 0.6.3

- Improved the calculation for the default room position.

## 0.6.2

- Fixed a bug where `active` state of a media was not set to `false` on stop.

## 0.6.1

- Changed npm `bundle` script to use rollup and terser instead of browserify.
- Fixed a bug where `OdinPeerDataChangedEvent` was not fired.
- Added `OdinPeer.userId` which stores the peers individual identifier string using during authentication.
- Updated example with options to set user data and user ID.

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

- Added npm `bundle` script to create standalone browser bundles.

## 0.5.4

- Added `OdinRoom.changeMediaStream` to allow replacing the microphone capture stream (e.g. when you want to change your input device).
- Fixed a bug where the internal connection state of `OdinClient` was set after the `ConnectionStateChanged` event was emitted.

## 0.5.3

- Initial public release
