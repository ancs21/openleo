// Tiny Web Audio voices, no audio files. Off switch: localStorage "openleo-sounds" = "off".

type Voice = {
  source: { type: "sine" | "square" | "noise"; frequency?: number | { start: number; end: number } };
  filter?: { type: BiquadFilterType; frequency: number; resonance?: number };
  envelope: { attack: number; decay: number; release?: number };
  gain: number;
};
export type SoundName = "press" | "tick" | "release" | "page" | "pulse";

const VOICES: Record<SoundName, Voice[]> = {
  press: [
    { source: { type: "noise" }, filter: { type: "highpass", frequency: 2400 }, envelope: { attack: 3e-4, decay: 0.009 }, gain: 0.13 },
    { source: { type: "sine", frequency: 680 }, envelope: { attack: 6e-4, decay: 0.022, release: 0.008 }, gain: 0.24 },
  ],
  tick: [{ source: { type: "square", frequency: 2100 }, filter: { type: "bandpass", frequency: 2600, resonance: 1.6 }, envelope: { attack: 4e-4, decay: 0.028 }, gain: 0.24 }],
  release: [{ source: { type: "noise" }, filter: { type: "lowpass", frequency: 1600, resonance: 0.9 }, envelope: { attack: 0.001, decay: 0.055 }, gain: 0.32 }],
  page: [{ source: { type: "sine", frequency: { start: 430, end: 640 } }, envelope: { attack: 0.002, decay: 0.11, release: 0.03 }, gain: 0.4 }],
  pulse: [{ source: { type: "sine", frequency: 330 }, filter: { type: "lowpass", frequency: 2200 }, envelope: { attack: 0.002, decay: 0.13, release: 0.04 }, gain: 0.5 }],
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio() {
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export const soundsOn = () => { try { return localStorage.getItem("openleo-sounds") !== "off"; } catch { return true; } };
export const setSoundsOn = (on: boolean) => { try { localStorage.setItem("openleo-sounds", on ? "on" : "off"); } catch {} };

export function play(name: SoundName) {
  if (!soundsOn()) return;
  const ac = audio();
  const t = ac.currentTime;
  for (const v of VOICES[name]) {
    const { attack, decay, release = 0 } = v.envelope;
    const end = t + attack + decay + release;
    let src: AudioScheduledSourceNode;
    if (v.source.type === "noise") {
      const b = ac.createBufferSource();
      b.buffer = noise;
      src = b;
    } else {
      const o = ac.createOscillator();
      o.type = v.source.type;
      const f = v.source.frequency ?? 440;
      if (typeof f === "number") o.frequency.value = f;
      else { o.frequency.setValueAtTime(f.start, t); o.frequency.exponentialRampToValueAtTime(f.end, end); }
      src = o;
    }
    const env = ac.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(v.gain, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay + release);
    let node: AudioNode = src;
    if (v.filter) {
      const bq = ac.createBiquadFilter();
      bq.type = v.filter.type;
      bq.frequency.value = v.filter.frequency;
      bq.Q.value = v.filter.resonance ?? 1;
      node.connect(bq);
      node = bq;
    }
    node.connect(env).connect(master!);
    src.start(t);
    src.stop(end + 0.02);
  }
}

const CONTROL = "button,a[href],input:not([type='hidden']),select,textarea,summary,[role='button'],[role='checkbox'],[role='menuitem'],[role='option'],[role='radio'],[role='switch'],[role='tab']";
const RELEASE = /close|dismiss|remove|delete|collapse|cancel|clear|stop|end/i;
const PULSE = /send|save|submit|create|add|teach|continue/i;

function voiceFor(el: Element): SoundName {
  const explicit = el.getAttribute("data-sound");
  if (explicit && explicit in VOICES) return explicit as SoundName;
  const label = `${el.getAttribute("aria-label") ?? ""} ${el.textContent ?? ""}`.trim();
  if (RELEASE.test(label)) return "release";
  if (el.matches("input[type='checkbox'], input[type='radio'], select, [role='checkbox'], [role='radio'], [role='switch'], [role='tab'], [aria-pressed]")) return "tick";
  if (el.matches("a[href]")) return "page";
  if (PULSE.test(label)) return "pulse";
  if (el.matches("input, textarea")) return "tick";
  return "press";
}

/** Mark a subtree with data-sound-silent to mute it. */
export function installInteractionSounds() {
  document.addEventListener("click", (e) => {
    const el = e.target instanceof Element ? e.target.closest(CONTROL) : null;
    if (!el || el.closest("[data-sound-silent]") || el.matches(":disabled, [aria-disabled='true']")) return;
    play(voiceFor(el));
  }, true);
}
