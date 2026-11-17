// js/audio.js
// Web Audio API 程序化合成音效與「FM 98.7 水公司之聲」惡搞廣播系統

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.radioPlaying = false;
    this.radioStep = 0;
    this.radioBeatAcc = 0;
    this.subtitleTimer = null;
    this.breakingTimer = 0;

    this.radioMessages = [
      '📻 【FM 98.7 水公司之聲】插播最新路況：一樓營業大廳目前有一輛失控的倉庫堆高機正在追逐業務科長，請洽公民眾注意閃避...',
      '📻 【政風室宣導】嚴禁同仁將滅火器綁在人體工學辦公椅後方進行走廊甩尾大賽，違者記大過處分！',
      '📻 【總務組廣播】請問是誰把茶水間的微波爐拿去加熱鋁箔包便當？現在三樓充滿濃煙，請立即自首！',
      '📻 【FM 98.7 點播時間】工務課阿明點播一首《漏水的心》，送給總是把給水申請書退件的副理，祝他假髮永遠不會被高壓水槍沖走...',
      '📻 【防汛中心快訊】本處外場堆置之巨型藍色 PVC 輸水管固定木楔疑似遭人蓄意破壞，請巡邏保全小心滾動巨管！',
      '📻 【節約用水小常識】打破桶裝水飲水機並不會讓您提早下班，若再砸毀旁邊的電腦主機更會引發全場感電，請同仁自重！',
      '📻 【熱門排行榜】本週辦公室最具殺傷力武器排行：第 1 名「高壓輸水幹管噴射砲」、第 2 名「滾燙特濃美式咖啡壺」...'
    ];
    this.msgIndex = 0;
    this._startSubtitleCycle();
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    return !this.muted;
  }

  _startSubtitleCycle() {
    const el = document.getElementById('radio-subtitle');
    if (!el) return;
    this.subtitleTimer = setInterval(() => {
      if (this.breakingTimer > 0) return;
      this.msgIndex = (this.msgIndex + 1) % this.radioMessages.length;
      el.textContent = this.radioMessages[this.msgIndex];
    }, 14000);
  }

  pushBreakingNews(text) {
    const el = document.getElementById('radio-subtitle');
    if (!el) return;
    el.textContent = text;
    this.breakingTimer = 7.0;
  }

  toggleRadio(active) {
    this.radioPlaying = Boolean(active);
  }

  updateRadio(dt, isDriving) {
    if (this.breakingTimer > 0) {
      this.breakingTimer = Math.max(0, this.breakingTimer - dt);
    }
    if (this.muted || (!this.radioPlaying && !isDriving)) return;
    this.radioBeatAcc += dt;
    if (this.radioBeatAcc >= 0.21) {
      this.radioBeatAcc -= 0.21;
      this._playFunkStep(this.radioStep++);
    }
  }

  update(dt, isDriving) {
    this.updateRadio(dt, isDriving);
  }

  _playFunkStep(step) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    const bassNotes = [110, 0, 110, 130.81, 146.83, 0, 130.81, 164.81, 110, 0, 98, 110, 146.83, 164.81, 130.81, 0];
    const freq = bassNotes[step % bassNotes.length];
    if (freq > 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(720, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.16);
      gain.gain.setValueAtTime(0.055, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    }

    if (step % 8 === 2 || step % 8 === 6) {
      [220, 261.63, 329.63, 392.0].forEach((cFreq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(cFreq, now);
        gain.gain.setValueAtTime(0.015, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      });
    }

    if (step % 2 === 1) {
      this._playNoiseBurst(0.03, 5000, 0.018, 'highpass');
    }
  }

  _playNoiseBurst(duration = 0.1, filterFreq = 1200, volume = 0.12, filterType = 'bandpass') {
    if (this.muted) return;
    const ctx = this.init();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);
  }

  playWater() {
    this._playNoiseBurst(0.16, 1100, 0.14, 'bandpass');
  }

  playHit(isHeavy = false) {
    if (this.muted) return;
    const ctx = this.init();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHeavy ? 220 : 150, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + (isHeavy ? 0.22 : 0.12));
    gain.gain.setValueAtTime(isHeavy ? 0.24 : 0.17, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isHeavy ? 0.24 : 0.14));
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
    this._playNoiseBurst(0.08, 900, 0.1);
  }

  playExplosion() {
    if (this.muted) return;
    const ctx = this.init();
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.65);
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.72);
    this._playNoiseBurst(0.6, 420, 0.32, 'lowpass');
  }

  playSFX(name) {
    if (this.muted) return;
    const ctx = this.init();
    if (!ctx) return;
    const now = ctx.currentTime;

    switch (name) {
      case 'punch':
        this.playHit(false);
        break;
      case 'kick':
        this.playHit(true);
        break;
      case 'wrench_hit': {
        [420, 680, 1120].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = idx === 0 ? 'triangle' : 'square';
          osc.frequency.setValueAtTime(freq, now);
          osc.frequency.exponentialRampToValueAtTime(freq * 0.72, now + 0.18);
          gain.gain.setValueAtTime(0.08 / (idx + 1), now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.21);
        });
        break;
      }
      case 'homerun': {
        this._playNoiseBurst(0.09, 2400, 0.26, 'highpass');
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + 0.04 + i * 0.04);
          gain.gain.setValueAtTime(0.11, now + 0.04 + i * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + 0.04 + i * 0.04);
          osc.stop(now + 0.55);
        });
        break;
      }
      case 'stapler': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(980, now);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.045);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.055);
        break;
      }
      case 'splash':
      case 'water_jet':
        this.playWater();
        break;
      case 'caffeine_boost': {
        [330, 440, 554.37, 659.25, 880].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + i * 0.05);
          gain.gain.setValueAtTime(0.09, now + i * 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.05 + 0.2);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + i * 0.05);
          osc.stop(now + i * 0.05 + 0.22);
        });
        break;
      }
      case 'glass_break': {
        this._playNoiseBurst(0.28, 3800, 0.22, 'highpass');
        for (let i = 0; i < 5; i++) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          const t = now + i * 0.035;
          osc.frequency.setValueAtTime(1800 + Math.random() * 2200, t);
          gain.gain.setValueAtTime(0.06, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.13);
        }
        break;
      }
      case 'electric_zap': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(640, now + 0.08);
        osc.frequency.linearRampToValueAtTime(95, now + 0.22);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
        this._playNoiseBurst(0.18, 3200, 0.13, 'bandpass');
        break;
      }
      case 'microwave_beep': {
        [2093, 4186].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(i === 0 ? 0.22 : 0.09, now);
          gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.55);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now);
          osc.stop(now + 0.58);
        });
        break;
      }
      case 'explosion':
      case 'shredder_tornado':
        this.playExplosion();
        break;
      case 'siren': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, now);
        osc.frequency.setValueAtTime(880, now + 0.18);
        osc.frequency.setValueAtTime(660, now + 0.36);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.54);
        break;
      }
      case 'wheel_open': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(240, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
        break;
      }
      case 'mission_passed': {
        [293.66, 369.99, 440, 587.33, 554.37, 587.33].forEach((f, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          const t = now + i * 0.11;
          osc.frequency.setValueAtTime(f, t);
          gain.gain.setValueAtTime(0.13, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.44);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(t);
          osc.stop(t + 0.46);
        });
        break;
      }
      case 'wasted':
      case 'busted': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.85);
        gain.gain.setValueAtTime(0.26, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.95);
        break;
      }
      default:
        this.playHit(false);
        break;
    }
  }
}

export default AudioSystem;
