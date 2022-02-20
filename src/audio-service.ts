import { OdinAudioSettings, OdinEvent } from './types';
import { OdinRoom } from './room';
import { OdinPeer } from './peer';
import { OdinMedia } from './media';
import { workletScript } from './worker';

import Bowser from 'bowser';

/**
 * Class to handle encoding/decoding and voice events like the talk status.
 */
export class AudioService {
  private static _instance: AudioService;
  private _audioElement: HTMLAudioElement | null = null;
  private _audioSource: MediaStreamAudioSourceNode | null = null;
  private _audioContext: AudioContext = new AudioContext({ sampleRate: 48000 });
  private _encoderNode!: AudioWorkletNode;
  private _decoderNode!: AudioWorkletNode;
  private _medias: OdinMedia[] = [];
  private _room!: OdinRoom;
  private _bowser!: Bowser.Parser.Parser;
  private _audioSettings!: OdinAudioSettings;
  private _defaultOdinAudioSettings: OdinAudioSettings = {
    masterVolume: 1,
    voiceActivityDetection: true,
  };

  private constructor(
    private _ms: MediaStream,
    private _worker: Worker,
    private _audioDataChannel: RTCDataChannel,
    audioSettings?: OdinAudioSettings
  ) {
    this._audioSettings = this._defaultOdinAudioSettings;
    if (audioSettings) {
      if (typeof audioSettings.masterVolume === 'number') {
        this._audioSettings.masterVolume = audioSettings.masterVolume;
      } else {
        this._audioSettings.masterVolume = this._defaultOdinAudioSettings.masterVolume;
      }
      this._audioSettings.voiceActivityDetection =
        audioSettings.voiceActivityDetection ?? this._defaultOdinAudioSettings.voiceActivityDetection;
    }

    if (!this._audioSettings.voiceActivityDetection) {
      this.disableVAD();
    }

    this._bowser = Bowser.getParser(window.navigator.userAgent);

    this._worker.onmessage = (event) => {
      switch (event.data.type) {
        case 'packet':
          if (this._audioDataChannel.readyState === 'open') {
            this._audioDataChannel.send(event.data.bytes);
          }
          break;
        case 'stats':
          this._room.eventTarget.dispatchEvent(new OdinEvent('AudioStats', { stats: event.data }));
          break;
        case 'talk_status':
          for (const media of this._medias) {
            if (media.id === event.data.media_id) {
              media.eventTarget.dispatchEvent(
                new OdinEvent('Activity', {
                  isActive: event.data.is_talking,
                })
              );
              const peer = this.getPeerByMediaId(media.id);
              if (peer) {
                peer.eventTarget.dispatchEvent(
                  new OdinEvent('MediaActivity', {
                    media,
                    isActive: event.data.is_talking,
                  })
                );
                this._room.eventTarget.dispatchEvent(
                  new OdinEvent('MediaActivity', { peer, media, isActive: event.data.is_talking })
                );
              }
            }
          }
          break;
      }
    };
  }

  /**
   * Returns the peer object matching the specified peer ID.
   *
   * @param id The numeric id of the peer
   */
  getPeerByMediaId(id: number): OdinPeer | undefined {
    if (this._room.me.medias.get(id)) return this._room.me;
    let peer!: OdinPeer;
    this._room.peers.forEach((p) => {
      if (p.medias.get(id)) peer = p;
    });
    return peer;
  }

  /**
   * Initializes and returns a singleton instance of the audio service.
   *
   * @param ms            The local microphone capture stream
   * @param worker        The worker instance handing all the encoding/decoding
   * @param audioChannel  The RTC data channel used to transfer audio data
   * @param audioSettings Optional audio settings to apply
   */
  static setInstance(
    ms: MediaStream,
    worker: Worker,
    audioChannel: RTCDataChannel,
    audioSettings?: OdinAudioSettings
  ): AudioService {
    this._instance = new AudioService(ms, worker, audioChannel, audioSettings);
    return this._instance;
  }

  /**
   * Returns a singleton instance of the audio service.
   */
  static getInstance(): AudioService | null {
    if (this._instance) {
      return this._instance;
    }
    return null;
  }

  /**
   * Returns the underlying audio worker instance.
   */
  get audioWorker(): Worker {
    return this._worker;
  }

  /**
   * Sets the room this audio service is dealing with.
   *
   * @param room A room instance
   */
  setRroom(room: OdinRoom) {
    this._room = room;
  }

  /**
   * Returns true if the audio service knows a media with the specified ID.
   *
   * @param media The media ID to search for.
   */
  hasMedia(media_id: number): boolean {
    return !!this._medias.find((media) => media.id === media_id);
  }

  /**
   * Registers a media to handle its talk status.
   *
   * @param media The media that gets registered
   */
  registerMedia(media: OdinMedia): void {
    this._medias.push(media);
  }

  /**
   * Unregister a media to stop the talk status handling.
   *
   * @param media The media that gets unregistered
   */
  unregisterMedia(media: OdinMedia): void {
    this._medias = this._medias.filter((mediaItem) => {
      return mediaItem.id !== media.id;
    });
  }

  /**
   * Set up the audio device, encoder and decoder.
   */
  async setupAudio(): Promise<void> {
    await this._audioContext.audioWorklet.addModule(workletScript);

    this._decoderNode = new AudioWorkletNode(this._audioContext, 'eyvor-decoder', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
    });
    this._encoderNode = new AudioWorkletNode(this._audioContext, 'eyvor-encoder', {
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });

    const browser = Bowser.getParser(window.navigator.userAgent);
    const audioTrack = this._ms.getAudioTracks()[0];

    // Apply ugly workaround to apply echo cancellation in Chromium based browsers
    if (browser.getEngineName() === 'Blink' && audioTrack?.getConstraints()?.echoCancellation) {
      const outputDestination = this._audioContext.createMediaStreamDestination();
      this._decoderNode.connect(outputDestination);

      const webrtc = await this.webrtcLoopback(audioTrack, outputDestination.stream.getAudioTracks()[0]);

      const inputStream = new MediaStream([webrtc.input]);
      const outputStream = new MediaStream([webrtc.output]);

      this.webrtcDummy(inputStream);
      this.webrtcDummy(outputStream);

      this._audioSource = this._audioContext.createMediaStreamSource(inputStream);
      this._audioSource.connect(this._encoderNode);

      this._audioElement = new Audio();
      this._audioElement.srcObject = outputStream;
      this._audioElement.volume = 1;

      await this._audioElement.play();
    } else {
      this._decoderNode.connect(this._audioContext.destination);
      this._audioSource = this._audioContext.createMediaStreamSource(this._ms);
      this._audioSource.connect(this._encoderNode);
    }

    const encoderPipe = new MessageChannel();
    const decoderPipe = new MessageChannel();

    this._worker.postMessage(
      {
        type: 'initialize',
        encoder: { worklet: encoderPipe.port1 },
        decoder: { worklet: decoderPipe.port1 },
        stats_interval: 1000,
      },
      [encoderPipe.port1, decoderPipe.port1]
    );

    this._worker.postMessage({
      type: 'set_volume',
      media_id: 0,
      value: this._audioSettings.masterVolume,
    });

    this._encoderNode.port.postMessage({ type: 'initialize', worker: encoderPipe.port2 }, [encoderPipe.port2]);
    this._decoderNode.port.postMessage({ type: 'initialize', worker: decoderPipe.port2 }, [decoderPipe.port2]);
  }

  /**
   * Enable RNN based voice activity detection.
   */
  enablesVAD() {
    this._worker.postMessage({
      type: 'update_vad_thresholds',
      voice: { going_active: 0.9, going_inactive: 0.8 },
      rms_dbfs: { going_active: -30, going_inactive: -40 },
    });
  }

  /**
   * Disable RNN based voice activity detection.
   */
  disableVAD() {
    this._worker.postMessage({
      type: 'update_vad_thresholds',
      voice: { going_active: 0, going_inactive: 0 },
      rms_dbfs: { going_active: 0, going_inactive: 0 },
    });
  }

  /**
   * Update the underlying microphone capture stream.
   *
   * @param ms The new media stream
   */
  async changeMediaStream(ms: MediaStream) {
    if (!this._decoderNode || !this._encoderNode) {
      throw new Error('Failed to change media stream; audio service is not initialized');
    }

    this._ms = ms;
    const audioTrack = ms.getAudioTracks()[0];
    if (this._bowser.getEngineName() === 'Blink' && audioTrack?.getConstraints()?.echoCancellation) {
      const outputDestination = this._audioContext.createMediaStreamDestination();
      const webrtc = await this.webrtcLoopback(audioTrack, outputDestination.stream.getAudioTracks()[0]);

      const inputStream = new MediaStream([webrtc.input]);
      const outputStream = new MediaStream([webrtc.output]);

      this.webrtcDummy(inputStream);
      this.webrtcDummy(outputStream);

      this._audioSource?.disconnect();
      this._audioSource = this._audioContext.createMediaStreamSource(inputStream);
      this._audioSource.connect(this._encoderNode);

      if (this._audioElement) {
        this._audioElement.remove();
        this._audioElement = new Audio();
        this._audioElement.srcObject = outputStream;
        this._audioElement.volume = 1;

        await this._audioElement.play();
      }
    } else {
      this._audioSource?.disconnect();
      this._audioSource = this._audioContext.createMediaStreamSource(ms);
      this._audioSource?.connect(this._encoderNode);
    }
  }

  /**
   * Stops all audio encoding/decoding and closes the related connections.
   */
  stopAllAudio() {
    if (this._encoderNode) {
      this._encoderNode.disconnect();
    }
    if (this._decoderNode) {
      this._decoderNode.disconnect();
    }
    if (this._audioSource) {
      this._audioSource.disconnect();
      this._audioSource = null;
    }
    if (this._audioContext && this._audioContext.state !== 'closed') {
      this._audioContext.close();
    }
    if (this._audioDataChannel) {
      this._audioDataChannel.close();
    }
    if (this._audioElement) {
      this._audioElement.pause();
      this._audioElement = null;
    }
  }

  /**
   * Helper functions to pipe all incoming audio through WebRTC to allow echo cancellation on Chromium based browsers.
   *
   * See https://bugs.chromium.org/p/chromium/issues/detail?id=687574
   */

  private webrtcDummy(stream: MediaStream) {
    let audio: HTMLAudioElement | null = new Audio();
    audio.muted = true;
    audio.srcObject = stream;
    audio.addEventListener('canplaythrough', () => {
      audio = null;
    });
  }

  private async webrtcLoopback(input: MediaStreamTrack, output: MediaStreamTrack) {
    // setup peer connections
    const connection_one = new RTCPeerConnection();
    const connection_two = new RTCPeerConnection();
    connection_one.onicecandidate = async (event) => {
      if (event.candidate) {
        await connection_two.addIceCandidate(event.candidate);
      }
    };
    connection_two.onicecandidate = async (event) => {
      if (event.candidate) {
        await connection_one.addIceCandidate(event.candidate);
      }
    };

    // add tracks and catch loopbacks
    connection_one.addTrack(input);
    connection_two.addTrack(output);
    const loopback_input = new Promise<MediaStreamTrack>((resolve) => {
      connection_two.ontrack = (event) => resolve(event.track);
    });
    const loopback_output = new Promise<MediaStreamTrack>((resolve) => {
      connection_one.ontrack = (event) => resolve(event.track);
    });

    // open connection
    const offer = await connection_one.createOffer();
    await connection_one.setLocalDescription(offer);
    await connection_two.setRemoteDescription(offer);
    const answer = await connection_two.createAnswer();
    await connection_two.setLocalDescription(answer);
    await connection_one.setRemoteDescription(answer);

    return {
      input: await loopback_input,
      output: await loopback_output,
    };
  }
}
