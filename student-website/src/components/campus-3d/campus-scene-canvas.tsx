"use client";

import { Canvas } from "@react-three/fiber";
import { ContactShadows, Float, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";

export type CampusSceneMode = "overview" | "housing" | "zones" | "business";

type Zone = {
  id: string;
  label: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
};

const ZONES: Zone[] = [
  { id: "gate", label: "Gate", position: [0, 0.35, 3.2], size: [1.6, 0.7, 0.5], color: "#0A0A0A" },
  { id: "hostels", label: "Hostels", position: [-2.4, 0.55, -0.4], size: [1.8, 1.1, 1.4], color: "#404040" },
  { id: "lecture", label: "Lecture", position: [0.2, 0.7, -1.6], size: [2.2, 1.4, 1.6], color: "#262626" },
  { id: "food", label: "Food", position: [2.3, 0.4, 0.6], size: [1.4, 0.8, 1.2], color: "#525252" },
  { id: "market", label: "Market", position: [2.0, 0.35, -1.8], size: [1.2, 0.7, 1.0], color: "#737373" },
];

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <circleGeometry args={[6.5, 48]} />
      <meshStandardMaterial color="#FAFAFA" />
    </mesh>
  );
}

function Building({
  zone,
  active,
  dimmed,
}: {
  zone: Zone;
  active?: boolean;
  dimmed?: boolean;
}) {
  return (
    <Float speed={active ? 1.4 : 0.6} rotationIntensity={0.05} floatIntensity={active ? 0.25 : 0.08}>
      <mesh position={zone.position} castShadow>
        <boxGeometry args={zone.size} />
        <meshStandardMaterial
          color={zone.color}
          transparent={dimmed}
          opacity={dimmed ? 0.35 : 1}
          roughness={0.55}
          metalness={0.05}
        />
      </mesh>
      {active ? (
        <mesh position={[zone.position[0], zone.position[1] + zone.size[1] / 2 + 0.15, zone.position[2]]}>
          <sphereGeometry args={[0.12, 12, 12]} />
          <meshStandardMaterial color="#0A0A0A" emissive="#0A0A0A" emissiveIntensity={0.4} />
        </mesh>
      ) : null}
    </Float>
  );
}

function SceneContent({ mode }: { mode: CampusSceneMode }) {
  const focus = useMemo(() => {
    if (mode === "housing") return "hostels";
    if (mode === "business") return "market";
    if (mode === "zones") return null;
    return null;
  }, [mode]);

  return (
    <>
      <color attach="background" args={["#FFFFFF"]} />
      <ambientLight intensity={0.75} />
      <directionalLight position={[4, 8, 3]} intensity={1.1} castShadow />
      <Ground />
      {ZONES.map((zone) => (
        <Building
          key={zone.id}
          zone={zone}
          active={focus === zone.id || mode === "overview"}
          dimmed={Boolean(focus) && focus !== zone.id}
        />
      ))}
      <ContactShadows position={[0, 0.01, 0]} opacity={0.35} scale={10} blur={2.2} far={6} />
      <OrbitControls
        enablePan={false}
        minPolarAngle={0.4}
        maxPolarAngle={1.35}
        minDistance={5}
        maxDistance={11}
        autoRotate={mode === "overview" || mode === "zones"}
        autoRotateSpeed={0.45}
      />
    </>
  );
}

export function CampusSceneCanvas({ mode = "overview" }: { mode?: CampusSceneMode }) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [5.5, 4.2, 5.5], fov: 42 }}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      style={{ width: "100%", height: "100%" }}
    >
      <SceneContent mode={mode} />
    </Canvas>
  );
}
