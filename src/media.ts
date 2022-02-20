import { MediaEvents } from './types';
import { AudioService } from './audio-service';
import { Stream } from './stream';

/**
 * The OdinMedia class manages a media stream in the ODIN context.
 */
export class OdinMedia {
  private _eventTarget: EventTarget = new EventTarget();
  private _audioService!: AudioService;
  private _active = false;
  private _volume = 1;

  /**
   * Creates a new OdinMedia instance.
   *
   * @param _id
   * @param _peerId
   * @param _remote
   * @param _worker
   * @param _roomStream
   * @param _options
   */
  constructor(
    private _id: number,
    private _peerId: number,
    private _remote: boolean,
    private _worker: Worker,
    private _roomStream: Stream,
    private _options?: any
  ) {
    const audioService = AudioService.getInstance();
    if (audioService) {
      this._audioService = audioService;
    }

    this.addEventListener('Activity', (event) => (this._active = event.detail.isActive));
  }

  /**
   * Returns the media ID.
   */
  get id(): number {
    return this._id;
  }

  /**
   * Returns the peer ID of the media.
   */
  get peerId(): number {
    return this._peerId;
  }

  /**
   * Returns true if the media belongs to a remote peer.
   */
  get remote(): boolean {
    return this._remote;
  }

  /**
   * Returns true if the media is currently sending/receiving data.
   */
  get active(): boolean {
    return this._active;
  }

  /**
   * Indicates whether or not the media is registered in the audio service instance.
   */
  get registered(): boolean {
    return this._audioService.hasMedia(this._id);
  }

  /**
   * Returns the event handler of the media.
   */
  get eventTarget(): EventTarget {
    return this._eventTarget;
  }

  /**
   * Returns the current volume of the media.
   */
  get volume(): number {
    return this._volume;
  }

  /**
   * Returns the options of the media.
   */
  get options(): any {
    return this._options;
  }

  /**
   * Starts the encoder/decoder for the media and adds it to the room if its a local media.
   *
   * @returns A promise which yields when the request is resolved
   */
  async start(): Promise<void> {
    if (this.registered) return;

    if (this._remote) {
      this._worker.postMessage({
        type: 'start_decoder',
        media_id: this._id,
        properties: {},
      });
    } else {
      await this._roomStream.request('StartMedia', {
        media_id: this._id,
        properties: {},
      });

      this._worker.postMessage({
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
    if (!this.registered) return;

    if (this._remote) {
      this._worker.postMessage({
        type: 'stop_decoder',
        media_id: this._id,
      });
    } else {
      await this._roomStream.request('StopMedia', {
        media_id: this._id,
        properties: {},
      });

      this._worker.postMessage({
        type: 'stop_encoder',
        media_id: this._id,
      });
    }

    this._audioService.unregisterMedia(this);
    this._active = false;
  }

  /**
   * Changes the playback volume of the media.
   *
   * @param volume The new volume (Default is 1)
   */
  changeVolume(volume: number): void {
    this._worker.postMessage({
      type: 'set_volume',
      media_id: this._id,
      value: volume,
    });
  }

  /**
   * Register to media events.
   *
   * @param eventName
   * @param handler
   */
  addEventListener<Event extends keyof MediaEvents>(eventName: Event, handler: MediaEvents[Event]): void {
    this._eventTarget.addEventListener(eventName, handler as EventListener);
  }
}
