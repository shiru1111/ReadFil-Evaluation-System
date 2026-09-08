import React, { useEffect, useRef } from 'react';

/**
 * SoundWaveBackground
 * A 60 FPS HTML5 Canvas background that renders audio-reactive flowing waves,
 * glowing floating particles, constellation linkages, and ambient voice auras.
 *
 * Preserves the exact light-theme ReadFil brand colors (#0096FF, #8ACEFF, soft cyans).
 *
 * @param {React.RefObject} analyserRef - Ref to the Web Audio AnalyserNode (optional)
 * @param {boolean} isRecording - Flag indicating if microphone recording is active
 */
export default function SoundWaveBackground({ analyserRef, isRecording = false }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // Audio smoothing variables
    let smoothedVolume = 0;
    let smoothedBass = 0;
    let time = 0;

    // Buffer for Web Audio analysis
    const bufferLength = 256;
    const timeData = new Uint8Array(bufferLength);
    const freqData = new Uint8Array(bufferLength);

    // Resize handler
    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initParticles();
    };
    window.addEventListener('resize', handleResize);

    // Particles setup - calibrated for elegance & calm readability
    const PARTICLE_COUNT = Math.min(Math.floor(window.innerWidth / 24), 55);
    let particles = [];

    const initParticles = () => {
      particles = [];
      const colors = ['#0096FF', '#38BDF8', '#8ACEFF', '#0284C7'];

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const colorIdx = i % colors.length;
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.35,
          vy: (Math.random() - 0.5) * 0.35,
          baseRadius: Math.random() * 1.8 + 1.6, // 1.6px to 3.4px - refined & clean
          radius: 2,
          baseAlpha: Math.random() * 0.25 + 0.30, // 0.30 to 0.55 - easy on the eye
          alpha: 0.35,
          color: colors[colorIdx],
          waveOffset: Math.random() * Math.PI * 2,
        });
      }
    };
    initParticles();

    // Render loop
    const render = () => {
      time += 0.014;

      // 1. Audio Analysis
      let currentVolume = 0;
      let currentBass = 0;

      if (analyserRef?.current) {
        try {
          analyserRef.current.getByteTimeDomainData(timeData);
          analyserRef.current.getByteFrequencyData(freqData);

          // Calculate RMS Volume
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            const val = (timeData[i] - 128) / 128.0;
            sum += val * val;
          }
          const rms = Math.sqrt(sum / bufferLength);
          currentVolume = Math.min(Math.max(rms * 4.0, 0), 1.6);

          // Calculate Bass (first 16 bins)
          let bassSum = 0;
          for (let i = 0; i < 16; i++) {
            bassSum += freqData[i];
          }
          currentBass = bassSum / (16 * 255);
        } catch (e) {
          // Analyser may be closing/unmounted
        }
      }

      // Smooth volume transitions
      smoothedVolume += (currentVolume - smoothedVolume) * 0.12;
      smoothedBass += (currentBass - smoothedBass) * 0.12;

      // Clear and paint calm ReadFil light theme backdrop
      const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
      bgGrad.addColorStop(0, '#FFFFFF');
      bgGrad.addColorStop(0.65, '#F8FAFC');
      bgGrad.addColorStop(1, '#F0F6FB');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Ambient / Voice Pulse Aura in Center (soft & calming)
      const centerX = width / 2;
      const centerY = height * 0.50;
      const auraRadius = Math.min(width, height) * (0.35 + smoothedVolume * 0.2);

      const auraGrad = ctx.createRadialGradient(
        centerX,
        centerY,
        15,
        centerX,
        centerY,
        auraRadius
      );
      const auraIntensity = isRecording
        ? 0.09 + smoothedVolume * 0.14
        : 0.035 + Math.sin(time * 0.7) * 0.015;

      auraGrad.addColorStop(0, `rgba(0, 150, 255, ${auraIntensity})`);
      auraGrad.addColorStop(0.6, `rgba(138, 206, 255, ${auraIntensity * 0.4})`);
      auraGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(centerX, centerY, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // 3. Audio-Reactive Waving Ribbons - Lowered comfortably towards bottom of screen
      const waveConfigs = [
        {
          baseY: height * 0.85, // Comfortably below reading card
          freq: 0.0022,
          speed: 0.018,
          baseAmp: 18,
          volAmp: 48,
          strokeColor: `rgba(0, 150, 255, ${0.28 + smoothedVolume * 0.30})`,
          strokeWidth: 1.5,
          colorStop1: `rgba(0, 150, 255, ${0.11 + smoothedVolume * 0.12})`,
          colorStop2: `rgba(138, 206, 255, ${0.02 + smoothedVolume * 0.04})`,
          phase: 0,
        },
        {
          baseY: height * 0.89,
          freq: 0.0028,
          speed: 0.014,
          baseAmp: 15,
          volAmp: 40,
          strokeColor: `rgba(14, 165, 233, ${0.24 + smoothedVolume * 0.28})`,
          strokeWidth: 1.3,
          colorStop1: `rgba(14, 165, 233, ${0.09 + smoothedVolume * 0.10})`,
          colorStop2: `rgba(186, 230, 253, ${0.02 + smoothedVolume * 0.03})`,
          phase: 2.1,
        },
        {
          baseY: height * 0.93,
          freq: 0.0018,
          speed: 0.022,
          baseAmp: 20,
          volAmp: 55,
          strokeColor: `rgba(56, 189, 248, ${0.20 + smoothedVolume * 0.25})`,
          strokeWidth: 1.2,
          colorStop1: `rgba(2, 132, 199, ${0.07 + smoothedVolume * 0.08})`,
          colorStop2: `rgba(224, 242, 254, ${0.01 + smoothedVolume * 0.03})`,
          phase: 4.2,
        },
      ];

      waveConfigs.forEach((cfg) => {
        const amp = cfg.baseAmp + smoothedVolume * cfg.volAmp + smoothedBass * 20;
        const currentPhase = time * cfg.speed * 60 + cfg.phase;
        const points = [];

        for (let x = 0; x <= width; x += 12) {
          let waveY =
            Math.sin(x * cfg.freq + currentPhase) * amp +
            Math.sin(x * cfg.freq * 2.0 - currentPhase * 0.6) * (amp * 0.32);

          // Audio waveform ripple when recording
          if (analyserRef?.current && smoothedVolume > 0.02) {
            const sampleIdx = Math.floor((x / width) * bufferLength) % bufferLength;
            const audioDist = ((timeData[sampleIdx] - 128) / 128.0) * (24 * smoothedVolume);
            waveY += audioDist;
          }

          const y = cfg.baseY + waveY;
          points.push({ x, y });
        }

        // Draw soft translucent ribbon fill
        ctx.beginPath();
        ctx.moveTo(0, height);
        points.forEach((pt, idx) => {
          if (idx === 0) ctx.lineTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.lineTo(width, height);
        ctx.closePath();

        const grad = ctx.createLinearGradient(0, cfg.baseY - amp, 0, height);
        grad.addColorStop(0, cfg.colorStop1);
        grad.addColorStop(1, cfg.colorStop2);
        ctx.fillStyle = grad;
        ctx.fill();

        // Draw delicate, silky crest line
        ctx.beginPath();
        points.forEach((pt, idx) => {
          if (idx === 0) ctx.moveTo(pt.x, pt.y);
          else ctx.lineTo(pt.x, pt.y);
        });
        ctx.strokeStyle = cfg.strokeColor;
        ctx.lineWidth = cfg.strokeWidth;
        ctx.stroke();
      });

      // 4. Subtle Floating Particles & Constellations (calm & non-intrusive)
      const maxDistance = 95;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            const lineAlpha = (1 - dist / maxDistance) * (0.16 + smoothedVolume * 0.22);
            ctx.strokeStyle = `rgba(0, 150, 255, ${lineAlpha})`;
            ctx.lineWidth = 0.85;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Update & Draw Particles
      particles.forEach((p) => {
        const speedMultiplier = 1 + smoothedVolume * 1.4;
        p.x += p.vx * speedMultiplier;
        p.y += p.vy * speedMultiplier + Math.sin(time + p.waveOffset) * 0.18;

        // Wrap borders
        if (p.x < -15) p.x = width + 15;
        if (p.x > width + 15) p.x = -15;
        if (p.y < -15) p.y = height + 15;
        if (p.y > height + 15) p.y = -15;

        p.radius = p.baseRadius * (1 + smoothedVolume * 1.25);
        p.alpha = Math.min(
          p.baseAlpha + smoothedVolume * 0.28 + Math.sin(time * 2 + p.waveOffset) * 0.06,
          0.75
        );

        // Soft subtle aura
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 2.0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(138, 206, 255, 0.25)';
        ctx.globalAlpha = p.alpha * 0.4;
        ctx.fill();

        // Core particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.alpha;
        ctx.fill();
      });

      ctx.globalAlpha = 1.0;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
    };
  }, [analyserRef, isRecording]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none -z-10 w-full h-full"
      style={{ display: 'block' }}
      aria-hidden="true"
    />
  );
}
