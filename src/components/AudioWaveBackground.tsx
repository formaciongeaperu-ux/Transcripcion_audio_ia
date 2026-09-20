import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
}

export const AudioWaveBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = container.clientWidth);
    let height = (canvas.height = container.clientHeight);

    // Particle nodes for subtle speech analytics neural network
    const particleCount = Math.min(35, Math.floor((width * height) / 30000));
    const particles: Particle[] = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: Math.random() * 2 + 1,
        alpha: Math.random() * 0.35 + 0.15
      });
    }

    // ResizeObserver to handle container scaling properly
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === container) {
          width = canvas.width = container.clientWidth;
          height = canvas.height = container.clientHeight;
        }
      }
    });
    resizeObserver.observe(container);

    let step = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      step += 0.015;

      // 1. Draw flowing acoustic sine waves simulating speech frequency
      const waveConfigs = [
        {
          amplitude: 38,
          frequency: 0.0035,
          speed: 0.02,
          yOffset: height * 0.35,
          color: 'rgba(0, 114, 206, 0.18)', // Azure
          lineWidth: 2
        },
        {
          amplitude: 48,
          frequency: 0.0028,
          speed: -0.015,
          yOffset: height * 0.45,
          color: 'rgba(7, 34, 66, 0.15)', // Navy
          lineWidth: 2.5
        },
        {
          amplitude: 32,
          frequency: 0.0045,
          speed: 0.025,
          yOffset: height * 0.58,
          color: 'rgba(218, 41, 28, 0.10)', // Claro Red
          lineWidth: 1.5
        },
        {
          amplitude: 24,
          frequency: 0.005,
          speed: -0.02,
          yOffset: height * 0.68,
          color: 'rgba(0, 114, 206, 0.12)', // Light azure
          lineWidth: 1.5
        }
      ];

      waveConfigs.forEach((wave) => {
        ctx.beginPath();
        ctx.strokeStyle = wave.color;
        ctx.lineWidth = wave.lineWidth;

        for (let x = 0; x <= width; x += 6) {
          // Complex harmonic wave: primary sine + secondary modulation
          const modulation = Math.sin(x * 0.001 + step * 0.5) * 15;
          const y =
            wave.yOffset +
            Math.sin(x * wave.frequency + step + wave.speed) * wave.amplitude +
            modulation;

          if (x === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      });

      // 2. Render subtle neural nodes and connecting hairline lines
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 114, 206, ${p.alpha})`;
        ctx.fill();

        // Connect nearby particles with subtle faint lines
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(7, 34, 66, ${0.12 * (1 - dist / 130)})`;
            ctx.lineWidth = 0.75;
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* 1. Subtle Architectural Blueprint Dot Grid */}
      <div
        className="absolute inset-0 opacity-[0.45]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(7, 34, 66, 0.12) 1.25px, transparent 1.25px)',
          backgroundSize: '28px 28px'
        }}
      />

      {/* 2. Soft Ambient Fluid Glowing Orbs (Breathing in Navy & Tech Azure) */}
      <div className="absolute -top-[15%] -left-[10%] h-[520px] w-[520px] rounded-full bg-gradient-to-br from-[#0072CE]/15 to-[#072242]/10 blur-[90px] animate-pulse duration-[8000ms]" />
      <div className="absolute top-[35%] -right-[12%] h-[600px] w-[600px] rounded-full bg-gradient-to-bl from-[#DA291C]/8 via-[#0072CE]/12 to-transparent blur-[110px] animate-pulse duration-[10000ms]" />
      <div className="absolute -bottom-[20%] left-[25%] h-[500px] w-[500px] rounded-full bg-gradient-to-t from-[#072242]/12 to-transparent blur-[100px]" />

      {/* 3. Real-Time Canvas Acoustic Waves */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-90"
      />

      {/* 4. Elegant Vignette Mask to ensure pristine foreground legibility */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#F8F9FA]/40 via-transparent to-[#F8F9FA]/60" />
    </div>
  );
};
