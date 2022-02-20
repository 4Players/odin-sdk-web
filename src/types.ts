import { OdinMedia } from './media';
import { OdinPeer } from './peer';

/**
 * Interface describing audio settings to be applied on connect.
 */
export interface OdinAudioSettings {
  masterVolume?: number;
  voiceActivityDetection?: boolean;
}

/**
 * Interface describing custom options like the worker and worklet script path.
 */
export interface OdinClientSettings {
  gatewayUrl?: string;
}

/**
 * Helper class to allow dispatching custom events.
 */
interface IOdinEvent<T> extends Event {
  readonly detail: T;
}
export class OdinEvent<T> extends Event implements IOdinEvent<T> {
  constructor(type: string, public readonly detail: T) {
    super(type);
  }
}

/**
 * Interface describing the authentication respone received from an ODIN gateway.
 */
export interface AuthResult {
  address: string;
  token: string;
}

/**
 * Interface describing a peer in a room.
 */
export interface Peer {
  id: number;
  mediaIds: number[];
  userData: Uint8Array;
}

/**
 * Interface describing a generic message payload.
 */
export interface MessageData {
  message: Uint8Array;
  target_peer_ids?: number[];
}

/**
 * Interface describing the expected format when receiving peer data from the ODIN server.
 */
export interface PeerData {
  id: number;
  medias: any;
  user_data: Uint8Array;
  user_id: string;
}

/**
 * Interface describing the expected format when receiving room data from the ODIN server.
 */
export interface RoomData {
  id: string;
  customer: String;
  user_data: Uint8Array;
  peers: PeerData[];
}

/**
 * Interface describing an error which could occur when trying to join a room.
 */
export interface RoomJoinError {
  reason: string;
}

/**
 * Possible events reveiced from the ODIN server.
 */
export type OdinEventMethods = 'RoomUpdated' | 'PeerUpdated' | 'MessageReceived';

/**
 * Interfaces describing the different kinds of room update events received from an ODIN server.
 */
export interface RoomJoinedUpdate {
  kind: 'Joined';
  room: RoomData;
  media_ids: number[];
  own_peer_id: number;
}
export interface RoomLeftUpdate {
  kind: 'Left';
}
export interface RoomDataChangedUpdate {
  kind: 'UserDataChanged';
  user_data: Uint8Array;
}
export interface RoomPeerJoinedUpdate {
  kind: 'PeerJoined';
  peer: PeerData;
}
export interface RoomPeerLeftUpdate {
  kind: 'PeerLeft';
  peer_id: number;
}
export type RoomUpdate =
  | RoomJoinedUpdate
  | RoomLeftUpdate
  | RoomDataChangedUpdate
  | RoomPeerJoinedUpdate
  | RoomPeerLeftUpdate;

/**
 * Interface describing encoder/decoder statistics from the audio worker.
 */
export interface OdinAudioStats {
  decoder: {
    avg_decode_time: number;
    cache_length: number;
    jitter: number;
    packets_dropped: number;
    packets_lost: number;
    packets_processed: number;
  };
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
export enum OdinConnectionState {
  disconnected,
  connecting,
  connected,
  error,
}

/**
 * Event emitted when the connection status of the ODIN client changes.
 */
export type OdinConnectionStateChangedEvent = (event: IOdinEvent<{ state: OdinConnectionState }>) => void;

/**
 * Event emitted when the sending/receiving status of a media changes (e.g. when a user starts/stops talking).
 *
 * Provides the new state of the media as a boolean.
 */
export type MediaActivityEvent = (event: IOdinEvent<{ isActive: boolean }>) => void;

/**
 * Event emitted whenever a peer adds/removes a media stream.
 *
 * Provides the media object.
 */
export type PeerMediaChangedEvent = (event: IOdinEvent<{ media: OdinMedia }>) => void;

/**
 * Event emitted when the sending/receiving status of any media belonging to a specific peer changes.
 *
 * Provides the media object and the new state as a boolean.
 */
export type PeerMediaActivityEvent = (event: IOdinEvent<{ media: OdinMedia; isActive: boolean }>) => void;

/**
 * Event emitted whenever a peer in the room adds/removes a media stream.
 *
 * Provides the updated room user data.
 */
export type RoomMediaChangedEvent = (event: IOdinEvent<{ peer: OdinPeer; media: OdinMedia }>) => void;

/**
 * Event emitted when the sending/receiving status of any media belonging to a peer in the room changes.
 *
 * Provides the media object and the new state as a boolean.
 */
export type RoomMediaActivityEvent = (
  event: IOdinEvent<{ peer: OdinPeer; media: OdinMedia; isActive: boolean }>
) => void;

/**
 * Event emitted whenever a peer joins/leaves the room.
 *
 * Provides the specific peer and the updated map of peers in the room.
 */
export type RoomPeerJoinedLeftEvent = (event: IOdinEvent<{ peer: OdinPeer; peers: Map<number, OdinPeer> }>) => void;

/**
 * Event emitted when a room was joined.
 *
 * Provides the initial room user data and ID.
 */
export type RoomJoinedEvent = (event: IOdinEvent<{ id: string; data: Uint8Array }>) => void;

/**
 * Event emitted when the user data of a room is updated.
 *
 * Provides the updated room user data.
 */
export type RoomDataUpdatedEvent = (event: IOdinEvent<{ data: Uint8Array }>) => void;

/**
 * Event emitted when the user data of a peer is updated.
 *
 * Provides the updated peer oject.
 */
export type PeerDataUpdatedEvent = (event: IOdinEvent<{ peer: OdinPeer }>) => void;

/**
 * Event emitted whenever a message with arbitrary data is received from a specific peer.
 *
 * Provides the raw message data.
 */
export type PeerMessageEvent = (event: IOdinEvent<{ message: Uint8Array }>) => void;

/**
 * Event emitted whenever a message with arbitrary data is received.
 *
 * Provides the sender peer id and the raw message data.
 */
export type RoomMessageEvent = (event: IOdinEvent<{ sender: OdinPeer; message: Uint8Array }>) => void;

/**
 * Event emitted in a configurable interval to monitor encoder/decoder statistics.
 *
 * Provides the updated stats of the encoder and decoder.
 */
export type RoomAudioStatsEvent = (event: IOdinEvent<{ stats: OdinAudioStats }>) => void;

/**
 * Interface describing possible room events.
 */
export interface RoomEvents {
  Joined: RoomJoinedEvent;
  UserDataChanged: RoomDataUpdatedEvent;
  PeerJoined: RoomPeerJoinedLeftEvent;
  PeerLeft: RoomPeerJoinedLeftEvent;
  MediaStarted: RoomMediaChangedEvent;
  MediaStopped: RoomMediaChangedEvent;
  MediaActivity: RoomMediaActivityEvent;
  MessageReceived: RoomMessageEvent;
  AudioStats: RoomAudioStatsEvent;
}

/**
 * Interface descrinbing possible peer events.
 */
export interface PeerEvents {
  MediaStarted: PeerMediaChangedEvent;
  MediaStopped: PeerMediaChangedEvent;
  MediaActivity: PeerMediaActivityEvent;
  UserDataChanged: PeerDataUpdatedEvent;
  MessageReceived: PeerMessageEvent;
}

/**
 * Interface describing possible media events.
 */
export interface MediaEvents {
  Activity: MediaActivityEvent;
}

/**
 * Interface describing possible media events.
 */
export interface ClientEvents {
  ConnectionStateChanged: OdinConnectionStateChangedEvent;
}

/**
 * Convinience type used when converting JSON data to byte arrays.
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
