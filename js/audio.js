// js/audio.js
// Web Audio API 程序化合成音效與「FM 98.7 水公司之聲」惡搞廣播系統

export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.radioPlaying = false;
    this.radioTimer = null;
    this.radioStep = 0;
    this.subtitleTimer = null;
    this.waterNoiseNode = null;
    this.waterGainNode = null;

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

    this._initUnlockEvents();
    this._startSubtitleCycle();
  }

  _initUnlockEvents() {
    const unlock = () => {
      this.ensureContext();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  ensureContext() {
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
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopWaterLoop();
    }
    return this.enabled;
  }

  _startSubtitleCycle() {
    const el = document.getElementById('radio-subtitle');
    if (!el) return;
    this.subtitleTimer = setInterval(() => {
      this.msgIndex = (this.msgIndex + 1) % this.radioMessages.length;
      el.textContent = this.radioMessages[this.msgIndex];
    }, 15000);
  }

  broadcastBreakingNews(text) {
    const el = document.getElementById('radio-subtitle');
    if (!el) return;
    el.textContent = `🚨 【FM 98.7 緊急插播】${text}`;
  }

  // 啟動/停止車載 Funk/Lo-Fi 電台背景音樂
  setRadioActive(active, vehicleName = '') {
    if (active === this.radioPlaying) return;
    this.radioPlaying = active;

    if (active) {
      if (vehicleName) {
        this.broadcastBreakingNews(
          `目擊者指出一名員工正駕駛「${vehicleName}」在廠區狂飆，車上還開著超大聲的 FM 98.7 放克電台！`
        );
      }
      this.radioStep = 0;
      if (this.radioTimer) clearInterval(this.radioTimer);
      this.radioTimer = setInterval(() => {
        if (!this.enabled || !this.radioPlaying) return;
        this._playFunkStep(this.radioStep++);
      }, 210);
    } else {
      if (this.radioTimer) {
        clearInterval(this.radioTimer);
        this.radioTimer = null;
      }
    }
  }

  _playFunkStep(step) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Groovy Funk Bassline (Dorian mode)
    const bassNotes = [110, 0, 110, 130.81, 146.83, 0, 130.81, 164.81, 110, 0, 98, 110, 146.83, 164.81, 130.81, 0];
    const freq = bassNotes[step % bassNotes.length];
    if (freq > 0) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(750, now);
      filter.frequency.exponentialRampToValueAtTime(180, now + 0.16);

      gain.gain.setValueAtTime(0.06, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    }

    // Lo-Fi Electric Piano Chord Stab on off-beats
    if (step % 8 === 2 || step % 8 === 6) {
      const chords = [220, 261.63, 329.63, 392.0];
      chords.forEach((cFreq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(cFreq, now);
        gain.gain.setValueAtTime(0.018, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.26);
      });
    }

    // Crisp Hi-hat / Snare tick
    if (step % 2 === 1) {
      this._playNoiseBurst(0.035, 5000, 0.02);
    }
  }

  _playNoiseBurst(duration = 0.1, filterFreq = 1200, volume = 0.12, filterType = 'bandpass') {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
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

  playPunch(isDropkick = false) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(isDropkick ? 220 : 150, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + (isDropkick ? 0.22 : 0.12));

    gain.gain.setValueAtTime(isDropkick ? 0.25 : 0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isDropkick ? 0.24 : 0.14));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);

    this._playNoiseBurst(0.08, 900, 0.1);
  }

  playWrench() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Metallic clang
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
  }

  playHomerun() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sharp bat crack + celebratory organ chord
    this._playNoiseBurst(0.09, 2400, 0.28, 'highpass');
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + 0.05 + i * 0.04);
      gain.gain.setValueAtTime(0.11, now + 0.05 + i * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + 0.05 + i * 0.04);
      osc.stop(now + 0.58);
    });
  }

  playStapler() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

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
  }

  playCoffeeSplash() {
    this._playNoiseBurst(0.24, 1500, 0.16, 'bandpass');
  }

  playCoffeeOverclock() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [330, 440, 554.37, 659.25, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      gain.gain.setValueAtTime(0.09, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.24);
    });
  }

  playWaterBurst() {
    this._playNoiseBurst(0.16, 1100, 0.14, 'bandpass');
  }

  stopWaterLoop() {
    if (this.waterNoiseNode) {
      try {
        this.waterNoiseNode.stop();
      } catch (e) {}
      this.waterNoiseNode = null;
    }
  }

  playGlassShatter() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    this._playNoiseBurst(0.28, 3800, 0.24, 'highpass');
    for (let i = 0; i < 6; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const f = 1800 + Math.random() * 2400;
      const t = now + i * 0.035;
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    }
  }

  playElectricZap() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, now);
    osc.frequency.linearRampToValueAtTime(640, now + 0.08);
    osc.frequency.linearRampToValueAtTime(95, now + 0.22);

    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);

    this._playNoiseBurst(0.18, 3200, 0.14, 'bandpass');
  }

  playMicrowaveDing() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Classic crisp microwave bell "DING!"
    [2093, 4186].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(i === 0 ? 0.25 : 0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.65);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.68);
    });
  }

  playTickBeep(pitch = 1046) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch, now);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  playExplosion() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sub-bass boom
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(135, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.65);
    gain.gain.setValueAtTime(0.36, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.72);

    // Debris rumble noise
    this._playNoiseBurst(0.65, 420, 0.34, 'lowpass');
  }

  playBowlingStrike() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Pins clattering + fanfare
    for (let i = 0; i < 5; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.04;
      osc.frequency.setValueAtTime(520 + i * 110, t);
      osc.frequency.exponentialRampToValueAtTime(240, t + 0.12);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    }
  }

  playSiren() {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.setValueAtTime(880, now + 0.18);
    osc.frequency.setValueAtTime(660, now + 0.36);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.56);
  }

  playSettlementCue(type) {
    if (!this.enabled) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'passed') {
      // GTA Mission Passed Brass Arpeggio
      const notes = [293.66, 369.99, 440, 587.33, 554.37, 587.33];
      notes.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        const t = now + i * 0.11;
        osc.frequency.setValueAtTime(f, t);
        gain.gain.setValueAtTime(0.14, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.48);
      });
    } else {
      // Dramatic low impact thud (Overworked / Written Up)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.9);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.95);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 1.0);
    }
  }
}
