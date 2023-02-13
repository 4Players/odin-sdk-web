const odin = require('@4players/odin');
const odinTokens = require('@4players/odin-tokens');

// Load Node.js WebSocket module as the browser variant is not available in this environment.
global.WebSocket = require('ws');

/**
 * The local access key used in this example.
 *
 * ===== IMPORTANT =====
 * Your access key is the unique authentication key to be used to generate room tokens for accessing the ODIN
 * server network. Think of it as your individual username and password combination all wrapped up into a single
 * non-comprehendible string of characters, and treat it with the same respect. For your own security, we strongly
 * recommend that you NEVER put an access key in your client-side code.
 *
 * Please refer to our developer documentation to learn more about access keys:
 * https://developers.4players.io/odin/introduction/access-keys/
 */
let accessKey = '';

/**
 * The identifier of the room we want to join.
 */
const roomId = '';

/**
 * The identifier to set for your own peer during authentication.
 */
const userId = '';

const startOdin = async function () {
  try {
    // generate a local access key if needed
    if (!accessKey.length) {
      console.warn('No access key specified; generating a new one ...');
      accessKey = odinTokens.generateAccessKey();
    }

    // generate a room token
    console.log(`Generating room token using access key ${accessKey}`);
    const token = (new odinTokens.TokenGenerator(accessKey)).createToken(roomId, userId);

    // Authenticate and initialize the room
    const room = await odin.OdinClient.initRoom(token);

    // Handle events for peers joining the room
    room.addEventListener('PeerJoined', (event) => {
      console.log(`Peer ${event.payload.peer.id} joined`);
    });

    // Handle events for peers leaving the room
    room.addEventListener('PeerLeft', (event) => {
      console.log(`Peer ${event.payload.peer.id} left`);
    });

    // Handle events for incoming arbitrary data messages
    room.addEventListener('MessageReceived', (event) => {
      console.log(`Peer ${event.payload.senderId} sent a message`);
    });

    // Join the room
    await room.join();
  } catch (e) {
    console.error(e);
  }
};

startOdin().then(() => {
  console.log('Started ODIN');
});
