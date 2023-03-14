/* eyvor [Revision: f397e9b166d58aa7ccb0a6461b93d508f980742c] */
const DecoderBlockSize = 32;
const RenderQuantum = 128;
const SamplesSize = 960;
const DefaultNumBuffers = 3;

class DecoderBlock extends AudioWorkletProcessor {
  constructor(...args) {
    console.assert(
      args.numberOfInputs === undefined || args.numberOfInputs === 0,
      'number of decoder-inputs must be 0'
    );
    args.numberOfInputs = 0;

    console.assert(
      args.numberOfOutputs === undefined || args.numberOfOutputs === 1,
      `number of decoder-outputs must be ${DecoderBlockSize}`
    );
    args.numberOfOutputs = DecoderBlockSize;

    console.assert(
      args.outputChannelCount === undefined ||
      (args.outputChannelCount.length === DecoderBlockSize && args.outputChannelCount.every((c) => c === 1)),
      'every decoded channel must be mono'
    );
    args.outputChannelCount = Array(DecoderBlockSize).fill(1);

    super(...args);

    this.buffer_index = 0;
    this.buffer_offset = 0;

    /** @type { Array<Float32Array> } */
    this.buffers = new Array(DefaultNumBuffers).fill(null);

    this.port.onmessage = this.on_message.bind(this);

    /** @type { Boolean } */
    this.alive = true;
  }

  /**
   * @param {MessageEvent} event
   */
  on_message(event) {
    switch (event.data.type) {
      case 'samples':
        if (event.data.index >= this.buffer_index) {
          console.assert(
            event.data.samples.length === DecoderBlockSize * SamplesSize,
            'invalid of numbers of samples in decoder buffer'
          );
          this.buffers[event.data.index % this.buffers.length] =
            event.data.samples;
        }
        break;
      case 'stop':
        this.alive = false;
        break;
      default:
        console.error('decoder got unknown message', event.data);
        break;
    }
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @param {Object<string, Float32Array>} parameters
   */
  process(inputs, outputs, parameters) {
    const start = this.buffer_offset;
    const end = Math.min(start + RenderQuantum, SamplesSize);

    this.fill(outputs, start, end, 0);
    if (end === SamplesSize) {
      this.port.postMessage({
        type: 'decode',
        index: this.buffer_index + this.buffers.length,
      });
      const left = (start + RenderQuantum) - SamplesSize;

      this.buffers[this.buffer_index % this.buffers.length] = null;
      this.buffer_offset = left;
      this.buffer_index += 1;

      this.fill(outputs, 0, left, end - start);
    } else {
      this.buffer_offset = end;
    }
    return this.alive;
  }

  /**
   * @param { Float32Array } outputs
   * @param { Number } start
   * @param { Number } end
   * @param { Number } offset
   */
  fill(outputs, start, end, offset) {
    if (start === end) return;

    const index = this.buffer_index % this.buffers.length;
    const buffer = this.buffers[index];
    if (buffer != null) {
      for (let i = 0; i < DecoderBlockSize; i++) {
        const index = i * SamplesSize;
        outputs[i][0].set(buffer.subarray(index + start, index + end), offset);
      }
    }
  }
}

class Encoder extends AudioWorkletProcessor {
  constructor(...args) {
    super(...args);
    // eslint-disable-next-line no-undef
    if (sampleRate % 50) {
      throw Error('sample rate must neatly fit into 20ms chunks');
    }

    /** @type {MessagePort} */
    this.worker = null;

    // eslint-disable-next-line no-undef
    this.buffer = new Float32Array(sampleRate / 50 /* sampleRate 20ms */);
    this.buffer_offset = 0;

    this.port.onmessage = this.on_message.bind(this);

    /** @type { Boolean } */
    this.alive = true;
  }

  /**
   * @param {MessageEvent} event
   * @param {Object}       event.data
   * @param {MessagePort}  event.data.worker
   */
  on_message(event) {
    switch (event.data.type) {
      case 'initialize':
        this.worker = event.data.worker;
        break;
      case 'stop':
        this.alive = false;
        break;
      default:
        console.error('encoder got unknown message', event.data);
    }
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @param {Object<string, Float32Array>} parameters
   */
  process(inputs, outputs, parameters) {
    const samples = inputs[0][0];
    if (samples === undefined || samples.length !== 128) return true;
    const free = this.buffer.length - this.buffer_offset;
    if (free > samples.length) {
      this.buffer.set(samples, this.buffer_offset);
      this.buffer_offset += samples.length;
    } else {
      this.buffer.set(samples.subarray(0, free), this.buffer_offset);
      this.encode();
      this.buffer.set(samples.subarray(free), 0);
      this.buffer_offset = samples.length - free;
    }
    return this.alive;
  }

  encode() {
    if (this.worker) {
      const samples = this.buffer;
      this.buffer = new Float32Array(samples.length);
      this.worker.postMessage({
        type: 'encode',
        samples,
      }, [samples.buffer]);
    }
  }
}

registerProcessor('eyvor-decoder', DecoderBlock);
registerProcessor('eyvor-encoder', Encoder);
