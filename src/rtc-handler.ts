import { OdinStream } from './stream';

export class OdinRtcHandler {
  /**
   * The `RTCDataChannel` for transmitting audio data.
   */
  private _audioChannel!: RTCDataChannel;

  /**
   * Creates a new `RtcHandler` instance.
   *
   * @param _worker The web worker to handle audio
   */
  constructor(private _worker: Worker, private _rtc: RTCPeerConnection) {
    this._audioChannel = this._rtc.createDataChannel('audio', {
      id: 2,
      negotiated: true,
      ordered: false,
      maxRetransmits: 0,
    });
    this._audioChannel.binaryType = 'arraybuffer';
    this._audioChannel.onerror = (error) => console.error(error);
    this._audioChannel.onmessage = (event) => {
      if (this._worker) {
        const bytes = new Uint8Array(event.data);
        this._worker.postMessage(
          {
            type: 'packet',
            bytes,
          },
          [bytes.buffer]
        );
      }
    };
  }

  /**
   * Get the DataChannel for audio.
   */
  get audioChannel(): RTCDataChannel {
    return this._audioChannel;
  }

  /**
   * Returns a promise which resolves with data providing statistics about the RTC connection.
   *
   * @returns A promise providing connection statistics
   */
  async getStats(): Promise<RTCStatsReport> {
    return this._rtc.getStats();
  }

  /**
   * Starts WebRTC on the given stream.
   *
   * @param mainStream
   */
  async startRtc(mainStream: OdinStream): Promise<void> {
    try {
      const offer = await this._rtc.createOffer();
      await this._rtc.setLocalDescription(offer);
      const answer = (await mainStream.request('SetupWebRtc', {
        sdp: offer.sdp,
      })) as { sdp: string };
      await this._rtc.setRemoteDescription({
        type: 'answer',
        sdp: answer.sdp,
      });
    } catch (e) {
      throw new Error('RPC SetupWebRtc failed\n' + e);
    }
  }

  /**
   * Close the RTC peer connection.
   */
  stopRtc() {
    if (this._rtc) {
      this._rtc.close();
    }
  }
}
