import { Stream } from './stream';

export class RtcHandler {
  private readonly _rtc!: RTCPeerConnection;
  private _audioChannel!: RTCDataChannel;

  constructor(private _worker: Worker) {
    this._rtc = new RTCPeerConnection();
    this.setUpAudioChannel(this._worker, this._audioChannel);
  }

  /**
   * Get the DataChannel for audio.
   */
  get audioChannel(): RTCDataChannel {
    return this._audioChannel;
  }

  /**
   * Starts WebRTC on the given stream.
   *
   * @param mainStream
   */
  async startRtc(mainStream: Stream): Promise<void> {
    const offer = await this._rtc.createOffer();
    await this._rtc.setLocalDescription(offer);
    const answer: { sdp: string } = await mainStream.request('SetupWebRtc', {
      sdp: offer.sdp,
    });
    await this._rtc.setRemoteDescription({
      type: 'answer',
      sdp: answer.sdp,
    });
  }

  private setUpAudioChannel(worker: Worker, audioChannel: RTCDataChannel): void {
    audioChannel = this._rtc.createDataChannel('audio', {
      id: 2,
      negotiated: true,
      ordered: false,
      maxRetransmits: 0,
    });
    audioChannel.binaryType = 'arraybuffer';
    audioChannel.onerror = (error) => console.error(error);
    audioChannel.onmessage = (event) => {
      if (worker) {
        const bytes = new Uint8Array(event.data);
        worker.postMessage(
          {
            type: 'packet',
            bytes: bytes,
          },
          [bytes.buffer]
        );
      }
    };
    this._audioChannel = audioChannel;
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
