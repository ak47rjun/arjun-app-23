'use client';

/**
 * ARJUN signature 3D hero: a luminous emerald globe (the connected global
 * trader network) surrounded by floating candlesticks, market particles and
 * fine orbital lines, with floating glass price panels. Interactive camera
 * (drag to rotate), subtle scroll parallax, and a reduced-motion fallback.
 */
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Sparkles, Text, Float, Html } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';

// ───────────────────────────── Globe ─────────────────────────────

function fibonacciSphere(count: number, radius: number) {
  const positions = new Float32Array(count * 3);
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    positions[i * 3] = Math.cos(theta) * r * radius;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = Math.sin(theta) * r * radius;
  }
  return positions;
}

function Globe() {
  const points = useMemo(() => fibonacciSphere(900, 1.62), []);
  const innerRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (innerRef.current) {
      innerRef.current.rotation.y = state.clock.elapsedTime * 0.05;
    }
  });

  return (
    <group>
      {/* solid inner sphere */}
      <mesh ref={innerRef}>
        <sphereGeometry args={[1.6, 64, 64]} />
        <meshStandardMaterial
          color="#06231a"
          emissive="#10b981"
          emissiveIntensity={0.28}
          roughness={0.35}
          metalness={0.7}
          transparent
          opacity={0.96}
        />
      </mesh>
      {/* wireframe shell */}
      <mesh>
        <icosahedronGeometry args={[1.64, 1]} />
        <meshBasicMaterial color="#34d399" wireframe transparent opacity={0.16} />
      </mesh>
      {/* atmosphere glow */}
      <mesh>
        <sphereGeometry args={[1.78, 32, 32]} />
        <meshBasicMaterial color="#10b981" transparent opacity={0.07} side={THREE.BackSide} />
      </mesh>
      {/* trader network nodes */}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[points, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.035} color="#a7f3d0" transparent opacity={0.9} sizeAttenuation />
      </points>
    </group>
  );
}

// ───────────────────────────── Candlesticks ─────────────────────────────

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

function CandlestickField() {
  const groupRef = useRef<THREE.Group>(null);
  const candles = useMemo<CandleData[]>(() => {
    const list: CandleData[] = [];
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let ring = 0; ring < 3; ring++) {
      const radius = 2.15 + ring * 0.55;
      const count = 14 + ring * 6;
      const tiltX = (rand() - 0.5) * 0.9;
      const tiltZ = (rand() - 0.5) * 0.9;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 + rand() * 0.3;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        const y = (rand() - 0.5) * 0.9;
        const up = rand() > 0.48;
        list.push({
          position: [x, y, z],
          rotation: [tiltX, angle, tiltZ],
          bodyH: 0.12 + rand() * 0.22,
          wickTop: 0.08 + rand() * 0.16,
          wickBottom: 0.08 + rand() * 0.16,
          up,
          speed: 0.15 + rand() * 0.35,
          phase: rand() * Math.PI * 2,
          ring,
        });
      }
    }
    return list;
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    groupRef.current.rotation.y = t * 0.06;
    groupRef.current.rotation.x = Math.sin(t * 0.1) * 0.08;
  });

  return (
    <group ref={groupRef}>
      {candles.map((c, i) => (
        <Candlestick key={i} data={c} index={i} />
      ))}
    </group>
  );
}

function Candlestick({ data, index }: { data: CandleData; index: number }) {
  const ref = useRef<THREE.Group>(null);
  const color = data.up ? '#34d399' : '#fb7185';

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = data.position[1] + Math.sin(t * data.speed + data.phase) * 0.12;
    ref.current.rotation.y = t * data.speed * (data.ring % 2 === 0 ? 1 : -1) * 0.4;
  });

  return (
    <group ref={ref} position={data.position} rotation={data.rotation}>
      {/* wick */}
      <mesh>
        <cylinderGeometry args={[0.008, 0.008, data.bodyH + data.wickTop + data.wickBottom, 4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
      </mesh>
      {/* body */}
      <mesh position={[0, -(data.wickBottom - data.wickTop) / 2, 0]}>
        <boxGeometry args={[0.055, data.bodyH, 0.055]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.55} roughness={0.3} />
      </mesh>
    </group>
  );
}

// ───────────────────────────── Orbital rings ─────────────────────────────

function OrbitalRings() {
  const rings = useMemo(
    () => [
      { radius: 2.6, rot: [Math.PI / 2.4, 0.2, 0] as [number, number, number] },
      { radius: 3.15, rot: [Math.PI / 2.1, -0.35, 0.4] as [number, number, number] },
      { radius: 3.7, rot: [Math.PI / 1.8, 0.5, -0.3] as [number, number, number] },
    ],
    [],
  );
  return (
    <group>
      {rings.map((r, i) => (
        <mesh key={i} rotation={r.rot}>
          <torusGeometry args={[r.radius, 0.006, 8, 200]} />
          <meshBasicMaterial color="#34d399" transparent opacity={0.22} />
        </mesh>
      ))}
    </group>
  );
}

// ───────────────────────────── Center emblem ─────────────────────────────

function Emblem() {
  return (
    <Float speed={2} rotationIntensity={0.15} floatIntensity={0.35}>
      <group position={[0, 0, 0]}>
        <mesh rotation={[0, 0, 0]}>
          <torusGeometry args={[0.62, 0.035, 16, 64]} />
          <meshStandardMaterial color="#a7f3d0" emissive="#34d399" emissiveIntensity={1.4} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.72, 0.018, 16, 64]} />
          <meshStandardMaterial color="#67e8f9" emissive="#67e8f9" emissiveIntensity={0.8} transparent opacity={0.8} />
        </mesh>
        <Text
          font="/fonts/V8mDoQDjQSkFtoMM3T6r8E7mPb94C-s0.woff2"
          fontSize={0.3}
          letterSpacing={0.06}
          color="#eafff5"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.008}
          outlineColor="#10b981"
        >
          ARJUN
        </Text>
      </group>
    </Float>
  );
}

// ───────────────────────────── Glass price panels ─────────────────────────────

interface PanelQuote {
  symbol: string;
  last: number;
  changePercent: number;
}

function GlassPanels({ quotes }: { quotes: PanelQuote[] }) {
  const positions = useMemo(
    () => [
      [-3.1, 1.1, 0.6],
      [3.0, -0.9, 0.4],
      [0.4, 2.6, -0.5],
    ] as const,
    [],
  );
  return (
    <>
      {quotes.slice(0, 3).map((q, i) => (
        <Html key={q.symbol} position={positions[i]} center distanceFactor={7} zIndexRange={[10, 0]} wrapperClass="pointer-events-none">
          <div className="pointer-events-auto w-44 select-none rounded-xl border border-emerald-500/25 bg-emerald-950/60 p-3 shadow-glass backdrop-blur-glass animate-float">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-semibold text-arjun-text">{q.symbol}</span>
              <span className={cn2(q.changePercent)}>{q.changePercent >= 0 ? '▲' : '▼'} {Math.abs(q.changePercent).toFixed(2)}%</span>
            </div>
            <div className="mt-1 font-mono text-lg font-semibold text-arjun-text">{q.last.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: q.last < 5 ? 5 : 2 })}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-arjun-muted">Global markets · live network</div>
          </div>
        </Html>
      ))}
    </>
  );
}

function cn2(pct: number) {
  return `font-mono text-[11px] ${pct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`;
}

// ───────────────────────────── Scene ─────────────────────────────

export function GlobeCanvas({ symbols }: { symbols: string[] }) {
  const [quotes, setQuotes] = useState<PanelQuote[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  // poll demo quotes for the floating panels (clearly labelled demo data)
  useEffect(() => {
    if (!mounted) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/market/quotes?symbols=${symbols.join(',')}`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setQuotes(data.quotes);
        }
      } catch {
        /* panels stay hidden until data arrives */
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [mounted, symbols]);

  if (!mounted) {
    return <div ref={containerRef} className="h-full w-full animate-pulse rounded-3xl bg-emerald-950/20" />;
  }

  return (
    <Canvas
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.4, 6.2], fov: 42 }}
      gl={{ antialias: true, alpha: true }}
      performance={{ min: 0.5 }}
    >
      <ambientLight intensity={0.5} />
      <pointLight position={[6, 4, 6]} intensity={1.4} color="#a7f3d0" />
      <pointLight position={[-6, -3, -4]} intensity={0.6} color="#34d399" />
      <Sparkles count={260} scale={9} size={2.2} speed={reducedMotion ? 0 : 0.25} opacity={0.5} color="#34d399" />
      <Globe />
      <CandlestickField />
      <OrbitalRings />
      <Emblem />
      {quotes.length > 0 && <GlassPanels quotes={quotes} />}
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.55}
        enableDamping
        dampingFactor={0.06}
        minPolarAngle={Math.PI / 3.2}
        maxPolarAngle={Math.PI / 1.7}
      />
    </Canvas>
  );
}
