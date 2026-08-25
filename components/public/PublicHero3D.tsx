import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

/* ── Lathe profile builder ────────────────────────────── */
function lp(profile: Array<[number, number]>): THREE.Vector2[] {
  return profile.map(([r, y]) => new THREE.Vector2(r, y));
}

/* ── Staunton Profiles (high-segment lathe) ─────────── */
const KING: Array<[number, number]> = [
  [0,0],[.48,0],[.48,.08],[.42,.15],[.36,.28],[.26,.55],[.29,.62],[.24,.68],
  [.22,.82],[.36,.95],[.38,1.08],[.32,1.18],[.22,1.25],[.08,1.32],[0,1.35],
];
const QUEEN: Array<[number, number]> = [
  [0,0],[.46,0],[.46,.08],[.40,.15],[.34,.28],[.24,.52],[.26,.58],[.22,.64],
  [.20,.78],[.35,.92],[.32,1.05],[.18,1.15],[.08,1.22],[0,1.25],
];
const ROOK: Array<[number, number]> = [
  [0,0],[.45,0],[.45,.08],[.38,.15],[.32,.26],[.28,.56],[.35,.65],[.36,.82],[.36,.92],[.30,.92],[0,.92],
];
const BISHOP: Array<[number, number]> = [
  [0,0],[.42,0],[.42,.08],[.36,.15],[.24,.45],[.26,.52],[.20,.58],[.28,.75],[.24,.92],[.10,.98],[0,1.02],
];
const KNIGHT_BASE: Array<[number, number]> = [
  [0,0],[.44,0],[.44,.08],[.38,.15],[.30,.28],[.28,.42],[0,.42],
];
const PAWN: Array<[number, number]> = [
  [0,0],[.38,0],[.38,.06],[.32,.12],[.20,.35],[.22,.40],[.16,.45],[.25,.58],[.08,.65],[0,.70],
];

/* ── Piece Component ──────────────────────────────────── */
type Side = 'white' | 'black';

function PieceMat({ side }: { side: Side }) {
  const color = side === 'white' ? '#e8e0d4' : '#1a1a2e';
  const emissive = side === 'white' ? '#f5efe6' : '#0d0d1a';
  return (
    <meshPhysicalMaterial
      color={color}
      metalness={side === 'white' ? 0.08 : 0.15}
      roughness={side === 'white' ? 0.12 : 0.08}
      clearcoat={1}
      clearcoatRoughness={0.05}
      reflectivity={1}
      emissive={emissive}
      emissiveIntensity={0.05}
      envMapIntensity={1.5}
    />
  );
}

function KingPiece({ pos, side }: { pos: [number, number, number]; side: Side }) {
  const geo = useMemo(() => new THREE.LatheGeometry(lp(KING), 48), []);
  return (
    <group position={pos} scale={0.42}>
      <mesh geometry={geo} castShadow receiveShadow><PieceMat side={side} /></mesh>
      <mesh position={[0, 1.42, 0]} castShadow>
        <boxGeometry args={[.055, .2, .055]} />
        <PieceMat side={side} />
      </mesh>
      <mesh position={[0, 1.47, 0]} castShadow>
        <boxGeometry args={[.16, .055, .055]} />
        <PieceMat side={side} />
      </mesh>
    </group>
  );
}

function QueenPiece({ pos, side }: { pos: [number, number, number]; side: Side }) {
  const geo = useMemo(() => new THREE.LatheGeometry(lp(QUEEN), 48), []);
  return (
    <group position={pos} scale={0.42}>
      <mesh geometry={geo} castShadow receiveShadow><PieceMat side={side} /></mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <sphereGeometry args={[.08, 16, 16]} />
        <PieceMat side={side} />
      </mesh>
    </group>
  );
}

function RookPiece({ pos, side }: { pos: [number, number, number]; side: Side }) {
  const geo = useMemo(() => new THREE.LatheGeometry(lp(ROOK), 48), []);
  return (
    <group position={pos} scale={0.42}>
      <mesh geometry={geo} castShadow receiveShadow><PieceMat side={side} /></mesh>
      {[0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * .24, .98, Math.sin(a) * .24]} castShadow>
          <boxGeometry args={[.1, .1, .1]} />
          <PieceMat side={side} />
        </mesh>
      ))}
    </group>
  );
}

function BishopPiece({ pos, side }: { pos: [number, number, number]; side: Side }) {
  const geo = useMemo(() => new THREE.LatheGeometry(lp(BISHOP), 48), []);
  return (
    <group position={pos} scale={0.42}>
      <mesh geometry={geo} castShadow receiveShadow><PieceMat side={side} /></mesh>
      <mesh position={[0, 1.08, 0]} castShadow>
        <sphereGeometry args={[.06, 16, 16]} />
        <PieceMat side={side} />
      </mesh>
    </group>
  );
}

function KnightPiece({ pos, side }: { pos: [number, number, number]; side: Side }) {
  const baseGeo = useMemo(() => new THREE.LatheGeometry(lp(KNIGHT_BASE), 48), []);
  return (
    <group position={pos} scale={0.42}>
      <mesh geometry={baseGeo} castShadow receiveShadow><PieceMat side={side} /></mesh>
      <group position={[0, .42, 0]}>
        <mesh position={[.02, .22, 0]} rotation={[0, 0, -.15]} castShadow>
          <cylinderGeometry args={[.16, .24, .42, 16]} />
          <PieceMat side={side} />
        </mesh>
        <mesh position={[.14, .34, 0]} rotation={[0, 0, -.35]} castShadow>
          <boxGeometry args={[.24, .16, .2]} />
          <PieceMat side={side} />
        </mesh>
        <mesh position={[-.04, .46, .06]} rotation={[.2, 0, -.2]} castShadow>
          <coneGeometry args={[.04, .14, 8]} />
          <PieceMat side={side} />
        </mesh>
        <mesh position={[-.04, .46, -.06]} rotation={[-.2, 0, -.2]} castShadow>
          <coneGeometry args={[.04, .14, 8]} />
          <PieceMat side={side} />
        </mesh>
      </group>
    </group>
  );
}

function PawnPiece({ pos, side }: { pos: [number, number, number]; side: Side }) {
  const geo = useMemo(() => new THREE.LatheGeometry(lp(PAWN), 48), []);
  return (
    <group position={pos} scale={0.42}>
      <mesh geometry={geo} castShadow receiveShadow><PieceMat side={side} /></mesh>
    </group>
  );
}

/* ── Board & Piece Layout (mid-game position) ────────── */
// Algebraic: col 0-7 = a-h, row 0-7 = 1-8
// We'll use a Sicilian Najdorf mid-game position
type PieceDef = { type: string; col: number; row: number; side: Side };

const POSITION: PieceDef[] = [
  // White pieces
  { type: 'R', col: 0, row: 0, side: 'white' },
  { type: 'N', col: 1, row: 0, side: 'white' },
  { type: 'K', col: 6, row: 0, side: 'white' },
  { type: 'R', col: 7, row: 0, side: 'white' },
  { type: 'P', col: 0, row: 1, side: 'white' },
  { type: 'P', col: 1, row: 1, side: 'white' },
  { type: 'P', col: 2, row: 1, side: 'white' },
  { type: 'P', col: 5, row: 1, side: 'white' },
  { type: 'P', col: 6, row: 1, side: 'white' },
  { type: 'P', col: 7, row: 1, side: 'white' },
  { type: 'B', col: 2, row: 2, side: 'white' },
  { type: 'N', col: 3, row: 3, side: 'white' },
  { type: 'P', col: 4, row: 3, side: 'white' },
  { type: 'Q', col: 3, row: 1, side: 'white' },
  { type: 'B', col: 4, row: 2, side: 'white' },
  // Black pieces
  { type: 'R', col: 0, row: 7, side: 'black' },
  { type: 'K', col: 6, row: 7, side: 'black' },
  { type: 'R', col: 5, row: 7, side: 'black' },
  { type: 'Q', col: 3, row: 7, side: 'black' },
  { type: 'B', col: 2, row: 7, side: 'black' },
  { type: 'N', col: 1, row: 5, side: 'black' },
  { type: 'B', col: 5, row: 6, side: 'black' },
  { type: 'P', col: 0, row: 6, side: 'black' },
  { type: 'P', col: 1, row: 6, side: 'black' },
  { type: 'P', col: 3, row: 5, side: 'black' },
  { type: 'P', col: 4, row: 4, side: 'black' },
  { type: 'P', col: 5, row: 5, side: 'black' },
  { type: 'P', col: 6, row: 6, side: 'black' },
  { type: 'P', col: 7, row: 6, side: 'black' },
  { type: 'N', col: 5, row: 4, side: 'black' },
];

function boardPos(col: number, row: number): [number, number, number] {
  const tileSize = 0.65;
  const x = (col - 3.5) * tileSize;
  const z = (row - 3.5) * tileSize;
  return [x, 0.06, z];
}

function ChessBoard() {
  const tileSize = 0.65;

  return (
    <group>
      {/* Board frame */}
      <mesh position={[0, -0.06, 0]} receiveShadow>
        <boxGeometry args={[tileSize * 8 + 0.35, 0.12, tileSize * 8 + 0.35]} />
        <meshPhysicalMaterial color="#0a0a14" metalness={0.4} roughness={0.1} clearcoat={1} />
      </mesh>

      {/* Tiles */}
      {Array.from({ length: 64 }, (_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const isLight = (row + col) % 2 === 0;
        const x = (col - 3.5) * tileSize;
        const z = (row - 3.5) * tileSize;
        return (
          <mesh key={i} position={[x, 0.01, z]} receiveShadow>
            <boxGeometry args={[tileSize - 0.02, 0.05, tileSize - 0.02]} />
            <meshPhysicalMaterial
              color={isLight ? '#c4b699' : '#2a2a3e'}
              metalness={isLight ? 0.05 : 0.15}
              roughness={isLight ? 0.2 : 0.1}
              clearcoat={0.8}
              clearcoatRoughness={0.08}
            />
          </mesh>
        );
      })}

      {/* Pieces */}
      {POSITION.map((p, i) => {
        const pos = boardPos(p.col, p.row);
        switch (p.type) {
          case 'K': return <KingPiece key={i} pos={pos} side={p.side} />;
          case 'Q': return <QueenPiece key={i} pos={pos} side={p.side} />;
          case 'R': return <RookPiece key={i} pos={pos} side={p.side} />;
          case 'B': return <BishopPiece key={i} pos={pos} side={p.side} />;
          case 'N': return <KnightPiece key={i} pos={pos} side={p.side} />;
          case 'P': return <PawnPiece key={i} pos={pos} side={p.side} />;
          default: return null;
        }
      })}
    </group>
  );
}

/* ── Cinematic Camera Rig ─────────────────────────────── */
function CinematicCameraRig() {
  const { camera, pointer } = useThree();
  const target = useRef(new THREE.Vector3(0, 0, 0));

  useFrame((state, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const t = state.clock.elapsedTime;

    // Slow orbit drift
    const baseX = 3.5 + Math.sin(t * 0.08) * 0.4;
    const baseY = 2.8 + Math.sin(t * 0.12) * 0.2;
    const baseZ = 3.5 + Math.cos(t * 0.08) * 0.3;

    // Mouse parallax
    const mx = pointer.x * 0.6;
    const my = pointer.y * 0.3;

    cam.position.x = THREE.MathUtils.lerp(cam.position.x, baseX + mx, delta * 1.5);
    cam.position.y = THREE.MathUtils.lerp(cam.position.y, baseY + my, delta * 1.5);
    cam.position.z = THREE.MathUtils.lerp(cam.position.z, baseZ, delta * 1.5);
    cam.lookAt(target.current);
  });

  return null;
}

/* ── Atmospheric Particles ────────────────────────────── */
function DustParticles() {
  const ref = useRef<THREE.Group>(null);
  const particles = useMemo(() =>
    Array.from({ length: 35 }, (_, i) => ({
      x: (Math.random() - 0.5) * 8,
      y: Math.random() * 4,
      z: (Math.random() - 0.5) * 8,
      s: 0.008 + Math.random() * 0.015,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.4,
    }))
  , []);

  useFrame((state) => {
    if (!ref.current) return;
    ref.current.children.forEach((child, i) => {
      const p = particles[i];
      child.position.y = p.y + Math.sin(state.clock.elapsedTime * p.speed + p.phase) * 0.3;
    });
  });

  return (
    <group ref={ref}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.s, 6, 6]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.15} />
        </mesh>
      ))}
    </group>
  );
}

/* ── Full Scene ───────────────────────────────────────── */
function CinematicScene() {
  const boardRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (!boardRef.current) return;
    boardRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.04) * 0.03;
  });

  return (
    <>
      <fog attach="fog" args={['#000000', 5, 14]} />
      <color attach="background" args={['#000000']} />

      {/* Lighting: cinematic dramatic 3-point + rim */}
      <ambientLight intensity={0.15} />

      {/* Key light - warm from upper right */}
      <directionalLight
        position={[4, 6, 3]}
        intensity={1.5}
        color="#ffe4c4"
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={20}
        shadow-camera-near={0.5}
        shadow-camera-left={-5}
        shadow-camera-right={5}
        shadow-camera-top={5}
        shadow-camera-bottom={-5}
      />

      {/* Fill light - cool blue from left */}
      <directionalLight position={[-3, 3, 2]} intensity={0.4} color="#4dc9f6" />

      {/* Rim light - cyan from back */}
      <pointLight position={[0, 2, -5]} intensity={1.2} color="#22d3ee" distance={12} />

      {/* Orange accent light - from front left */}
      <pointLight position={[-4, 1, 4]} intensity={0.6} color="#f97316" distance={10} />

      {/* Subtle purple top accent */}
      <pointLight position={[2, 5, -2]} intensity={0.3} color="#a855f7" distance={10} />

      <group ref={boardRef} rotation={[0, -Math.PI / 6, 0]}>
        <ChessBoard />
      </group>

      <DustParticles />
      <CinematicCameraRig />
    </>
  );
}

/* ── Export Component ─────────────────────────────────── */
const PublicHero3D: React.FC = () => (
  <div className="absolute inset-0 z-0" aria-hidden>
    <Canvas
      camera={{ position: [3.5, 2.8, 3.5], fov: 42 }}
      gl={{
        alpha: false,
        antialias: true,
        powerPreference: 'high-performance',
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      shadows
      dpr={[1, 2]}
      style={{ background: '#000000' }}
    >
      <CinematicScene />
    </Canvas>
  </div>
);

export default PublicHero3D;
