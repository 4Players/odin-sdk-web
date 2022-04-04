import { OdinRoom } from './room';
import { OdinPeer } from './peer';
import { OdinMedia } from './media';

/**
 * Interface describing audio settings to be applied on connect.
 */
export interface IOdinAudioSettings {
  /**
   * Enable or disable RNN-based voice activity detection.
   */
  voiceActivityDetection?: boolean;
}

/**
 * Interface describing custom options for ODIN clients.
 */
export interface IOdinClientSettings {
  /**
   * The URL of the ODIN gateway to use.
   */
  gatewayUrl: string;
}

/**
 * Interface extending default JavaScript events with custom information.
 */
export interface IOdinEvent<T> extends Event {
  /**
   * Custom payload of the event (see `IOdin*Payload` interfaces).
   */
  readonly payload: T;
}
export class OdinEvent<T> extends Event implements IOdinEvent<T> {
  constructor(type: string, public readonly payload: T) {
    super(type);
  }
}

/**
 * Interface describing the authentication response received from an ODIN gateway.
 */
export interface IAuthResult {
  address: string;
  token: string;
}

/**
 * Interface describing a peer in a room.
 */
export interface IPeer {
  id: number;
  mediaIds: number[];
  userData: Uint8Array;
}

/**
 * Interface describing a generic message payload.
 */
export interface IMessageData {
  message: Uint8Array;
  target_peer_ids?: number[];
}

/**
 * Interface describing the expected format when receiving peer data from the ODIN server.
 */
export interface IPeerData {
  id: number;
  medias: any;
  user_data: Uint8Array;
  user_id: string;
}

/**
 * Interface describing the expected format when receiving room data from the ODIN server.
 */
export interface IRoomData {
  id: string;
  customer: string;
  user_data: Uint8Array;
  peers: IPeerData[];
}

/**
 * Possible events received from the ODIN server.
 */
export type OdinEventMethods = 'RoomUpdated' | 'PeerUpdated' | 'MessageReceived';

/**
 * Interface describing encoder/decoder statistics from the audio worker.
 */
export interface IOdinAudioStats {
  /**
   * Internal Opus decoder statistics.
   */
  decoder: {
    avg_decode_time: number;
    cache_length: number;
    jitter: number;
    packets_dropped: number;
    packets_lost: number;
    packets_processed: number;
  };
  /**
   * Internal Opus encoder statistics.
   */
  encoder: {
    avg_encode_time: number;
    cbr: boolean;
    complexity: number;
    fec: boolean;
    packet_loss: number;
    voip: boolean;
  };
}

/**
 * Enum defining all possible connection states of the ODIN client.
 */
export type OdinConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Interface describing the payload of an `OdinConnectionStateChangedEvent`.
 */
export interface IOdinConnectionStateChangedEventPayload {
  /**
   * Previous state of the connection.
   */
  oldState: OdinConnectionState;
  /**
   * Current state of the connection.
   */
  newState: OdinConnectionState;
}

/**
 * Event emitted when the connection status of the internal main/room stream was updated.
 *
 * Provides both the old and the new connection state.
 */
export type OdinConnectionStateChangedEvent = (event: IOdinEvent<IOdinConnectionStateChangedEventPayload>) => void;

/**
 * Interface describing the payload of an `OdinRoomJoinedLeftEvent`.
 */
export interface IOdinRoomJoinedLeftEventPayload {
  /**
   * The room that was joined/left.
   */
  room: OdinRoom;
}

/**
 * Event emitted when a room was joined/left and its internal instance is up-to-date.
 *
 * Provides the new `OdinRoom` instance.
 */
export type OdinRoomJoinedLeftEvent = (event: IOdinEvent<IOdinRoomJoinedLeftEventPayload>) => void;

/**
 * Interface describing the payload of an `OdinRoomDataChangedEvent`.
 */
export interface IOdinRoomDataChangedEventPayload {
  /**
   * The updated `OdinRoom` instance.
   */
  room: OdinRoom;
}

/**
 * Event emitted when the user data of a room was updated.
 *
 * Provides the updated `OdinRoom` instance.
 */
export type OdinRoomDataChangedEvent = (event: IOdinEvent<IOdinRoomDataChangedEventPayload>) => void;

/**
 * Interface describing the payload of an `OdinPeerJoinedLeftEvent`.
 */
export interface IOdinPeerJoinedLeftEventPayload {
  /**
   * The room the peer joined/left.
   */
  room: OdinRoom;
  /**
   * The peer that joined/left.
   */
  peer: OdinPeer;
}

/**
 * Event emitted whenever a remote peer joined/left the room.
 *
 * Provides the updated `OdinRoom` instance and the specific `OdinPeer` instance.
 */
export type OdinPeerJoinedLeftEvent = (event: IOdinEvent<IOdinPeerJoinedLeftEventPayload>) => void;

/**
 * Interface describing the payload of an `OdinPeerDataChangedEvent`.
 */
export interface IOdinPeerDataChangedEventPayload {
  /**
   * The room where the peer was updated.
   */
  room: OdinRoom;
  /**
   * The updated `OdinPeer` instance.
   */
  peer: OdinPeer;
}

/**
 * Event emitted when the user data of a remote peer was updated.
 *
 * Provides the updated `OdinPeer` instance.
 */
export type OdinPeerDataChangedEvent = (event: IOdinEvent<IOdinPeerDataChangedEventPayload>) => void;

/**
 * Interface describing the payload of an `OdinMediaStartedStoppedEvent`.
 */
export interface IOdinMediaStartedStoppedEventPayload {
  /**
   * The room where the media was added/removed.
   */
  room: OdinRoom;
  /**
   * The peer that owns the media.
   */
  peer: OdinPeer;
  /**
   * The media that was added/removed.
   */
  media: OdinMedia;
}

/**
 * Event emitted whenever a peer adds/removes a media stream.
 *
 * Provides the updated `OdinRoom`, `OdinPeer` and `OdinMedia` instances.
 */
export type OdinMediaStartedStoppedEvent = (event: IOdinEvent<IOdinMediaStartedStoppedEventPayload>) => void;

/**
 * Interface describing the payload of an `OdinMediaActivityChangedEvent`.
 */
export interface IOdinMediaActivityChangedEventPayload {
  /**
   * The room the media is added to.
   */
  room: OdinRoom;
  /**
   * The peer that owns the media.
   */
  peer: OdinPeer;
  /**
   * The media that was updated.
   */
  media: OdinMedia;
}

/**
 * Event emitted when the sending/receiving status of a media changes (e.g. when a user starts/stops talking).
 *
 * Provides the updated `OdinRoom`, `OdinPeer` and `OdinMedia` instances as well as the new state.
 */
export type OdinMediaActivityChangedEvent = (event: IOdinEvent<IOdinMediaActivityChangedEventPayload>) => void;

/**
 * Interface describing the payload of an `OdinMessageReceivedEvent`.
 */
export interface IOdinMessageReceivedEventPayload {
  /**
   * The room where the message was received.
   */
  room: OdinRoom;
  /**
   * The ID of the peer that sent the message (might not be in proximity).
   */
  senderId: number;
  /**
   * A byte array with the message.
   */
  message: Uint8Array;
}

/**
 * Event emitted whenever a message with arbitrary data is received.
 *
 * Provides the `OdinRoom` instance where the message was received, the sender peer ID and the actual message data.
 */
export type OdinMessageReceivedEvent = (event: IOdinEvent<IOdinMessageReceivedEventPayload>) => void;

/**
 * Interface describing the payload of an `OdinAudioStatsEvent`.
 */
export interface IOdinAudioStatsEventPayload {
  /**
   * The `OdinRoom` instace the stats ere coming from.
   */
  room: OdinRoom;
  /**
   * The internal Opus encoder/decoder stats.
   */
  stats: IOdinAudioStats;
}

/**
 * Event emitted in a configurable interval to monitor encoder/decoder statistics.
 *
 * Provides the updated stats of the encoder and decoder.
 */
export type OdinAudioStatsEvent = (event: IOdinEvent<IOdinAudioStatsEventPayload>) => void;

/**
 * Interface describing possible media events.
 */
export interface IOdinClientEvents {
  /**
   * Main stream connection state updates.
   */
  ConnectionStateChanged: OdinConnectionStateChangedEvent;
}

/**
 * Interface describing possible room events.
 */
export interface IOdinRoomEvents {
  /**
   * Room stream connection state updates.
   */
  ConnectionStateChanged: OdinConnectionStateChangedEvent;
  /**
   * The room was joined successfully.
   */
  Joined: OdinRoomJoinedLeftEvent;
  /**
   * The room was left.
   */
  Left: OdinRoomJoinedLeftEvent;
  /**
   * The global room user data was updated.
   */
  UserDataChanged: OdinRoomDataChangedEvent;
  /**
   * A new peer entered the room.
   */
  PeerJoined: OdinPeerJoinedLeftEvent;
  /**
   * A peer in the room updated its user data.
   */
  PeerUserDataChanged: OdinPeerDataChangedEvent;
  /**
   * A peer left the room.
   */
  PeerLeft: OdinPeerJoinedLeftEvent;
  /**
   * A new media stream was added to the room.
   */
  MediaStarted: OdinMediaStartedStoppedEvent;
  /**
   * A media stream was removed from the room.
   */
  MediaStopped: OdinMediaStartedStoppedEvent;
  /**
   * A media in the room is sending/receiving data.
   */
  MediaActivity: OdinMediaActivityChangedEvent;
  /**
   * Received a message with arbitrary data.
   */
  MessageReceived: OdinMessageReceivedEvent;
  /**
   * Internal encoder/decoder stats updates.
   */
  AudioStats: OdinAudioStatsEvent;
}

/**
 * Interface describing possible peer events.
 */
export interface IOdinPeerEvents {
  /**
   * Peer updated its user data.
   */
  UserDataChanged: OdinPeerDataChangedEvent;
  /**
   * Peer added a new media stream.
   */
  MediaStarted: OdinMediaStartedStoppedEvent;
  /**
   * Peer removed a media stream.
   */
  MediaStopped: OdinMediaStartedStoppedEvent;
  /**
   * A media owned by the peer is sending/receiving data.
   */
  MediaActivity: OdinMediaActivityChangedEvent;
  /**
   * Peer sent a message with arbitrary data.
   */
  MessageReceived: OdinMessageReceivedEvent;
}

/**
 * Interface describing possible media events.
 */
export interface IOdinMediaEvents {
  /**
   * The media is sending/receiving data.
   */
  Activity: OdinMediaActivityChangedEvent;
}

/**
 * Convenience type used when converting JSON data to byte arrays.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };
