import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import type { Group, Mesh } from 'three';

export type PieceProps = {
  position: [number, number, number];
  color: string;
  accent: string;
  speed?: number;
  phase?: number;
  scale?: number;
};

export function ChessKing({ position, color, accent, speed = 0.35, phase = 0, scale = 0.55 }: PieceProps) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime * speed + phase;
    ref.current.rotation.y = Math.sin(t * 0.6) * 0.4;
  });
  return (
    <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.35}>
      <group ref={ref} position={position} scale={scale}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.42, 0.48, 0.22, 20]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.22} />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.28, 0.32, 0.38, 20]} />
          <meshStandardMaterial color={color} metalness={0.42} roughness={0.18} />
        </mesh>
        <mesh position={[0, 0.72, 0]}>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshStandardMaterial color={accent} metalness={0.5} roughness={0.15} emissive={accent} emissiveIntensity={0.18} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <boxGeometry args={[0.06, 0.22, 0.06]} />
          <meshStandardMaterial color={accent} metalness={0.55} roughness={0.15} />
        </mesh>
        <mesh position={[0, 1.02, 0]}>
          <boxGeometry args={[0.2, 0.06, 0.06]} />
          <meshStandardMaterial color={accent} metalness={0.55} roughness={0.15} />
        </mesh>
      </group>
    </Float>
  );
}

export function ChessQueen({ position, color, accent, speed = 0.32, phase = 0.5, scale = 0.52 }: PieceProps) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * speed * 0.4 + phase;
  });
  return (
    <Float speed={1.4} rotationIntensity={0.12} floatIntensity={0.32}>
      <group ref={ref} position={position} scale={scale}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.4, 0.46, 0.22, 20]} />
          <meshStandardMaterial color={color} metalness={0.38} roughness={0.22} />
        </mesh>
        <mesh position={[0, 0.48, 0]}>
          <cylinderGeometry args={[0.22, 0.3, 0.5, 20]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.88, 0]}>
          <sphereGeometry args={[0.2, 16, 16]} />
          <meshStandardMaterial color={accent} metalness={0.48} roughness={0.16} emissive={accent} emissiveIntensity={0.14} />
        </mesh>
        <mesh position={[0, 1.05, 0]}>
          <coneGeometry args={[0.1, 0.18, 12]} />
          <meshStandardMaterial color={accent} metalness={0.5} roughness={0.15} />
        </mesh>
      </group>
    </Float>
  );
}

export function ChessRook({ position, color, accent, speed = 0.3, phase = 1.2, scale = 0.5 }: PieceProps) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * speed * 0.5 + phase;
  });
  return (
    <Float speed={1.5} rotationIntensity={0.1} floatIntensity={0.3}>
      <group ref={ref} position={position} scale={scale}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.4, 0.46, 0.22, 16]} />
          <meshStandardMaterial color={color} metalness={0.38} roughness={0.22} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <cylinderGeometry args={[0.3, 0.32, 0.55, 16]} />
          <meshStandardMaterial color={color} metalness={0.4} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.86, 0]}>
          <cylinderGeometry args={[0.36, 0.34, 0.14, 16]} />
          <meshStandardMaterial color={accent} metalness={0.45} roughness={0.18} />
        </mesh>
      </group>
    </Float>
  );
}

export function ChessBishop({ position, color, accent, speed = 0.38, phase = 1.8, scale = 0.48 }: PieceProps) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * speed + phase) * 0.35;
  });
  return (
    <Float speed={1.3} rotationIntensity={0.14} floatIntensity={0.28}>
      <group ref={ref} position={position} scale={scale}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.38, 0.44, 0.2, 16]} />
          <meshStandardMaterial color={color} metalness={0.38} roughness={0.22} />
        </mesh>
        <mesh position={[0, 0.55, 0]}>
          <sphereGeometry args={[0.26, 16, 16]} />
          <meshStandardMaterial color={color} metalness={0.42} roughness={0.18} />
        </mesh>
        <mesh position={[0, 0.88, 0]}>
          <coneGeometry args={[0.12, 0.22, 12]} />
          <meshStandardMaterial color={accent} metalness={0.5} roughness={0.15} emissive={accent} emissiveIntensity={0.1} />
        </mesh>
      </group>
    </Float>
  );
}

export function ChessKnight({ position, color, accent, speed = 0.4, phase = 2.4, scale = 0.48 }: PieceProps) {
  const ref = useRef<Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * speed + phase) * 0.5;
  });
  return (
    <Float speed={1.8} rotationIntensity={0.2} floatIntensity={0.4}>
      <group position={position} scale={scale}>
        <mesh position={[0, 0.12, 0]}>
          <cylinderGeometry args={[0.38, 0.44, 0.2, 16]} />
          <meshStandardMaterial color={color} metalness={0.38} roughness={0.22} />
        </mesh>
        <mesh ref={ref} position={[0.05, 0.55, 0]}>
          <coneGeometry args={[0.28, 0.65, 16]} />
          <meshStandardMaterial color={color} metalness={0.42} roughness={0.18} />
        </mesh>
        <mesh position={[0.18, 0.78, 0.08]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color={accent} metalness={0.5} roughness={0.15} emissive={accent} emissiveIntensity={0.12} />
        </mesh>
      </group>
    </Float>
  );
}

export function ChessPawn({ position, color, accent, speed = 0.45, phase = 3, scale = 0.42 }: PieceProps) {
  const ref = useRef<Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * speed + phase) * 0.25;
  });
  return (
    <Float speed={2} rotationIntensity={0.08} floatIntensity={0.25}>
      <group ref={ref} position={position} scale={scale}>
        <mesh position={[0, 0.1, 0]}>
          <cylinderGeometry args={[0.34, 0.4, 0.18, 14]} />
          <meshStandardMaterial color={color} metalness={0.35} roughness={0.24} />
        </mesh>
        <mesh position={[0, 0.38, 0]}>
          <cylinderGeometry args={[0.14, 0.22, 0.35, 14]} />
          <meshStandardMaterial color={color} metalness={0.38} roughness={0.2} />
        </mesh>
        <mesh position={[0, 0.62, 0]}>
          <sphereGeometry args={[0.14, 12, 12]} />
          <meshStandardMaterial color={accent} metalness={0.42} roughness={0.18} />
        </mesh>
      </group>
    </Float>
  );
}

export function ParticleField({ count = 60, spread = 14 }: { count?: number; spread?: number }) {
  const ref = useRef<Group>(null);
  const dots = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        x: (Math.random() - 0.5) * spread,
        y: (Math.random() - 0.5) * (spread * 0.45),
        z: (Math.random() - 0.5) * (spread * 0.35),
        s: 0.015 + Math.random() * 0.035,
        phase: i * 0.35,
        color: i % 3 === 0 ? '#a855f7' : i % 3 === 1 ? '#818cf8' : '#c7d2fe',
      })),
    [count, spread],
  );
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.02;
    ref.current.children.forEach((child, i) => {
      const d = dots[i];
      child.position.y = d.y + Math.sin(state.clock.elapsedTime * 0.6 + d.phase) * 0.12;
    });
  });
  return (
    <group ref={ref}>
      {dots.map((d, i) => (
        <mesh key={i} position={[d.x, d.y, d.z]}>
          <sphereGeometry args={[d.s, 6, 6]} />
          <meshBasicMaterial color={d.color} transparent opacity={0.5} />
        </mesh>
      ))}
    </group>
  );
}

export const FLOATING_PIECES: Array<{
  type: 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';
  position: [number, number, number];
  color: string;
  accent: string;
  phase: number;
  scale?: number;
}> = [
  { type: 'king', position: [3.2, 0.8, -1], color: '#f8fafc', accent: '#fbbf24', phase: 0, scale: 0.65 },
  { type: 'queen', position: [-4.5, 1.2, -2], color: '#e2e8f0', accent: '#f472b6', phase: 0.8, scale: 0.6 },
  { type: 'rook', position: [5.5, -0.5, -3], color: '#cbd5e1', accent: '#6366f1', phase: 1.5, scale: 0.58 },
  { type: 'bishop', position: [-2.8, 0.3, 0.5], color: '#f1f5f9', accent: '#a78bfa', phase: 2.1, scale: 0.55 },
  { type: 'knight', position: [1.8, 1.5, -0.5], color: '#f8fafc', accent: '#c4b5fd', phase: 2.8, scale: 0.58 },
  { type: 'pawn', position: [-5.8, -0.8, -1.5], color: '#94a3b8', accent: '#818cf8', phase: 3.2, scale: 0.5 },
  { type: 'pawn', position: [6.2, 0.2, -2.5], color: '#64748b', accent: '#a855f7', phase: 3.8, scale: 0.48 },
  { type: 'rook', position: [-1.2, -1, -4], color: '#e2e8f0', accent: '#4f46e5', phase: 4.2, scale: 0.52 },
  { type: 'bishop', position: [4, -1.2, 0], color: '#f1f5f9', accent: '#7c3aed', phase: 4.8, scale: 0.5 },
  { type: 'knight', position: [-3.5, -1.5, -3.5], color: '#cbd5e1', accent: '#818cf8', phase: 5.2, scale: 0.54 },
  { type: 'queen', position: [0.5, 2, -3], color: '#f8fafc', accent: '#ec4899', phase: 5.8, scale: 0.55 },
  { type: 'pawn', position: [2.5, -1.8, -2], color: '#94a3b8', accent: '#6366f1', phase: 6.2, scale: 0.46 },
  { type: 'king', position: [-6, 0.5, 0], color: '#e2e8f0', accent: '#f59e0b', phase: 6.8, scale: 0.5 },
  { type: 'pawn', position: [7, -0.3, -1], color: '#64748b', accent: '#8b5cf6', phase: 7.2, scale: 0.44 },
];

export function FloatingPiecesSet() {
  return (
    <>
      {FLOATING_PIECES.map((p, i) => {
        const props = {
          position: p.position,
          color: p.color,
          accent: p.accent,
          phase: p.phase,
          scale: p.scale,
        };
        switch (p.type) {
          case 'king': return <ChessKing key={i} {...props} />;
          case 'queen': return <ChessQueen key={i} {...props} />;
          case 'rook': return <ChessRook key={i} {...props} />;
          case 'bishop': return <ChessBishop key={i} {...props} />;
          case 'knight': return <ChessKnight key={i} {...props} />;
          default: return <ChessPawn key={i} {...props} />;
        }
      })}
    </>
  );
}
