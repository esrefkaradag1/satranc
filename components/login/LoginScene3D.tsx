import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { FloatingPiecesSet, ParticleField } from '../dashboard/chessPieces3d';

type Props = {
  accent?: string;
  className?: string;
};

function CameraRig() {
  const { camera, pointer } = useThree();
  const target = useRef(new THREE.Vector3(-1.5, 0, 0));
  useFrame((_, delta) => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.x = THREE.MathUtils.lerp(cam.position.x, -2 + pointer.x * 0.8, delta * 1.5);
    cam.position.y = THREE.MathUtils.lerp(cam.position.y, 0.5 + pointer.y * 0.25, delta * 1.5);
    cam.lookAt(target.current);
  });
  return null;
}

function AccentGlow({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    const s = 1 + Math.sin(state.clock.elapsedTime * 0.45) * 0.06;
    ref.current.scale.set(s, s, 1);
    (ref.current.material as THREE.MeshBasicMaterial).color.set(color);
  });
  return (
    <mesh ref={ref} position={[-4, 0, -5]}>
      <planeGeometry args={[22, 22]} />
      <meshBasicMaterial color={color} transparent opacity={0.14} />
    </mesh>
  );
}

function OrbitRing({ color }: { color: string }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.x = Math.PI / 2.2;
    ref.current.rotation.z = state.clock.elapsedTime * 0.12;
  });
  return (
    <mesh ref={ref} position={[-3, -0.5, -2]}>
      <torusGeometry args={[3.2, 0.02, 8, 64]} />
      <meshBasicMaterial color={color} transparent opacity={0.35} />
    </mesh>
  );
}

function BoardPlane() {
  return (
    <group position={[-3.5, -2.2, -1]} rotation={[-Math.PI / 2.6, 0.15, 0]}>
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#12101f" metalness={0.35} roughness={0.55} transparent opacity={0.75} />
      </mesh>
      {Array.from({ length: 64 }, (_, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const light = (row + col) % 2 === 0;
        return (
          <mesh key={i} position={[(col - 3.5) * 0.62, 0.01, (row - 3.5) * 0.62]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[0.58, 0.58]} />
            <meshStandardMaterial
              color={light ? '#2e2a5c' : '#1a1733'}
              metalness={0.2}
              roughness={0.45}
              transparent
              opacity={0.85}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Scene({ accent }: { accent: string }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.05) * 0.06;
  });

  return (
    <group ref={groupRef} position={[-2.5, 0, 0]}>
      <fog attach="fog" args={['#060912', 5, 20]} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 3]} intensity={0.9} color="#e2e8f0" />
      <pointLight position={[-6, 3, 2]} intensity={0.85} color={accent} />
      <pointLight position={[2, -2, 4]} intensity={0.4} color="#818cf8" />
      <pointLight position={[-2, 4, -3]} intensity={0.3} color="#38bdf8" />

      <Stars radius={45} depth={40} count={900} factor={2.5} saturation={0.1} fade speed={0.35} />
      <AccentGlow color={accent} />
      <OrbitRing color={accent} />
      <Grid
        position={[0, -3, 0]}
        args={[24, 24]}
        cellSize={0.55}
        cellThickness={0.4}
        cellColor="#312e81"
        sectionSize={2.5}
        sectionThickness={0.8}
        sectionColor={accent}
        fadeDistance={20}
        fadeStrength={1.3}
        infiniteGrid
      />
      <BoardPlane />
      <ParticleField count={70} spread={16} />
      <group position={[-1, 0, 0]} scale={0.92}>
        <FloatingPiecesSet />
      </group>
      <CameraRig />
    </group>
  );
}

const LoginScene3D: React.FC<Props> = ({ accent = '#6366f1', className = '' }) => {
  const color = useMemo(() => accent, [accent]);

  return (
    <div className={`pointer-events-none ${className}`} aria-hidden>
      <Canvas
        camera={{ position: [-2, 0.5, 8], fov: 48 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        style={{ background: 'transparent' }}
      >
        <Scene accent={color} />
      </Canvas>
    </div>
  );
};

export default LoginScene3D;
