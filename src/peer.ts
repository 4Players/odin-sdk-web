import { OdinEvent, PeerEvents } from './types';
import { AudioService } from './audio-service';
import { OdinMedia } from './media';
import { Stream } from './stream';

/**
 * The Peer class manages a peer in the ODIN context.
 */
export class OdinPeer {
  private _freeMediaIds: number[] = [];
  private _activeMedias: Map<number, OdinMedia> = new Map();
  private _data: Uint8Array = new Uint8Array();
  private _eventTarget: EventTarget = new EventTarget();
  private _audioService!: AudioService;

  /**
   * Creates a new OdinPeer instance.
   *
   * @param _id
   * @param _roomStream
   */
  constructor(private _id: number, private _roomStream: Stream) {
    const audioService = AudioService.getInstance();
    if (audioService) {
      this._audioService = audioService;
    }
  }

  /**
   * Get the peer ID.
   */
  get id(): number {
    return this._id;
  }

  /**
   * Returns a list of medias owned by the peer.
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
   * Returns the current user data of the peer.
   */
  get data(): Uint8Array {
    return this._data;
  }

  /**
   * Returns the event handler of the peer.
   */
  get eventTarget(): EventTarget {
    return this._eventTarget;
  }

  /**
   * Set the list of media IDs assigned by the server.
   * @param ids
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
    const newMedia = new OdinMedia(freeMediaId, this._id, false, this._audioService.audioWorker, this._roomStream);
    this._activeMedias.set(newMedia.id, newMedia);
    return newMedia;
  }

  /**
   * Adds a media to the list of active medias and starts decoding.
   *
   * @param media The media that gets added
   */
  addMedia(media: OdinMedia): void {
    this._activeMedias.set(media.id, media);
    this._eventTarget.dispatchEvent(new OdinEvent('MediaStarted', { media }));
  }

  /**
   * Removes a media from the list of active medias and stops decoding.
   *
   * @param media The media that gets removed
   */
  removeMedia(media: OdinMedia): void {
    this._audioService.unregisterMedia(media);
    this._activeMedias.delete(media.id);
    this._eventTarget.dispatchEvent(new OdinEvent('MediaStopped', { media }));
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
   * Sends a message to this peer.
   *
   * @param message The message encoded to an Uint8Array
   */
  sendMessage(message: Uint8Array): void {
    if (!message) return;
    this._roomStream?.request('SendMessage', {
      message: message,
      target_peer_ids: [this._id],
    });
  }

  /**
   * Updates the peer with the current data
   */
  update(): void {
    this._roomStream?.request('UpdatePeer', {
      user_data: this._data,
    });
  }

  /**
   * Register to media events.
   *
   * @param eventName
   * @param handler
   */
  addEventListener<Event extends keyof PeerEvents>(eventName: Event, handler: PeerEvents[Event]): void {
    this._eventTarget.addEventListener(eventName, handler as EventListener);
  }
}
