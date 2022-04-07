import { generateAccessKey, TokenGenerator } from '@4players/odin-tokens';
import { OdinClient, OdinMedia, OdinPeer, OdinRoom, uint8ArrayToValue, valueToUint8Array } from '@4players/odin';

import './style.css';

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
let roomId = '';

/**
 * The identifier to set for your own peer during authentication.
 */
let userId = '';

/**
 * The custom string to set as user data for your own peer (can be changed later).
 */
let userData = '';

/**
 * Connects to the ODIN server network by authenticating with the specified room token, joins the room, configures our
 * own microphone input stream and registers a few callbacks to handle the most important server events.
 */
async function connect(token: string) {
  try {
    // Authenticate and initialize the room
    const odinRoom = await OdinClient.initRoom(token);

    // Register room events
    handleRoomEvents(odinRoom);

    // Join the room and specify initial user data
    const ownPeer = await odinRoom.join(valueToUint8Array(userData));
    addOrUpdateUiPeer(ownPeer);

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
    console.error('Failed to join room', e);
    disconnect();
    resetUi();
  }
}

/**
 * Helper function to set event handlers for ODIN room events.
 */
function handleRoomEvents(room: OdinRoom) {
  room.addEventListener('ConnectionStateChanged', (event) => {
    console.log('Client connection status changed', event.payload.newState);

    if (event.payload.newState !== 'disconnected') {
      accessKeyInput?.setAttribute('disabled', 'disabled');
      userIdInput?.setAttribute('disabled', 'disabled');
      roomIdInput?.setAttribute('disabled', 'disabled');
      generateAccessKeyBtn?.setAttribute('disabled', 'disabled');
      if (toggleConnectionBtn) toggleConnectionBtn.innerHTML = 'Leave';
    } else {
      resetUi();
    }

    const title = app.querySelector('#room-title');
    if (title) {
      title.innerHTML =
        event.payload.newState === 'connected'
          ? `Joined '${OdinClient.rooms[0].id}' on ${OdinClient.rooms[0].serverAddress}`
          : 'Not Connected';
    }
  });

  // Handle peer join events to update our UI
  room.addEventListener('PeerJoined', (event) => {
    console.log(`Adding peer ${event.payload.peer.id}`);
    console.log(event.payload.peer);
    addOrUpdateUiPeer(event.payload.peer);
  });

  // Handle peer left events to update our UI
  room.addEventListener('PeerLeft', (event) => {
    console.log(`Removing peer ${event.payload.peer.id}`);
    removeUiPeer(event.payload.peer);
  });

  // Handle media started events to update our UI and start the audio decoder
  room.addEventListener('MediaStarted', (event) => {
    console.log(`Adding new media ${event.payload.media.id} owned by peer ${event.payload.peer.id}`);
    event.payload.media.start();
    addOrUpdateUiPeer(event.payload.peer);
  });

  // Handle media stopped events to update our UI and stop the audio decoder
  room.addEventListener('MediaStopped', (event) => {
    console.log(`Removing new media ${event.payload.media.id} owned by peer ${event.payload.peer.id}`);
    event.payload.media.stop();
    addOrUpdateUiPeer(event.payload.peer);
  });

  // Handle peer user data changes to update our UI
  room.addEventListener('PeerUserDataChanged', (event) => {
    console.log(`Received user data update for peer ${event.payload.peer.id}`);
    console.log(event.payload.peer);
    addOrUpdateUiPeer(event.payload.peer);
  });

  // Handle media stopped events to update our UI and stop the audio decoder
  room.addEventListener('MediaActivity', (event) => {
    console.log(`Handle activity update on media ${event.payload.media.id}`, event.payload.media.active);
    updateUiMediaActivity(event.payload.media);
  });
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
    <label for="user-id">Peer User ID</label>
    <input id="user-id" type="text" value="${userId}" placeholder="Optional identifier (e.g. nickname)">
    <label for="user-data">Peer User Data</label>
    <input id="user-data" type="text" value="${userData}" placeholder="Optional arbitrary data (e.g. JSON)">
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
 * Grab user ID input and register event handlers to handle manual changes.
 */
const userIdInput = app.querySelector<HTMLInputElement>('#user-id');
userIdInput?.addEventListener('change', (e: any) => {
  if (!e.target) return;
  userId = (e.target as HTMLInputElement).value;
});

/**
 * Grab user data input and register event handlers to handle manual changes.
 */
const userDataInput = app.querySelector<HTMLInputElement>('#user-data');
userDataInput?.addEventListener('change', (e: any) => {
  if (!e.target) return;
  userData = (e.target as HTMLInputElement).value;

  // if we're connected, also send an update of our own user data to the server
  if (OdinClient.connectionState === 'connected') {
    const ownPeer = OdinClient.rooms[0].ownPeer;
    ownPeer.data = valueToUint8Array(userData);
    ownPeer.update(); // flush user data update
    console.log('Sent updated peer user data to server', ownPeer.data);
    addOrUpdateUiPeer(ownPeer);
  }
});

/**
 * Grab room ID input and register event handlers to handle manual changes.
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
  if (OdinClient.connectionState === 'disconnected' || OdinClient.connectionState === 'error') {
    const tokenGenerator = new TokenGenerator(accessKey);
    const token = tokenGenerator.createToken(roomId, userId);
    console.log('Generated a new signed JWT to join room', token);
    connect(token);
  } else {
    disconnect();
  }
});

/**
 * Helper function to add a peer node to the UI.
 */
function addOrUpdateUiPeer(peer: OdinPeer) {
  let container = app.querySelector('#peer-container');
  if (!container) {
    container = document.createElement('ul');
    container.setAttribute('id', 'peer-container');
    app.querySelector('#room-container')?.append(container);
  }

  const peerItem = app.querySelector(`#peer-${peer.id}`) ?? document.createElement('li');

  const decodedData: unknown = uint8ArrayToValue(peer.data);
  let userData: string = '';
  if (decodedData && typeof decodedData === 'string') {
    userData = decodedData;
  }

  peerItem.setAttribute('id', `peer-${peer.id}`);
  peerItem.innerHTML = `Peer(${peer.id}) <div> User ID: ${peer.userId} <br> User Data: ${userData} <div>`;
  container.append(peerItem);

  const mediaList = document.createElement('ul');
  mediaList.setAttribute('id', `peer-${peer.id}-medias`);
  peerItem.append(mediaList);

  peer.medias.forEach((media) => {
    const mediaItem = document.createElement('li');
    mediaItem.setAttribute('id', `media-${media.id}`);
    mediaItem.innerHTML = `Media(${media.id})`;
    mediaList.append(mediaItem);
  });
}

/**
 * Helper function to remove a peer node from the UI.
 */
function removeUiPeer(peer: OdinPeer) {
  app.querySelector(`#peer-${peer.id}`)?.remove();
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
  userIdInput?.removeAttribute('disabled');
  generateAccessKeyBtn?.removeAttribute('disabled');
  if (toggleConnectionBtn) toggleConnectionBtn.innerHTML = 'Join';
  app.querySelector('#peer-container')?.remove();
}
