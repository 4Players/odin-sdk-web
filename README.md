# @4players/odin

[![npm](https://img.shields.io/npm/v/@4players/odin.svg)][npm-badge-url]
[![npm](https://img.shields.io/npm/l/@4players/odin.svg)][license-url]
[![npm](https://img.shields.io/npm/dm/@4players/odin.svg)][npm-badge-url]

ODIN is a cross-platform software development kit (SDK) that enables developers to integrate real-time voice chat technology into multiplayer games, apps and websites.

This package is fully compatible with all of our other client SDKs, allowing you to effortlessly connect and communicate with any native app or game that has integrated ODIN. Whether using your favorite web browser or a native app, ODIN makes it easy for you to stay connected with those who matter most.

[Online Documentation](https://www.4players.io/developers/)

## Audio Processing Features

ODIN enhances your audio experience during VoIP chats by offering a comprehensive set of filters beyond the basic audio processing features found in web browsers. These enhancements activated by default, ensuring clear and interruption-free communication.

### Voice Activity Detection (VAD)

When enabled, ODIN will analyze the audio input signal using smart voice detection algorithm to determine the presence of speech. You can define both the probability required to start and stop transmitting.

### Input Volume Gate

When enabled, the volume gate will measure the volume of the input audio signal, thus deciding when a user is speaking loud enough to transmit voice data. You can define both the root mean square power (dBFS) for when the gate should engage and disengage.

## Quick Start

Ready to take your app to the next level? Integrating ODIN is a simple and straightforward process. Here are two examples of how to get started with our SDK.

### TypeScript Example

```typescript
import { OdinClient } from '@4players/odin';

const startOdin = async function (token: string) {
  try {
    // Authenticate and initialize the room
    const odinRoom = await OdinClient.initRoom(token);

    // Handle events for peers joining the room
    odinRoom.addEventListener('PeerJoined', (event) => {
      console.log(`Peer ${event.payload.peer.id} joined`);
    });

    // Handle events for peers leaving the room
    odinRoom.addEventListener('PeerLeft', (event) => {
      console.log(`Peer ${event.payload.peer.id} left`);
    });

    // Handle events for medias added by peers (e.g. start processing voice data)
    odinRoom.addEventListener('MediaStarted', (event) => {
      console.log(`Peer ${event.payload.peer.id} added media stream ${event.payload.media.id}`);
      event.payload.media.start();
    });

    // Handle events for medias removed by peers (e.g. stop processing voice data)
    odinRoom.addEventListener('MediaStopped', (event) => {
      console.log(`Peer ${event.payload.peer.id} removed media stream ${event.payload.media.id}`);
      event.payload.media.stop();
    });

    // Handle events for media activity (e.g. someone starts/stops talking)
    odinRoom.addEventListener('MediaActivity', (event) => {
      console.log(`Peer ${event.payload.peer.id} ${event.payload.active ? 'started' : 'stopped'} talking on media ${event.payload.media.id}`);
    });

    // Join the room
    await odinRoom.join();

    // Create a new audio stream for the default capture device and append it to the room
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      })
      .then((mediaStream) => {
        odinRoom.createMedia(mediaStream);
      });
  } catch (e) {
    console.error('Something went wrong', e);
  }
}

startOdin('__YOUR TOKEN__').then(() => {
  console.log('Started ODIN');
});
```

### HTML/JavaScript Example

```html
<html>
  <body>
    <script type="text/javascript" src="odin.min.js"></script>
    <script type="text/javascript">
      let startOdin = async function (token) {
        // Authenticate and initialize the room (notice the `ODIN` namespace which encapsulates the API)
        const odinRoom = await ODIN.OdinClient.initRoom(token);

        // Add additional code here
      }
      startOdin('__YOUR TOKEN__').then(() => {
        console.log('Started ODIN');
      });
    </script>
  </body>
</html>
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
