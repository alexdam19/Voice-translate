/** Tiny synthesized sound effects (no audio files needed). */
export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  muted = false;
  private last = new Map<string, number>();

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  unlock(): void {
    const c = this.ensure();
    if (c && c.state === 'suspended') void c.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.35;
  }

  private throttle(key: string, ms: number): boolean {
    const now = performance.now();
    if ((this.last.get(key) ?? 0) + ms > now) return false;
    this.last.set(key, now);
    return true;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0): void {
    const c = this.ensure();
    if (!c || !this.master || this.muted) return;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), c.currentTime + dur);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(c.currentTime + dur);
  }

  private noise(dur: number, vol: number, filter: number, q = 1): void {
    const c = this.ensure();
    if (!c || !this.master || !this.noiseBuf || this.muted) return;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filter;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(0, Math.random() * 0.5);
    s.stop(c.currentTime + dur);
  }

  play(name: string, vol = 1): void {
    if (this.muted || vol <= 0.02 || !this.throttle(name, name === 'harvest' ? 120 : name === 'smg' ? 45 : 30)) return;
    switch (name) {
      case 'smg': this.noise(0.07, 0.3 * vol, 3200); this.tone(160, 0.05, 'square', 0.05 * vol, 0.6); break;
      case 'shotgun': this.noise(0.25, 0.6 * vol, 1400); this.tone(90, 0.18, 'sawtooth', 0.15 * vol, 0.4); break;
      case 'cannon': this.noise(0.35, 0.7 * vol, 900); this.tone(70, 0.3, 'square', 0.25 * vol, 0.4); break;
      case 'laser': this.tone(1200, 0.14, 'sawtooth', 0.1 * vol, 0.3); break;
      case 'rail': this.tone(2200, 0.35, 'sawtooth', 0.16 * vol, 0.1); this.noise(0.2, 0.3 * vol, 5000); break;
      case 'rocket': this.noise(0.45, 0.35 * vol, 900); this.tone(300, 0.2, 'triangle', 0.06 * vol, 2); break;
      case 'mortar': this.tone(180, 0.25, 'square', 0.18 * vol, 0.5); this.noise(0.2, 0.4 * vol, 700); break;
      case 'tesla': this.noise(0.18, 0.3 * vol, 6000, 4); this.tone(90, 0.15, 'sawtooth', 0.1 * vol, 3); break;
      case 'flak': this.noise(0.12, 0.35 * vol, 1800); break;
      case 'enemyshot': this.noise(0.06, 0.2 * vol, 2400); this.tone(420, 0.05, 'square', 0.04 * vol, 0.6); break;
      case 'boom': this.noise(0.5, 0.6 * vol, 600, 0.7); this.tone(70, 0.35, 'sine', 0.3 * vol, 0.4); break;
      case 'bigboom': this.noise(1.1, 0.95 * vol, 400, 0.7); this.tone(45, 0.8, 'sine', 0.55 * vol, 0.3); break;
      case 'splat': this.noise(0.12, 0.25 * vol, 1200); this.tone(140, 0.1, 'square', 0.06 * vol, 0.5); break;
      case 'bite': this.tone(200, 0.08, 'square', 0.1 * vol, 0.6); break;
      case 'harvest': this.noise(0.06, 0.12 * vol, 2500 + Math.random() * 2000); this.tone(700 + Math.random() * 200, 0.04, 'square', 0.03 * vol); break;
      case 'pickup': this.tone(880, 0.06, 'square', 0.06 * vol, 1.5); break;
      case 'chest': this.tone(523, 0.1, 'square', 0.1 * vol); setTimeout(() => this.tone(659, 0.1, 'square', 0.1 * vol), 90); setTimeout(() => this.tone(784, 0.18, 'square', 0.1 * vol), 180); break;
      case 'legendary': [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'square', 0.1 * vol), i * 90)); break;
      case 'rune': this.tone(330, 0.5, 'sine', 0.15 * vol, 2); this.tone(495, 0.5, 'triangle', 0.08 * vol, 2); break;
      case 'levelup': [392, 523, 659].forEach((f, i) => setTimeout(() => this.tone(f, 0.12, 'square', 0.08 * vol), i * 80)); break;
      case 'ability': this.tone(600, 0.12, 'triangle', 0.12 * vol, 1.8); this.noise(0.1, 0.15 * vol, 4000); break;
      case 'alarm': this.tone(700, 0.25, 'square', 0.1 * vol, 0.7); setTimeout(() => this.tone(700, 0.25, 'square', 0.1 * vol, 0.7), 300); break;
      case 'roar': this.noise(1.4, 0.6 * vol, 300, 2); this.tone(55, 1.2, 'sawtooth', 0.3 * vol, 0.6); break;
      case 'ui': this.tone(660, 0.04, 'square', 0.05 * vol); break;
      case 'error': this.tone(140, 0.15, 'square', 0.1 * vol); break;
      case 'build': this.tone(260, 0.06, 'square', 0.1 * vol, 0.8); this.noise(0.05, 0.2 * vol, 3000); break;
      case 'craft': this.tone(520, 0.08, 'square', 0.08 * vol, 1.2); setTimeout(() => this.tone(780, 0.1, 'square', 0.08 * vol, 1.2), 70); break;
      case 'hurt': this.tone(220, 0.2, 'sawtooth', 0.15 * vol, 0.5); break;
    }
  }

  /** Continuous engine drone whose pitch follows rig speed. */
  engine(speed: number, on: boolean): void {
    const c = this.ctx;
    if (!c || !this.master) return;
    if (!this.engineOsc) {
      this.engineOsc = c.createOscillator();
      this.engineOsc.type = 'sawtooth';
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      this.engineGain = c.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(f).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    this.engineOsc.frequency.setTargetAtTime(36 + Math.abs(speed) * 6, c.currentTime, 0.1);
    this.engineGain!.gain.setTargetAtTime(on && !this.muted ? 0.04 + Math.min(0.06, Math.abs(speed) * 0.008) : 0, c.currentTime, 0.2);
  }
}
