import {
  OdinConnectionState,
  OdinEventMethods,
  OdinEvent,
  RoomUpdate,
  IOdinRoomEvents,
  IOdinConnectionStateChangedEventPayload,
  IMessageData,
  IOdinMessageReceivedEventPayload,
  IOdinRoomJoinedLeftEventPayload,
  IOdinRoomDataChangedEventPayload,
  IOdinPeerJoinedLeftEventPayload,
  IOdinMediaStartedStoppedEventPayload,
  IOdinPeerDataChangedEventPayload,
} from './types';
import { AudioService } from './audio-service';
import { OdinClient } from './client';
import { OdinPeer } from './peer';
import { OdinMedia } from './media';
import { Stream } from './stream';
import { openStream } from './utils';
import { OdinRoomJoinedLeftEvent } from '.';

/**
 * Class describing an `OdinRoom`.
 */
export class OdinRoom {
  private _ownPeer!: OdinPeer;
  private _customer: String = '';
  private _data: Uint8Array = new Uint8Array();
  private _remotePeers: Map<number, OdinPeer> = new Map();
  private _roomStream!: Stream;
  private _eventTarget: EventTarget = new EventTarget();
  private _connectionState: OdinConnectionState = OdinConnectionState.disconnected;
  private _audioService!: AudioService;

  /**
   * Creates a new `OdinRoom` instance.
   *
   * @param _id      The ID of the new room
   * @param _address The address of the ODIN server this room lives on
   * @param _worker  An instance of the internal worker handing audo I/O
   */
  constructor(private _id: string, private _address: string, private _worker: Worker) {
    const audioService = AudioService.getInstance();
    if (audioService) {
      this._audioService = audioService;
      this._audioService.room = this;
    }
  }

  /**
   * The ID of the room.
   */
  get id(): string {
    return this._id;
  }

  /**
   * The customer identifier this room is assigned to.
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
   * The arbitrary user data of the room.
   */
  get data(): Uint8Array {
    return this._data;
  }

  /**
   * The current state of the room stream connection.
   */
  get connectionState(): OdinConnectionState {
    return this._connectionState;
  }

  /**
   * Update the connection state of the room.
   */
  private set connectionState(state: OdinConnectionState) {
    const oldState = this.connectionState;
    this._connectionState = state;
    if (oldState !== state) {
      this.eventTarget.dispatchEvent(
        new OdinEvent<IOdinConnectionStateChangedEventPayload>('ConnectionStateChanged', { oldState, newState: state })
      );
      if (state === OdinConnectionState.disconnected) {
        this.eventTarget.dispatchEvent(
          new OdinEvent<IOdinRoomJoinedLeftEventPayload>('Left', {
            room: this,
          })
        );
      }
    }
  }

  /**
   * An instance of your own `OdinPeer` in the room.
   */
  get ownPeer(): OdinPeer {
    return this._ownPeer;
  }

  /**
   * A map of all remore `OdinPeer` instances in the room using the peer ID as index.
   */
  get remotePeers(): Map<number, OdinPeer> {
    return this._remotePeers;
  }

  /**
   * An event target handler for the room.
   *
   * @ignore
   */
  get eventTarget(): EventTarget {
    return this._eventTarget;
  }

  /**
   * The address of the voice server this room is living on.
   */
  get serverAddress(): string {
    return this._address;
  }

  /**
   * Joins the room and returns your own peer instance after the room was successfully joined.
   *
   * @param   userData Optional user data to set for the peer when connecting
   * @param   position Optional coordinates to set the two-dimensional position of the peer in the room when connecting
   * @returns Returns your own peer
   */
  async join(userData?: Uint8Array, position?: [number, number]): Promise<OdinPeer | null> {
    this.connectionState = OdinConnectionState.connecting;
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
      this._roomStream = await this.connectRoom(this._address, this._id, userData, position);
      await new Promise((resolve) => this._eventTarget.addEventListener('Joined', resolve, { once: true }));
      if (this._ownPeer) {
        this._ownPeer.data = userData;
      }
      this.connectionState = OdinConnectionState.connected;
      return this._ownPeer;
    } catch (e) {
      this.connectionState = OdinConnectionState.error;
      return null;
    }
  }

  /**
   * Changes the active capture stream.
   */
  changeMediaStream(ms: MediaStream) {
    if (this.connectionState !== OdinConnectionState.connected) {
      throw new Error('Unable to change media stream; room is not connected');
    }

    this._audioService.changeMediaStream(ms);
  }

  /**
   * Creates a new local media using the specified stream.
   */
  createMedia(): OdinMedia {
    if (this.connectionState !== OdinConnectionState.connected) {
      throw new Error('Unable to create new media; room is not connected');
    } else if (!this._ownPeer) {
      throw new Error('Unable to create new media; own peer information is not available');
    }

    return this._ownPeer.createMedia();
  }

  /**
   * Adds a local media stream to the room.
   *
   * @param media The media instance to be added.
   * @ignore
   */
  async addMedia(media: OdinMedia) {
    if (media.remote) {
      throw new Error('Unable to add new media; media is owned by a remote peer');
    }

    await this._roomStream?.request('StartMedia', {
      media_id: media.id,
      properties: {},
    });
  }

  /**
   * Removes a local media stream from the room.
   *
   * @param media The media instance to be removed.
   * @ignore
   */
  async removeMedia(media: OdinMedia) {
    if (media.remote) {
      throw new Error('Unable to remove media; media is owned by a remote peer');
    }

    await this._roomStream?.request('StopMedia', {
      media_id: media.id,
      properties: {},
    });
  }

  /**
   * Joins a room and opens the room stream.
   *
   * @private
   */
  private async connectRoom(
    address: string,
    roomId: string,
    userData: Uint8Array,
    position: [number, number]
  ): Promise<Stream> {
    const params = {
      room_id: roomId,
      user_data: userData,
      position: position,
    };

    const { stream_id } = await OdinClient.request('JoinRoom', params);
    return openStream(`wss://${address}?${stream_id}`, this.streamHandler.bind(this));
  }

  /**
   * Updates the two-dimensional position of our own `OdinPeer` in the room to apply server-side culling.
   *
   * @param offsetX
   * @param offsetY
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
   * Sends updated user data of the room to the server.
   */
  async flushDataUpdate() {
    await this._roomStream?.request('UpdateRoom', {
      user_data: this.data,
    });
  }

  /**
   * Sends updated user data of your own peer to the server.
   */
  async flushOwnPeerDataUpdate() {
    await this._roomStream?.request('UpdatePeer', {
      user_data: this.ownPeer.data,
    });
  }

  /**
   * Sends a message with arbitrary datato all peers in the room or optionally to a list of specified peers.
   *
   * @param message       Byte array of arbitrary data to send
   * @param targetPeerIds Optional list of target peer IDs
   */
  async sendMessage(message: Uint8Array, targetPeerIds?: number[]) {
    const params: IMessageData = { message: message };
    if (targetPeerIds) {
      params.target_peer_ids = targetPeerIds;
    }
    await this._roomStream?.request('SendMessage', params);
  }

  /**
   * Rests the internal peers list and closes the room stream.
   *
   * @ignore
   */
  reset(): void {
    this._remotePeers.clear();
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
        const peer = this._remotePeers.get(params.sender_peer_id);
        const payload = {
          room: this,
          senderId: params.sender_peer_id,
          message: params.message,
        };
        peer?.eventTarget.dispatchEvent(new OdinEvent<IOdinMessageReceivedEventPayload>('MessageReceived', payload));
        this.eventTarget.dispatchEvent(new OdinEvent<IOdinMessageReceivedEventPayload>('MessageReceived', payload));
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
        this._ownPeer = new OdinPeer(roomUpdate.own_peer_id);
        this._ownPeer.setFreeMediaIds(roomUpdate.media_ids);
        this._data = roomUpdate.room.user_data;
        this._customer = roomUpdate.room.customer;
        for (const peer of roomUpdate.room.peers) {
          this.addPeer(peer.id, peer.medias, peer.user_data);
        }
        this.eventTarget.dispatchEvent(new OdinEvent<IOdinRoomJoinedLeftEventPayload>('Joined', { room: this }));
        break;
      }
      case 'UserDataChanged': {
        this._data = roomUpdate.user_data;
        this.eventTarget.dispatchEvent(
          new OdinEvent<IOdinRoomDataChangedEventPayload>('UserDataChanged', { room: this })
        );
        break;
      }
      case 'PeerJoined': {
        const peer = this.addPeer(roomUpdate.peer.id, roomUpdate.peer.medias, roomUpdate.peer.user_data);
        if (peer) {
          this.eventTarget.dispatchEvent(
            new OdinEvent<IOdinPeerJoinedLeftEventPayload>('PeerJoined', { room: this, peer })
          );
        }
        break;
      }
      case 'PeerLeft': {
        const peer = this.removePeer(roomUpdate.peer_id);
        if (peer) {
          this.eventTarget.dispatchEvent(
            new OdinEvent<IOdinPeerJoinedLeftEventPayload>('PeerLeft', { room: this, peer })
          );
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
    const peer = this._remotePeers.get(update.peer_id);
    if (!peer) {
      return;
    }
    switch (update.kind) {
      case 'MediaStarted': {
        const media = new OdinMedia(update.media.id, update.peer_id, true);
        peer.addMedia(media);
        peer.eventTarget.dispatchEvent(
          new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStarted', { room: this, peer, media })
        );
        this.eventTarget.dispatchEvent(
          new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStarted', { room: this, peer, media })
        );
        break;
      }
      case 'MediaStopped': {
        const media = peer.medias.get(update.media_id);
        peer.removeMediaById(update.media_id);
        if (media) {
          peer.eventTarget.dispatchEvent(
            new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStopped', { room: this, peer, media })
          );
          this.eventTarget.dispatchEvent(
            new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStopped', { room: this, peer, media })
          );
        }
        break;
      }
      case 'PeerUserDataChanged': {
        peer.data = update.user_data;
        peer.eventTarget.dispatchEvent(
          new OdinEvent<IOdinPeerDataChangedEventPayload>('UserDataChanged', { room: this, peer })
        );
        this.eventTarget.dispatchEvent(
          new OdinEvent<IOdinPeerDataChangedEventPayload>('UserDataChanged', { room: this, peer })
        );
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
  private addPeer(peerId: number, medias: { id: number }[], data: Uint8Array): OdinPeer | undefined {
    if (peerId === this._ownPeer.id) {
      return;
    }
    const peer = new OdinPeer(peerId);
    peer.data = data;
    medias.forEach((media) => {
      const mediaInstance = new OdinMedia(media.id, peerId, true);
      peer.addMedia(mediaInstance);
    });
    this._remotePeers.set(peerId, peer);
    return peer;
  }

  /**
   * Removes the peer with the specified ID from the room.
   *
   * @param peerId The id of the peer to remove
   */
  private removePeer(peerId: number): OdinPeer | undefined {
    if (peerId === this._ownPeer.id) {
      return;
    }
    const peer = this._remotePeers.get(peerId);
    if (!peer) {
      return;
    }
    peer.medias.forEach((media) => {
      peer.medias.delete(media.id);
    });
    this._remotePeers.delete(peerId);
    return peer;
  }

  /**
   * Disables RNN-based voice activity detection.
   */
  disableVAD() {
    this._audioService.disableVAD();
  }

  /**
   * Enables RNN-based voice activity detection.
   */
  enableVAD() {
    this._audioService.enablesVAD();
  }

  /**
   * Exececute a command on the room stream.
   *
   * @ignore
   */
  request(method: string, params: any): any {
    return this._roomStream.request(method, params);
  }

  /**
   * Register to peer events from `IOdinRoomEvents`.
   *
   * @param eventName The name of the event to listen to
   * @param handler   The callback to handle the event
   */
  addEventListener<OdinEvent extends keyof IOdinRoomEvents>(
    eventName: OdinEvent,
    handler: IOdinRoomEvents[OdinEvent]
  ): void {
    this._eventTarget.addEventListener(eventName, handler as EventListener);
  }
}
