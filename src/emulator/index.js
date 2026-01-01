import {
  DisplayLoop,
  RetroAppWrapper,
  ScriptAudioProcessor,
  LOG,
} from '@webrcade/app-common';

export class Emulator extends RetroAppWrapper {

  constructor(app, debug = false) {
    super(app, debug);

    window.emulator = this;

    this.swapControllers = null;
    this.leftDifficulty = null;
    this.rightDifficulty = null;
    this.colorSwitch = null;

    this.frameRate = 60;

    this.total = 0;
    this.count = 0;

    const START_DELAY = 5;


    let started = 0;

    // Fractional sample carry
    this.audioCarry = 0;

    this.total = 0;
    this.count = 0;

    this.audioCallback = (offset, length) => {
      if (started === START_DELAY) {
        this.audioProcessor.start();
      } else if (started < START_DELAY) {
        started++;
        return;
      }

      // length = incoming frames (mono)
      //this.total += length;
      this.count++;

      if (this.count >= this.frameRate) {
        //console.log("total:", this.total);
        this.total = 0;
        this.count = 0;
      }

      // ---- target frames this callback ----
      const exactFrames = (48000 + 15) / this.frameRate;
      const framesWithCarry = exactFrames + this.audioCarry;
      const outFrames = Math.floor(framesWithCarry);
      this.audioCarry = framesWithCarry - outFrames;

      // ---- input samples (stereo interleaved) ----
      const inSamples = length << 1;
      const input = new Int16Array(
        window.Module.HEAP16.buffer,
        offset,
        inSamples
      );

      // ---- output buffer (stereo interleaved) ----
      const outSamples = outFrames << 1;
      const output = new Int16Array(outSamples);

      // ---- frame walking resampler (no timing drift) ----
      const step = length / outFrames;

      let srcFrame = 0;
      for (let i = 0; i < outFrames; i++) {
        const si = (srcFrame | 0) << 1;

        output[i * 2]     = input[si];
        output[i * 2 + 1] = input[si + 1];

        srcFrame += step;
      }

      this.total += (outSamples >> 1);

      this.audioProcessor.storeSoundCombinedInput(
        output,
        2,
        outSamples,
        0,
        28000 /*((65535 >> 1) | 0)*/
      );
    };

    // let started = 0;
    // this.audioCallback = (offset, length) => {
    //   if (started === START_DELAY) {
    //     this.audioProcessor.start();
    //   } else if (started < START_DELAY) {
    //     started++;
    //     return;
    //   }

    //   this.total += length;
    //   this.count ++;

    //   if (this.count === 60) {
    //     console.log(this.total);
    //     this.total = 0;
    //     this.count = 0;
    //   }

    //   length = length << 1;
    //   const audioArray = new Int16Array(window.Module.HEAP16.buffer, offset, length);
    //   this.audioProcessor.storeSoundCombinedInput(
    //     audioArray, 2, length, 0, 28000 /*((65535 >> 1) | 0)*/
    //   );
    // };
  }

  createAudioProcessor() {
    return new ScriptAudioProcessor(
      2,
      48000,
      8192 + 4096,
      2048,
    ).setDebug(this.debug);
  }

  // createAudioProcessor() {
  //   return new ScriptAudioProcessor(2, 48000).setDebug(this.debug);
  // }

  setFrameRate(rate) {
    rate = Math.round(rate);
    LOG.info("## frame rate set to: " + rate);
    this.frameRate = rate;
  }

  createDisplayLoop(debug) {
    return new DisplayLoop(this.frameRate, true, debug, false, false);
  }

  updateSwitches(switches) {
    console.log("Update switches: " + switches);
    this.leftDifficulty = switches & 0x40 ? "a" : "b";
    this.rightDifficulty = switches & 0x80 ? "a" : "b";
    this.colorSwitch = switches & 0x08 ? "color" : "b&w";
  }

  getLeftDifficulty() { return this.leftDifficulty; }
  setLeftDifficulty(value) {
    if (value === this.leftDifficulty) return;
    this.leftDifficulty = value;
    this.applyGameSettings();
  }

  getRightDifficulty() { return this.rightDifficulty; }
  setRightDifficulty(value) {
    if (value === this.rightDifficulty) return;
    this.rightDifficulty = value;
    this.applyGameSettings();
  }

  getColorSwitch() { return this.colorSwitch; }
  setColorSwitch(value) {
    if (value === this.colorSwitch) return;
    this.colorSwitch = value;
    this.applyGameSettings();
  }

  getSwapControllers() { return this.swapControllers; }
  setSwapControllers(value) {
    if (value === this.swapControllers) return;
    this.swapControllers = value;
    this.applyGameSettings();
  }

  getScriptUrl() {
    return 'js/stella2014_libretro.js';
  }

  getPrefs() {
    return this.prefs;
  }

  async saveState() {
  }

  isEscapeHackEnabled() {
    return false;
  }

  async loadState() {
    // Check cloud storage (eliminate delay when showing settings)
    try {
      await this.getSaveManager().isCloudEnabled(this.loadMessageCallback);
    } finally {
      this.loadMessageCallback(null);
    }
  }

  getPortZeroType() {
    const props = this.getProps();
    return props.port0 ? props.port0 : 0;
  }

  getPortOneType() {
    const props = this.getProps();
    return props.port1 ? props.port1 : 0;
  }

  getPaddleVertical() {
    const props = this.getProps();
    return props.paddleVertical && props.paddleVertical === true ? 1 : 0;
  }

  getPaddleCenter() {
    const props = this.getProps();
    return props.paddleCenter !== undefined ? props.paddleCenter : 0;
  }

  getPaddleSensitivity() {
    const props = this.getProps();
    return props.paddleSensitivity !== undefined ? props.paddleSensitivity : 0;
  }

  getPaddleInverted() {
    const props = this.getProps();
    return props.paddleInverted && props.paddleInverted === true ? 1 : 0;
  }

  applyGameSettings() {
    const { Module } = window;
    const props = this.getProps();

    console.log(props);

    if (this.leftDifficulty === null) {
      this.leftDifficulty = "b";
    }

    if (this.rightDifficulty === null) {
      this.rightDifficulty = "b";
    }

    if (this.colorSwitch === null) {
      this.colorSwitch = "color";
    }

    if (this.swapControllers === null) {
      this.swapControllers = props.swap ? true : false;
    }

    let options = 0;
    if (this.swapControllers) {
      options |= this.OPT1;
    }
    if (this.colorSwitch === "b&w") {
      options |= this.OPT2;
    }
    if (this.leftDifficulty === "a") {
      options |= this.OPT3;
    }
    if (this.rightDifficulty === "a") {
      options |= this.OPT4;
    }

    Module._wrc_set_options(options);
  }

  isForceAspectRatio() {
    return false;
  }

  getDefaultAspectRatio() {
    return 1.333;
  }

  resizeScreen(canvas) {
    this.canvas = canvas;
    this.updateScreenSize();
  }

  getShotAspectRatio() { return this.getDefaultAspectRatio(); }
}
