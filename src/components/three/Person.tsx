import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { createPortal, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Vec3 } from "./effects";
import { surface } from "./surfaces";

/**
 * Crew member built on a rigged, skinned human (Mixamo "X Bot", 1.81 m, from the
 * three.js examples). Walking and standing use motion-captured clips; postures
 * that have no capture are authored as clips on the same skeleton:
 * - neutral: NASA's microgravity "neutral body posture" (arms and legs half flexed).
 * - translate: moving head first in microgravity, reaching hand over hand.
 * - supine: lying back in an Apollo couch, knees raised.
 * - limp / down: unconscious, floating limp in orbit or lying in gravity.
 */
export type Pose = "neutral" | "translate" | "walk" | "stand" | "supine" | "limp" | "down" | "slumped" | "rise" | "tunnel";
export type Outfit = { suit: string; trim: string };
export type CrewRoute = {
  progress: number;
  halted?: boolean;
  sample: (progress: number) => { target: Vec3; pose: Pose };
};

const MODEL = "/models/crew.glb";
useGLTF.preload(MODEL);

type Offsets = Record<string, [number, number, number]>;
// Euler offsets (x, y, z) applied on the bind pose. Axes measured on the rig:
// UpLeg −X flexes the hip, Leg +X flexes the knee, Spine/Neck +X bend forward,
// LeftArm +Z raises / −Y swings forward (mirrored on the right arm).
const poses: Record<Exclude<Pose, "walk" | "stand">, Offsets> = {
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
    Spine: [0.08, 0, 0],
    Neck: [-0.45, 0, 0],
    LeftArm: [0, -1.05, -0.1],
    RightArm: [0, 1.05, 0.1],
    LeftForeArm: [0, -0.65, 0],
    RightForeArm: [0, 0.65, 0],
    LeftUpLeg: [-0.12, 0, -0.05],
    RightUpLeg: [-0.12, 0, 0.05],
    LeftLeg: [0.34, 0, 0],
    RightLeg: [0.34, 0, 0],
  },
  tunnel: {
    Spine: [0.06, 0, 0],
    Neck: [0.1, 0, 0],
    LeftArm: [0, -0.16, -1.48],
    RightArm: [0, 0.16, 1.48],
    LeftForeArm: [0, -0.34, 0],
    RightForeArm: [0, 0.34, 0],
    LeftUpLeg: [-0.28, 0, 0],
    RightUpLeg: [-0.28, 0, 0],
    LeftLeg: [0.38, 0, 0],
    RightLeg: [0.38, 0, 0],
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
  rise: {
    Spine: [0.3, 0, 0],
    Neck: [-0.18, 0, 0],
    LeftArm: [0, -0.55, -1.12],
    RightArm: [0, 0.55, 1.12],
    LeftForeArm: [0, -0.8, 0],
    RightForeArm: [0, 0.8, 0],
    LeftUpLeg: [-1.05, 0, 0],
    RightUpLeg: [-1.05, 0, 0],
    LeftLeg: [1.3, 0, 0],
    RightLeg: [1.3, 0, 0],
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
    LeftArm: [0, -0.3, -1.12],
    RightArm: [0, 0.3, 1.12],
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
export const CREW_HIP_HEIGHT = 1.04;
export const CREW_ROUTE_RATE = 0.48;
// Distance covered by one full walk cycle, estimated from the planted toes
// in the in-place capture. The model is measured in metres in the cabin.
const WALK_STRIDE = 1.55;
type Bones = Record<string, { bone: THREE.Bone; rest: THREE.Quaternion }>;
type Posture = keyof typeof poses;

function postureClip(pose: Posture, bones: Bones) {
  const frequency = pose === "translate" ? 2.6 : pose === "neutral" ? 0.85 : 0;
  const duration = frequency ? 2 * Math.PI / frequency : 1;
  const times = frequency ? Array.from({ length: 49 }, (_, index) => index * duration / 48) : [0];
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();

  const tracks = POSED_BONES.filter((name) => bones[name]).map((name) => {
    const { bone, rest } = bones[name];
    const [x, y, z] = poses[pose][name] ?? [0, 0, 0];
    const side = name.startsWith("Left") ? 1 : -1;
    const values = times.flatMap((time) => {
      const phase = time * frequency;
      const reach = side * Math.sin(phase);
      let pitch = x;
      let yaw = y;
      let roll = z;
      if (pose === "translate") {
        if (name === "LeftArm" || name === "RightArm") {
          yaw -= side * reach * 0.12;
          roll += side * reach * 0.17;
        }
        if (name.endsWith("ForeArm")) yaw += Math.sin(phase - 0.35) * 0.42;
        if (name === "Spine") roll += Math.sin(phase) * 0.09;
        if (name === "Neck") roll -= Math.sin(phase) * 0.06;
        if (name.endsWith("UpLeg")) pitch -= reach * 0.07;
        if (name.endsWith("Leg") && !name.endsWith("UpLeg")) pitch += reach * 0.08;
      }
      if (pose === "neutral") {
        if (name.endsWith("UpLeg")) pitch += Math.sin(phase) * 0.06;
        if (name.endsWith("ForeArm")) yaw += side * Math.sin(phase + 0.65) * 0.055;
        if (name === "Spine") pitch += Math.sin(phase - 0.4) * 0.035;
      }
      return rotation.setFromEuler(euler.set(pitch, yaw, roll)).premultiply(rest).toArray();
    });
    return new THREE.QuaternionKeyframeTrack(bone.name + ".quaternion", times, values);
  });
  return new THREE.AnimationClip(pose, duration, tracks);
}

export default function Person({
  target: destination,
  heading,
  pose: destinationPose,
  outfit,
  seed = 0,
  status = "ok",
  closedHatches = [],
  onRoot,
  route,
}: {
  target: Vec3;
  heading: number;
  pose: Pose;
  outfit: Outfit;
  seed?: number;
  status?: "ok" | "watch" | "danger" | "safe" | "down";
  closedHatches?: readonly number[];
  onRoot?: (node: THREE.Group | null) => void;
  route?: CrewRoute;
}) {
  const { scene, animations } = useGLTF(MODEL);
  const model = useMemo(() => {
    const object = cloneSkinned(scene) as THREE.Object3D;
    object.traverse((node) => {
      const mesh = node as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      const source = mesh.material as THREE.MeshStandardMaterial;
      const joints = source.name.includes("Joints");
      const material = new THREE.MeshStandardMaterial({
        ...surface("fabric"),
        color: joints ? outfit.trim : outfit.suit,
        roughness: joints ? 0.7 : 1,
        bumpScale: joints ? 0.0015 : 0.0035,
      });
      mesh.material = material;
    });
    return object;
  }, [scene, outfit.suit, outfit.trim]);
  useEffect(() => () => {
    model.traverse((node) => {
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) (node as THREE.SkinnedMesh<THREE.BufferGeometry, THREE.Material>).material.dispose();
    });
  }, [model]);
  const bones = useMemo(() => {
    const map: Bones = {};
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
    const clips = [
      ...Object.keys(poses).map((name) => postureClip(name as Posture, bones)),
      ...animations.filter(({ name }) => name === "idle" || name === "walk"),
    ];
    return clips.map((clip) => ({
      pose: clip.name === "idle" ? "stand" : clip.name,
      action: mixer.clipAction(clip),
    }));
  }, [animations, bones, mixer]);
  const initialPose = useRef(destinationPose);
  initialPose.current = destinationPose === "walk" ? "stand" : destinationPose === "translate" ? "neutral" : destinationPose;
  useLayoutEffect(() => {
    for (const { pose: actionPose, action } of actions) {
      action.reset().setEffectiveWeight(actionPose === initialPose.current ? 1 : 0).play();
      action.time = (seed * 0.7) % action.getClip().duration;
    }
    mixer.update(0);
    return () => { mixer.stopAllAction(); };
  }, [actions, mixer, seed]);

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const travel = useMemo(() => new THREE.Vector3(), []);
  const initialized = useRef(false);
  const facing = useRef(heading);
  const progress = useRef(route?.progress ?? 0);

  useFrame(({ clock }, delta) => {
    const actor = root.current;
    if (!actor || !body.current) return;
    const t = clock.elapsedTime + seed * 1.37;
    let target = destination;
    let pose = destinationPose;
    if (route) {
      if (!route.halted) {
        progress.current += THREE.MathUtils.clamp(route.progress - progress.current, -delta * CREW_ROUTE_RATE, delta * CREW_ROUTE_RATE);
      }
      ({ target, pose } = route.sample(progress.current));
    }
    const grounded = pose === "walk" || pose === "stand";
    const floating = pose === "translate" || pose === "neutral";
    const mobile = grounded || floating;
    // A timeline jump across a now-closed hatch changes the visible compartment.
    const changedCompartment = closedHatches.some((x) =>
      (actor.position.x < x) !== (target[0] < x) || Math.abs(actor.position.x - x) < 1.07,
    );
    if (!initialized.current || changedCompartment) {
      actor.position.set(...target);
      actor.rotation.y = heading;
      facing.current = heading;
      initialized.current = true;
    }

    // Advance toward the latest simulation sample at a pace the stride can follow.
    travel.set(...target).sub(actor.position);
    if (!route) {
      travel.multiplyScalar(1 - Math.exp(-delta * 4));
      travel.clampLength(0, (grounded ? 1.55 : floating ? 1.1 : 0.8) * delta);
    }
    actor.position.add(travel);
    const horizontalTravel = Math.hypot(travel.x, travel.z);
    const distance = grounded ? horizontalTravel : travel.length();
    const speed = delta > 0 ? distance / delta : 0;
    if (mobile && horizontalTravel > 0.09 * delta) facing.current = Math.atan2(travel.x, travel.z);
    if (pose === "supine" || pose === "slumped" || pose === "rise") facing.current = heading;
    const turn = facing.current - actor.rotation.y;
    actor.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * (1 - Math.exp(-delta * 7));

    const motion = THREE.MathUtils.smoothstep(speed, 0.04, grounded ? 0.65 : 0.5);
    const movingPose = grounded ? "walk" : "translate";
    const restingPose = grounded ? "stand" : "neutral";
    // Crossfade mixer actions from their current weights, including on interruption.
    const blend = 1 - Math.exp(-delta * 7);
    let pitch = 0;
    let roll = 0;
    let lift = 0;
    for (const { pose: actionPose, action } of actions) {
      const targetWeight = mobile
        ? actionPose === movingPose ? motion : actionPose === restingPose ? 1 - motion : 0
        : Number(actionPose === pose);
      const weight = THREE.MathUtils.lerp(action.getEffectiveWeight(), targetWeight, blend);
      action.setEffectiveWeight(weight);
      if (actionPose === "walk") {
        // Advance a fraction of the cycle per metre travelled, so paused crews settle into idle.
        action.setEffectiveTimeScale(grounded ? speed * action.getClip().duration / WALK_STRIDE : 0);
      }
      if (actionPose === "translate") {
        pitch += weight * 1.26;
        roll += weight * Math.sin(action.time * 2.6) * 0.05;
      }
      if (actionPose === "neutral") {
        pitch += weight * (-0.08 + Math.sin(t * 0.5) * 0.04);
        lift += weight * Math.sin(t * 0.7) * 0.025;
      }
      if (actionPose === "limp") {
        pitch += weight * 0.25;
      }
      if (actionPose === "supine" || actionPose === "slumped" || actionPose === "down") pitch -= weight * 1.5;
      if (actionPose === "rise") pitch -= weight * 0.32;
      if (actionPose === "down") lift -= weight * 0.88;
    }
    mixer.update(delta);
    body.current.rotation.x = pitch;
    body.current.rotation.z = roll;
    body.current.position.y = lift;
  });

  const marker = status === "safe" ? "#4fb37a" : status === "down" ? "#e5533d" : status === "danger" ? "#f0a23b" : null;
  return (
    <group ref={(node) => {
      root.current = node;
      onRoot?.(node);
    }}>
      <group ref={body}>
        <primitive object={model} position={[0, -CREW_HIP_HEIGHT, 0]} />
        {bones.Spine2 && createPortal(
          <group>
            <mesh position={[0, 2, 13]} castShadow>
              <boxGeometry args={[23, 14, 5]} />
              <meshStandardMaterial color="#d8dfe2" roughness={0.65} />
            </mesh>
            <mesh position={[0, 2, 15.6]}>
              <boxGeometry args={[16, 7, 0.6]} />
              <meshStandardMaterial color="#263743" roughness={0.5} />
            </mesh>
            <mesh position={[-4, 2, 16]}>
              <boxGeometry args={[4, 2, 0.5]} />
              <meshStandardMaterial color="#7ebac8" emissive="#39798b" emissiveIntensity={0.5} />
            </mesh>
          </group>,
          bones.Spine2.bone,
        )}
        {bones.Head && createPortal(
          <group position={[0, 9, 2]}>
            <mesh castShadow scale={[1, 1.06, 1]}>
              <sphereGeometry args={[15, 32, 24]} />
              <meshStandardMaterial color={outfit.suit} roughness={0.5} metalness={0.15} />
            </mesh>
            <mesh position={[0, 0, 9]} scale={[1, 0.88, 0.58]}>
              <sphereGeometry args={[13, 32, 24]} />
              <meshPhysicalMaterial color="#304958" roughness={0.2} metalness={0.45} clearcoat={1} />
            </mesh>
            <mesh position={[0, -12, -1]}>
              <cylinderGeometry args={[11, 12.5, 4, 32]} />
              <meshStandardMaterial color={outfit.trim} roughness={0.4} metalness={0.4} />
            </mesh>
          </group>,
          bones.Head.bone,
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
