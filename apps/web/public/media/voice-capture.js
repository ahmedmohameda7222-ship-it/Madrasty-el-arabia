class MadrastyVoiceCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(2048);
    this.used = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data !== "finish") return;
      if (this.used) {
        const last = this.block.slice(0, this.used);
        this.port.postMessage(last, [last.buffer]);
      }
      this.stopped = true;
      this.port.postMessage("finished");
    };
  }

  process(inputs) {
    if (this.stopped) return false;
    const samples = inputs[0]?.[0];
    if (!samples) return true;
    for (const sample of samples) {
      this.block[this.used++] = sample;
      if (this.used === this.block.length) {
        this.port.postMessage(this.block, [this.block.buffer]);
        this.block = new Float32Array(2048);
        this.used = 0;
      }
    }
    return true;
  }
}

registerProcessor("madrasty-voice", MadrastyVoiceCapture);
