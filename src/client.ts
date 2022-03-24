import {
  IAuthResult,
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
    return this._rooms;
  }

  /**
   * The current state of the main stream connection.
   */
  static get connectionState(): OdinConnectionState {
    return this._state;
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
   * Authenticates against the configured ODIN gateway and establishes the main stream connection.
   *
   * @private
   */
  private static async connect(token: string, gateway?: string): Promise<OdinRoom[]> {
    if (this.connectionState === OdinConnectionState.connected) {
      return this._rooms;
    }

    if (!this.config.gatewayUrl && !gateway) {
      throw new Error('No gateway URL configured');
    }

    this._worker = new Worker(workerScript);
    this._rtcHandler = new RtcHandler(this._worker);
    this._audioService = AudioService.setInstance(this._worker, this._rtcHandler.audioChannel);
    this.connectionState = OdinConnectionState.connecting;

    try {
      const gatewayAuthResult = await this.authGateway(token, gateway ?? this.config.gatewayUrl);
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
        return new OdinRoom(roomId, token, gatewayAuthResult.address, this._mainStream);
      });

      this.connectionState = OdinConnectionState.connected;
      return this._rooms;
    } catch (e) {
      this.connectionState = OdinConnectionState.error;
      throw new Error('Failed to establish main stream connection');
    }
  }

  /**
   * Authenticates against the ODIN server and returns `OdinRoom` instances for all rooms set in the specified token.
   *
   * @param token The room token for authentication
   * @param gateway The gateway to authenticate against
   * @returns A promise of the available rooms
   */
  static async initRooms(token: string, gateway?: string): Promise<OdinRoom[]> {
    return await this.connect(token, gateway);
  }

  /**
   * Authenticates against the ODIN server and returns an `OdinRoom` instance for the first room set in the specified token.
   *
   * @param token The room token for authentication
   * @param gateway The gateway to authenticate against
   * @returns A promise of the first available room
   */
  static async initRoom(token: string, gateway?: string): Promise<OdinRoom> {
    const rooms = await this.initRooms(token, gateway);

    if (rooms.length) {
      return rooms[0];
    } else {
      throw new Error('Could not create a room');
    }
  }

  /**
   * Not implemented.
   *
   * @private
   */
  private static mainHandler(method: string, params: unknown): void {}

  /**
   * Authenticates against the gateway and returns its result.
   *
   * @private
   */
  private static async authGateway(token: string, gateway: string): Promise<IAuthResult> {
    const response = await fetch(gateway, {
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
   * Disconnects from all rooms and stops all audio handling.
   */
  static disconnect(): void {
    this._rooms.forEach((room) => {
      room.reset();
    });

    if (this._audioService) {
      this._audioService.stopAllAudio();
    }
    if (this._mainStream) {
      this._mainStream.close();
    }
    if (this._worker) {
      this._worker.terminate();
    }
    if (this._rtcHandler) {
      this._rtcHandler.stopRtc();
    }

    this._rooms = [];
  }

  /**
   * Registers to client events from `IOdinClientEvents`.
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
