"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const KID_MODE_IDLE_MS = 10_000;
const MAX_PARTICLES = 360;
const MAX_SHAPES = 16;
const MAX_SYMBOLS = 9;
const MIN_REACTION_MS = 58;
const MAX_AUDIO_VOICES = 10;

const EMOJIS = ["🌈", "⭐", "🚀", "🦕", "🦄", "🐳", "🍓", "🌞", "🐸", "🎈", "🍉", "🪐", "🐙", "🚂", "🍩", "🦋", "🐯", "💫", "🌻", "🐝"];
const FRIENDLY_KEYS: Record<string, string> = {
  " ": "★",
  Enter: "↵",
  Backspace: "←",
  Tab: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Shift: "⬆",
  CapsLock: "A",
  Meta: "◆",
  Control: "●",
  Alt: "▲",
  Escape: "☆",
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  life: number;
  size: number;
  hue: number;
  shape: number;
  spin: number;
  rotation: number;
};

type KidPartyRuntime = {
  end: () => void;
  pointerDown: (x: number, y: number) => void;
  toggleSound: () => void;
};

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || Boolean(target.closest("input, textarea, select, button, [role='dialog']"));
}

export function KidModeParty({ suspended }: { suspended: boolean }) {
  const [active, setActive] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(false);
  const suspendedRef = useRef(suspended);
  const runtimeRef = useRef<KidPartyRuntime | null>(null);

  useEffect(() => {
    suspendedRef.current = suspended;
  }, [suspended]);

  useEffect(() => {
    let audio: AudioContext | null = null;
    let master: GainNode | null = null;
    let compressor: DynamicsCompressorNode | null = null;
    let noiseBuffer: AudioBuffer | null = null;
    let activeVoices = 0;
    let soundEnabled = true;
    let hue = Math.random() * 360;
    let cornerClicks = 0;
    let cornerTimer: number | null = null;
    let idleTimer: number | null = null;
    let ambientTimer: number | null = null;
    let animationFrame = 0;
    let lastReaction = 0;
    let pulseAnimation: Animation | null = null;
    const particles: Particle[] = [];
    const scheduledEffects = new Set<number>();

    const clearScheduledEffects = () => {
      for (const timer of scheduledEffects) window.clearTimeout(timer);
      scheduledEffects.clear();
    };

    const resize = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { alpha: true });
      if (!canvas || !context) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const initAudio = () => {
      if (audio) {
        if (audio.state === "suspended") void audio.resume();
        return;
      }
      const webkitWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext };
      const AudioContextConstructor = window.AudioContext ?? webkitWindow.webkitAudioContext;
      if (!AudioContextConstructor) return;

      audio = new AudioContextConstructor();
      compressor = audio.createDynamicsCompressor();
      compressor.threshold.value = -18;
      compressor.knee.value = 12;
      compressor.ratio.value = 8;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;

      master = audio.createGain();
      master.gain.value = soundEnabled ? 0.22 : 0;
      master.connect(compressor);
      compressor.connect(audio.destination);

      noiseBuffer = audio.createBuffer(1, Math.floor(audio.sampleRate * 0.5), audio.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        const fade = 1 - index / data.length;
        data[index] = (Math.random() * 2 - 1) * fade;
      }
    };

    const makeVoice = (duration: number, x = window.innerWidth / 2) => {
      if (!audio || !master || !soundEnabled || activeVoices >= MAX_AUDIO_VOICES) return null;
      activeVoices += 1;
      const gain = audio.createGain();
      let output: AudioNode = gain;

      if (audio.createStereoPanner) {
        const panner = audio.createStereoPanner();
        panner.pan.value = Math.max(-0.75, Math.min(0.75, (x / window.innerWidth) * 1.5 - 0.75));
        gain.connect(panner);
        panner.connect(master);
        output = panner;
      } else {
        gain.connect(master);
      }

      window.setTimeout(() => {
        activeVoices = Math.max(0, activeVoices - 1);
        try { gain.disconnect(); } catch {}
        try { if (output !== gain) output.disconnect(); } catch {}
      }, duration * 1_000 + 100);
      return gain;
    };

    const envelope = (gain: GainNode, now: number, peak: number, attack: number, duration: number) => {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, peak), now + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    };

    const playBell = (base: number, x: number) => {
      if (!audio) return;
      const now = audio.currentTime;
      const duration = 0.58;
      const voice = makeVoice(duration, x);
      if (!voice) return;
      envelope(voice, now, 0.34, 0.008, duration);
      [1, 2.01, 3.99].forEach((ratio, index) => {
        if (!audio) return;
        const oscillator = audio.createOscillator();
        const partial = audio.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = base * ratio;
        partial.gain.value = [1, 0.28, 0.08][index];
        oscillator.connect(partial);
        partial.connect(voice);
        oscillator.start(now);
        oscillator.stop(now + duration);
      });
    };

    const playBubble = (base: number, x: number) => {
      if (!audio) return;
      const now = audio.currentTime;
      const duration = 0.24;
      const voice = makeVoice(duration, x);
      if (!voice) return;
      envelope(voice, now, 0.42, 0.008, duration);
      const oscillator = audio.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(Math.max(90, base * 0.42), now);
      oscillator.frequency.exponentialRampToValueAtTime(base * 1.35, now + 0.16);
      oscillator.connect(voice);
      oscillator.start(now);
      oscillator.stop(now + duration);
    };

    const playBoing = (base: number, x: number) => {
      if (!audio) return;
      const now = audio.currentTime;
      const duration = 0.38;
      const voice = makeVoice(duration, x);
      if (!voice) return;
      envelope(voice, now, 0.36, 0.01, duration);
      const oscillator = audio.createOscillator();
      const filter = audio.createBiquadFilter();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(base * 1.3, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(70, base * 0.48), now + 0.13);
      oscillator.frequency.exponentialRampToValueAtTime(base * 0.78, now + 0.34);
      filter.type = "lowpass";
      filter.frequency.value = 1_500;
      oscillator.connect(filter);
      filter.connect(voice);
      oscillator.start(now);
      oscillator.stop(now + duration);
    };

    const playDrum = (base: number, x: number) => {
      if (!audio) return;
      const now = audio.currentTime;
      const duration = 0.28;
      const voice = makeVoice(duration, x);
      if (!voice) return;
      envelope(voice, now, 0.46, 0.004, duration);
      const kick = audio.createOscillator();
      kick.type = "sine";
      kick.frequency.setValueAtTime(145 + base * 0.08, now);
      kick.frequency.exponentialRampToValueAtTime(48, now + 0.18);
      kick.connect(voice);
      kick.start(now);
      kick.stop(now + duration);

      if (noiseBuffer) {
        const click = audio.createBufferSource();
        const clickGain = audio.createGain();
        const highpass = audio.createBiquadFilter();
        click.buffer = noiseBuffer;
        highpass.type = "highpass";
        highpass.frequency.value = 1_800;
        clickGain.gain.setValueAtTime(0.11, now);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
        click.connect(highpass);
        highpass.connect(clickGain);
        clickGain.connect(voice);
        click.start(now);
        click.stop(now + 0.07);
      }
    };

    const playSparkle = (base: number, x: number) => {
      if (!audio) return;
      const now = audio.currentTime;
      const duration = 0.42;
      const voice = makeVoice(duration, x);
      if (!voice) return;
      envelope(voice, now, 0.28, 0.008, duration);
      [1, 1.5, 2].forEach((ratio, index) => {
        if (!audio) return;
        const oscillator = audio.createOscillator();
        const noteGain = audio.createGain();
        const startAt = now + index * 0.055;
        oscillator.type = index === 1 ? "triangle" : "sine";
        oscillator.frequency.value = base * ratio;
        noteGain.gain.setValueAtTime(0.0001, now);
        noteGain.gain.setValueAtTime(0.8, startAt);
        noteGain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.18);
        oscillator.connect(noteGain);
        noteGain.connect(voice);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.2);
      });
    };

    const playChord = (base: number, x: number) => {
      if (!audio) return;
      const now = audio.currentTime;
      const duration = 0.5;
      const voice = makeVoice(duration, x);
      if (!voice) return;
      envelope(voice, now, 0.26, 0.012, duration);
      [1, 1.25, 1.5].forEach((ratio, index) => {
        if (!audio) return;
        const oscillator = audio.createOscillator();
        const noteGain = audio.createGain();
        oscillator.type = index === 0 ? "triangle" : "sine";
        oscillator.frequency.value = base * ratio;
        noteGain.gain.value = [1, 0.7, 0.62][index];
        oscillator.connect(noteGain);
        noteGain.connect(voice);
        oscillator.start(now);
        oscillator.stop(now + duration);
      });
    };

    const playSwoosh = (base: number, x: number) => {
      if (!audio) return;
      const now = audio.currentTime;
      const duration = 0.32;
      const voice = makeVoice(duration, x);
      if (!voice) return;
      envelope(voice, now, 0.24, 0.01, duration);
      const oscillator = audio.createOscillator();
      const filter = audio.createBiquadFilter();
      oscillator.type = "sawtooth";
      oscillator.frequency.setValueAtTime(Math.max(80, base * 0.35), now);
      oscillator.frequency.exponentialRampToValueAtTime(base * 1.7, now + 0.24);
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(2_600, now + 0.24);
      filter.Q.value = 4;
      oscillator.connect(filter);
      filter.connect(voice);
      oscillator.start(now);
      oscillator.stop(now + duration);
    };

    const playSound = (key = "", x = window.innerWidth / 2) => {
      if (!audio || !master || !soundEnabled) return;
      if (audio.state === "suspended") void audio.resume();
      const scale = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25, 783.99];
      const seed = [...String(key)].reduce((sum, character) => sum + (character.codePointAt(0) ?? 0), 0);
      const base = scale[Math.abs(seed) % scale.length];

      if (key === " " || key === "Enter") playChord(base, x);
      else if (String(key).startsWith("Arrow")) playSwoosh(base, x);
      else if (key === "Backspace" || key === "Delete") playBoing(base, x);
      else {
        const sound = Math.abs(seed) % 5;
        if (sound === 0) playBell(base, x);
        else if (sound === 1) playBubble(base, x);
        else if (sound === 2) playSparkle(base, x);
        else if (sound === 3) playDrum(base, x);
        else playBoing(base, x);
      }
    };

    const randomPoint = () => {
      const margin = 70;
      return {
        x: margin + Math.random() * Math.max(1, window.innerWidth - margin * 2),
        y: margin + Math.random() * Math.max(1, window.innerHeight - margin * 2),
      };
    };

    const trimNodes = (selector: string, maximum: number) => {
      const nodes = stageRef.current?.querySelectorAll(selector) ?? [];
      for (let index = 0; index < nodes.length - maximum; index += 1) nodes[index].remove();
    };

    const symbolFor = (key: string) => {
      if (FRIENDLY_KEYS[key]) return FRIENDLY_KEYS[key];
      if (key && key.length === 1 && /\S/.test(key)) return key.toUpperCase();
      return EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
    };

    const createSymbol = (key: string, x: number, y: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      trimNodes(".kid-party-symbol", MAX_SYMBOLS - 1);
      const element = document.createElement("div");
      element.className = "kid-party-symbol";
      element.textContent = Math.random() < 0.35 ? EMOJIS[Math.floor(Math.random() * EMOJIS.length)] : symbolFor(key);
      element.style.setProperty("--kid-x", `${x}px`);
      element.style.setProperty("--kid-y", `${y}px`);
      element.style.setProperty("--kid-symbol-hue", String((hue + Math.random() * 120) % 360));
      element.style.setProperty("--kid-twist", `${Math.random() * 34 - 17}deg`);
      stage.appendChild(element);
      element.addEventListener("animationend", () => element.remove(), { once: true });
    };

    const createShape = (x: number, y: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      trimNodes(".kid-party-shape", MAX_SHAPES - 1);
      const element = document.createElement("div");
      const kind = Math.random();
      const size = 48 + Math.random() * 105;
      element.className = `kid-party-shape ${kind < 0.3 ? "kid-party-cube" : kind < 0.72 ? "kid-party-orb" : "kid-party-ring"}`;
      if (kind < 0.3) {
        element.innerHTML = '<div class="kid-party-face front"></div><div class="kid-party-face back"></div><div class="kid-party-face right"></div><div class="kid-party-face left"></div><div class="kid-party-face top"></div><div class="kid-party-face bottom"></div>';
      }
      element.style.setProperty("--kid-size", `${size}px`);
      element.style.setProperty("--kid-x", `${x}px`);
      element.style.setProperty("--kid-y", `${y}px`);
      element.style.setProperty("--kid-shape-hue", String((hue + 60 + Math.random() * 220) % 360));
      element.style.setProperty("--kid-drift-x", `${Math.random() * 300 - 150}px`);
      element.style.setProperty("--kid-drift-y", `${Math.random() * 210 - 155}px`);
      element.style.setProperty("--kid-rx", `${300 + Math.random() * 520}deg`);
      element.style.setProperty("--kid-ry", `${300 + Math.random() * 520}deg`);
      element.style.setProperty("--kid-rz", `${Math.random() * 420 - 210}deg`);
      element.style.setProperty("--kid-life", `${1.35 + Math.random() * 0.55}s`);
      stage.appendChild(element);
      element.addEventListener("animationend", () => element.remove(), { once: true });
    };

    const animateParticles = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d", { alpha: true });
      if (!canvas || !context || !activeRef.current) {
        animationFrame = 0;
        return;
      }
      animationFrame = window.requestAnimationFrame(animateParticles);
      context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      let writeIndex = 0;
      for (const particle of particles) {
        particle.life -= 1;
        if (particle.life <= 0) continue;
        particles[writeIndex] = particle;
        writeIndex += 1;
        particle.vx *= particle.drag;
        particle.vy = particle.vy * particle.drag + particle.gravity;
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.rotation += particle.spin;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.globalAlpha = Math.min(1, particle.life / 18);
        context.fillStyle = `hsl(${particle.hue} 100% 67%)`;
        if (particle.shape === 0) context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
        else if (particle.shape === 1) {
          context.beginPath();
          context.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.beginPath();
          context.moveTo(0, -particle.size);
          context.lineTo(particle.size * 0.75, particle.size * 0.8);
          context.lineTo(-particle.size * 0.75, particle.size * 0.8);
          context.closePath();
          context.fill();
        }
        context.restore();
      }
      particles.length = writeIndex;
      context.globalAlpha = 1;
      if (!particles.length) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = 0;
        context.clearRect(0, 0, window.innerWidth, window.innerHeight);
      }
    };

    const burst = (x: number, y: number, requested = 22) => {
      const room = MAX_PARTICLES - particles.length;
      if (room <= 0) return;
      const count = Math.min(requested, room);
      const palette = Array.from({ length: 6 }, (_, index) => (hue + index * 54) % 360);
      for (let index = 0; index < count; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 2.2 + Math.random() * 8.5;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          gravity: 0.12 + Math.random() * 0.1,
          drag: 0.982,
          life: 42 + Math.random() * 34,
          size: 3 + Math.random() * 9,
          hue: palette[Math.floor(Math.random() * palette.length)],
          shape: Math.floor(Math.random() * 3),
          spin: Math.random() * 0.2 - 0.1,
          rotation: Math.random() * Math.PI,
        });
      }
      if (!animationFrame) animateParticles();
    };

    const pulseWorld = () => {
      pulseAnimation?.cancel();
      pulseAnimation = rootRef.current?.animate(
        [
          { transform: "scale(1)", filter: "brightness(1)" },
          { transform: "scale(1.012)", filter: "brightness(1.14) saturate(1.12)", offset: 0.45 },
          { transform: "scale(1)", filter: "brightness(1)" },
        ],
        { duration: 260, easing: "ease-out" },
      ) ?? null;
    };

    const react = (key = "★", x?: number, y?: number, force = false) => {
      if (!activeRef.current || !rootRef.current || !stageRef.current) return false;
      const now = performance.now();
      if (!force && now - lastReaction < MIN_REACTION_MS) return false;
      lastReaction = now;
      const point = x === undefined || y === undefined ? randomPoint() : { x, y };
      hue = (hue + 31 + Math.random() * 67) % 360;
      rootRef.current.style.setProperty("--kid-hue", hue.toFixed(1));
      createSymbol(key, point.x, point.y);
      createShape(point.x, point.y);
      burst(point.x, point.y, 18 + Math.floor(Math.random() * 11));
      playSound(key, point.x);
      pulseWorld();
      return true;
    };

    const cleanupVisuals = () => {
      clearScheduledEffects();
      particles.length = 0;
      pulseAnimation?.cancel();
      pulseAnimation = null;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      stageRef.current?.replaceChildren();
      const canvas = canvasRef.current;
      canvas?.getContext("2d", { alpha: true })?.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };

    const endParty = () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      idleTimer = null;
      activeRef.current = false;
      cornerClicks = 0;
      cleanupVisuals();
      setActive(false);
    };

    const resetIdleTimer = () => {
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(endParty, KID_MODE_IDLE_MS);
    };

    const startParty = (initialKey: string) => {
      initAudio();
      activeRef.current = true;
      setActive(true);
      resetIdleTimer();

      const launch = () => {
        if (!rootRef.current || !stageRef.current || !canvasRef.current) {
          const retry = window.setTimeout(launch, 0);
          scheduledEffects.add(retry);
          return;
        }
        resize();
        react(initialKey, undefined, undefined, true);
        for (let index = 0; index < 3; index += 1) {
          const timer = window.setTimeout(() => {
            scheduledEffects.delete(timer);
            const point = randomPoint();
            react(EMOJIS[index], point.x, point.y, true);
          }, 120 + index * 130);
          scheduledEffects.add(timer);
        }
      };
      window.requestAnimationFrame(launch);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) {
        const activatingControl = isInteractiveTarget(event.target) && (event.key === "Enter" || event.key === " ");
        if (suspendedRef.current || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || activatingControl) return;
        event.preventDefault();
        event.stopPropagation();
        startParty(event.key);
        return;
      }
      if (isInteractiveTarget(event.target) && (event.key === "Enter" || event.key === " ")) return;
      event.preventDefault();
      event.stopPropagation();
      resetIdleTimer();
      react(event.key);
    };

    runtimeRef.current = {
      end: endParty,
      pointerDown: (x, y) => {
        if (!activeRef.current) return;
        resetIdleTimer();
        if (x < 70 && y < 70) {
          cornerClicks += 1;
          if (cornerTimer !== null) window.clearTimeout(cornerTimer);
          cornerTimer = window.setTimeout(() => { cornerClicks = 0; }, 1_800);
          if (cornerClicks >= 5) {
            endParty();
            return;
          }
        }
        react(EMOJIS[Math.floor(Math.random() * EMOJIS.length)], x, y, true);
      },
      toggleSound: () => {
        initAudio();
        soundEnabled = !soundEnabled;
        setSoundOn(soundEnabled);
        if (audio && master) {
          const now = audio.currentTime;
          master.gain.cancelScheduledValues(now);
          master.gain.setTargetAtTime(soundEnabled ? 0.22 : 0, now, 0.018);
        }
        if (soundEnabled) playChord(392, window.innerWidth - 30);
      },
    };

    ambientTimer = window.setInterval(() => {
      if (!activeRef.current || document.hidden || particles.length > MAX_PARTICLES * 0.65) return;
      const point = randomPoint();
      createShape(point.x, point.y);
      burst(point.x, point.y, 5);
    }, 2_600);

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("resize", resize, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("resize", resize);
      if (ambientTimer !== null) window.clearInterval(ambientTimer);
      if (idleTimer !== null) window.clearTimeout(idleTimer);
      if (cornerTimer !== null) window.clearTimeout(cornerTimer);
      activeRef.current = false;
      cleanupVisuals();
      runtimeRef.current = null;
      if (audio) void audio.close();
    };
  }, []);

  if (!active) return null;

  return createPortal(
    <div
      className="kid-party-root"
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Party"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => runtimeRef.current?.pointerDown(event.clientX, event.clientY)}
    >
      <canvas className="kid-party-sparkles" ref={canvasRef} aria-hidden="true" />
      <div className="kid-party-stage" ref={stageRef} aria-hidden="true" />
      <div className="kid-party-title" aria-hidden="true"><span>Keyboard</span><strong>Party!</strong></div>
      <button
        className="kid-party-sound-toggle"
        type="button"
        aria-label={soundOn ? "Turn Kid mode sounds off" : "Turn Kid mode sounds on"}
        aria-pressed={soundOn}
        title={soundOn ? "Sound on" : "Sound off"}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          runtimeRef.current?.toggleSound();
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        {soundOn ? "🔊" : "🔇"}
      </button>
      <div className="kid-party-help">Parent: tap the upper-left corner 5× to return · weather returns after 10 quiet seconds</div>
      <button className="kid-party-sr-exit" type="button" onClick={() => runtimeRef.current?.end()}>Return to weather</button>
    </div>,
    document.body,
  );
}
