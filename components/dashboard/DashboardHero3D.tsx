import React from 'react';
import { Canvas } from '@react-three/fiber';
import {
  ChessKing, ChessQueen, ChessRook, ChessBishop, ChessKnight, ChessPawn, ParticleField,
} from './chessPieces3d';

function HeroScene() {
  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 5, 2]} intensity={1.1} color="#e0e7ff" />
      <pointLight position={[-1, 2, 2]} intensity={0.7} color="#a855f7" />
      <pointLight position={[2, 0, 1]} intensity={0.45} color="#fbbf24" />

      <ParticleField count={40} spread={6} />

      <ChessKing position={[1.1, 0, 0]} color="#f8fafc" accent="#fbbf24" phase={0} scale={0.72} />
      <ChessQueen position={[0.2, 0.4, -0.4]} color="#f1f5f9" accent="#f472b6" phase={0.6} scale={0.65} />
      <ChessRook position={[-0.3, -0.1, 0.2]} color="#e2e8f0" accent="#818cf8" phase={1.2} scale={0.6} />
      <ChessKnight position={[1.8, -0.2, 0.3]} color="#f8fafc" accent="#c4b5fd" phase={2} scale={0.62} />
      <ChessBishop position={[0.6, -0.5, -0.5]} color="#cbd5e1" accent="#a78bfa" phase={2.6} scale={0.55} />
      <ChessPawn position={[1.5, 0.6, -0.2]} color="#94a3b8" accent="#6366f1" phase={3.2} scale={0.48} />
      <ChessPawn position={[-0.1, 0.2, 0.5]} color="#64748b" accent="#8b5cf6" phase={3.8} scale={0.44} />
    </>
  );
}

const DashboardHero3D: React.FC = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
    <Canvas
      camera={{ position: [0.6, 0.6, 3.2], fov: 40 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.75]}
      style={{ background: 'transparent' }}
    >
      <HeroScene />
    </Canvas>
  </div>
);

export default DashboardHero3D;
