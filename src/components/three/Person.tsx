import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Vec3 } from "./effects";

/**
 * Crew member built on a rigged, skinned human (Mixamo "X Bot", 1.81 m, from the
 * three.js examples). Walking and standing use motion-captured clips; postures
 * that have no clip are set joint by joint on the skeleton:
 * - neutral: NASA's microgravity "neutral body posture" (arms and legs half flexed).
 * - translate: moving head first in microgravity, reaching hand over hand.
 * - supine: lying back in an Apollo couch, knees raised.
 * - limp / down: unconscious, floating limp in orbit or lying in gravity.
 */
export type Pose = "neutral" | "translate" | "walk" | "stand" | "supine" | "limp" | "down" | "slumped";
export type Outfit = { suit: string; trim: string; helmet?: boolean };

const MODEL = "/models/crew.glb";
useGLTF.preload(MODEL);

type Offsets = Record<string, [number, number, number]>;
// Euler offsets (x, y, z) applied on the bind pose. Axes measured on the rig:
// UpLeg −X flexes the hip, Leg +X flexes the knee, Spine/Neck +X bend forward,
// LeftArm +Z raises / −Y swings forward (mirrored on the right arm).
const poses: Record<string, Offsets> = {
  neutral: {
    Spine: [0.12, 0, 0],
    Neck: [0.35, 0, 0],
    LeftArm: [0, -0.55, -0.75],
    RightArm: [0, 0.55, 0.75],
    LeftForeArm: [0, -0.9, 0],
    RightForeArm: [0, 0.9, 0],
    LeftUpLeg: [-0.85, 0, -0.08],
    RightUpLeg: [-0.85, 0, 0.08],
    LeftLeg: [0.9, 0, 0],
    RightLeg: [0.9, 0, 0],
  },
  translate: {
    Neck: [-0.55, 0, 0],
    LeftArm: [0, -1.15, 0.55],
    RightArm: [0, 1.15, -0.55],
    LeftForeArm: [0, -0.25, 0],
    RightForeArm: [0, 0.25, 0],
    LeftUpLeg: [0.12, 0, -0.05],
    RightUpLeg: [0.22, 0, 0.05],
    LeftLeg: [0.35, 0, 0],
    RightLeg: [0.5, 0, 0],
  },
  supine: {
    Neck: [0.25, 0, 0],
    LeftArm: [0, -0.45, -1.15],
    RightArm: [0, 0.45, 1.15],
    LeftForeArm: [0, -1.0, 0],
    RightForeArm: [0, 1.0, 0],
    LeftUpLeg: [-1.0, 0, -0.06],
    RightUpLeg: [-1.0, 0, 0.06],
    LeftLeg: [1.1, 0, 0],
    RightLeg: [1.1, 0, 0],
  },
  slumped: {
    Neck: [0.9, 0.3, 0.2],
    LeftArm: [0, -0.1, -1.35],
    RightArm: [0, 0.1, 1.35],
    LeftForeArm: [0, -0.3, 0],
    RightForeArm: [0, 0.3, 0],
    LeftUpLeg: [-0.95, 0, -0.18],
    RightUpLeg: [-0.95, 0, 0.18],
    LeftLeg: [1.05, 0, 0],
    RightLeg: [1.05, 0, 0],
  },
  limp: {
    Spine: [0.3, 0, 0],
    Neck: [0.85, 0.2, 0],
    LeftArm: [0, -0.3, -0.35],
    RightArm: [0, 0.3, 0.35],
    LeftForeArm: [0, -0.6, 0],
    RightForeArm: [0, 0.6, 0],
    LeftUpLeg: [-0.6, 0, -0.15],
    RightUpLeg: [-0.45, 0, 0.15],
    LeftLeg: [0.8, 0, 0],
    RightLeg: [0.6, 0, 0],
  },
  down: {
    Neck: [0.2, 0.6, 0],
    LeftArm: [0, -0.2, -1.2],
    RightArm: [0, 0.4, 1.0],
    LeftForeArm: [0, -0.4, 0],
    RightForeArm: [0, 0.2, 0],
    LeftUpLeg: [-0.25, 0, -0.1],
    RightUpLeg: [-0.05, 0, 0.12],
    LeftLeg: [0.5, 0, 0],
    RightLeg: [0.15, 0, 0],
  },
};
const POSED_BONES = ["Spine", "Neck", "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftUpLeg", "RightUpLeg", "LeftLeg", "RightLeg"];
const HIP_HEIGHT = 1.04;

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
  status?: "ok" | "watch" | "danger" | "safe" | "down";
}) {
  const { scene, animations } = useGLTF(MODEL);
  const model = useMemo(() => {
    const object = cloneSkinned(scene) as THREE.Object3D;
    object.traverse((node) => {
      const mesh = node as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh && !(node as THREE.Mesh).isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const source = mesh.material as THREE.MeshStandardMaterial;
      const material = new THREE.MeshStandardMaterial({
        color: source.name.includes("Joints") ? outfit.trim : outfit.suit,
        roughness: source.name.includes("Joints") ? 0.45 : 0.82,
        metalness: source.name.includes("Joints") ? 0.25 : 0.02,
      });
      mesh.material = material;
    });
    return object;
  }, [scene, outfit.suit, outfit.trim]);
  const bones = useMemo(() => {
    const map: Record<string, { bone: THREE.Bone; rest: THREE.Quaternion }> = {};
    model.traverse((node) => {
      if ((node as THREE.Bone).isBone) {
        const name = node.name.replace("mixamorig", "");
        map[name] = { bone: node as THREE.Bone, rest: node.quaternion.clone() };
      }
    });
    return map;
  }, [model]);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  const actions = useMemo(() => {
    const pick = (name: string) => {
      const clip = animations.find((a) => a.name === name);
      return clip ? mixer.clipAction(clip) : null;
    };
    return { idle: pick("idle"), walk: pick("walk") };
  }, [animations, mixer]);
  useEffect(() => {
    actions.idle?.play();
    actions.walk?.play();
    if (actions.walk) actions.walk.setEffectiveWeight(0);
    mixer.update(seed * 0.7);
    return () => {
      mixer.stopAllAction();
    };
  }, [actions, mixer, seed]);

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const goal = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const scratch = useMemo(() => ({ q: new THREE.Quaternion(), e: new THREE.Euler() }), []);
  const weights = useRef({ walk: 0, idle: 1, custom: 0 });

  useFrame(({ clock }, delta) => {
    if (!root.current || !body.current) return;
    const t = clock.elapsedTime + seed * 1.37;
    goal.current.set(...target);
    if (!initialized.current) {
      root.current.position.copy(goal.current);
      initialized.current = true;
    }
    root.current.position.lerp(goal.current, 1 - Math.exp(-delta * 3));
    let diff = heading - root.current.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    root.current.rotation.y += diff * (1 - Math.exp(-delta * 4));

    const animated = pose === "walk" || pose === "stand";
    const w = weights.current;
    const k = 1 - Math.exp(-delta * 5);
    w.walk += ((pose === "walk" ? 1 : 0) - w.walk) * k;
    w.idle += ((pose === "stand" ? 1 : 0) - w.idle) * k;
    w.custom += ((animated ? 0 : 1) - w.custom) * k;
    actions.walk?.setEffectiveWeight(w.walk);
    actions.idle?.setEffectiveWeight(Math.max(0.0001, w.idle));
    mixer.update(delta);

    // Body orientation per posture.
    let pitch = 0;
    let roll = 0;
    let lift = 0;
    if (pose === "translate") pitch = 1.3 + Math.sin(t * 1.6) * 0.04;
    if (pose === "neutral") pitch = -0.08 + Math.sin(t * 0.5) * 0.04;
    if (pose === "limp") {
      pitch = 0.4 + Math.sin(t * 0.25) * 0.25;
      roll = Math.sin(t * 0.18) * 0.5;
    }
    if (pose === "supine" || pose === "slumped") pitch = -1.5;
    if (pose === "down") {
      pitch = -1.5;
      lift = -0.85;
    }
    body.current.rotation.x += (pitch - body.current.rotation.x) * Math.min(1, delta * 3);
    body.current.rotation.z += (roll - body.current.rotation.z) * Math.min(1, delta * 2);
    body.current.position.y += (lift - body.current.position.y) * Math.min(1, delta * 3);
    if (pose === "neutral" || pose === "limp") body.current.position.y += Math.sin(t * 0.7) * 0.0006;

    // Skeleton postures blended over the clips.
    if (w.custom > 0.01) {
      const offsets = poses[pose] ?? poses.neutral;
      const swing = pose === "translate" ? Math.sin(t * 3) : pose === "neutral" ? Math.sin(t * 0.6) * 0.15 : 0;
      for (const name of POSED_BONES) {
        const entry = bones[name];
        if (!entry) continue;
        const [x, y, z] = offsets[name] ?? [0, 0, 0];
        let dx = x;
        let dy = y;
        if (pose === "translate" && name === "LeftArm") dy -= swing * 0.45;
        if (pose === "translate" && name === "RightArm") dy -= swing * 0.45;
        if (pose === "translate" && name.endsWith("ForeArm")) dy += (name.startsWith("Left") ? -1 : 1) * Math.max(0, swing * (name.startsWith("Left") ? 1 : -1)) * 0.6;
        if (pose === "neutral" && name.endsWith("UpLeg")) dx += swing;
        scratch.e.set(dx, dy, z);
        scratch.q.setFromEuler(scratch.e).premultiply(entry.rest);
        entry.bone.quaternion.slerp(scratch.q, w.custom);
      }
    }
  });

  const marker = status === "safe" ? "#4fb37a" : status === "down" ? "#e5533d" : status === "danger" ? "#f0a23b" : null;
  return (
    <group ref={root}>
      <group ref={body}>
        <primitive object={model} position={[0, -HIP_HEIGHT, 0]} />
        {outfit.helmet && (
          <mesh position={[0, 0.62, 0.02]}>
            <sphereGeometry args={[0.17, 24, 18]} />
            <meshPhysicalMaterial color="#eef3f5" roughness={0.05} transmission={0.6} transparent opacity={0.45} />
          </mesh>
        )}
      </group>
      {marker && (
        <mesh position={[0, 1.0, 0]}>
          <octahedronGeometry args={[0.07, 0]} />
          <meshBasicMaterial color={marker} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
