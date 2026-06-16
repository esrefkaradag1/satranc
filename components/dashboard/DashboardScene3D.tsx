import React, { useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { FloatingPiecesSet, ParticleField } from './chessPieces3d';

function CameraRig() {
  const { camera, pointer } = useThree();
  const target = useRef(new THREE.Vector3(0, 0.2, 0));
  useFrame((_, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    const destX = pointer.x * 1.2;
    const destY = 1.8 + pointer.y * 0.35;
    cam.position.x = THREE.MathUtils.lerp(cam.position.x, destX, delta * 2);
    cam.position.y = THREE.MathUtils.lerp(cam.position.y, destY, delta * 2);
    cam.lookAt(target.current);
  });
  return null;
}

function ChessBoardFloor() {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.08) * 0.02;
  });
  return (
    <group ref={ref} position={[0, -2.8, -2]} rotation={[-Math.PI / 2.8, 0, 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[14, 14]} />
        <meshStandardMaterial color="#1e1b4b" metalness={0.2} roughness={0.6} transparent opacity={0.85} />
      </mesh>
      {Array.from({ length: 64 }, (_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const light = (row + col) % 2 === 0;
        return (
          <mesh
            key={i}
            position={[(col - 3.5) * 0.85, 0.01, (row - 3.5) * 0.85]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.82, 0.82]} />
            <meshStandardMaterial
              color={light ? '#312e81' : '#1e1b4b'}
              metalness={0.15}
              roughness={0.5}
              transparent
              opacity={0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function AmbientGlow() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(state.clock.elapsedTime * 0.5) * 0.05;
    ref.current.scale.set(s, s, 1);
  });
  return (
    <mesh ref={ref} position={[0, 0, -6]}>
      <planeGeometry args={[30, 18]} />
      <meshBasicMaterial color="#4338ca" transparent opacity={0.12} />
    </mesh>
  );
}

function FullScene() {
  const sceneRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!sceneRef.current) return;
    sceneRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.06) * 0.08;
  });

  return (
    <group ref={sceneRef}>
      <fog attach="fog" args={['#0a0f1e', 6, 22]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 8, 4]} intensity={1} color="#e0e7ff" />
      <pointLight position={[-6, 3, 2]} intensity={0.7} color="#a855f7" />
      <pointLight position={[6, -2, 3]} intensity={0.5} color="#6366f1" />
      <pointLight position={[0, 4, -4]} intensity={0.35} color="#38bdf8" />

      <Stars radius={40} depth={30} count={1200} factor={3} saturation={0.15} fade speed={0.4} />
      <AmbientGlow />
      <Grid
        position={[0, -3.5, -1]}
        args={[20, 20]}
        cellSize={0.6}
        cellThickness={0.5}
        cellColor="#4338ca"
        sectionSize={3}
        sectionThickness={1}
        sectionColor="#6366f1"
        fadeDistance={22}
        fadeStrength={1.2}
        infiniteGrid
      />

      <ChessBoardFloor />
      <ParticleField count={90} spread={18} />
      <FloatingPiecesSet />
      <CameraRig />
    </group>
  );
}

type Props = {
  className?: string;
};

const DashboardScene3D: React.FC<Props> = ({ className = '' }) => (
  <div className={`pointer-events-none ${className}`} aria-hidden>
    <Canvas
      camera={{ position: [0, 1.8, 7.5], fov: 50 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      dpr={[1, 1.5]}
      style={{ background: 'transparent' }}
      events={undefined}
    >
      <FullScene />
    </Canvas>
  </div>
);

export default DashboardScene3D;
