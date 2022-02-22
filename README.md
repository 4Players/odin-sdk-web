# @4players/odin

[![npm](https://img.shields.io/npm/v/@4players/odin.svg)][npm-badge-url]
[![npm](https://img.shields.io/npm/l/@4players/odin.svg)][license-url]
[![npm](https://img.shields.io/npm/dm/@4players/odin.svg)][npm-badge-url]

4Players ODIN is a cross-platform software development kit (SDK) that enables developers to integrate real-time chat technology into multiplayer games, apps and websites.

[Online Documentation](https://developers.4players.io/odin)

**:warning: Important Notice:**

> Please note that ODIN is currently in **Beta** and features are being added over time.

## TypeScript Example

```typescript
import { OdinClient } from '@4players/odin';

// Create a media stream for the default input device
const mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,
    autoGainControl: false,
    noiseSuppression: true,
    sampleRate: 48000,
  },
});

// Join a room in the ODIN server network using a room token obtained externally
const odinRoom = await OdinClient.joinRoom(token, mediaStream);

// Create a new media for ourselves and start capturing from the microphone
await odinRoom.createMedia().start();

// Start processing voice data of remote peers that were already in the room
odinRoom.remotePeers.forEach((peer) => {
  peer.startMedias();
});

// Handle events for new peers joining the room
odinRoom.addEventListener('PeerJoined', (event) => {
  console.log(`Peer ${event.payload.peer.id} joined`);
});

// Handle events for peers leaving the room
odinRoom.addEventListener('PeerLeft', (event) => {
  console.log(`Peer ${event.payload.peer.id} left`);
});

// Handle events for medias added by remote peers (e.g. start processing voice data)
odinRoom.addEventListener('MediaStarted', (event) => {
  event.payload.media.start();
});

// Handle events for medias removed by remote peers (e.g. stop processing voice data)
odinRoom.addEventListener('MediaStopped', (event) => {
  event.payload.media.stop();
});

// Handle events for media activity (e.g. user starts/stops talking)
odinRoom.addEventListener('MediaActivity', (event) => {
  console.log(`Peer ${event.payload.peer.id} ${event.payload.active ? 'started' : 'stopped'} talking on media ${event.payload.media.id}`);
});
```

## Troubleshooting

Contact us through the listed methods below to receive answers to your questions and learn more about ODIN.

### Discord

Join our official Discord server to chat with us directly and become a part of the 4Players ODIN community.

[![Join us on Discord](https://developers.4players.io/images/join_discord.png)](https://discord.gg/9yzdJNUGZS)

### Twitter

Have a quick question? Tweet us at [@4PlayersBiz](https://twitter.com/4PlayersBiz) and we’ll help you resolve any issues.

### Email

Don’t use Discord or Twitter? Send us an [email](mailto:odin@4players.io) and we’ll get back to you as soon as possible.

[npm-badge-url]: https://www.npmjs.com/package/@4players/odin
[license-url]: https://github.com/4Players/odin/blob/master/LICENSE
