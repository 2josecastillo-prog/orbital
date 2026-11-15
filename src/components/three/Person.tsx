import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Vec3 } from "./effects";

/**
 * Articulated crew member at real scale (1.75 m), origin at the pelvis.
 * Poses:
 * - neutral: NASA "neutral body posture" adopted when floating relaxed in
 *   microgravity (arms raised, hips and knees half flexed).
 * - translate: moving in microgravity, head first, pulling hand over hand.
 * - walk: normal gait in gravity.
 * - supine: lying back in an Apollo couch, knees raised.
 */
export type Pose = "neutral" | "translate" | "walk" | "supine" | "stand";

export type Outfit = { suit: string; trim: string; helmet?: boolean };

const SEG = {
  torso: 0.42,
  upperArm: 0.29,
  forearm: 0.26,
  thigh: 0.43,
  shin: 0.42,
};

function Limb({ length, radius, color }: { length: number; radius: number; color: string }) {
  return (
    <mesh position={[0, -length / 2, 0]} castShadow>
      <capsuleGeometry args={[radius, Math.max(0.01, length - radius * 2), 6, 12]} />
      <meshStandardMaterial color={color} roughness={0.75} />
    </mesh>
  );
}

export default function Person({
  target,
  heading,
  pose,
  outfit,
  seed = 0,
  status = "ok",
}: {
  target: Vec3;
  heading: number;
  pose: Pose;
  outfit: Outfit;
  seed?: number;
  status?: "ok" | "watch" | "danger" | "safe";
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const shoulderL = useRef<THREE.Group>(null);
  const shoulderR = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null);
  const elbowR = useRef<THREE.Group>(null);
  const hipL = useRef<THREE.Group>(null);
  const hipR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const initialized = useRef(false);
  const goal = useRef(new THREE.Vector3());

  useFrame(({ clock }, delta) => {
    if (!root.current) return;
    const t = clock.elapsedTime + seed * 1.37;
    goal.current.set(...target);
    if (!initialized.current) {
      root.current.position.copy(goal.current);
      initialized.current = true;
    }
    // Smooth motion between simulation seconds.
    root.current.position.lerp(goal.current, 1 - Math.exp(-delta * 3.2));
    const yaw = root.current.rotation.y;
    let diff = heading - yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    root.current.rotation.y = yaw + diff * (1 - Math.exp(-delta * 4));

    const set = (ref: React.RefObject<THREE.Group | null>, x: number, z = 0) => {
      if (!ref.current) return;
      ref.current.rotation.x += (x - ref.current.rotation.x) * Math.min(1, delta * 8);
      ref.current.rotation.z += (z - ref.current.rotation.z) * Math.min(1, delta * 8);
    };
    let pitch = 0;
    let bob = 0;
    if (pose === "neutral") {
      const drift = Math.sin(t * 0.7) * 0.06;
      set(shoulderL, -0.75 + drift, 0.35);
      set(shoulderR, -0.75 - drift, -0.35);
      set(elbowL, -0.85);
      set(elbowR, -0.85);
      set(hipL, -0.8 + drift);
      set(hipR, -0.8 - drift);
      set(kneeL, 0.95);
      set(kneeR, 0.95);
      pitch = -0.12;
      bob = Math.sin(t * 0.8) * 0.03;
    } else if (pose === "translate") {
      const w = t * 3.2;
      set(shoulderL, -2.7 + Math.sin(w) * 0.55, 0.15);
      set(shoulderR, -2.7 - Math.sin(w) * 0.55, -0.15);
      set(elbowL, -0.25 - Math.max(0, Math.sin(w)) * 0.6);
      set(elbowR, -0.25 - Math.max(0, -Math.sin(w)) * 0.6);
      set(hipL, -0.15 + Math.sin(w * 0.5) * 0.1);
      set(hipR, -0.25 - Math.sin(w * 0.5) * 0.1);
      set(kneeL, 0.35);
      set(kneeR, 0.45);
      pitch = 1.35;
    } else if (pose === "walk") {
      const w = t * 5.5;
      set(hipL, Math.sin(w) * 0.5);
      set(hipR, -Math.sin(w) * 0.5);
      set(kneeL, 0.15 + Math.max(0, Math.sin(w + 1.6)) * 0.8);
      set(kneeR, 0.15 + Math.max(0, -Math.sin(w + 1.6)) * 0.8);
      set(shoulderL, -Math.sin(w) * 0.4, 0.06);
      set(shoulderR, Math.sin(w) * 0.4, -0.06);
      set(elbowL, -0.35);
      set(elbowR, -0.35);
      bob = Math.abs(Math.sin(w)) * 0.035;
      pitch = 0.06;
    } else if (pose === "supine") {
      set(hipL, -1.45);
      set(hipR, -1.45);
      set(kneeL, 1.45);
      set(kneeR, 1.45);
      set(shoulderL, -0.35, 0.2);
      set(shoulderR, -0.35, -0.2);
      set(elbowL, -1.1);
      set(elbowR, -1.1);
      pitch = -1.45;
    } else {
      set(hipL, 0);
      set(hipR, 0);
      set(kneeL, 0.05);
      set(kneeR, 0.05);
      set(shoulderL, 0.05, 0.08);
      set(shoulderR, 0.05, -0.08);
      set(elbowL, -0.15);
      set(elbowR, -0.15);
    }
    if (body.current) {
      body.current.rotation.x += (pitch - body.current.rotation.x) * Math.min(1, delta * 5);
      body.current.position.y = bob;
    }
    if (head.current) head.current.rotation.x = pose === "translate" ? -0.9 : pose === "neutral" ? 0.15 : 0;
  });

  const { suit, trim, helmet } = outfit;
  const marker = status === "safe" ? "#c6ed9c" : status === "danger" ? "#f08a6c" : null;
  return (
    <group ref={root}>
      {marker && (
        <mesh position={[0, 1.15, 0]}>
          <sphereGeometry args={[0.06, 12, 10]} />
          <meshBasicMaterial color={marker} />
        </mesh>
      )}
      <group ref={body}>
        {/* Pelvis and torso */}
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[0.32, 0.16, 0.2]} />
          <meshStandardMaterial color={suit} roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.3, 0]} castShadow>
          <capsuleGeometry args={[0.16, SEG.torso - 0.2, 6, 14]} />
          <meshStandardMaterial color={suit} roughness={0.78} />
        </mesh>
        <mesh position={[0, 0.34, 0.12]}>
          <boxGeometry args={[0.18, 0.14, 0.04]} />
          <meshStandardMaterial color={trim} roughness={0.6} />
        </mesh>
        {/* Head */}
        <group ref={head} position={[0, 0.6, 0]}>
          <mesh position={[0, 0.1, 0]} castShadow>
            <sphereGeometry args={[helmet ? 0.155 : 0.105, 20, 16]} />
            <meshStandardMaterial
              color={helmet ? "#e8eef0" : "#d7b393"}
              roughness={helmet ? 0.15 : 0.6}
              metalness={helmet ? 0.1 : 0}
              transparent={helmet}
              opacity={helmet ? 0.55 : 1}
            />
          </mesh>
          {helmet && (
            <mesh position={[0, 0.08, 0]}>
              <sphereGeometry args={[0.1, 16, 12]} />
              <meshStandardMaterial color="#d7b393" roughness={0.6} />
            </mesh>
          )}
          <mesh position={[0, -0.03, 0]}>
            <cylinderGeometry args={[0.05, 0.06, 0.08, 10]} />
            <meshStandardMaterial color={suit} />
          </mesh>
        </group>
        {/* Arms */}
        {([
          [shoulderL, elbowL, 1],
          [shoulderR, elbowR, -1],
        ] as const).map(([shoulder, elbow, side]) => (
          <group key={side} ref={shoulder} position={[side * 0.21, 0.5, 0]}>
            <Limb length={SEG.upperArm} radius={0.05} color={suit} />
            <group ref={elbow} position={[0, -SEG.upperArm, 0]}>
              <Limb length={SEG.forearm} radius={0.042} color={suit} />
              <mesh position={[0, -SEG.forearm - 0.03, 0]}>
                <sphereGeometry args={[0.045, 10, 8]} />
                <meshStandardMaterial color={helmet ? "#cfd3cf" : "#d7b393"} roughness={0.7} />
              </mesh>
            </group>
          </group>
        ))}
        {/* Legs */}
        {([
          [hipL, kneeL, 1],
          [hipR, kneeR, -1],
        ] as const).map(([hip, knee, side]) => (
          <group key={side} ref={hip} position={[side * 0.1, -0.04, 0]}>
            <Limb length={SEG.thigh} radius={0.07} color={suit} />
            <group ref={knee} position={[0, -SEG.thigh, 0]}>
              <Limb length={SEG.shin} radius={0.055} color={suit} />
              <mesh position={[0, -SEG.shin - 0.02, 0.06]} castShadow>
                <boxGeometry args={[0.1, 0.07, 0.25]} />
                <meshStandardMaterial color={trim} roughness={0.7} />
              </mesh>
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}
