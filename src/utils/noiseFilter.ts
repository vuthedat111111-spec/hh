// @ts-expect-error - WASM JS module
interface RNNoiseWasmModule {
  _rnnoise_create: (ctx: null) => number;
  _rnnoise_process_frame: (state: number, outPtr: number, inPtr: number) => number;
  _rnnoise_destroy: (state: number) => void;
  _malloc: (bytes: number) => number;
  _free: (ptr: number) => void;
  HEAPF32: Float32Array;
  ready?: Promise<RNNoiseWasmModule>;
}

let wasmModulePromise: Promise<RNNoiseWasmModule> | null = null;

async function getRNNoiseWasm(): Promise<RNNoiseWasmModule | null> {
  if (!wasmModulePromise) {
    wasmModulePromise = (async () => {
      try {
        const moduleOrPromise = createRNNWasmModuleSync();
        if (moduleOrPromise && moduleOrPromise.ready) {
          return await moduleOrPromise.ready;
        }
        return moduleOrPromise;
      } catch (err) {
        console.warn('RNNoise WASM failed to initialize:', err);
        return null;
      }
    })();
  }
  return wasmModulePromise;
}

export class AudioNoiseProcessor {
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private destinationNode: MediaStreamAudioDestinationNode | null = null;
  private isProcessing = false;

  // RNNoise State
  private denoiseState: number | null = null;
  private inPtr: number | null = null;
  private outPtr: number | null = null;
  private wasmModule: RNNoiseWasmModule | null = null;

  public processAudioStream(inputStream: MediaStream, enableNoiseFilter: boolean): MediaStream {
    const audioTrack = inputStream.getAudioTracks()[0];
    if (!audioTrack) return inputStream;

    if (!enableNoiseFilter) {
      this.cleanup();
      return inputStream;
    }

    try {
      if (!this.audioCtx) {
        const AudioCtxClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.audioCtx = new AudioCtxClass({ sampleRate: 48000 });
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      this.cleanupNodes();

      const rawStream = new MediaStream([audioTrack]);
      this.sourceNode = this.audioCtx.createMediaStreamSource(rawStream);
      this.destinationNode = this.audioCtx.createMediaStreamDestination();

      // High-pass filter to remove sub-bass low-frequency rumble (AC, wind, hum)
      const highPassFilter = this.audioCtx.createBiquadFilter();
      highPassFilter.type = 'highpass';
      highPassFilter.frequency.setValueAtTime(85, this.audioCtx.currentTime);

      // Dynamics Compressor acting as audio leveler and noise gate
      const compressor = this.audioCtx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-40, this.audioCtx.currentTime);
      compressor.knee.setValueAtTime(24, this.audioCtx.currentTime);
      compressor.ratio.setValueAtTime(10, this.audioCtx.currentTime);
      compressor.attack.setValueAtTime(0.003, this.audioCtx.currentTime);
      compressor.release.setValueAtTime(0.2, this.audioCtx.currentTime);

      // Try RNNoise neural network WASM engine
      getRNNoiseWasm().then((wasm) => {
        if (wasm && this.audioCtx) {
          try {
            this.wasmModule = wasm;
            this.denoiseState = wasm._rnnoise_create(null);
            const FRAME_SIZE = 480;
            this.inPtr = wasm._malloc(FRAME_SIZE * 4);
            this.outPtr = wasm._malloc(FRAME_SIZE * 4);

            const bufferSize = 2048;
            this.scriptNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

            const inBuffer: number[] = [];
            const outBuffer: number[] = [];

            this.scriptNode.onaudioprocess = (e) => {
              const inputChannel = e.inputBuffer.getChannelData(0);
              const outputChannel = e.outputBuffer.getChannelData(0);

              for (let i = 0; i < inputChannel.length; i++) {
                inBuffer.push(inputChannel[i]);
              }

              while (inBuffer.length >= FRAME_SIZE) {
                const frame = inBuffer.splice(0, FRAME_SIZE);
                const inOffset = (this.inPtr as number) / 4;

                for (let i = 0; i < FRAME_SIZE; i++) {
                  wasm.HEAPF32[inOffset + i] = frame[i] * 32768.0;
                }

                wasm._rnnoise_process_frame(
                  this.denoiseState as number,
                  this.outPtr as number,
                  this.inPtr as number
                );

                const outOffset = (this.outPtr as number) / 4;
                for (let i = 0; i < FRAME_SIZE; i++) {
                  outBuffer.push(wasm.HEAPF32[outOffset + i] / 32768.0);
                }
              }

              for (let i = 0; i < outputChannel.length; i++) {
                if (outBuffer.length > 0) {
                  outputChannel[i] = outBuffer.shift()!;
                } else {
                  outputChannel[i] = inputChannel[i];
                }
              }

              if (e.outputBuffer.numberOfChannels > 1) {
                const outputChannel1 = e.outputBuffer.getChannelData(1);
                outputChannel1.set(outputChannel);
              }
            };

            // Connect nodes: Source -> Highpass -> ScriptProcessor (RNNoise) -> Compressor -> Destination
            this.sourceNode?.disconnect();
            this.sourceNode?.connect(highPassFilter);
            highPassFilter.connect(this.scriptNode);
            this.scriptNode.connect(compressor);
            compressor.connect(this.destinationNode!);
          } catch (err) {
            console.warn('Error setting up RNNoise processor, using filter fallback:', err);
            this.setupFallbackNodes(highPassFilter, compressor);
          }
        } else {
          this.setupFallbackNodes(highPassFilter, compressor);
        }
      });

      // Default initial connection until RNNoise loads
      this.setupFallbackNodes(highPassFilter, compressor);

      this.isProcessing = true;
      const processedAudioTrack = this.destinationNode.stream.getAudioTracks()[0];
      const videoTrack = inputStream.getVideoTracks()[0];

      const tracks: MediaStreamTrack[] = [processedAudioTrack];
      if (videoTrack) tracks.push(videoTrack);

      return new MediaStream(tracks);
    } catch (err) {
      console.warn('Web Audio Noise Filter error, falling back to raw stream:', err);
      return inputStream;
    }
  }

  private setupFallbackNodes(highPassFilter: BiquadFilterNode, compressor: DynamicsCompressorNode) {
    if (this.sourceNode && this.destinationNode) {
      try {
        this.sourceNode.disconnect();
        this.sourceNode.connect(highPassFilter);
        highPassFilter.connect(compressor);
        compressor.connect(this.destinationNode);
      } catch {
        // ignore
      }
    }
  }

  private cleanupNodes() {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }
    if (this.scriptNode) {
      try {
        this.scriptNode.disconnect();
        this.scriptNode.onaudioprocess = null;
      } catch {
        // ignore
      }
      this.scriptNode = null;
    }

    if (this.wasmModule) {
      if (this.denoiseState && this.wasmModule._rnnoise_destroy) {
        try {
          this.wasmModule._rnnoise_destroy(this.denoiseState);
        } catch {
          // ignore
        }
      }
      if (this.inPtr && this.wasmModule._free) {
        try {
          this.wasmModule._free(this.inPtr);
        } catch {
          // ignore
        }
      }
      if (this.outPtr && this.wasmModule._free) {
        try {
          this.wasmModule._free(this.outPtr);
        } catch {
          // ignore
        }
      }
    }

    this.denoiseState = null;
    this.inPtr = null;
    this.outPtr = null;
    this.destinationNode = null;
  }

  public cleanup() {
    this.cleanupNodes();
    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }
    this.isProcessing = false;
  }

  public getIsProcessing(): boolean {
    return this.isProcessing;
  }
}
