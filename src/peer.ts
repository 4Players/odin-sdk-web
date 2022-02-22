import { IOdinPeerEvents } from './types';
import { AudioService } from './audio-service';
import { OdinMedia } from './media';

/**
 * Class describing a single peer inside an `OdinRoom`.
 */
export class OdinPeer {
  private _freeMediaIds: number[] = [];
  private _activeMedias: Map<number, OdinMedia> = new Map();
  private _data: Uint8Array = new Uint8Array();
  private _eventTarget: EventTarget = new EventTarget();
  private _audioService!: AudioService;

  /**
   * Creates a new `OdinPeer` instance.
   *
   * @param _id The ID of the new peer
   * @ignore
   */
  constructor(private _id: number, private _userId: string) {
    const audioService = AudioService.getInstance();
    if (audioService) {
      this._audioService = audioService;
    }
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
    this._audioService.unregisterMedia(media);
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
  startMedias(mediaIds?: number[]): void {
    if (mediaIds && mediaIds.length > 0) {
      this._activeMedias.forEach(async (media) => {
        if (media.id in mediaIds) {
          await media.start();
        }
      });
    } else {
      this._activeMedias.forEach(async (media) => {
        await media.start();
      });
    }
  }

  /**
   * Stops all active medias or a list of specific active medias.
   *
   * @param mediaIds Optional list of media IDs to stop
   */
  stopMedias(mediaIds?: number[]): void {
    if (mediaIds && mediaIds.length > 0) {
      this._activeMedias.forEach(async (media) => {
        if (media.id in mediaIds) {
          await media.stop();
        }
      });
    } else {
      this._activeMedias.forEach(async (media) => {
        await media.stop();
      });
    }
  }

  /**
   * Sends a message with arbitrary data to this peer.
   *
   * @param message Byte array of arbitrary data to send
   */
  sendMessage(message: Uint8Array): void {
    if (!message) return;
    this._audioService.room.sendMessage(message, [this._id]);
  }

  /**
   * Sends user data of the peer to the server.
   */
  update(): void {
    if (this.id !== this._audioService.room.ownPeer.id) {
      throw new Error('Failed to flush peer user data update; not allowed to update remote peer');
    }

    this._audioService.room.flushOwnPeerDataUpdate();
  }

  /**
   * Register to peer events from `IOdinPeerEvents`.
   *
   * @param eventName The name of the event to listen to
   * @param handler   The callback to handle the event
   */
  addEventListener<Event extends keyof IOdinPeerEvents>(eventName: Event, handler: IOdinPeerEvents[Event]): void {
    this._eventTarget.addEventListener(eventName, handler as EventListener);
  }
}
