'use client';

/**
 * Full-page 3D background for the landing site: a slowly rotating Earth
 * (procedurally textured on a canvas — no network assets, so it also renders
 * inside the sandboxed preview) ringed by floating candlesticks and market
 * particles. Mounted BEHIND the page content (fixed, z-0, pointer-events-none)
 * and dimmed by a vignette so text stays readable.
 *
 * Reduced motion: the canvas is replaced by a static CSS planet — no animation.
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { Sparkles } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';

// ───────────────────────────── Procedural Earth texture ─────────────────────────────

function makeEarthTexture(): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // ocean — deep emerald-teal gradient
  const ocean = ctx.createLinearGradient(0, 0, 0, h);
  ocean.addColorStop(0, '#07332a');
  ocean.addColorStop(0.5, '#04120c');
  ocean.addColorStop(1, '#031712');
  ctx.fillStyle = ocean;
  ctx.fillRect(0, 0, w, h);

  // continents — deterministic random-walk blobs (equirectangular, wraps in x)
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let c = 0; c < 9; c++) {
    let x = rand() * w;
    let y = h * 0.12 + rand() * h * 0.76;
    const steps = 60 + Math.floor(rand() * 90);
    const hue = 158 + Math.floor(rand() * 14);
    for (let s = 0; s < steps; s++) {
      x = (((x + (rand() - 0.5) * 46) % w) + w) % w;
      y += (rand() - 0.5) * 30;
      const r = 8 + rand() * 34;
      ctx.fillStyle = `hsla(${hue}, ${70 + rand() * 20}%, ${38 + rand() * 22}%, ${0.25 + rand() * 0.5})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // polar ice caps
  ctx.fillStyle = 'rgba(230, 255, 244, 0.14)';
  ctx.fillRect(0, 0, w, h * 0.045);
  ctx.fillRect(0, h * 0.955, w, h * 0.045);

  // faint graticule
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.10)';
  ctx.lineWidth = 1;
  for (let lon = 0; lon < 360; lon += 30) {
    const gx = (lon / 360) * w;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const gy = ((90 - lat) / 180) * h;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ───────────────────────────── Earth ─────────────────────────────

function Earth({ reducedMotion }: { reducedMotion: boolean }) {
  const tex = useMemo(() => makeEarthTexture(), []);
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (reducedMotion) return;
    const t = state.clock.elapsedTime;
    if (meshRef.current) meshRef.current.rotation.y = t * 0.045;
    if (glowRef.current) glowRef.current.rotation.y = -t * 0.02;
  });

  return (
    <group position={[0, -0.3, 0]}>
      {/* planet body */}
      <mesh ref={meshRef}>
        <sphereGeometry args={[2.6, 72, 72]} />
        <meshStandardMaterial
          map={tex}
          emissive="#10b981"
          emissiveMap={tex}
          emissiveIntensity={0.14}
          roughness={0.65}
          metalness={0.25}
        />
      </mesh>
      {/* wireframe shell */}
      <mesh>
        <icosahedronGeometry args={[2.66, 1]} />
        <meshBasicMaterial color="#34d399" wireframe transparent opacity={0.08} />
      </mesh>
      {/* atmosphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[2.95, 48, 48]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.06} side={THREE.BackSide} />
      </mesh>
      {/* inner glow core */}
      <mesh>
        <sphereGeometry args={[2.58, 32, 32]} />
        <meshBasicMaterial color="#34d399" transparent opacity={0.05} side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

// ───────────────────────────── Background candlesticks ─────────────────────────────

interface CandleData {
  position: [number, number, number];
  rotation: [number, number, number];
  bodyH: number;
  wickTop: number;
  wickBottom: number;
  up: boolean;
  speed: number;
  phase: number;
  ring: number;
}

function CandlestickField({ reducedMotion }: { reducedMotion: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const candles = useMemo<CandleData[]>(() => {
    const list: CandleData[] = [];
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let ring = 0; ring < 3; ring++) {
      const radius = 3.5 + ring * 0.75;
      const count = 12 + ring * 5;
      const tiltX = (rand() - 0.5) * 0.9;
      const tiltZ = (rand() - 0.5) * 0.9;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rand() * 0.3;
        list.push({
          position: [Math.cos(angle) * radius, (rand() - 0.5) * 1.4, Math.sin(angle) * radius],
          rotation: [tiltX, angle, tiltZ],
          bodyH: 0.14 + rand() * 0.26,
          wickTop: 0.1 + rand() * 0.18,
          wickBottom: 0.1 + rand() * 0.18,
          up: rand() > 0.48,
          speed: 0.12 + rand() * 0.3,
          phase: rand() * Math.PI * 2,
          ring,
        });
      }
    }
    return list;
  }, []);

  useFrame((state) => {
    if (reducedMotion || !groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.05;
    groupRef.current.rotation.x = Math.sin(t * 0.08) * 0.06;
  });

  return (
    <group ref={groupRef}>
      {candles.map((c, i) => (
        <BackgroundCandle key={i} data={c} reducedMotion={reducedMotion} />
      ))}
    </group>
  );
}

function BackgroundCandle({ data, reducedMotion }: { data: CandleData; reducedMotion: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const color = data.up ? '#34d399' : '#fb7185';

  useFrame((state) => {
    if (reducedMotion || !ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = data.position[1] + Math.sin(t * data.speed + data.phase) * 0.14;
    ref.current.rotation.y = t * data.speed * (data.ring % 2 === 0 ? 1 : -1) * 0.35;
  });

  return (
    <group ref={ref} position={data.position} rotation={data.rotation}>
      <mesh>
        <cylinderGeometry args={[0.009, 0.009, data.bodyH + data.wickTop + data.wickBottom, 4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} transparent opacity={0.75} />
      </mesh>
      <mesh position={[0, -(data.wickBottom - data.wickTop) / 2, 0]}>
        <boxGeometry args={[0.06, data.bodyH, 0.06]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.3} roughness={0.3} transparent opacity={0.75} />
      </mesh>
    </group>
  );
}

// ───────────────────────────── Static fallback (reduced motion) ─────────────────────────────

function StaticEarth() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      <div
        className="h-[72vmin] w-[72vmin] rounded-full opacity-70"
        style={{
          background: 'radial-gradient(circle at 35% 30%, #10b981 0%, #065f46 35%, #022c22 68%, #01110b 100%)',
          boxShadow: '0 0 140px rgba(16, 185, 129, 0.35), inset -30px -40px 90px rgba(0,0,0,0.65)',
        }}
      />
    </div>
  );
}

// ───────────────────────────── Scene ─────────────────────────────

export function EarthBackground() {
  const [mounted, setMounted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setMounted(true);
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!mounted) {
    return <div className="absolute inset-0 bg-emerald-950/20" />;
  }

  if (reducedMotion) {
    return <StaticEarth />;
  }

  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.1, 8.4], fov: 45 }}
      gl={{ antialias: true, alpha: true }}
      performance={{ min: 0.5 }}
    >
      <ambientLight intensity={0.45} />
      <pointLight position={[7, 5, 7]} intensity={1.1} color="#a7f3d0" />
      <pointLight position={[-7, -4, -5]} intensity={0.5} color="#34d399" />
      <Sparkles count={140} scale={11} size={1.8} speed={0.2} opacity={0.35} color="#34d399" />
      <Earth reducedMotion={reducedMotion} />
      <CandlestickField reducedMotion={reducedMotion} />
    </Canvas>
  );
}
