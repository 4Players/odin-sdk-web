import { IOdinPeerEvents } from './types';
import { OdinAudioService } from './audio';
import { OdinMedia } from './media';
import { OdinStream } from './stream';

/**
 * Class describing a single peer inside an `OdinRoom`.
 */
export class OdinPeer {
  /**
   * An optional instance of `OdinAudioService` used for handling audio interactions.
   */
  private _audioService?: OdinAudioService;

  /**
   * An instance of `EventTarget` for handling events related to this peer.
   */
  private _eventTarget: EventTarget = new EventTarget();

  /**
   * Free media IDs available to this peer.
   */
  private _freeMediaIds: number[] = [];

  /**
   * Map of currently active media instances associated with this peer.
   */
  private _activeMedias: Map<number, OdinMedia> = new Map();

  /**
   * User data associated with the peer.
   */
  private _data: Uint8Array = new Uint8Array();

  /**
   * Creates a new `OdinPeer` instance.
   *
   * @param _id     The ID of the new peer
   * @param _userId The user ID of the new peer
   * @param _remote Indicates, whether the peer is a remote peer or not
   * @ignore
   */
  constructor(private _roomStream: OdinStream, private _id: number, private _userId: string, private _remote: boolean) {
    this._audioService = OdinAudioService.getInstance();
  }

  /**
   * The ID of the peer.
   */
  get id(): number {
    return this._id;
  }

  /**
   * The identifier of the peer.
   */
  get userId(): string {
    return this._userId;
  }

  /**
   * Indicates, whether the peer is a remote peer or not.
   */
  get remote(): boolean {
    return this._remote;
  }

  /**
   * A list of media instances owned by the peer.
   */
  get medias(): Map<number, OdinMedia> {
    return this._activeMedias;
  }

  /**
   * Set updated user data for the peer.
   */
  set data(data: Uint8Array) {
    this._data = data;
  }

  /**
   * The arbitrary user data of the peer.
   */
  get data(): Uint8Array {
    return this._data;
  }

  /**
   * An event target handler for the peer.
   *
   * @ignore
   */
  get eventTarget(): EventTarget {
    return this._eventTarget;
  }

  /**
   * Set the list of media IDs assigned by the server.
   *
   * @ignore
   */
  setFreeMediaIds(ids: number[]) {
    if (this._freeMediaIds.length > 0) return;
    this._freeMediaIds = ids;
  }

  /**
   * Creates a local media, configures audio capture/playback and returns the new `OdinMedia` instance.
   */
  createMedia(): OdinMedia {
    if (this._activeMedias.size > 0) {
      throw new Error(
        'Unable to create new media; adding more than one media per local peer is currently not supported'
      );
    }

    const freeMediaId = this.takeFreeMedia();
    if (!freeMediaId) throw new Error('Unable to create new media; no more media IDs available');
    const newMedia = new OdinMedia(freeMediaId, this._id, false);
    this._activeMedias.set(newMedia.id, newMedia);
    return newMedia;
  }

  /**
   * Adds a media to the list of active medias and starts decoding.
   *
   * @param media The media instance to add
   */
  addMedia(media: OdinMedia): void {
    this._activeMedias.set(media.id, media);
  }

  /**
   * Removes a media from the list of active medias and stops decoding.
   *
   * @param media The media instance to remove
   */
  removeMedia(media: OdinMedia): void {
    media.stop();
    this._audioService?.unregisterMedia(media);
    this._activeMedias.delete(media.id);
  }

  /**
   * Removes a media from the list of active medias by the given ID and stops decoding.
   *
   * @param id The media ID to remove
   */
  removeMediaById(id: number): void {
    const media = this._activeMedias.get(id);
    if (media) {
      this.removeMedia(media);
    }
  }

  /**
   * Pops the next media from the free medias array.
   */
  private takeFreeMedia(): number | undefined {
    return this._freeMediaIds.pop();
  }

  /**
   * Starts all active medias or a list of specific active medias.
   *
   * @param mediaIds Optional list of media IDs to start
   */
  async startMedias(mediaIds?: number[]): Promise<void> {
    if (mediaIds && mediaIds.length > 0) {
      for (const media of this._activeMedias) {
        if (media[0] in mediaIds) {
          await media[1].start();
        }
      }
    } else {
      for (const media of this._activeMedias) {
        await media[1].start();
      }
    }
  }

  /**
   * Stops all active medias or a list of specific active medias.
   *
   * @param mediaIds Optional list of media IDs to stop
   */
  async stopMedias(mediaIds?: number[]): Promise<void> {
    if (mediaIds && mediaIds.length > 0) {
      for (const media of this._activeMedias) {
        if (media[0] in mediaIds) {
          await media[1].stop();
        }
      }
    } else {
      for (const media of this._activeMedias) {
        await media[1].stop();
      }
    }
  }

  /**
   * Sends a message with arbitrary data to this peer.
   *
   * @param message Byte array of arbitrary data to send
   */
  async sendMessage(message: Uint8Array) {
    if (!message) return;

    await this._roomStream?.request('SendMessage', { message, target_peer_ids: [this._id] });
  }

  /**
   * Sends user data of the peer to the server.
   */
  async update() {
    if (this._remote) {
      throw new Error('Failed to flush peer user data update; not allowed to update remote peer');
    }

    await this._roomStream?.request('UpdatePeer', {
      user_data: this._data,
    });
  }

  /**
   * Registers to peer events from `IOdinPeerEvents`.
   *
   * @param eventName The name of the event to listen to
   * @param handler   The callback to handle the event
   */
  addEventListener<Event extends keyof IOdinPeerEvents>(eventName: Event, handler: IOdinPeerEvents[Event]): void {
    this._eventTarget.addEventListener(eventName, handler as EventListener);
  }
}
