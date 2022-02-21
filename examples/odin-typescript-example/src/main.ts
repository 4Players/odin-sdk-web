import { generateAccessKey, TokenGenerator } from '@4players/odin-tokens';
import { OdinClient, OdinConnectionState, OdinMedia, OdinPeer } from '@4players/odin';

import './style.css';

/**
 * The local access key used in this example.
 *
 * ===== IMPORTANT =====
 * Your access key is the unique authentication key to be used to generate room tokens for accessing the ODIN
 * server network. Think of it as your individual username and password combination all wrapped up into a single
 * non-comprehendable string of characters, and treat it with the same respect. For your own security, we strongly
 * recommend that you NEVER put an access key in your client-side code.
 *
 * Please refer to our developer documentation to learn more about access keys:
 * https://developers.4players.io/odin/introduction/access-keys/
 */
let accessKey = '';

/**
 * The identifier of the room we want to join.
 */
let roomId = '';

/**
 * Connects to the ODIN server network by authenticating with the specified room token, joins the room, configures our
 * own microphone input stream and registers a few callbacks to handle the most important server events.
 */
async function connect(token: string) {
  try {
    // Create a new media stream for the default capture device
    const mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true,
        sampleRate: 48000,
      },
    });

    // Authenticate and join a room using the specified token and audio settings
    const odinRoom = await OdinClient.joinRoom(token, mediaStream, {
      voiceActivityDetection: true,
      masterVolume: 1,
    });

    // Create a local media for us and start capturing the microphone using the media stream from above
    await odinRoom.createMedia().start();

    // Add our own peer to UI
    addUiPeer(odinRoom.me);

    // Process remote peers that were in the room while we joined and start decoding their media streams
    odinRoom.peers.forEach((peer) => {
      console.log(`Processing existing peer ${peer.id}`);
      peer.startMedias();
      addUiPeer(peer);
    });

    // Handle peer join events to update our UI
    odinRoom.addEventListener('PeerJoined', (event) => {
      console.log(`Adding new peer ${event.detail.peer.id}`);
      addUiPeer(event.detail.peer);
    });

    // Handle peer left events to update our UI
    odinRoom.addEventListener('PeerLeft', (event) => {
      console.log(`Removing peer ${event.detail.peer.id}`);
      removeUiPeer(event.detail.peer);
    });

    // Handle media started events to update our UI and start the audio decoder
    odinRoom.addEventListener('MediaStarted', (event) => {
      console.log(`Adding new media ${event.detail.media.id} owned by peer ${event.detail.peer.id}`);
      event.detail.media.start();
      addUiMedia(event.detail.media);
    });

    // Handle media stopped events to update our UI and stop the audio decoder
    odinRoom.addEventListener('MediaStopped', (event) => {
      console.log(`Removing new media ${event.detail.media.id} owned by peer ${event.detail.peer.id}`);
      event.detail.media.stop();
      removeUiMedia(event.detail.media);
    });

    // Handle media stopped events to update our UI and stop the audio decoder
    odinRoom.addEventListener('MediaActivity', (event) => {
      console.log(`Handle activity update on media ${event.detail.media.id}`, event.detail.isActive);
      updateUiMediaActivity(event.detail.media);
    });
  } catch (e) {
    console.error('Failed to join room', e);
    disconnect();
    resetUi();
  }
}

/**
 * Leaves the room and closes the connection to the ODIN server network.
 */
function disconnect() {
  OdinClient.disconnect();
}

// ======================================================================================================================
// ======================================================================================================================
// ==================================== All the example UI related code starts below ====================================
// ======================================================================================================================
// ======================================================================================================================

/**
 * Render some basic HTML.
 */
const app: HTMLDivElement = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <h1>ODIN TypeScript Example</h1>
  <div id="login-form">
    <label for="access-key">Access Key</label>
    <input id="access-key" type="text" value="${accessKey}" placeholder="A local access key for testing">
    <button id="generate-access-key">Generate</button>
    <label for="room-id">Room ID</label>
    <input id="room-id" type="text" value="${roomId}" placeholder="The name of the room to join">
    <button id="toggle-connection">Join</button>
  </div>
  <fieldset id="room-container">
    <legend id="room-title">Not Connected</legend>
  </fieldset>
`;

/**
 * Grab access key input and register event handlers to handle manual changes.
 */
const accessKeyInput = app.querySelector<HTMLInputElement>('#access-key');
accessKeyInput?.addEventListener('change', (e: any) => {
  if (!e.target) return;
  accessKey = (e.target as HTMLInputElement).value;
});

/**
 * Grab access key input and register event handlers to handle manual changes.
 */
const roomIdInput = app.querySelector<HTMLInputElement>('#room-id');
roomIdInput?.addEventListener('change', (e: any) => {
  if (!e.target) return;
  roomId = (e.target as HTMLInputElement).value;
});

/**
 * Grab 'Generate' button and register an event handler to update the access key if necessary.
 */
const generateAccessKeyBtn = document.querySelector<HTMLButtonElement>('#generate-access-key');
generateAccessKeyBtn?.addEventListener('click', () => {
  accessKey = generateAccessKey();
  if (accessKeyInput) accessKeyInput.value = accessKey;
  console.log('Generated a new local access key', accessKey);
});

/**
 * Grab 'Join/Leave' button and register and register an event handler to connect/disconnect.
 */
const toggleConnectionBtn = document.querySelector<HTMLButtonElement>('#toggle-connection');
toggleConnectionBtn?.addEventListener('click', (e: any) => {
  if (OdinClient.state === OdinConnectionState.disconnected || OdinClient.state === OdinConnectionState.error) {
    const userId = ''; // For this example, we just sent an empty string as user ID for authentication
    const tokenGenerator = new TokenGenerator(accessKey);
    const token = tokenGenerator.createToken(roomId, userId);
    console.log('Generated a new signed JWT to join room', token);
    connect(token);
  } else {
    disconnect();
  }
});

/**
 * Handle connection state changes and conditionally enable/disable UI elements.
 */
OdinClient.addEventListener('ConnectionStateChanged', (event) => {
  console.log('Client connection status changed', event.detail.state);

  if (event.detail.state !== OdinConnectionState.disconnected) {
    accessKeyInput?.setAttribute('disabled', 'disabled');
    roomIdInput?.setAttribute('disabled', 'disabled');
    generateAccessKeyBtn?.setAttribute('disabled', 'disabled');
    if (toggleConnectionBtn) toggleConnectionBtn.innerHTML = 'Leave';
  } else {
    resetUi();
  }

  const title = app.querySelector('#room-title');
  if (title) {
    title.innerHTML =
      event.detail.state === OdinConnectionState.connected
        ? `Joined '${OdinClient.rooms[0].id}' on ${OdinClient.rooms[0].serverAddress}`
        : 'Not Connected';
  }
});

/**
 * Helper function to get HTML container contaning the list of peers and medias.
 */
function getUiPeerContainer(): Element {
  let container = app.querySelector('#peer-container');
  if (!container) {
    container = document.createElement('ul');
    container.setAttribute('id', 'peer-container');
    app.querySelector('#room-container')?.append(container);
  }
  return container;
}

/**
 * Helper function to add a peer node to the UI.
 */
function addUiPeer(peer: OdinPeer) {
  const container = getUiPeerContainer();
  const peerItem = document.createElement('li');
  peerItem.setAttribute('id', `peer-${peer.id}`);
  peerItem.innerHTML = `Peer(${peer.id})`;
  container.append(peerItem);

  const mediaList = document.createElement('ul');
  mediaList.setAttribute('id', `peer-${peer.id}-medias`);
  peerItem.append(mediaList);
  peer.medias.forEach((media) => {
    addUiMedia(media);
  });
}

/**
 * Helper function to remove a peer node from the UI.
 */
function removeUiPeer(peer: OdinPeer) {
  app.querySelector(`#peer-${peer.id}`)?.remove();
}

/**
 * Helper function to add a media node to the UI.
 */
function addUiMedia(media: OdinMedia) {
  const container = app.querySelector(`#peer-${media.peerId}-medias`);
  const mediaItem = document.createElement('li');
  mediaItem.setAttribute('id', `media-${media.id}`);
  mediaItem.innerHTML = `Media(${media.id})`;
  container?.append(mediaItem);
}

/**
 * Helper function to remove a media node to the UI.
 */
function removeUiMedia(media: OdinMedia) {
  app.querySelector(`#media-${media.id}`)?.remove();
}

/**
 * Helper function to highlight media activity in the UI.
 */
function updateUiMediaActivity(media: OdinMedia) {
  if (media.active) {
    app.querySelector(`#media-${media.id}`)?.setAttribute('class', 'talking');
  } else {
    app.querySelector(`#media-${media.id}`)?.removeAttribute('class');
  }
}

/**
 * Helper function to reset UI to its original state.
 */
function resetUi() {
  accessKeyInput?.removeAttribute('disabled');
  roomIdInput?.removeAttribute('disabled');
  generateAccessKeyBtn?.removeAttribute('disabled');
  if (toggleConnectionBtn) toggleConnectionBtn.innerHTML = 'Join';
  app.querySelector('#peer-container')?.remove();
}
