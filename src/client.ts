import {
  IAuthResult,
  IOdinAudioSettings,
  IOdinClientSettings,
  IOdinClientEvents,
  OdinConnectionState,
  OdinEvent,
  IOdinConnectionStateChangedEventPayload,
} from './types';
import { AudioService } from './audio-service';
import { RtcHandler } from './rtc-handler';
import { Stream } from './stream';
import { OdinRoom } from './room';
import { openStream } from './utils';
import { workerScript } from './worker';

/**
 * Class providing static methods to handle ODIN client connections.
 */
export class OdinClient {
  private static _eventTarget: EventTarget = new EventTarget();
  private static _mainStream: Stream;
  private static _rooms: OdinRoom[] = [];
  private static _rtcHandler: RtcHandler;
  private static _audioService: AudioService;
  private static _state: OdinConnectionState = OdinConnectionState.disconnected;
  private static _worker: Worker;

  /**
   * @ignore
   */
  constructor() {
    throw new Error('Not allowed to instantiate OdinClient');
  }

  /**
   * Global settings for ODIN connections.
   */
  static config: IOdinClientSettings = {
    gatewayUrl: 'https://gateway.odin.4players.io',
  };

  /**
   * An array of available `OdinRoom` instances.
   */
  static get rooms(): OdinRoom[] {
    return OdinClient._rooms;
  }

  /**
   * The current state of the main stream connection.
   */
  static get connectionState(): OdinConnectionState {
    return OdinClient._state;
  }

  /**
   * Update the state of the connection.
   */
  private static set connectionState(state: OdinConnectionState) {
    const oldState = this.connectionState;
    this._state = state;
    if (oldState !== state) {
      this.eventTarget.dispatchEvent(
        new OdinEvent<IOdinConnectionStateChangedEventPayload>('ConnectionStateChanged', { oldState, newState: state })
      );
    }
  }

  /**
   * Returns the event handler of the client.
   *
   * @ignore
   */
  static get eventTarget(): EventTarget {
    return this._eventTarget;
  }

  /**
   * Authenticates against the Odin gateway and establishes the main stream connection.
   *
   * @private
   */
  private static async connect(
    token: string,
    ms: MediaStream,
    audioSettings?: IOdinAudioSettings
  ): Promise<OdinRoom[]> {
    if (this.connectionState === OdinConnectionState.connected) {
      return this._rooms;
    }

    this._worker = new Worker(workerScript);
    this._rtcHandler = new RtcHandler(OdinClient._worker);
    this._audioService = AudioService.setInstance(ms, this._worker, this._rtcHandler.audioChannel, audioSettings);
    OdinClient.connectionState = OdinConnectionState.connecting;

    try {
      const gatewayAuthResult = await this.authGateway(token);

      this._mainStream = await openStream(`wss://${gatewayAuthResult.address}`, this.mainHandler);

      this._mainStream.onclose = () => {
        this.connectionState = OdinConnectionState.disconnected;
        this.disconnect();
      };

      this._mainStream.onerror = () => {
        this.connectionState = OdinConnectionState.error;
        this.disconnect();
      };

      const mainStreamAuthResult = await this._mainStream.request('Authenticate', {
        token: gatewayAuthResult.token,
      });
      const roomIds: string[] = mainStreamAuthResult.room_ids;

      await this._rtcHandler.startRtc(this._mainStream);
      await this._audioService.setupAudio();

      this._rooms = roomIds.map((roomId) => {
        return new OdinRoom(roomId, gatewayAuthResult.address, this._worker);
      });

      this.connectionState = OdinConnectionState.connected;

      return this._rooms;
    } catch (e) {
      console.error('Failed to establish main stream connection', e);
      this.connectionState = OdinConnectionState.error;
    }

    return [];
  }

  /**
   * Authenticates against the configured ODIN gateway and joins a room using a specified token.
   *
   * @param token         The room token for authentication
   * @param ms            The capture stream of the input device
   * @param audioSettings Optional audio settings like VAD or master volume used to initialize audio
   * @param userData      Optional user data to set for the peer when connecting
   * @param position      Optional coordinates to set the two-dimensional position of the peer in the room when connecting
   * @returns             A promise which yields when the room was joined
   */
  static async joinRoom(
    token: string,
    ms: MediaStream,
    audioSettings?: IOdinAudioSettings,
    userData?: Uint8Array,
    position?: [number, number]
  ): Promise<OdinRoom> {
    if (OdinClient.rooms.length > 0) {
      throw new Error('Failed to join room; close other open connections first');
    }
    const rooms = await this.connect(token, ms, audioSettings);
    if (rooms.length > 0) {
      await rooms[0].join(userData, position);

      rooms[0].addEventListener('ConnectionStateChanged', (event) => {
        if (
          event.payload.newState === OdinConnectionState.disconnected ||
          event.payload.newState === OdinConnectionState.error
        ) {
          this.connectionState = event.payload.newState;
          this.disconnect();
        }
      });
      return rooms[0];
    } else {
      throw new Error('Failed to join room; specified token did not contain a valid room ID');
    }
  }

  /**
   * Not implemented
   *
   * @private
   */
  private static mainHandler(method: string, params: any[]): void {}

  /**
   * Authenticate against the gateway and returns its result
   *
   * @private
   */
  private static async authGateway(token: string): Promise<IAuthResult> {
    if (!this.config.gatewayUrl) {
      throw new Error('No gateway URL configured');
    }
    const response = await fetch(this.config.gatewayUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'Connect',
        params: {},
      }),
    });
    const body = await response.json();
    if (body.result) {
      return body.result;
    } else {
      throw new Error(`Gateway authentication failed; ${body.error.message}`);
    }
  }

  /**
   * Exececute a command on the main stream.
   *
   * @ignore
   */
  static request(method: string, params: any): any {
    return this._mainStream.request(method, params);
  }

  /**
   * Disconnect from all rooms and stops all audio handling.
   */
  static disconnect(): void {
    this._rooms.forEach((room) => {
      room.reset();
    });

    if (this._audioService) {
      this._audioService.stopAllAudio();
    }
    if (this._mainStream) {
      OdinClient._mainStream.close();
    }
    if (this._worker) {
      OdinClient._worker.terminate();
    }
    if (this._rtcHandler) {
      OdinClient._rtcHandler.stopRtc();
    }

    this._rooms = [];
  }

  /**
   * Register to client events from `IOdinClientEvents`.
   *
   * @param eventName The name of the event to listen to
   * @param handler   The callback to handle the event
   */
  static addEventListener<Event extends keyof IOdinClientEvents>(
    eventName: Event,
    handler: IOdinClientEvents[Event]
  ): void {
    this._eventTarget.addEventListener(eventName, handler as EventListener);
  }
}
