import { IOdinMediaEvents } from './types';
import { AudioService } from './audio-service';

/**
 * Class describing a single media stream inside an `OdinRoom`.
 */
export class OdinMedia {
  private _eventTarget: EventTarget = new EventTarget();
  private _audioService: AudioService | null;
  private _active = false;
  private _volume = 1;

  /**
   * Creates a new `OdinMedia` instance.
   *
   * @param _id     The ID of the new media
   * @param _peerId The ID of the peer that owns the new media
   * @param _remote Wether or not the new media belongs to a remote peer
   *
   * @ignore
   */
  constructor(private _id: number, private _peerId: number, private _remote: boolean) {
    this._audioService = AudioService.getInstance();
  }

  /**
   * The ID of the media.
   */
  get id(): number {
    return this._id;
  }

  /**
   * The ID of the peer that owns the media.
   */
  get peerId(): number {
    return this._peerId;
  }

  /**
   * Indicates wether or not the media belongs to a remote peer.
   */
  get remote(): boolean {
    return this._remote;
  }

  /**
   * Set the activity status of the media.
   */
  set active(active: boolean) {
    this._active = active;
  }

  /**
   * Indicates wether or not the media is currently sending/receiving data.
   */
  get active(): boolean {
    return this._active;
  }

  /**
   * Indicates whether or not the media is registered in the audio service instance (e.g. started).
   */
  get started(): boolean {
    return this._audioService?.hasMedia(this._id) ?? false;
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
   * The individual playback volume of the media stream.
   */
  get volume(): number {
    return this._volume;
  }

  /**
   * Starts the encoder/decoder for the media and adds it to the room if its a local media.
   *
   * @returns A promise which yields when the request is resolved
   */
  async start(): Promise<void> {
    if (this.started) return;

    if (!this._audioService) {
      throw new Error('Unable to start media; AudioService is not available');
    }

    if (this._remote) {
      this._audioService.audioWorker.postMessage({
        type: 'start_decoder',
        media_id: this._id,
        properties: {},
      });
    } else {
      await this._audioService.room.addMedia(this);
      this._audioService.audioWorker.postMessage({
        type: 'start_encoder',
        media_id: this._id,
        properties: {
          cbr: false,
          fec: true,
          voip: true,
        },
      });
    }

    this._audioService.registerMedia(this);
  }

  /**
   * Stops the encoder/decoder for the media and removes it from the room if its a local media.
   *
   * @returns A promise which yields when the request is resolved
   */
  async stop(): Promise<void> {
    if (!this.started) return;

    if (!this._audioService) {
      throw new Error('Unable to stop media; AudioService is not available');
    }

    if (this._remote) {
      this._audioService.audioWorker.postMessage({
        type: 'stop_decoder',
        media_id: this._id,
      });
    } else {
      await this._audioService.room.removeMedia(this);
      this._audioService.audioWorker.postMessage({
        type: 'stop_encoder',
        media_id: this._id,
      });
    }

    this._active = false;
    this._audioService.unregisterMedia(this);
  }

  /**
   * Changes the playback volume of the media.
   *
   * @param volume The new volume (Default is 1)
   */
  changeVolume(volume: number): void {
    if (!this._audioService) {
      throw new Error('Unable to change media volume; AudioService is not available');
    }

    this._audioService.audioWorker.postMessage({
      type: 'set_volume',
      media_id: this._id,
      value: volume,
    });
  }

  /**
   * Registers to media events from `IOdinMediaEvents`.
   *
   * @param eventName The name of the event to listen to
   * @param handler   The callback to handle the event
   */
  addEventListener<Event extends keyof IOdinMediaEvents>(eventName: Event, handler: IOdinMediaEvents[Event]): void {
    this._eventTarget.addEventListener(eventName, handler as EventListener);
  }
}
