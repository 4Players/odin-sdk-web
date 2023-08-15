import {
  IMessageData,
  IOdinAudioSettings,
  IOdinConnectionStateChangedEventPayload,
  IOdinMediaStartedStoppedEventPayload,
  IOdinMessageReceivedEventPayload,
  IOdinPeerDataChangedEventPayload,
  IOdinPeerJoinedLeftEventPayload,
  IOdinRoomDataChangedEventPayload,
  IOdinRoomEvents,
  IOdinRoomJoinedLeftEventPayload,
  OdinConnectionState,
  OdinEvent,
} from './types';
import { OdinAudioService } from './audio';
import { OdinPeer } from './peer';
import { OdinMedia } from './media';
import { makeHandler, OdinStream } from './stream';
import { openStream } from './utils';
import { EVENT_SCHEMAS, EventSchemaByMethod, PeerUpdatedSchemaType } from './schema-types';

/**
 * Class describing an `OdinRoom`.
 */
export class OdinRoom {
  /**
   * An optional instance of `OdinAudioService` used for handling audio interactions.
   */
  private _audioService?: OdinAudioService;

  /**
   * An instance of `EventTarget` for handling events related to this room.
   */
  private _eventTarget: EventTarget = new EventTarget();

  /**
   * The `OdinStream` instance representing the main connection for the room.
   */
  private _roomStream!: OdinStream;

  /**
   * The `OdinPeer` instance representing the current user within the room.
   */
  private _ownPeer!: OdinPeer;

  /**
   * The two-dimensional position of the current user within the room.
   */
  private _position!: [number, number];

  /**
   * The current connection state of the room, defaulting to 'disconnected'.
   */
  private _connectionState: OdinConnectionState = 'disconnected';

  /**
   * The arbitrary user data for the room.
   */
  private _data: Uint8Array = new Uint8Array();

  /**
   * A Map storing all remote `OdinPeer` instances within the room, using the peer ID as the key.
   */
  private _remotePeers: Map<number, OdinPeer> = new Map();

  /**
   * The customer identifier to which this room is assigned.
   */
  private _customer: string = '<no customer>';

  /**
   * Creates a new `OdinRoom` instance.
   *
   * @param _id         The ID of the new room
   * @param _user_id    The user ID specified in the authentication token
   * @param _address    The address of the ODIN SFU this room lives on
   * @param _mainStream The main stream connection this room is based on
   * @ignore
   */
  constructor(
    private _id: string,
    private _user_id: string,
    private _address: string,
    private _mainStream: OdinStream
  ) {
    const audioService = OdinAudioService.getInstance();
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
    const oldState = this._connectionState;
    this._connectionState = state;
    if (oldState !== state) {
      this.eventTarget.dispatchEvent(
        new OdinEvent<IOdinConnectionStateChangedEventPayload>('ConnectionStateChanged', { oldState, newState: state })
      );
      if (state === 'disconnected') {
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
   * A map of all remote `OdinPeer` instances in the room using the peer ID as index.
   */
  get remotePeers(): Map<number, OdinPeer> {
    return this._remotePeers;
  }

  /**
   * The current two-dimensional position of our own `OdinPeer` in the room.
   */
  get position(): [number, number] {
    return this._position;
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
   * @param userData Optional user data to set for the peer when connecting
   * @param position Optional coordinates to set the two-dimensional position of the peer in the room when connecting
   * @returns        A promise of the own OdinPeer which yields when the room was joined
   */
  async join(userData?: Uint8Array, position?: [number, number]): Promise<OdinPeer> {
    this.connectionState = 'connecting';

    if (!position) {
      const a = Math.random() * 2 * Math.PI;
      const r = 0.5 * Math.sqrt(Math.random());
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      position = [x, y];
    }
    if (!userData) {
      userData = new Uint8Array();
    }

    let streamId: string | undefined;
    try {
      try {
        const result = (await this._mainStream.request('JoinRoom', {
          room_id: this.id,
          user_data: userData,
          position,
        })) as { stream_id: string };
        streamId = result.stream_id;
      } catch (e) {
        throw new Error('JoinRoom on the main stream failed\n' + e);
      }

      if (!streamId) throw new Error('No Stream ID fetched\n');

      try {
        this._roomStream = await openStream(`wss://${this._address}/room?${streamId}`, this.streamHandler.bind(this));
        this._roomStream.onclose = () => {
          this.connectionState = 'disconnected';
          this.disconnect();
        };
      } catch (e) {
        throw new Error('Could not open the room stream\n' + e);
      }

      await new Promise<void>((resolve, reject) =>
        this.addEventListener('ConnectionStateChanged', (connection) => {
          if (connection.payload.newState === 'connected') {
            resolve();
          }
        })
      );

      this._ownPeer.data = userData;

      this.eventTarget.dispatchEvent(
        new OdinEvent<IOdinPeerJoinedLeftEventPayload>('PeerJoined', { room: this, peer: this._ownPeer })
      );

      this.eventTarget.dispatchEvent(new OdinEvent<IOdinRoomJoinedLeftEventPayload>('Joined', { room: this }));

      return this._ownPeer;
    } catch (e) {
      this.connectionState = 'error';
      throw new Error('Could not join the room\n' + e);
    }
  }

  /**
   * Changes the active capture stream (e.g. when switching to another input device).
   *
   * @param mediaStream The capture stream of the input device
   */
  async changeMediaStream(mediaStream: MediaStream) {
    if (!this._audioService) {
      throw new Error('Unable to change media stream; audio service is not available\n');
    } else if (this.connectionState !== 'connected') {
      throw new Error('Unable to change media stream; room is not connected\n');
    }

    try {
      await this._audioService.updateInputStream(mediaStream);
    } catch (e) {
      throw new Error('Could not change MediaStream\n' + e);
    }
  }

  /**
   * Creates a new local media using the specified stream.
   *
   * @param mediaStream   The capture stream of the input device
   * @param audioSettings Optional audio settings like VAD or master volume used to initialize audio
   * @returns             A promise of the newly created OdinMedia.
   */
  async createMedia(mediaStream: MediaStream, audioSettings?: IOdinAudioSettings): Promise<OdinMedia> {
    if (!this._audioService) {
      throw new Error('Unable to create new media; audio service is not available\n');
    } else if (this.connectionState !== 'connected') {
      throw new Error('Unable to create new media; room is not connected\n');
    } else if (!this._ownPeer) {
      throw new Error('Unable to create new media; own peer information is not available\n');
    }

    if (audioSettings) {
      this._audioService.setVoiceProcessingConfig(audioSettings);
    }

    await this._audioService.updateInputStream(mediaStream);

    const newMedia = this._ownPeer.createMedia();
    this._ownPeer.eventTarget.dispatchEvent(
      new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStarted', {
        room: this,
        peer: this._ownPeer,
        media: newMedia,
      })
    );
    this.eventTarget.dispatchEvent(
      new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStarted', {
        room: this,
        peer: this._ownPeer,
        media: newMedia,
      })
    );
    return newMedia;
  }

  /**
   * Adds a local media stream to the room.
   *
   * @param media The media instance to be added
   * @ignore
   */
  async addMedia(media: OdinMedia) {
    if (media.remote) {
      throw new Error('Unable to add new media; media is owned by a remote peer\n');
    }

    await this._roomStream?.request('StartMedia', {
      media_id: media.id,
      properties: {},
    });
  }

  /**
   * Removes a local media stream from the room.
   *
   * @param media The media instance to be removed
   * @ignore
   */
  async removeMedia(media: OdinMedia) {
    if (media.remote) {
      throw new Error('Unable to remove media; media is owned by a remote peer\n');
    }

    await this._roomStream?.request('StopMedia', {
      media_id: media.id,
      properties: {},
    });
  }

  /**
   * Updates the two-dimensional position of our own `OdinPeer` in the room to apply server-side culling.
   *
   * @param offsetX The new X coordinate for the peers position in the room
   * @param offsetY The new Y coordinate for the peers position in the room
   */
  setPosition(offsetX: number, offsetY: number): void {
    this._position = [offsetX, offsetY];

    if (this._connectionState === 'connected') {
      this._roomStream?.request('SetPeerPosition', {
        position: [offsetX, offsetY],
      });
    }
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
   * Sends a message with arbitrary data to all peers in the room or optionally to a list of specified peers.
   *
   * @param message       Byte array of arbitrary data to send
   * @param targetPeerIds Optional list of target peer IDs
   */
  async sendMessage(message: Uint8Array, targetPeerIds?: number[]) {
    const params: IMessageData = { message };

    if (targetPeerIds) {
      params.target_peer_ids = targetPeerIds;
    }

    await this._roomStream?.request('SendMessage', params);
  }

  /**
   * Leaves the room and closes the connection to the server.
   *
   * @ignore
   */
  disconnect(): void {
    this._remotePeers.clear();
    this._roomStream?.close();

    this.connectionState = 'disconnected';
  }

  /**
   * Internal handler for room stream events.
   *
   * @private
   */
  private streamHandler(method: string, params: unknown) {
    const handler = makeHandler(
      EVENT_SCHEMAS,
      {
        async RoomUpdated(params, room) {
          for (const update of params.updates) {
            await room.roomUpdated(update);
          }
        },
        async PeerUpdated(params, room) {
          room.peerUpdated(params);
        },
        async MessageReceived(params, room) {
          const peer = room._remotePeers.get(params.sender_peer_id);
          const payload = {
            room,
            senderId: params.sender_peer_id,
            message: params.message,
          };
          peer?.eventTarget.dispatchEvent(new OdinEvent<IOdinMessageReceivedEventPayload>('MessageReceived', payload));
          room.eventTarget.dispatchEvent(new OdinEvent<IOdinMessageReceivedEventPayload>('MessageReceived', payload));
        },
      },
      this
    );

    handler(method, params);
  }

  /**
   * Internal handler for room updates.
   *
   * @private
   */
  private async roomUpdated(roomUpdate: EventSchemaByMethod<'RoomUpdated'>['updates'][number]): Promise<void> {
    switch (roomUpdate.kind) {
      case 'Joined': {
        if (!roomUpdate.room || !roomUpdate.own_peer_id || !roomUpdate.media_ids) {
          throw Error(`The room update of kind ${roomUpdate.kind} is missing fields.`);
        }
        this._data = roomUpdate.room.user_data;
        this._customer = roomUpdate.room.customer;
        this._ownPeer = new OdinPeer(this._roomStream, roomUpdate.own_peer_id, this._user_id, false);
        this._ownPeer.setFreeMediaIds(roomUpdate.media_ids);
        for (const remotePeer of roomUpdate.room.peers) {
          const peer = this.addRemotePeer(remotePeer.id, remotePeer.user_id, remotePeer.medias, remotePeer.user_data);
          this.eventTarget.dispatchEvent(
            new OdinEvent<IOdinPeerJoinedLeftEventPayload>('PeerJoined', { room: this, peer })
          );
          peer.medias.forEach((media) => {
            peer.eventTarget.dispatchEvent(
              new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStarted', { room: this, peer, media })
            );
            this.eventTarget.dispatchEvent(
              new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStarted', { room: this, peer, media })
            );
          });
        }
        this.connectionState = 'connected';
        break;
      }
      case 'UserDataChanged': {
        if (!roomUpdate.user_data) {
          throw Error(`The room update of kind ${roomUpdate.kind} is missing fields.`);
        }
        this._data = roomUpdate.user_data;
        this.eventTarget.dispatchEvent(
          new OdinEvent<IOdinRoomDataChangedEventPayload>('UserDataChanged', { room: this })
        );
        break;
      }
      case 'PeerJoined': {
        if (!roomUpdate.peer) {
          throw Error(`The room update of kind ${roomUpdate.kind} is missing fields.`);
        }
        const peer = this.addRemotePeer(
          roomUpdate.peer.id,
          roomUpdate.peer.user_id,
          roomUpdate.peer.medias,
          roomUpdate.peer.user_data
        );
        if (peer) {
          this.eventTarget.dispatchEvent(
            new OdinEvent<IOdinPeerJoinedLeftEventPayload>('PeerJoined', { room: this, peer })
          );

          peer.medias.forEach((media) => {
            peer.eventTarget.dispatchEvent(
              new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStarted', { room: this, peer, media })
            );
            this.eventTarget.dispatchEvent(
              new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStarted', { room: this, peer, media })
            );
          });
        }
        break;
      }
      case 'PeerLeft': {
        if (!roomUpdate.peer_id) {
          throw Error(`The room update of kind ${roomUpdate.kind} is missing fields.`);
        }
        await this.removePeer(roomUpdate.peer_id);
        break;
      }
    }
  }

  /**
   * Internal handler for peer updates.
   *
   * @private
   */
  private peerUpdated(update: PeerUpdatedSchemaType): void {
    const peer = this._remotePeers.get(update.peer_id);
    if (!peer) return;

    switch (update.kind) {
      case 'MediaStarted': {
        if (!update.media) {
          throw Error(`The peer update of kind ${update.kind} is missing fields.`);
        } else if (update.media.properties?.kind === 'video') {
          // support for video medias will be added in a future sdk releases
          return;
        }
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
        if (!update.media_id) {
          throw Error(`The peer update of kind ${update.kind} is missing fields.`);
        }
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
      case 'UserDataChanged': {
        if (!update.user_data) {
          throw Error(`The peer update of kind ${update.kind} is missing fields.`);
        }
        peer.data = update.user_data;
        peer.eventTarget.dispatchEvent(
          new OdinEvent<IOdinPeerDataChangedEventPayload>('UserDataChanged', { room: this, peer })
        );
        this.eventTarget.dispatchEvent(
          new OdinEvent<IOdinPeerDataChangedEventPayload>('PeerUserDataChanged', { room: this, peer })
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
    if (!this._audioService) return;

    this._audioService.audioWorker.postMessage({
      type: 'set_volume',
      media_id: 0,
      value: volume,
    });
  }

  /**
   * Creates a new peer instance and adds it to the room.
   *
   * @param peerId The ID of the peer
   * @param userId The identifier of the peer specified during authentication
   * @param medias A list of media IDs to initialize for the peer
   * @param data   The user data for the peer
   */
  private addRemotePeer(
    peerId: number,
    userId: string,
    medias: { id: number; properties?: any }[],
    data: Uint8Array
  ): OdinPeer {
    if (peerId === this._ownPeer.id) {
      throw new Error('Can not add the remote peer with this method\n');
    }

    const peer = new OdinPeer(this._roomStream, peerId, userId, true);
    peer.data = data;

    medias.forEach((media) => {
      if (media.properties?.kind === 'video') {
        // support for video medias will be added in a future sdk releases
        return;
      }
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
  private async removePeer(peerId: number): Promise<OdinPeer | undefined> {
    if (peerId === this._ownPeer.id) {
      return;
    }

    const peer = this._remotePeers.get(peerId);
    if (!peer) {
      return;
    }

    for (const media of peer.medias.entries()) {
      peer.eventTarget.dispatchEvent(
        new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStopped', { room: this, peer, media: media[1] })
      );
      this.eventTarget.dispatchEvent(
        new OdinEvent<IOdinMediaStartedStoppedEventPayload>('MediaStopped', { room: this, peer, media: media[1] })
      );

      await media[1].stop();
      peer.medias.delete(media[1].id);
    }

    this.eventTarget.dispatchEvent(new OdinEvent<IOdinPeerJoinedLeftEventPayload>('PeerLeft', { room: this, peer }));

    this._remotePeers.delete(peerId);
    return peer;
  }

  /**
   * Disables RNN-based voice activity detection.
   */
  disableVAD() {
    if (!this._audioService) return;

    const config = this._audioService.getVoiceProcessingConfig();

    config.voiceActivityDetection = false;

    this._audioService.setVoiceProcessingConfig(config);
  }

  /**
   * Enables RNN-based voice activity detection.
   */
  enableVAD() {
    if (!this._audioService) return;

    const config = this._audioService.getVoiceProcessingConfig();

    config.voiceActivityDetection = true;

    this._audioService.setVoiceProcessingConfig(config);
  }

  /**
   * Updates thresholds for vice activity detection (between 0 and 1).
   *
   * @param attackProbability  Voice probability value when the VAD should engage
   * @param releaseProbability Voice probability value when the VAD should disengage
   */
  updateVADThresholds(attackProbability: number, releaseProbability?: number) {
    if (!this._audioService) return;

    const config = this._audioService.getVoiceProcessingConfig();

    config.voiceActivityDetectionAttackProbability = attackProbability;
    config.voiceActivityDetectionReleaseProbability = releaseProbability ?? attackProbability - 0.1;

    this._audioService.setVoiceProcessingConfig(config);
  }

  /**
   * Disables RNN-based voice activity detection.
   */
  disableVolumeGate() {
    if (!this._audioService) return;

    const config = this._audioService.getVoiceProcessingConfig();

    config.volumeGate = false;

    this._audioService.setVoiceProcessingConfig(config);
  }

  /**
   * Enables RNN-based voice activity detection.
   */
  enableVolumeGate() {
    if (!this._audioService) return;

    const config = this._audioService.getVoiceProcessingConfig();

    config.volumeGate = true;

    this._audioService.setVoiceProcessingConfig(config);
  }

  /**
   * Updates thresholds for the input volume gate (between -90 and 0).
   *
   * @param attackLoudness  Root mean square power (dBFS) when the volume gate should engage
   * @param releaseLoudness Root mean square power (dBFS) when the volume gate should disengage
   */
  updateVolumeGateThresholds(attackLoudness: number, releaseLoudness?: number) {
    if (!this._audioService) return;

    const config = this._audioService.getVoiceProcessingConfig();

    config.volumeGateAttackLoudness = attackLoudness;
    config.volumeGateReleaseLoudness = releaseLoudness ?? attackLoudness - 10;

    this._audioService.setVoiceProcessingConfig(config);
  }

  /**
   * Returns the current voice processing config for VAD and volume gate.
   */
  getAudioSettings(): IOdinAudioSettings | undefined {
    return this._audioService?.getVoiceProcessingConfig();
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
