import {
  IAuthResult,
  IOdinClientSettings,
  IOdinClientEvents,
  IOdinConnectionStateChangedEventPayload,
  OdinConnectionState,
  OdinEvent,
} from './types';
import { OdinAudioService } from './audio';
import { OdinRtcHandler } from './rtc-handler';
import { OdinStream } from './stream';
import { OdinRoom } from './room';
import { openStream } from './utils';
import { workerScript } from './worker';

/**
 * Class providing static methods to handle ODIN client connections.
 */
export class OdinClient {
  /**
   * Optional audio service used for ODIN audio functionality.
   */
  private static _audioService?: OdinAudioService;

  /**
   * RTCPeerConnection handler for handling WebRTC operations.
   */
  private static _rtcHandler?: OdinRtcHandler;


  /**
   * Main WebSocket stream to interact with the ODIN server.
   */
  private static _mainStream: OdinStream;

  /**
   * EventTarget instance to listen for and dispatch custom events.
   */
  private static _eventTarget: EventTarget = new EventTarget();

  /**
   * Connection state of the client to the ODIN server.
   */
  private static _state: OdinConnectionState = 'disconnected';

  /**
   * Array holding the currently available `OdinRoom` instances.
   */
  private static _rooms: OdinRoom[] = [];
  private static _worker?: Worker;

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
   * Updates the state of the connection.
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
   * Authenticates the client, establishes the main stream connection, sets up audio context and WebRTC connection, and finally
   * creates `OdinRoom` instances.
   *
   * @private
   */
  private static async connect(token: string, gateway?: string, audioContext?: AudioContext): Promise<OdinRoom[]> {
    if (this.connectionState === 'connected') {
      return this._rooms;
    }

    if (!this.config.gatewayUrl && !gateway) {
      throw new Error('No gateway URL configured\n');
    }

    let audioContexts: OdinAudioContextConfig | undefined;

    if (typeof audioContext === 'undefined') {
      if (typeof AudioContext === 'undefined') {
        console.warn('AudioContext is not available on this platform; disabling ODIN audio functionality');
      } else if (typeof Worker === 'undefined') {
        console.warn('Worker is not available on this platform; disabling ODIN audio functionality');
      } else {
        audioContexts = setupDefaultAudioContext(audioContext);
      }
    }

    if (audioContexts) {
      await audioContexts.input.resume();
      await audioContexts.output.resume();

      const rtc = new RTCPeerConnection();
      rtc.onconnectionstatechange = () => {
        if (rtc.connectionState === 'failed') {
          console.error('Failed to establish RTC peer connection; ODIN audio functionality is disrupted');
          this.connectionState = 'incomplete';
        }
      };

      this._worker = new Worker(workerScript);
      this._rtcHandler = new OdinRtcHandler(this._worker, rtc);
      this._audioService = OdinAudioService.setInstance(this._worker, this._rtcHandler.audioChannel, audioContexts);
    }

    this.connectionState = 'connecting';

    try {
      const gatewayAuthResult = await this.authGateway(token, gateway ?? this.config.gatewayUrl);
      this._mainStream = await openStream(`wss://${gatewayAuthResult.address}/main`, this.mainHandler);

      this._mainStream.onclose = () => {
        this.connectionState = 'disconnected';
        this.disconnect();
      };

      this._mainStream.onerror = () => {
        this.connectionState = 'error';
        this.disconnect();
      };

      let roomIds: string[] = [];
      try {
        const mainStreamAuthResult = (await this._mainStream.request('Authenticate', {
          token: gatewayAuthResult.token,
        })) as { room_ids: string[] };

        if (mainStreamAuthResult && mainStreamAuthResult.room_ids) {
          roomIds = mainStreamAuthResult.room_ids;
        }
      } catch (err) {
        if ((err as any).message === 'unknown method') {
          console.warn('Incompatible ODIN server version detected; please update your client');
        }
        throw err;
      }

      await this._rtcHandler?.startRtc(this._mainStream);
      await this._audioService?.setupAudio();

      this._rooms = roomIds.map((roomId) => {
        return new OdinRoom(roomId, token, gatewayAuthResult.address, this._mainStream);
      });

      /**
       * Currently, if the connection of the room gets closed, also close the connection of the OdinClient.
       * This might change, once multiple rooms will get supported.
       */
      for (const room of this._rooms) {
        room.addEventListener('Left', (_) => {
          this.disconnect();
        });
      }

      this.connectionState = 'connected';
      return this._rooms;
    } catch (e) {
      this.connectionState = 'error';
      throw new Error('Failed to establish main stream connection\n' + e);
    }
  }

  /**
   * Authenticates against the ODIN server and returns `OdinRoom` instances for all rooms set in the specified token.
   *
   * @param token   The room token for authentication
   * @param gateway The gateway to authenticate against
   * @returns       A promise of the available rooms
   */
  static async initRooms(token: string, gateway?: string, audioContext?: AudioContext): Promise<OdinRoom[]> {
    try {
      return await this.connect(token, gateway, audioContext);
    } catch (e) {
      throw new Error('Could not connect the rooms\n' + e);
    }
  }

  /**
   * Authenticates against the ODIN server and returns an `OdinRoom` instance for the first room set in the specified token.
   *
   * @param token   The room token for authentication
   * @param gateway The gateway to authenticate against
   * @returns       A promise of the first available room
   */
  static async initRoom(token: string, gateway?: string, audioContext?: AudioContext): Promise<OdinRoom> {
    const rooms = await this.initRooms(token, gateway, audioContext);

    if (rooms.length) {
      return rooms[0];
    } else {
      throw new Error('Could not create a room\n');
    }
  }

  /**
   * Not implemented.
   *
   * @private
   */
  private static mainHandler(_method: string, _params: unknown): void {}

  /**
   * Authenticates against the gateway and returns its result.
   *
   * @param token   The token for authentication
   * @param gateway The gateway to authenticate against
   * @returns       A promise resolving to the authentication result
   */
  private static async authGateway(token: string, gateway: string): Promise<IAuthResult> {
    let response: Response | undefined;
    try {
      response = await fetch(gateway, {
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
    } catch (e) {
      throw new Error('Error happened when authenticating at the gateway\n' + e);
    }
    const body = await response.json();
    if (body.result) {
      return body.result;
    } else {
      throw new Error(`Gateway authentication failed:\n ${body.error.message}`);
    }
  }

  /**
   * Disconnects from all rooms and stops all audio handling.
   */
  static disconnect(): void {
    this._rooms.forEach((room) => {
      if (room.connectionState !== 'disconnected') {
        room.disconnect();
      }
    });

    this._audioService?.stopAllAudio();
    this._mainStream?.close();
    this._worker?.terminate();
    this._rtcHandler?.stopRtc();

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
