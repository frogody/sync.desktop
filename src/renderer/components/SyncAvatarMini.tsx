/**
 * SyncAvatarMini Component
 * Ported from app.isyncso.com to match the web app avatar exactly
 *
 * Features:
 * - SVG hexagonal ring segments representing different SYNC agents
 * - Canvas-based particle animation inside
 * - Anime.js powered animations for segments and glow
 * - Synchronized with SyncStateContext for mood/level changes
 */

import React, { useRef, useEffect, useMemo } from 'react';
import anime from 'animejs';
import { cn, prefersReducedMotion } from '../lib/utils';
import { useSyncState } from '../context/SyncStateContext';

// Hexagon geometry helpers (pointy-top orientation)
const HEX_ANGLES = [270, 330, 30, 90, 150, 210].map(d => (d * Math.PI) / 180);

function hexVertex(cx: number, cy: number, r: number, i: number) {
  const a = HEX_ANGLES[i % 6];
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function hexPointsStr(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const v = hexVertex(cx, cy, r, i);
    return `${v.x},${v.y}`;
  }).join(' ');
}

// Map a 0-1 fraction to a point on the hexagon perimeter
function hexPerimeterPoint(cx: number, cy: number, r: number, frac: number) {
  const f = ((frac % 1) + 1) % 1;
  const totalEdges = 6;
  const edgeProgress = f * totalEdges;
  const edgeIndex = Math.floor(edgeProgress);
  const t = edgeProgress - edgeIndex;
  const v0 = hexVertex(cx, cy, r, edgeIndex);
  const v1 = hexVertex(cx, cy, r, (edgeIndex + 1) % 6);
  return {
    x: v0.x + (v1.x - v0.x) * t,
    y: v0.y + (v1.y - v0.y) * t,
  };
}

// Build SVG path along hex perimeter from frac0 to frac1
function hexEdgePath(cx: number, cy: number, r: number, frac0: number, frac1: number) {
  const f0 = ((frac0 % 1) + 1) % 1;
  const f1 = ((frac1 % 1) + 1) % 1;
  const totalEdges = 6;

  const points: { x: number; y: number }[] = [];
  points.push(hexPerimeterPoint(cx, cy, r, f0));

  const startEdge = Math.floor(f0 * totalEdges);
  const span = f1 > f0 ? f1 - f0 : 1 - f0 + f1;
  const endFrac = f0 + span;
  let nextVertexFrac = (startEdge + 1) / totalEdges;
  if (nextVertexFrac <= f0) nextVertexFrac += 1;

  while (nextVertexFrac < endFrac - 0.0001) {
    points.push(hexPerimeterPoint(cx, cy, r, nextVertexFrac));
    nextVertexFrac += 1 / totalEdges;
  }

  points.push(hexPerimeterPoint(cx, cy, r, f1));
  return 'M ' + points.map(p => `${p.x} ${p.y}`).join(' L ');
}

// CSS clip-path for pointy-top hexagon
const HEX_CLIP = 'polygon(50% 0%, 93.3% 25%, 93.3% 75%, 50% 100%, 6.7% 75%, 6.7% 25%)';

// Agent color segments - matches the web app exactly
const AGENT_SEGMENTS = [
  { id: 'orchestrator', color: '#ec4899', from: 0.0, to: 0.1 }, // pink - multi-agent workflows
  { id: 'learn', color: '#06b6d4', from: 0.1, to: 0.2 }, // cyan
  { id: 'growth', color: '#6366f1', from: 0.2, to: 0.3 }, // indigo
  { id: 'products', color: '#10b981', from: 0.3, to: 0.4 }, // emerald
  { id: 'sentinel', color: '#86EFAC', from: 0.4, to: 0.5 }, // sage green
  { id: 'finance', color: '#f59e0b', from: 0.5, to: 0.6 }, // amber
  { id: 'create', color: '#f43f5e', from: 0.6, to: 0.7 }, // rose
  { id: 'tasks', color: '#f97316', from: 0.7, to: 0.8 }, // orange
  { id: 'research', color: '#3b82f6', from: 0.8, to: 0.9 }, // blue
  { id: 'inbox', color: '#14b8a6', from: 0.9, to: 1.0 }, // teal - completes the ring
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  s: number;
  hue: number;
}

interface StateRef {
  particles: Particle[];
  time: number;
  currentLevel: number;
}

interface SyncAvatarMiniProps {
  size?: number;
  className?: string;
}

export default function SyncAvatarMini({ size = 48, className = '' }: SyncAvatarMiniProps) {
  // Get synchronized state from context
  const syncState = useSyncState();
  const { mood, level, activeAgent, isProcessing, showSuccess } = syncState;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const segmentsRef = useRef<SVGGElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<StateRef>({
    particles: [],
    time: 0,
    currentLevel: 0.18,
  });

  // Derive animation state from sync state
  const animationState = useMemo(() => {
    if (showSuccess) return 'success';
    if (mood === 'speaking') return 'speaking';
    if (mood === 'thinking' || isProcessing) return 'thinking';
    return 'idle';
  }, [mood, isProcessing, showSuccess]);

  // Match SyncAgent proportions exactly
  const r = size / 2;
  const segmentR = r - 2;
  const innerR = r * 0.58;


  // Animate segments based on mood
  useEffect(() => {
    if (prefersReducedMotion() || !segmentsRef.current) return;

    const paths = segmentsRef.current.querySelectorAll('path');
    anime.remove(paths);

    // Different animation parameters based on state
    const configs: Record<string, { strokeWidth: number[]; opacity: number[]; duration: number }> = {
      speaking: {
        strokeWidth: [3, 5, 3],
        opacity: [0.9, 1, 0.9],
        duration: 400,
      },
      thinking: {
        strokeWidth: [3, 4.5, 3],
        opacity: [0.8, 1, 0.8],
        duration: 800,
      },
      success: {
        strokeWidth: [3, 6, 3],
        opacity: [1, 1, 1],
        duration: 300,
      },
      idle: {
        strokeWidth: [3, 3.5, 3],
        opacity: [0.7, 0.85, 0.7],
        duration: 2000,
      },
    };

    const config = configs[animationState] || configs.idle;

    anime({
      targets: paths,
      strokeWidth: config.strokeWidth,
      opacity: config.opacity,
      duration: config.duration,
      loop: true,
      easing: 'easeInOutSine',
      delay: anime.stagger(40),
    });

    return () => {
      anime.remove(paths);
    };
  }, [animationState]);

  // Highlight active agent segment
  useEffect(() => {
    if (!segmentsRef.current || !activeAgent) return;

    const activePath = segmentsRef.current.querySelector(
      `path[data-agent="${activeAgent}"]`
    );

    if (activePath) {
      anime.remove(activePath);
      anime({
        targets: activePath,
        strokeWidth: [4, 6, 4],
        opacity: [1, 1, 1],
        duration: 500,
        loop: true,
        easing: 'easeInOutSine',
      });
    }

    return () => {
      if (activePath) anime.remove(activePath);
    };
  }, [activeAgent]);

  // Outer glow animation based on state
  useEffect(() => {
    if (prefersReducedMotion() || !glowRef.current) return;

    const glowConfigs: Record<string, { scale: number[]; opacity: number[]; duration: number }> = {
      speaking: { scale: [1, 1.15, 1], opacity: [0.6, 0.9, 0.6], duration: 400 },
      thinking: { scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4], duration: 1000 },
      success: { scale: [1, 1.3, 1], opacity: [0.8, 1, 0.8], duration: 500 },
      idle: { scale: [1, 1.03, 1], opacity: [0.2, 0.35, 0.2], duration: 3000 },
    };

    const config = glowConfigs[animationState] || glowConfigs.idle;

    anime.remove(glowRef.current);
    anime({
      targets: glowRef.current,
      scale: config.scale,
      opacity: config.opacity,
      duration: config.duration,
      loop: true,
      easing: 'easeInOutSine',
    });

    return () => {
      if (glowRef.current) anime.remove(glowRef.current);
    };
  }, [animationState]);

  // Initialize particles
  useEffect(() => {
    const st = stateRef.current;
    const N = 18; // More particles for richer visualization
    const rand = (a: number) => {
      const x = Math.sin(a * 9999) * 10000;
      return x - Math.floor(x);
    };

    st.particles = Array.from({ length: N }).map((_, i) => {
      const pr = innerR * 0.8 * Math.sqrt(rand(i + 1));
      const ang = rand(i + 7) * Math.PI * 2;
      return {
        x: r + pr * Math.cos(ang),
        y: r + pr * Math.sin(ang),
        vx: (rand(i + 11) - 0.5) * 0.12,
        vy: (rand(i + 17) - 0.5) * 0.12,
        s: 0.5 + rand(i + 23) * 0.7,
        hue: rand(i + 31) * 40 + 160, // Teal-ish hue variation
      };
    });
  }, [size, innerR, r]);

  // Canvas animation for inner visualization - synchronized with mood/level
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const st = stateRef.current;
    let running = true;

    const render = () => {
      if (!running) return;

      st.time += 0.016;

      // Smoothly interpolate to target level
      const targetLevel = level || 0.18;
      st.currentLevel += (targetLevel - st.currentLevel) * 0.05;

      const cx = size / 2;
      const cy = size / 2;
      const intensity = st.currentLevel;

      // Handle DPR
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (canvas.width !== size * dpr || canvas.height !== size * dpr) {
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx.clearRect(0, 0, size, size);

      // Inner dark background - hexagonal
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const v = hexVertex(cx, cy, innerR, i);
        if (i === 0) ctx.moveTo(v.x, v.y);
        else ctx.lineTo(v.x, v.y);
      }
      ctx.closePath();
      ctx.fill();

      // Clip to inner hexagon
      ctx.save();
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const v = hexVertex(cx, cy, innerR, i);
        if (i === 0) ctx.moveTo(v.x, v.y);
        else ctx.lineTo(v.x, v.y);
      }
      ctx.closePath();
      ctx.clip();

      // Teal gradient - intensity based on level
      const g = ctx.createRadialGradient(cx - 2, cy - 2, 1, cx, cy, innerR);
      const baseAlpha = 0.3 + intensity * 0.4;
      g.addColorStop(0, `rgba(42,157,143,${baseAlpha})`);
      g.addColorStop(0.5, `rgba(6,182,212,${baseAlpha * 0.6})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);

      // Update and draw particles - speed based on level
      const speedBoost = 0.5 + intensity * 1.5;
      ctx.globalCompositeOperation = 'screen';

      for (let i = 0; i < st.particles.length; i++) {
        const a = st.particles[i];

        // Orbital motion - faster when active
        const dx = a.x - cx;
        const dy = a.y - cy;
        const ang = Math.atan2(dy, dx) + 0.003 * speedBoost;
        const pr = Math.sqrt(dx * dx + dy * dy);
        a.vx += (cx + pr * Math.cos(ang) - a.x) * 0.002 * speedBoost;
        a.vy += (cy + pr * Math.sin(ang) - a.y) * 0.002 * speedBoost;

        a.x += a.vx * speedBoost;
        a.y += a.vy * speedBoost;

        // Keep inside hexagonal boundary (approximate with inscribed circle)
        const rr = Math.sqrt((a.x - cx) ** 2 + (a.y - cy) ** 2);
        const maxR = innerR * 0.75; // inscribed circle of hexagon
        if (rr > maxR) {
          const k = maxR / rr;
          a.x = cx + (a.x - cx) * k;
          a.y = cy + (a.y - cy) * k;
          a.vx *= -0.3;
          a.vy *= -0.3;
        }

        // Draw links - more visible when active
        const linkOpacityBase = 0.15 + intensity * 0.3;
        for (let j = i + 1; j < st.particles.length; j++) {
          const b = st.particles[j];
          const dist = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
          if (dist < 12) {
            const o = (1 - dist / 12) * linkOpacityBase;
            ctx.strokeStyle = `rgba(255,255,255,${o})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // Draw dots - brighter when active
      ctx.globalCompositeOperation = 'lighter';
      const dotOpacity = 0.2 + intensity * 0.4;
      for (const p of st.particles) {
        ctx.fillStyle = `rgba(255,255,255,${dotOpacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * (0.8 + intensity * 0.4), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';

      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);

    return () => {
      running = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [size, level, innerR]);

  // Get active agent color for glow
  const activeAgentColor = activeAgent
    ? AGENT_SEGMENTS.find((s) => s.id === activeAgent)?.color || '#2A9D8F'
    : '#2A9D8F';

  return (
    <div
      className={cn('relative', className)}
      style={{ width: size, height: size }}
    >
      {/* Outer glow halo — hexagonal */}
      <div
        ref={glowRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          clipPath: HEX_CLIP,
          background: `radial-gradient(circle, ${activeAgentColor}40 0%, transparent 70%)`,
          transform: 'scale(1.2)',
          opacity: 0.3,
        }}
      />

      {/* SVG for hexagonal ring segments */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        aria-hidden="true"
      >
        <defs>
          <filter id="miniGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation={1.5} result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base hexagon ring (visible when no/few segments) */}
        <polygon
          points={hexPointsStr(r, r, segmentR)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={3}
          strokeLinejoin="round"
        />

        {/* Colored segments — drawn along hexagon edges */}
        <g ref={segmentsRef} filter="url(#miniGlow)">
          {AGENT_SEGMENTS.map((segment) => (
            <path
              key={segment.id}
              data-agent={segment.id}
              d={hexEdgePath(r, r, segmentR, segment.from, segment.to)}
              fill="none"
              stroke={segment.color}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={activeAgent === segment.id ? 1 : 0.75}
            />
          ))}
        </g>

        {/* Inner dark hexagon background */}
        <polygon points={hexPointsStr(r, r, innerR)} fill="rgba(0,0,0,0.6)" />
      </svg>

      {/* Canvas for inner particle visualization */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none"
        style={{ width: size, height: size }}
        aria-hidden="true"
      />

      {/* Success flash overlay — hexagonal */}
      {showSuccess && (
        <div
          className="absolute inset-0 bg-green-500/30 animate-ping"
          style={{ clipPath: HEX_CLIP, animationDuration: '0.5s' }}
        />
      )}
    </div>
  );
}
