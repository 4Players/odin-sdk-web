import {
  OdinAudioSettings,
  OdinEvent,
  OdinConnectionState,
  AuthResult,
  OdinClientSettings,
  ClientEvents,
} from './types';
import { AudioService } from './audio-service';
import { RtcHandler } from './rtc-handler';
import { Stream } from './stream';
import { OdinRoom } from './room';
import { openStream } from './utils';
import { workerScript } from './worker';

/**
 * 4Players ODIN
 * LIFT YOUR PLAYER COMMUNICATION TO THE NEXT LEVEL
 *
 * The OdinClient helps you with connecting and using ODIN in an understandable and easy way.
 */
export class OdinClient {
  private static _eventTarget: EventTarget = new EventTarget();
  private static _mainStream: Stream;
  private static _rooms: OdinRoom[] = [];
  private static _rtcHandler: RtcHandler;
  private static _audioService: AudioService;
  private static _state: OdinConnectionState = OdinConnectionState.disconnected;
  private static _worker: Worker;
  static config: OdinClientSettings = {
    gatewayUrl: 'https://gateway.odin.4players.io',
  };

  /**
   * Returns an array of available rooms.
   */
  static get rooms(): OdinRoom[] {
    return OdinClient._rooms;
  }

  /**
   * Returns the current state of the connection.
   */
  static get state(): OdinConnectionState {
    return OdinClient._state;
  }

  private static set state(state: OdinConnectionState) {
    if (OdinClient._state !== state) {
      OdinClient._eventTarget.dispatchEvent(new OdinEvent('ConnectionStateChanged', { state }));
    }
    OdinClient._state = state;
  }

  /**
   * Returns the underlying WebSocket main stream.
   */
  static get stream(): Stream {
    return OdinClient._mainStream;
  }

  /**
   * Authenticates against the Odin gateway and establishes the main stream connection.
   *
   * @private
   */
  private static async connect(token: string, ms: MediaStream, audioSettings?: OdinAudioSettings): Promise<OdinRoom[]> {
    if (OdinClient.state === OdinConnectionState.connected) {
      return OdinClient._rooms;
    }

    OdinClient._worker = new Worker(workerScript);
    OdinClient._rtcHandler = new RtcHandler(OdinClient._worker);
    OdinClient._audioService = AudioService.setInstance(
      ms,
      OdinClient._worker,
      OdinClient._rtcHandler.audioChannel,
      audioSettings
    );
    OdinClient.state = OdinConnectionState.connecting;

    try {
      const gatewayAuthResult = await OdinClient.authGateway(token);

      OdinClient._mainStream = await openStream(`wss://${gatewayAuthResult.address}`, OdinClient.mainHandler);

      OdinClient._mainStream.onclose = () => {
        OdinClient.state = OdinConnectionState.disconnected;
        OdinClient.disconnect();
      };

      OdinClient._mainStream.onerror = () => {
        OdinClient.state = OdinConnectionState.error;
        OdinClient.disconnect();
      };

      const mainStreamAuthResult = await OdinClient._mainStream.request('Authenticate', {
        token: gatewayAuthResult.token,
      });
      const roomIds: string[] = mainStreamAuthResult.room_ids;

      await OdinClient._rtcHandler.startRtc(OdinClient._mainStream);
      await OdinClient._audioService.setupAudio();

      OdinClient._rooms = roomIds.map((roomId) => {
        return new OdinRoom(roomId, gatewayAuthResult.address, OdinClient._mainStream, OdinClient._worker);
      });

      OdinClient.state = OdinConnectionState.connected;

      return OdinClient._rooms;
    } catch (e) {
      console.error('Failed to establish main stream connection', e);
      OdinClient.state = OdinConnectionState.error;
    }

    return [];
  }

  /**
   * Authenticates against the gateway and directly connects to the room.
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
    audioSettings?: OdinAudioSettings,
    userData?: Uint8Array,
    position?: [number, number]
  ): Promise<OdinRoom> {
    if (OdinClient.rooms.length > 0) {
      throw new Error('Failed to join room; close other open connections first');
    }
    const rooms = await OdinClient.connect(token, ms, audioSettings);
    if (rooms.length > 0) {
      await rooms[0].join(userData, position);
      rooms[0].stream.onclose = () => {
        OdinClient.state = OdinConnectionState.disconnected;
        OdinClient.disconnect();
      };
      rooms[0].stream.onerror = () => {
        OdinClient.state = OdinConnectionState.error;
        OdinClient.disconnect();
      };
      return rooms[0];
    } else {
      throw new Error('Failed to join room; specified token did not contain a valid room ID');
    }
  }

  /**
   * Changes the active capture stream.
   */
  static changeMediaStream(ms: MediaStream) {
    OdinClient._audioService?.changeMediaStream(ms);
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
  private static async authGateway(token: string): Promise<AuthResult> {
    if (!OdinClient.config.gatewayUrl) {
      throw new Error('No gateway URL configured');
    }
    const response = await fetch(OdinClient.config.gatewayUrl, {
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
   * Disconnect from all rooms and stops all audio handling.
   */
  static disconnect(): void {
    OdinClient._rooms.forEach((room) => {
      room.reset();
    });

    if (OdinClient._audioService) {
      OdinClient._audioService.stopAllAudio();
    }
    if (OdinClient._mainStream) {
      OdinClient._mainStream.close();
    }
    if (OdinClient._worker) {
      OdinClient._worker.terminate();
    }
    if (OdinClient._rtcHandler) {
      OdinClient._rtcHandler.stopRtc();
    }

    OdinClient._rooms = [];
  }

  /**
   * Register to client events.
   *
   * @param eventName
   * @param handler
   */
  static addEventListener<Event extends keyof ClientEvents>(eventName: Event, handler: ClientEvents[Event]): void {
    OdinClient._eventTarget.addEventListener(eventName, handler as EventListener);
  }
}
