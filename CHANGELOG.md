# Changelog

## 0.17.4

- Fixed a bug when using `OdinClient.initRoom()` with the default gateway.

## 0.17.3

- Now using `ReturnType<typeof setTimeout>` instead of `NodeJS.Timeout` types. 

## 0.17.2

- Updated TypeScript example to show popups on connection errors.
- Fixed a bug where calling `OdinRoom.startVADMeter` had no effect before `OdinMedia.start` was called on an input stream.
- Improved error handling when establishing connection to server.

## 0.17.1

- Added `OdinRoom.startVADMeter` and `OdinRoom.stopVADMeter`.
- Added `VoiceProcessingStats` event on `OdinRoom`.

## 0.17.0

- Added `OdinRoom.pauseMedia` and `OdinRoom.resumeMedia`.
- Added `OdinMedia.pause` and `OdinMedia.resume`.
- Added `OdinMedia.paused` flag to determine wether or not a remote media is accepting data (e.g. server-side muted/unmuted).
- Updated connection code to allow direct connections to on-premise servers without a gateway.
- Fixed a bug where peer user data in JSON format was not shown correctly in TypeScript example.

## 0.16.1

- Fixed a bug where audio was not accessible when supplying a custom `AudioContext` to `OdinClient.initRoom`.

## 0.16.0

- Replaced `OdinRoom.getPosition` function with `OdinRoom.position` getter.
- Updated Opus codec to version 1.4 and changed encoder settings to utilize new FEC options.
- Updated Opus encoder bitrate to use 32000 kbps for voice signals and 96000 kbps for music signals.
- Updated room to change state to use `incomplete` if RTC peer connection can't be established.
- Fixed a bug where packet loss was always 0 in jitter stats.
- Fixed error `TS2354` (This syntax requires an imported helper but module 'tslib' cannot be found).
- Added a warning when trying to connect to incompatible server versions.
- Added an input resampler for audio nodes, supporting sample rates beyond 48 kHz.

## 0.15.2

- Updated WebAssembly to support legacy browsers.
- Fixed a bug where `AudioContext` API was not found on some iOS devices.

## 0.15.1

- Fixed a bug where speech detection settings were not applied in VAD processor.

## 0.15.0

- Updated QoS metrics for compatibility with native clients using version 1.4.0 or later.

## 0.14.0

- Added CommonJS builds for Node.js environments.
- Updated client to automatically disable audio functionality when neither `AudioContext` nor `Worker` are available.

## 0.13.1

- Removed a debug log.

## 0.13.0

- Refactored internal jitter buffer for better handling of high latency scenarios.
- Added QoS metrics to voice packets to allow debugging of performance issues.
- Reduced overall latency.

## 0.12.0

- Added RTT hints to voice packets for compatibility with native clients using version 1.3.1 or later.

## 0.11.0

- Fixed a bug where `MediaStarted` events weren't emitted, when using `OdinRoom.setPosition()`.
- Added `MediaStopped` events for convenience when using `OdinRoom.setPosition()`.

## 0.10.0

- Added `OdinRoom.disableVolumeGate`.
- Added `OdinRoom.enableVolumeGate`.
- Added `OdinRoom.updateVolumeGateThresholds` to allow configuring root mean square power (dBFS) when the volume gate should engage.
- Added `OdinRoom.updateVADThresholds` to allow configuring voice probability value when the VAD should engage.
- Renamed `OdinRoom.enablesVAD` to `OdinRoom.enableVAD`.

## 0.9.4

- Fixed a bug where the client could become unresponsive on failed connection attempts.

## 0.9.3

- Added optional arguments to `OdinClient.initRoom` and `OdinClient.initRooms` to allow passing a custom AudioContext, which might be necessary on Apple platforms.

## 0.9.2

- Fixed broken audio in Safari 15.4 or later.

## 0.9.1

- Added a new prop `OdinPeer.remote` to differentiate between your own peer and others.

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
