/* eyvor [Revision: c7eeadd1be207b48a4f9c5e6bfe56715f4248814] */
class Decoder extends AudioWorkletProcessor {
    constructor(...args) {
        super(...args);

        /** @type {MessagePort} */
        this.worker = null;

        this.buffer_index = 0;
        this.buffer_offset = 0;

        /** @type { Array<Float32Array> } */
        this.buffers = null;

        this.port.onmessage = this.on_message.bind(this)
    }

    /**
     * @param {MessageEvent} event
     * @param {Object}       event.data
     * @param {MessagePort}  event.data.worker
     * @param {Number}       event.data.num_buffers
     */
    on_message(event) {
        switch (event.data.type) {
            case "initialize":
                console.assert(this.worker == null);
                console.assert(this.buffers == null);
                this.buffers = new Array(event.data.num_buffers || 3);
                this.buffers.fill(null);
                this.worker = event.data.worker;
                this.worker.onmessage = this.on_message.bind(this);
                this.worker.onmessageerror = console.error;
                break;
            case "samples":
                if (event.data.index >= this.buffer_index) {
                    this.buffers[event.data.index % this.buffers.length] = event.data.samples;
                }
                break;
            default:
                console.error("decoder got unknown message", event.data);
                break;
        }
    }

    /**
     * @param {Float32Array[][]} inputs
     * @param {Float32Array[][]} outputs
     * @param {Object<string, Float32Array>} parameters
     */
    process(inputs, outputs, parameters) {
        const samples = outputs[0][0];
        if (this.buffers) {
            const n = this.fill(samples);
            if (n < samples.length) {
                this.fill(samples.subarray(n));
            }
        }

        return true;
    }

    /**
     * @param { Float32Array } samples
     */
    fill(samples) {
        const start = this.buffer_offset;
        const end = Math.min(start + samples.length, 960);
        const index = this.buffer_index % this.buffers.length;
        const buffer = this.buffers[index];
        if (buffer) {
            samples.set(buffer.subarray(start, end));
        }
        if (end !== 960) {
            this.buffer_offset = end;
        } else {
            if (this.worker) {
                this.worker.postMessage({ type: "decode", index: this.buffer_index + this.buffers.length });
            }
            this.buffers[index] = null;
            this.buffer_offset = 0;
            this.buffer_index += 1;
        }

        return end - start;
    }
}

class Encoder extends AudioWorkletProcessor {
    constructor(...args) {
        super(...args);
        if (sampleRate != 48000 /* 48kHz */) {
            throw "sample rate must be 48khz"
        }

        /** @type {MessagePort} */
        this.worker = null;

        this.buffer = new Float32Array(sampleRate / 50 /* sampleRate 20ms */);
        this.buffer_offset = 0;

        this.port.onmessage = this.on_message.bind(this);
    }

    /**
     * @param {MessageEvent} event
     * @param {Object}       event.data
     * @param {MessagePort}  event.data.worker
     */
    on_message(event) {
        switch (event.data.type) {
            case "initialize":
                this.worker = event.data.worker;
                break;
            default:
                console.error("encoder got unknown message", event.data);
        }
    }

    /**
     * @param {Float32Array[][]} inputs
     * @param {Float32Array[][]} outputs
     * @param {Object<string, Float32Array>} parameters
     */
    process(inputs, outputs, parameters) {
        const samples = inputs[0][0];
        if (samples == undefined || samples.length !== 128) return true;
        const free = this.buffer.length - this.buffer_offset;
        if (free > samples.length) {
            this.buffer.set(samples, this.buffer_offset);
            this.buffer_offset += samples.length;
        }
        else {
            this.buffer.set(samples.subarray(0, free), this.buffer_offset);
            this.encode();
            this.buffer.set(samples.subarray(free), 0);
            this.buffer_offset = samples.length - free;
        }
        return true;
    }

    encode() {
        if (this.worker) {
            const samples = this.buffer;
            this.buffer = new Float32Array(samples.length);
            this.worker.postMessage({
                type: "encode",
                samples,
            }, [samples.buffer]);
        }
    }
}

registerProcessor('eyvor-decoder', Decoder);
registerProcessor('eyvor-encoder', Encoder);
