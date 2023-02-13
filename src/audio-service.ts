import {
  IOdinAudioSettings,
  IOdinAudioStatsEventPayload,
  IOdinMediaActivityChangedEventPayload,
  OdinEvent,
} from './types';
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
  private _encoderNode!: AudioWorkletNode;
  private _decoderNode!: AudioWorkletNode;
  private _medias: OdinMedia[] = [];
  private _room!: OdinRoom;
  private _bowser!: Bowser.Parser.Parser;
  private _audioSettings: IOdinAudioSettings = {
    voiceActivityDetection: true,
    voiceActivityDetectionAttackProbability: 0.9,
    voiceActivityDetectionReleaseProbability: 0.8,
    volumeGate: true,
    volumeGateAttackLoudness: -30,
    volumeGateReleaseLoudness: -40,
  };

  private constructor(
    private _worker: Worker,
    private _audioDataChannel: RTCDataChannel,
    private _audioContext: AudioContext
  ) {
    this._bowser = Bowser.getParser(window.navigator.userAgent);

    this._worker.onmessage = (event) => {
      switch (event.data.type) {
        case 'packet':
          if (this._audioDataChannel.readyState === 'open') {
            this._audioDataChannel.send(event.data.bytes);
          }
          break;
        case 'stats':
          this._room.eventTarget.dispatchEvent(
            new OdinEvent<IOdinAudioStatsEventPayload>('AudioStats', { room: this._room, stats: event.data })
          );
          break;
        case 'talk_status':
          this.updateMediaActivity(event.data.media_id, event.data.is_talking);
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
    if (this._room.ownPeer.medias.get(id)) return this._room.ownPeer;
    let peer!: OdinPeer;
    this._room.remotePeers.forEach((p) => {
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
  static setInstance(worker: Worker, audioChannel: RTCDataChannel, audioContext: AudioContext): AudioService {
    this._instance = new AudioService(worker, audioChannel, audioContext);
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
   * Returns the underlying room instance.
   */
  get room(): OdinRoom {
    return this._room;
  }

  /**
   * Sets the room this audio service is dealing with.
   *
   * @param room A room instance
   */
  set room(room: OdinRoom) {
    this._room = room;
  }

  /**
   * Returns true if the audio service knows a media with the specified ID.
   *
   * @param media The media ID to search for.
   */
  hasMedia(id: number): boolean {
    return !!this._medias.find((media) => media.id === id);
  }

  /**
   * Updates the activity status of a media and emits the necessary events.
   *
   * @param id
   * @param isActive
   */
  updateMediaActivity(id: number, isActive: boolean) {
    const media = this._medias.find((media) => media.id === id);
    const peer = this.getPeerByMediaId(id);

    if (!media) {
      return;
    }

    media.active = isActive;

    if (peer) {
      media.eventTarget.dispatchEvent(
        new OdinEvent<IOdinMediaActivityChangedEventPayload>('Activity', { room: this._room, peer, media })
      );
      peer.eventTarget.dispatchEvent(
        new OdinEvent<IOdinMediaActivityChangedEventPayload>('MediaActivity', { room: this._room, peer, media })
      );
      this._room.eventTarget.dispatchEvent(
        new OdinEvent<IOdinMediaActivityChangedEventPayload>('MediaActivity', { room: this._room, peer, media })
      );
    }
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

    this._encoderNode.port.postMessage({ type: 'initialize', worker: encoderPipe.port2 }, [encoderPipe.port2]);
    this._decoderNode.port.postMessage({ type: 'initialize', worker: decoderPipe.port2 }, [decoderPipe.port2]);

    this._decoderNode.connect(this._audioContext.destination);
  }

  /**
   * Starts to record the audio input and in the case of having a Blink based browser, also takes care about
   * echo cancellation.
   *
   * @param mediaStream
   * @param audioSettings
   */
  async updateInputStream(mediaStream: MediaStream): Promise<void> {
    const audioTrack = mediaStream.getAudioTracks()[0];

    // Apply ugly workaround to apply echo cancellation in Chromium based browsers
    if (this._bowser.getEngineName() === 'Blink' && audioTrack?.getConstraints()?.echoCancellation) {
      const outputDestination = this._audioContext.createMediaStreamDestination();
      this._decoderNode.disconnect(this._audioContext.destination);
      this._decoderNode.connect(outputDestination);

      const webrtc = await this.webrtcLoopback(audioTrack, outputDestination.stream.getAudioTracks()[0]);

      const inputStream = new MediaStream([webrtc.input]);
      const outputStream = new MediaStream([webrtc.output]);

      this.webrtcDummy(inputStream);
      this.webrtcDummy(outputStream);

      this._audioSource?.disconnect();
      this._audioSource = this._audioContext.createMediaStreamSource(inputStream);
      this._audioSource.connect(this._encoderNode);

      this._audioElement?.remove();
      this._audioElement = new Audio();
      this._audioElement.srcObject = outputStream;
      this._audioElement.volume = 1;

      await this._audioElement.play();
    } else {
      this._audioSource?.disconnect();
      this._audioSource = this._audioContext.createMediaStreamSource(mediaStream);
      this._audioSource?.connect(this._encoderNode);
    }
  }

  /**
   * Updates settings for voice activity detection and volume gate.
   *
   * @param settings The new settings and thresholds.
   */
  setVoiceProcessingConfig(settings: IOdinAudioSettings) {
    this._audioSettings = settings;

    this._worker.postMessage({
      type: 'update_vad_thresholds',
      voice: settings.voiceActivityDetection
        ? {
            going_active: settings.voiceActivityDetectionAttackProbability,
            going_inactive: settings.voiceActivityDetectionReleaseProbability,
          }
        : { going_active: 0, going_inactive: 0 },
      rms_dbfs: settings.volumeGate
        ? {
            going_active: settings.volumeGateAttackLoudness,
            going_inactive: settings.volumeGateReleaseLoudness,
          }
        : { going_active: 0, going_inactive: 0 },
    });
  }

  /**
   * Returns settings for voice activity detection and volume gate.
   */
  getVoiceProcessingConfig(): IOdinAudioSettings {
    return this._audioSettings;
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
