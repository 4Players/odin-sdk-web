import { OdinConnectionState, OdinEventMethods, OdinEvent, RoomEvents, RoomUpdate, MessageData } from './types';
import { AudioService } from './audio-service';
import { Stream } from './stream';
import { OdinMedia } from './media';
import { OdinPeer } from './peer';
import { openStream } from './utils';

/**
 * Enables interactions with the odin room
 */
export class OdinRoom {
  private _me!: OdinPeer;
  private _customer: String = '';
  private _data: Uint8Array = new Uint8Array();
  private _peers: Map<number, OdinPeer> = new Map();
  private _roomStream!: Stream;
  private _eventTarget: EventTarget = new EventTarget();
  private _connectionState: OdinConnectionState = OdinConnectionState.disconnected;
  private _audioService!: AudioService;

  /**
   * Creates a new OdinRoom instance.
   *
   * @param _id
   * @param _address
   * @param _mainStream
   * @param _worker
   */
  constructor(private _id: string, private _address: string, private _mainStream: Stream, private _worker: Worker) {
    const audioService = AudioService.getInstance();
    if (audioService) {
      this._audioService = audioService;
      this._audioService.setRroom(this);
    }
  }

  /**
   * Returns the ID of the room.
   */
  get id(): string {
    return this._id;
  }

  /**
   * Returns the customer identifier this room is assigned to.
   */
  get customer() {
    return this._customer;
  }

  /**
   * Sets the user data of the room.
   *
   * @param data
   */
  set data(data: Uint8Array) {
    this._data = data;
  }

  /**
   * Returns the user data of the room.
   */
  get data(): Uint8Array {
    return this._data;
  }

  /**
   * Returns the current connection state of the room.
   */
  get connectionState(): string {
    return this._connectionState.toString();
  }

  /**
   * Returns your own peer in the room.
   */
  get me(): OdinPeer {
    return this._me;
  }

  /**
   * Returns all remote peers in the room.
   */
  get peers(): Map<number, OdinPeer> {
    return this._peers;
  }

  /**
   * Returns the event handler of the room.
   */
  get eventTarget(): EventTarget {
    return this._eventTarget;
  }

  /**
   * Returns the address of the voice server this room is living on.
   */
  get serverAddress(): string {
    return this._address;
  }

  /**
   * Returns the underlying room stream.
   */
  get stream(): Stream {
    return this._roomStream;
  }

  /**
   * Joins the room and returns your own peer instance after the room was successfully joined.
   *
   * @param   userData Optional user data to set for the peer when connecting
   * @param   position Optional coordinates to set the two-dimensional position of the peer in the room when connecting
   * @returns Returns your own peer
   */
  async join(userData?: Uint8Array, position?: [number, number]): Promise<OdinPeer | null> {
    this._connectionState = OdinConnectionState.connecting;
    if (!userData) {
      userData = new Uint8Array();
    }
    if (!position) {
      const a = OdinRoom.randomIntFromInterval(0, 2 * Math.PI);
      const x = Math.cos(a) * 0.5;
      const y = Math.sin(a) * 0.5;
      position = [x, y];
    }
    try {
      this._roomStream = await this.connectRoom(this._address, this._id, this._mainStream, userData, position);
      await new Promise((resolve) => this._eventTarget.addEventListener('Joined', resolve, { once: true }));
      this._connectionState = OdinConnectionState.connected;
      return this.me;
    } catch (e) {
      this._connectionState = OdinConnectionState.error;
      return null;
    }
  }

  /**
   * Changes the active capture stream.
   */
  changeMediaStream(ms: MediaStream) {
    if (this._connectionState !== OdinConnectionState.connected) {
      throw new Error('Unable to change media stream; room is not connected');
    }

    this._audioService.changeMediaStream(ms);
  }

  /**
   * Creates a new local media using the specified stream.
   */
  createMedia(): OdinMedia {
    if (this._connectionState !== OdinConnectionState.connected) {
      throw new Error('Unable to create new media; room is not connected');
    } else if (!this._me) {
      throw new Error('Unable to create new media; own peer information is not available');
    }

    return this._me.createMedia();
  }

  /**
   * Joins a room and opens the room stream.
   *
   * @private
   */
  private async connectRoom(
    address: string,
    roomId: string,
    mainStream: Stream,
    userData: Uint8Array,
    position: [number, number]
  ): Promise<Stream> {
    const params = {
      room_id: roomId,
      user_data: userData,
      position: position,
    };

    const { stream_id } = await mainStream.request('JoinRoom', params);
    return openStream(`wss://${address}?${stream_id}`, this.streamHandler.bind(this));
  }

  /**
   * Sets the position in the OdinRoom and also sends the position to the server.
   * @param offsetX
   * @param offsetY
   * @returns {void}
   * @private
   */
  setPosition(offsetX: number, offsetY: number): void {
    this._roomStream?.request('SetPeerPosition', {
      position: [offsetX, offsetY],
    });
  }

  /**
   * Returns a randon int value.
   *
   * @private
   */
  private static randomIntFromInterval(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  /**
   * Sends a message to all peers in the room or optionally to a list of specified peers.
   *
   * @param message       The message encoded to an Uint8Array
   * @param targetPeerIds Optional list of target peer IDs
   */
  sendMessage(message: Uint8Array, targetPeerIds?: number[]): void {
    const params: MessageData = { message: message };
    if (targetPeerIds) {
      params.target_peer_ids = targetPeerIds;
    }
    this._roomStream?.request('SendMessage', params);
  }

  /**
   * Rests the internal peers list and closes the room stream.
   */
  reset(): void {
    this._peers.clear();
    this._roomStream?.close();
  }

  /**
   * Internal handler for room stream events.
   *
   * @private
   */
  private streamHandler(method: OdinEventMethods, params: any) {
    switch (method) {
      case 'RoomUpdated': {
        for (const update of params.updates) {
          this.roomUpdated(update);
        }
        break;
      }
      case 'PeerUpdated': {
        this.peerUpdated(params);
        break;
      }
      case 'MessageReceived': {
        const peer = this.peers.get(params.sender_peer_id);
        if (peer) {
          peer.eventTarget.dispatchEvent(new OdinEvent('MessageReceived', { message: params.message }));
        }
        this._eventTarget.dispatchEvent(
          new OdinEvent('MessageReceived', {
            sender: this.peers.get(params.sender_peer_id),
            message: params.message,
          })
        );
        break;
      }
    }
  }

  /**
   * Internal handler for room updates.
   *
   * @private
   */
  private roomUpdated(roomUpdate: RoomUpdate): void {
    switch (roomUpdate.kind) {
      case 'Joined': {
        this._me = new OdinPeer(roomUpdate.own_peer_id, this._roomStream);
        this._me.setFreeMediaIds(roomUpdate.media_ids);
        this._data = roomUpdate.room.user_data;
        this._customer = roomUpdate.room.customer;
        for (const peer of roomUpdate.room.peers) {
          this.addPeer(peer.id, peer.medias, peer.user_data);
        }
        this._eventTarget.dispatchEvent(
          new OdinEvent('Joined', { id: this._id, customer: this._customer, data: this._data })
        );
        break;
      }
      case 'UserDataChanged': {
        this._data = roomUpdate.user_data;
        this._eventTarget.dispatchEvent(new OdinEvent('UserDataChanged', { data: this._data }));
        break;
      }
      case 'PeerJoined': {
        const peer = this.addPeer(roomUpdate.peer.id, roomUpdate.peer.medias, roomUpdate.peer.user_data);
        if (peer) {
          this._eventTarget.dispatchEvent(new OdinEvent('PeerJoined', { peer: peer, peers: this.peers }));
        }
        break;
      }
      case 'PeerLeft': {
        const peer = this.removePeer(roomUpdate.peer_id);
        if (peer) {
          this._eventTarget.dispatchEvent(new OdinEvent('PeerLeft', { peer: peer, peers: this.peers }));
        }
        break;
      }
    }
  }

  /**
   * Internal handler for peer updates.
   *
   * @private
   */
  private peerUpdated(update: any): void {
    const peer = this.peers.get(update.peer_id);
    if (!peer) return;
    switch (update.kind) {
      case 'MediaStarted': {
        const media = new OdinMedia(update.media.id, update.peer_id, true, this._worker, this._roomStream);
        this._eventTarget.dispatchEvent(new OdinEvent('MediaStarted', { peer, media }));
        peer.addMedia(media);
        break;
      }
      case 'MediaStopped': {
        const media = peer.medias.get(update.media_id);
        this._eventTarget.dispatchEvent(new OdinEvent('MediaStopped', { peer, media }));
        peer.removeMediaById(update.media_id);
        break;
      }
      case 'PeerUserDataChanged': {
        peer.data = update.user_data;
        peer.eventTarget.dispatchEvent(new OdinEvent('UserDataChanged', { peer }));
        this._eventTarget.dispatchEvent(new OdinEvent('UserDataChanged', { peer }));
        break;
      }
    }
  }

  /**
   * Change the global master volume for the room (should be between 0 and 2).
   *
   * @param volume The new volume
   */
  changeVolume(volume: number): void {
    this._worker.postMessage({
      type: 'set_volume',
      media_id: 0,
      value: volume,
    });
  }

  /**
   * Creates a new peer instance and adds it to the room.
   *
   * @param peerId The ID of the peer
   * @param medias A list of media IDs to initialize for the peer
   * @param data   The user data for the peer
   */
  private addPeer(peerId: number, medias: { id: number }[], data: Uint8Array): OdinPeer | null {
    if (peerId === this.me.id) {
      return null;
    }
    const peer = new OdinPeer(peerId, this._roomStream);
    peer.data = data;
    medias.forEach((media) => {
      const mediaInstance = new OdinMedia(media.id, peerId, true, this._audioService.audioWorker, this._roomStream);
      peer.addMedia(mediaInstance);
    });
    this.peers.set(peerId, peer);
    return peer;
  }

  /**
   * Removes the peer with the specified ID from the room.
   *
   * @param peerId The id of the peer to remove
   */
  removePeer(peerId: number): OdinPeer | null {
    if (peerId === this.me.id) return null;
    const peer = this.peers.get(peerId);
    if (!peer) return null;
    peer.medias.forEach((media) => {
      peer.medias.delete(media.id);
    });
    this.peers.delete(peerId);
    return peer;
  }

  /**
   * Disables voice activity detection.
   */
  disableVAD() {
    this._audioService.disableVAD();
  }

  /**
   * Enables voice activity detection.
   */
  enableVAD() {
    this._audioService.enablesVAD();
  }

  /**
   * Add event listener to room events.
   *
   * @param eventName
   * @param handler
   */
  addEventListener<Event extends keyof RoomEvents>(eventName: Event, handler: RoomEvents[Event]): void {
    this._eventTarget.addEventListener(eventName, handler as EventListener);
  }
}
