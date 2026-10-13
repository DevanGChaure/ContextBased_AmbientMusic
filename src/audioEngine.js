// Generative Ambient Sound Engine for Emotion-Aware Reading POC
// Uses Web Audio API to create dynamic, cinematic atmospheric soundscapes
// with smooth crossfading based on detected scene emotions.

class EmotionAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.currentVoice = null;
    this.volume = 0.35;
    this.isPlaying = false;
    this.currentEmotion = null;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    }
  }

  // Frequency and chord presets tailored for each emotional mood
  getEmotionFrequencies(emotion) {
    switch (emotion) {
      case 'Fear':
        // Dissonant, low eerie drone (Eb2, Bb2, E3 tritone tension)
        return { freqs: [77.78, 116.54, 164.81], type: 'sawtooth', filterFreq: 240, Q: 3.5 };
      case 'Interest':
        // Open fifths with inquisitive, evolving resonance (A2, E3, B3)
        return { freqs: [110.0, 164.81, 246.94], type: 'sine', filterFreq: 480, Q: 1.2 };
      case 'Joy':
        // Warm, glowing major chord (F2, C3, A3)
        return { freqs: [87.31, 130.81, 220.0], type: 'triangle', filterFreq: 520, Q: 0.8 };
      case 'Sadness':
        // Melancholic minor voicing (D2, A2, F3)
        return { freqs: [73.42, 110.0, 174.61], type: 'sine', filterFreq: 280, Q: 1.5 };
      case 'Anger':
        // Harsh low tension (C2, F#2, C3)
        return { freqs: [65.41, 92.5, 130.81], type: 'sawtooth', filterFreq: 220, Q: 4.0 };
      case 'Surprise':
        // Floating suspended chord (G2, D3, F#3)
        return { freqs: [98.0, 146.83, 185.0], type: 'triangle', filterFreq: 600, Q: 2.0 };
      case 'Neutral':
      default:
        // Meditative, warm peaceful fifths (C2, G2, D3)
        return { freqs: [65.41, 98.0, 146.83], type: 'sine', filterFreq: 340, Q: 0.6 };
    }
  }

  play(emotion = 'Neutral', intensity = 50, fadeMs = 1800) {
    this.init();
    this.isPlaying = true;

    if (this.currentEmotion === emotion && this.currentVoice) {
      return; // Already playing this mood
    }

    this.currentEmotion = emotion;
    const now = this.ctx.currentTime;
    const fadeSec = Math.max(0.4, fadeMs / 1000);

    // Old voice fade out
    if (this.currentVoice) {
      const oldGain = this.currentVoice.gainNode;
      const oldOscs = this.currentVoice.oscillators;
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      setTimeout(() => {
        try {
          oldOscs.forEach((o) => o.stop());
          oldGain.disconnect();
        } catch (e) {}
      }, fadeSec * 1000 + 100);
    }

    // New voice setup
    const config = this.getEmotionFrequencies(emotion);
    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);

    // Intensity scales target volume slightly
    const targetGain = 0.25 + (intensity / 100) * 0.15;
    voiceGain.gain.linearRampToValueAtTime(targetGain, now + fadeSec);

    // Filter to soften harmonics and create ambient atmosphere
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(config.filterFreq, now);
    filter.Q.setValueAtTime(config.Q, now);

    // Create LFO for subtle breathing/movement
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.setValueAtTime(0.12, now); // Slow 8.3s cycle
    lfoGain.gain.setValueAtTime(30, now);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // Create detuned chord oscillators
    const oscillators = config.freqs.map((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = config.type;
      // Subtle micro-detuning for chorus/warmth
      const detune = (i - 1) * 4;
      osc.frequency.setValueAtTime(freq, now);
      osc.detune.setValueAtTime(detune, now);
      osc.connect(filter);
      osc.start();
      return osc;
    });

    oscillators.push(lfo);

    filter.connect(voiceGain);
    voiceGain.connect(this.masterGain);

    this.currentVoice = {
      gainNode: voiceGain,
      oscillators,
      filter,
      lfo,
    };
  }

  stop(fadeMs = 800) {
    if (!this.isPlaying || !this.ctx) return;
    this.isPlaying = false;
    this.currentEmotion = null;

    if (this.currentVoice) {
      const now = this.ctx.currentTime;
      const fadeSec = fadeMs / 1000;
      const oldGain = this.currentVoice.gainNode;
      const oldOscs = this.currentVoice.oscillators;
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      setTimeout(() => {
        try {
          oldOscs.forEach((o) => o.stop());
          oldGain.disconnect();
        } catch (e) {}
      }, fadeSec * 1000 + 100);
      this.currentVoice = null;
    }
  }
}

export const audioEngine = new EmotionAudioEngine();
