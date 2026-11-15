import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
  Stars,
} from "@react-three/drei";
import * as THREE from "three";
import {
  scenarioInfo,
  type ScenarioId,
  type SimConfig,
  type SimFrame,
} from "../lib/simulation";

/*
 * Reconstrucciones a escala a partir de dimensiones publicadas (metros):
 * - Mir 1997: bloque base 13,1 m × 4,15 m; Kvant-1 5,8 m; Kvant-2 12,4 m;
 *   Kristall 11,9 m; Spektr 14,4 m; Priroda 11,6 m; Soyuz TM 7,0 m.
 * - Apollo: módulo de mando Ø 3,9 m × 3,2 m; módulo de servicio Ø 3,9 m × 7,5 m
 *   con tobera; módulo lunar 4,2 m de ancho (etapa de descenso) y 7 m de alto.
 * La disposición interior es esquemática.
 */

type Vec3 = [number, number, number];
type Props = {
  scenario: ScenarioId;
  frame: SimFrame;
  cutaway: boolean;
  config: SimConfig;
};

const textureCache = new Map<string, THREE.Texture>();
function canvasTexture(key: string, draw: (c: CanvasRenderingContext2D, size: number) => void, size = 128) {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d")!, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, texture);
  return texture;
}
const softDot = () =>
  canvasTexture("soft", (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
  });
const solarCells = (tint: string) =>
  canvasTexture(`solar-${tint}`, (c, s) => {
    c.fillStyle = "#c9ccd0";
    c.fillRect(0, 0, s, s);
    const n = 8;
    const cell = s / n;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        c.fillStyle = (i + j) % 5 === 0 ? tint : shade(tint, -8);
        c.fillRect(i * cell + 1.5, j * cell + 1.5, cell - 3, cell - 3);
      }
  });
const foil = () =>
  canvasTexture("foil", (c, s) => {
    c.fillStyle = "#e0b45a";
    c.fillRect(0, 0, s, s);
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * s;
      const y = Math.random() * s;
      const r = 6 + Math.random() * 22;
      const v = 170 + Math.floor(Math.random() * 80);
      c.fillStyle = `rgba(${v + 20},${v - 25},${Math.max(30, v - 140)},0.55)`;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + r, y + Math.random() * r);
      c.lineTo(x + Math.random() * r, y + r);
      c.fill();
    }
  }, 256);
const blanket = (base: string) =>
  canvasTexture(`blanket-${base}`, (c, s) => {
    c.fillStyle = base;
    c.fillRect(0, 0, s, s);
    c.strokeStyle = shade(base, -18);
    c.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      c.beginPath();
      c.moveTo(0, (i * s) / 4);
      c.lineTo(s, (i * s) / 4);
      c.stroke();
    }
    for (let i = 0; i < 40; i++) {
      c.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
      c.fillRect(Math.random() * s, Math.random() * s, 20 + Math.random() * 40, 3 + Math.random() * 10);
    }
  });
function shade(hex: string, amount: number) {
  const value = parseInt(hex.slice(1), 16);
  const clampByte = (n: number) => Math.max(0, Math.min(255, n));
  const r = clampByte((value >> 16) + amount);
  const g = clampByte(((value >> 8) & 255) + amount);
  const b = clampByte((value & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** A hull section along +X. In cutaway mode the shell becomes a translucent "ghost". */
function Hull({
  from,
  to,
  r1,
  r2 = r1,
  color = "#d9dcd6",
  ghost = false,
  map,
  segments = 40,
}: {
  from: number;
  to: number;
  r1: number;
  r2?: number;
  color?: string;
  ghost?: boolean;
  map?: THREE.Texture;
  segments?: number;
}) {
  const length = Math.abs(to - from);
  return (
    <mesh position={[(from + to) / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow={!ghost} receiveShadow>
      <cylinderGeometry args={[r2, r1, length, segments, 1, ghost]} />
      <meshStandardMaterial
        color={color}
        map={ghost ? undefined : map}
        metalness={0.25}
        roughness={0.62}
        transparent={ghost}
        opacity={ghost ? 0.13 : 1}
        depthWrite={!ghost}
        side={ghost ? THREE.DoubleSide : THREE.FrontSide}
      />
    </mesh>
  );
}

function RingFrame({ x, r, color = "#8f979b" }: { x: number; r: number; color?: string }) {
  return (
    <mesh position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[r, 0.06, 6, 40]} />
      <meshStandardMaterial color={color} metalness={0.7} roughness={0.35} />
    </mesh>
  );
}

/** Solar wing hanging from its root along +Z (rotate group to orient). */
function SolarWing({
  length,
  width,
  tint = "#1f2f5f",
  segments = 1,
}: {
  length: number;
  width: number;
  tint?: string;
  segments?: number;
}) {
  const texture = solarCells(tint);
  const panel = useMemo(() => {
    const t = texture.clone();
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(width / 1.2, length / segments / 1.2);
    t.needsUpdate = true;
    return t;
  }, [texture, width, length, segments]);
  const gap = 0.12;
  const piece = (length - gap * (segments - 1)) / segments;
  return (
    <group>
      <mesh position={[0, 0, length / 2]}>
        <boxGeometry args={[0.07, 0.07, length]} />
        <meshStandardMaterial color="#9aa1a5" metalness={0.8} roughness={0.3} />
      </mesh>
      {Array.from({ length: segments }, (_, index) => (
        <mesh key={index} position={[0, 0, piece / 2 + index * (piece + gap) + 0.15]} castShadow>
          <boxGeometry args={[width, 0.035, piece]} />
          <meshStandardMaterial map={panel} metalness={0.55} roughness={0.32} />
        </mesh>
      ))}
    </group>
  );
}

function Dish({ radius = 0.6, color = "#d9dcd6" }: { radius?: number; color?: string }) {
  return (
    <group>
      <mesh rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[radius, 24, 8, 0, Math.PI * 2, 0, 0.6]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -radius * 0.55, 0]}>
        <cylinderGeometry args={[0.025, 0.025, radius * 0.7, 6]} />
        <meshStandardMaterial color="#9aa1a5" />
      </mesh>
    </group>
  );
}

function Lattice({ length, width = 0.5 }: { length: number; width?: number }) {
  const bays = Math.max(2, Math.round(length / width));
  const step = length / bays;
  const members: { p: Vec3; s: Vec3; r?: Vec3 }[] = [];
  for (const x of [-1, 1])
    for (const z of [-1, 1]) members.push({ p: [(x * width) / 2, length / 2, (z * width) / 2], s: [0.04, length, 0.04] });
  for (let i = 0; i <= bays; i++) {
    members.push({ p: [0, i * step, width / 2], s: [width, 0.03, 0.03] });
    members.push({ p: [0, i * step, -width / 2], s: [width, 0.03, 0.03] });
    members.push({ p: [width / 2, i * step, 0], s: [0.03, 0.03, width] });
    members.push({ p: [-width / 2, i * step, 0], s: [0.03, 0.03, width] });
    if (i < bays) {
      const diag = Math.hypot(step, width);
      const angle = Math.atan2(width, step);
      members.push({ p: [0, i * step + step / 2, width / 2], s: [0.025, diag, 0.025], r: [0, 0, i % 2 ? angle : -angle] });
      members.push({ p: [0, i * step + step / 2, -width / 2], s: [0.025, diag, 0.025], r: [0, 0, i % 2 ? -angle : angle] });
    }
  }
  return (
    <group>
      {members.map((member, index) => (
        <mesh key={index} position={member.p} rotation={member.r ?? [0, 0, 0]}>
          <boxGeometry args={member.s} />
          <meshStandardMaterial color="#b8bcbd" metalness={0.75} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

/* --------------------------------------------------------------- effects */

type FireMode = "jet" | "micro" | "buoyant" | "vent";

function Fire({
  position,
  intensity,
  mode,
  direction = [1, 0, 0],
  flow = 0,
}: {
  position: Vec3;
  intensity: number;
  mode: FireMode;
  direction?: Vec3;
  flow?: number;
}) {
  const group = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const sparks = useRef<THREE.Points>(null);
  const dot = softDot();
  const dir = useMemo(() => new THREE.Vector3(...direction).normalize(), [direction]);
  const sparkData = useMemo(() => {
    const count = 70;
    const positions = new Float32Array(count * 3);
    const seeds = Array.from({ length: count }, (_, i) => ({
      phase: (i * 0.618) % 1,
      spread: new THREE.Vector3(Math.sin(i * 12.9), Math.cos(i * 4.1), Math.sin(i * 7.7)).multiplyScalar(0.35),
    }));
    return { positions, seeds };
  }, []);
  const strength = Math.min(intensity, 1.5);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) {
      const flicker = 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 7.3) * 0.05;
      group.current.scale.setScalar(Math.max(0.05, strength) * flicker);
    }
    if (light.current) light.current.intensity = 6 * strength * (0.85 + Math.sin(t * 17) * 0.15);
    if (sparks.current && (mode === "jet" || mode === "vent")) {
      const { positions, seeds } = sparkData;
      const reach = mode === "vent" ? 3.2 : 1.6;
      seeds.forEach((seed, i) => {
        const life = (t * (mode === "vent" ? 0.55 : 0.9) + seed.phase) % 1;
        const along = dir.clone().multiplyScalar(life * reach);
        const spread = seed.spread.clone().multiplyScalar(life * (mode === "vent" ? 2.2 : 1));
        positions[i * 3] = along.x + spread.x;
        positions[i * 3 + 1] = along.y + spread.y - (mode === "jet" ? 0 : 0);
        positions[i * 3 + 2] = along.z + spread.z;
      });
      sparks.current.geometry.attributes.position.needsUpdate = true;
      (sparks.current.material as THREE.PointsMaterial).opacity = Math.min(1, strength * 1.2);
    }
  });
  if (intensity < 0.03) return null;

  // Flame "puffs" laid out according to the regime.
  const puffs: { p: Vec3; s: number; color: string; o: number }[] = [];
  if (mode === "buoyant") {
    // Normal gravity: hot gas rises, flame becomes a tall flickering teardrop.
    for (let i = 0; i < 6; i++)
      puffs.push({ p: [0, i * 0.17, 0], s: 0.55 - i * 0.07, color: i < 2 ? "#ffe39a" : "#ff8a2a", o: 0.75 - i * 0.08 });
    puffs.push({ p: [0, -0.04, 0], s: 0.26, color: "#6aa8ff", o: 0.5 });
  } else if (mode === "micro") {
    // Microgravity: no buoyancy, a dim round flame, bluish because there is less soot.
    // Air flow stretches it downstream.
    const stretch = Math.min(flow / 0.2, 1);
    puffs.push({ p: [0, 0, 0], s: 0.62, color: "#3d7dff", o: 0.5 });
    puffs.push({ p: [stretch * 0.25, 0, 0], s: 0.42, color: "#ffb15a", o: 0.38 });
    puffs.push({ p: [stretch * 0.5, 0, 0], s: 0.3 + stretch * 0.1, color: "#ff8a2a", o: 0.25 * stretch });
  } else if (mode === "jet") {
    // Mir's oxygen candle: a torch-like jet with molten sparks.
    for (let i = 0; i < 6; i++) {
      const d = dir.clone().multiplyScalar(i * 0.22);
      puffs.push({ p: [d.x, d.y, d.z], s: 0.24 + i * 0.05, color: i < 2 ? "#fff2c4" : "#ff9a3a", o: 0.85 - i * 0.1 });
    }
  } else {
    puffs.push({ p: [0, 0, 0], s: 0.5, color: "#ffd9a8", o: 0.6 });
  }

  return (
    <group position={position}>
      <pointLight ref={light} color={mode === "micro" ? "#8fb4ff" : "#ff8a3d"} distance={6} decay={2} />
      <group ref={group}>
        <sprite scale={[2.2, 2.2, 1]}>
          <spriteMaterial map={dot} color={mode === "micro" ? "#335cff" : "#ff6a1a"} transparent opacity={0.28} depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
        {puffs.map((puff, index) => (
          <sprite key={index} position={puff.p} scale={[puff.s, puff.s * (mode === "buoyant" ? 1.4 : 1), 1]}>
            <spriteMaterial map={dot} color={puff.color} transparent opacity={puff.o} depthWrite={false} blending={THREE.AdditiveBlending} />
          </sprite>
        ))}
      </group>
      {(mode === "jet" || mode === "vent") && (
        <points ref={sparks}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[sparkData.positions, 3]} />
          </bufferGeometry>
          <pointsMaterial
            map={dot}
            opacity={0.8}
            size={mode === "vent" ? 0.28 : 0.09}
            color={mode === "vent" ? "#e8f3ff" : "#ffc266"}
            transparent
            depthWrite={false}
            blending={mode === "vent" ? THREE.NormalBlending : THREE.AdditiveBlending}
          />
        </points>
      )}
    </group>
  );
}

/** Drifting smoke inside a cylindrical compartment along X. */
function Smoke({
  amount,
  center,
  length,
  radius,
  tint = "#8b8e8f",
}: {
  amount: number;
  center: Vec3;
  length: number;
  radius: number;
  tint?: string;
}) {
  const ref = useRef<THREE.Points>(null);
  const dot = softDot();
  const data = useMemo(() => {
    const count = 140;
    const base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = i * 2.39996;
      const rr = Math.sqrt(((i * 0.618) % 1)) * radius * 0.85;
      base[i * 3] = (((i * 0.37) % 1) - 0.5) * length * 0.92;
      base[i * 3 + 1] = Math.sin(a) * rr;
      base[i * 3 + 2] = Math.cos(a) * rr;
    }
    return { base, live: new Float32Array(base) };
  }, [length, radius]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * 0.25;
    const { base, live } = data;
    for (let i = 0; i < base.length; i += 3) {
      live[i] = base[i] + Math.sin(t + i) * 0.12;
      live[i + 1] = base[i + 1] + Math.sin(t * 1.3 + i * 0.7) * 0.1;
      live[i + 2] = base[i + 2] + Math.cos(t * 0.9 + i * 0.3) * 0.1;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });
  if (amount < 1) return null;
  return (
    <points ref={ref} position={center}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.live, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={dot}
        size={radius * 1.3}
        color={tint}
        transparent
        opacity={Math.min(0.08 + (amount / 100) * 0.55, 0.62)}
        depthWrite={false}
      />
    </points>
  );
}

/** Simple crew figure. Floats tilted in microgravity, stands or sits in 1 g. */
function Astronaut({
  position,
  safe,
  pose,
  index,
  scale = 1,
}: {
  position: Vec3;
  safe: boolean;
  pose: "float" | "seated" | "stand";
  index: number;
  scale?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (ref.current && pose === "float") {
      ref.current.rotation.z = 0.35 + Math.sin(clock.elapsedTime * 0.6 + index) * 0.12;
      ref.current.position.y = position[1] + Math.sin(clock.elapsedTime * 0.8 + index * 1.7) * 0.04;
    }
  });
  const suit = safe ? "#c6ed9c" : "#eef0ea";
  const legs: Vec3 = pose === "seated" ? [0.42, -0.28, 0] : [0, -0.45, 0];
  return (
    <group ref={ref} position={position} scale={scale} rotation={pose === "seated" ? [0, 0, -0.9] : [0, index * 0.8, 0]}>
      <mesh castShadow>
        <capsuleGeometry args={[0.13, 0.32, 4, 10]} />
        <meshStandardMaterial color={suit} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.34, 0]}>
        <sphereGeometry args={[0.11, 14, 12]} />
        <meshStandardMaterial color="#e3c7a8" roughness={0.6} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[legs[0], legs[1], side * 0.07]} rotation={[0, 0, pose === "seated" ? Math.PI / 2 : 0]}>
          <capsuleGeometry args={[0.05, 0.36, 4, 8]} />
          <meshStandardMaterial color={suit} roughness={0.7} />
        </mesh>
      ))}
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0.02, 0.06, side * 0.17]} rotation={[side * 0.25, 0, 0.2]}>
          <capsuleGeometry args={[0.04, 0.26, 4, 8]} />
          <meshStandardMaterial color={suit} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

const levelColor: Record<string, string> = { ok: "#c6ed9c", watch: "#f0c674", danger: "#f08a6c" };
/** Canvas-sprite label: always faces the camera and stays readable. */
function Label({
  position,
  name,
  detail,
  level,
  k = 1,
}: {
  position: Vec3;
  name: string;
  detail: string;
  level: string;
  k?: number;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 160;
    const c = canvas.getContext("2d")!;
    c.font = "600 46px 'DM Sans', sans-serif";
    const width = Math.min(620, Math.max(c.measureText(name).width, (c.font = "400 38px 'DM Sans', sans-serif", c.measureText(detail).width)) + 110);
    c.fillStyle = "rgba(11,20,27,0.9)";
    c.strokeStyle = "#3a4a55";
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(4, 4, width - 8, 152, 22);
    c.fill();
    c.stroke();
    c.fillStyle = levelColor[level] ?? levelColor.ok;
    c.beginPath();
    c.arc(46, 80, 13, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#eef3f1";
    c.font = "600 46px 'DM Sans', sans-serif";
    c.fillText(name, 80, 66, 530);
    c.fillStyle = "#a9bac4";
    c.font = "400 38px 'DM Sans', sans-serif";
    c.fillText(detail, 80, 118, 530);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
  }, [name, detail, level]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[1.6 * k, 0.4 * k, 1]} center={new THREE.Vector2(0.5, 0)} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

/** Interpolates a crew position (0..2) along three interior anchor points. */
function along(anchors: Vec3[], value: number): Vec3 {
  const i = Math.min(Math.floor(value), anchors.length - 2);
  const t = value - i;
  const a = anchors[i];
  const b = anchors[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function Crew({
  frame,
  anchors,
  pose,
  spread = 0.45,
  scale = 1,
}: {
  frame: SimFrame;
  anchors: Vec3[];
  pose: "float" | "seated" | "stand";
  spread?: number;
  scale?: number;
}) {
  return (
    <>
      {frame.crew.map((value, index) => {
        const base = along(anchors, value);
        const offset = (index - (frame.crew.length - 1) / 2) * spread;
        return (
          <Astronaut
            key={index}
            index={index}
            pose={pose}
            safe={value >= 2}
            scale={scale}
            position={[base[0] + (value % 1 ? 0 : offset * 0.8), base[1], base[2] + (value % 1 ? 0 : offset * 0.35)]}
          />
        );
      })}
    </>
  );
}

/* --------------------------------------------------------------- vehicles */

function Soyuz({ ghost = false, blocked = false }: { ghost?: boolean; blocked?: boolean }) {
  // Docking end at x = 0, extends toward −X. Orbital module · descent module · service module.
  const green = blanket("#6f7d5c");
  return (
    <group>
      <mesh position={[-1.15, 0, 0]} scale={[1.2, 1, 1]} castShadow>
        <sphereGeometry args={[1.12, 32, 20]} />
        <meshStandardMaterial color="#7c8a66" map={green} roughness={0.85} transparent={ghost} opacity={ghost ? 0.25 : 1} />
      </mesh>
      <Hull from={-2.4} to={-4.5} r1={0.6} r2={1.08} color="#6f7d5c" map={green} ghost={ghost} />
      <Hull from={-4.5} to={-4.65} r1={1.1} color="#3a3330" />
      <Hull from={-4.65} to={-7.0} r1={1.36} color="#c9cbc4" ghost={ghost} />
      <Hull from={-6.6} to={-7.0} r1={1.45} r2={1.36} color="#8f969a" />
      {[-1, 1].map((side) => (
        <group key={side} position={[-6.0, 0, side * 1.35]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <SolarWing length={4.2} width={1.15} tint="#25335a" segments={4} />
        </group>
      ))}
      <mesh position={[-0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.38, 0.45, 0.3, 20]} />
        <meshStandardMaterial color="#9aa1a5" metalness={0.7} roughness={0.35} />
      </mesh>
      {blocked && (
        <mesh position={[-3.5, 1.7, 0]}>
          <torusGeometry args={[0.3, 0.05, 8, 24]} />
          <meshBasicMaterial color="#ff8a5a" />
        </mesh>
      )}
    </group>
  );
}

function RadialModule({
  length,
  radius = 2.17,
  arrays = 0,
  tint = "#1f2f5f",
}: {
  length: number;
  radius?: number;
  arrays?: number;
  tint?: string;
}) {
  // Built along +X from the node port.
  const white = blanket("#d9dbd4");
  return (
    <group>
      <Hull from={0} to={1.4} r1={0.8} r2={1.3} map={white} />
      <Hull from={1.4} to={length * 0.55} r1={1.45} map={white} />
      <Hull from={length * 0.55} to={length * 0.62} r1={1.45} r2={radius} map={white} />
      <Hull from={length * 0.62} to={length} r1={radius} map={white} />
      <RingFrame x={length * 0.62} r={radius} />
      <RingFrame x={length} r={radius * 0.9} />
      {Array.from({ length: arrays }, (_, i) => {
        const angle = (i / arrays) * Math.PI * 2 + Math.PI / 2;
        return (
          <group key={i} position={[length * 0.8, Math.sin(angle) * radius, Math.cos(angle) * radius]} rotation={[-angle + Math.PI / 2, 0, 0]}>
            <group rotation={[Math.PI / 2, 0, 0]}>
              <SolarWing length={arrays > 2 ? 7 : 9} width={2.6} tint={tint} segments={6} />
            </group>
          </group>
        );
      })}
    </group>
  );
}

function Mir({ frame, cutaway, config }: Props) {
  // 1 unit = 1 m; the group is scaled to fit. Core runs along +X from x = 0.
  const white = blanket("#dcdcd2");
  const ghost = cutaway;
  const coreFloor: Vec3 = [4.5, -0.6, 0];
  const anchors: Vec3[] = [
    [-2.9, -0.4, 0], // Kvant-1
    [4.2, -0.4, 0], // Core
    [16.2, 0, 0], // forward Soyuz
  ];
  const [kvant, core, soyuz] = frame.modules;
  return (
    <group scale={0.2} position={[-0.5, 0.2, 0.5]} rotation={[0, 0.67, 0]}>
      {/* Base block */}
      <Hull from={0} to={6.4} r1={2.07} map={white} ghost={ghost} />
      <Hull from={6.4} to={7.6} r1={2.07} r2={1.45} map={white} ghost={ghost} />
      <Hull from={7.6} to={11.6} r1={1.45} map={white} ghost={ghost} />
      <RingFrame x={0} r={2.07} />
      <RingFrame x={6.4} r={2.07} />
      {/* Docking node with five ports */}
      <mesh position={[12.7, 0, 0]} castShadow>
        <sphereGeometry args={[1.1, 32, 24]} />
        <meshStandardMaterial color="#cfd1ca" metalness={0.3} roughness={0.6} transparent={ghost} opacity={ghost ? 0.3 : 1} />
      </mesh>
      {/* Core solar arrays */}
      {[-1, 1].map((side) => (
        <group key={side} position={[3.5, 1.2, side * 2.07]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <SolarWing length={11.5} width={3.4} tint="#2a2f6a" segments={8} />
        </group>
      ))}
      <group position={[9.5, 1.5, 0]}>
        <Dish radius={0.55} />
      </group>
      {/* Kvant-1 */}
      <Hull from={-5.8} to={0} r1={2.07} map={white} ghost={ghost} />
      <RingFrame x={-5.8} r={2.07} />
      {/* Sofora truss on Kvant-1 */}
      <group position={[-3, 2.07, 0]}>
        <Lattice length={14} width={0.7} />
        <mesh position={[0, 14.4, 0]}>
          <boxGeometry args={[1.1, 0.9, 1.1]} />
          <meshStandardMaterial color="#c8c9c2" map={white} />
        </mesh>
      </group>
      {/* Soyuz behind Kvant-1: the one blocked by the fire in 1997 */}
      <group position={[-5.8, 0, 0]}>
        <Soyuz blocked={frame.fireIntensity > 0.1} />
      </group>
      {/* Forward Soyuz on the node: the available escape vehicle */}
      <group position={[13.8, 0, 0]} rotation={[0, Math.PI, 0]}>
        <Soyuz ghost={ghost} />
      </group>
      {/* Radial modules: Kvant-2 (up), Kristall (down), Spektr (+Z), Priroda (−Z) */}
      <group position={[12.7, 1.1, 0]} rotation={[0, 0, Math.PI / 2]}>
        <RadialModule length={12.4} arrays={2} />
      </group>
      <group position={[12.7, -1.1, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <RadialModule length={11.9} arrays={2} tint="#283160" />
        <group position={[12.6, 0, 0]}>
          <Hull from={0} to={4.7} r1={1.1} color="#cfcfc8" />
        </group>
      </group>
      <group position={[12.7, 0, 1.1]} rotation={[0, -Math.PI / 2, 0]}>
        <RadialModule length={14.4} arrays={4} tint="#2c2a5c" />
      </group>
      <group position={[12.7, 0, -1.1]} rotation={[0, Math.PI / 2, 0]}>
        <RadialModule length={11.6} />
      </group>

      {cutaway && (
        <>
          {/* Interior floor, equipment racks and the oxygen candle (SFOG) */}
          <mesh position={coreFloor} receiveShadow>
            <boxGeometry args={[10.5, 0.08, 2.4]} />
            <meshStandardMaterial color="#6b7a74" roughness={0.8} />
          </mesh>
          {Array.from({ length: 6 }, (_, i) => (
            <mesh key={i} position={[0.9 + i * 1.6, 0.2, -1.35]}>
              <boxGeometry args={[1.3, 1.6, 0.6]} />
              <meshStandardMaterial color={i % 2 ? "#a7b0a6" : "#c4c8bd"} roughness={0.7} />
            </mesh>
          ))}
          <mesh position={[-4.6, -0.9, -1.2]}>
            <boxGeometry args={[0.5, 0.8, 0.5]} />
            <meshStandardMaterial color="#6f6f66" metalness={0.5} />
          </mesh>
          <Smoke amount={kvant.smoke} center={[-2.9, 0, 0]} length={5.6} radius={1.9} tint="#7d756d" />
          <Smoke amount={core.smoke} center={[5.5, 0, 0]} length={11} radius={1.7} />
          <Smoke amount={soyuz.smoke} center={[16.6, 0, 0]} length={2.2} radius={1.0} />
          <Crew frame={frame} anchors={anchors} pose="float" spread={0.9} scale={4.5} />
          <Label k={6.5} position={[-2.9, 3.6, 0]} name={kvant.name} detail={kvant.visibility} level={kvant.level} />
          <Label k={6.5} position={[5, 3.2, 0]} name={core.name} detail={core.visibility} level={core.level} />
          <Label k={6.5} position={[16.4, 2.5, 0]} name={`${soyuz.name} (escape)`} detail={soyuz.visibility} level={soyuz.level} />
          <Label k={6.5} position={[-10, 2.6, 0]} name="Soyuz bloqueada" detail="Detrás del fuego" level="danger" />
        </>
      )}
      <Fire position={[-4.6, -0.4, -1.1]} intensity={frame.fireIntensity} mode="jet" direction={[0.6, 0.3, 1]} />
      {config.isolation && frame.time >= 30 && (
        <mesh position={[0.05, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.55, 24]} />
          <meshStandardMaterial color="#c6ed9c" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/** Apollo command module, apex toward +Y, heat shield at y = 0. */
function CommandModule({ ghost = false, hatchOpen = false }: { ghost?: boolean; hatchOpen?: boolean }) {
  const profile = useMemo(
    () =>
      [
        [0.0, 0.0],
        [1.95, 0.25],
        [1.95, 0.42],
        [0.62, 3.0],
        [0.5, 3.05],
        [0.5, 3.4],
        [0.0, 3.4],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    [],
  );
  const shield = useMemo(
    () =>
      Array.from({ length: 9 }, (_, i) => {
        const t = i / 8;
        return new THREE.Vector2(1.97 * t, -0.22 + 0.24 * t * t);
      }),
    [],
  );
  return (
    <group>
      <mesh castShadow>
        <latheGeometry args={[profile, 48]} />
        <meshStandardMaterial
          color="#dfe2e1"
          metalness={ghost ? 0.2 : 0.85}
          roughness={0.22}
          transparent={ghost}
          opacity={ghost ? 0.16 : 1}
          depthWrite={!ghost}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh>
        <latheGeometry args={[shield, 48]} />
        <meshStandardMaterial color="#6b4f3a" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* Windows */}
      {[-0.55, 0.55].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 1.25, 1.95, Math.cos(a) * 1.25]} rotation={[-0.6, a, 0]}>
          <planeGeometry args={[0.32, 0.26]} />
          <meshStandardMaterial color="#10202a" metalness={0.9} roughness={0.1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Side hatch */}
      <mesh position={[0, 1.55, 1.48]} rotation={[-0.55, hatchOpen ? 0.9 : 0, 0]}>
        <planeGeometry args={[0.8, 0.75]} />
        <meshStandardMaterial color={hatchOpen ? "#c6ed9c" : "#8a8f90"} metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* Docking probe */}
      <mesh position={[0, 3.62, 0]}>
        <coneGeometry args={[0.15, 0.45, 12]} />
        <meshStandardMaterial color="#9aa1a5" metalness={0.8} />
      </mesh>
    </group>
  );
}

/** Service module below the CM. Optional bay 4 damage (Apollo 13). */
function ServiceModule({ damaged = false }: { damaged?: boolean }) {
  const bay = damaged ? Math.PI / 3 : 0;
  return (
    <group>
      <mesh position={[0, -2.35, 0]} castShadow>
        <cylinderGeometry args={[1.96, 1.96, 4.4, 48, 1, damaged, damaged ? bay : 0, Math.PI * 2 - bay]} />
        <meshStandardMaterial color="#e3e5e2" metalness={0.75} roughness={0.28} side={THREE.DoubleSide} />
      </mesh>
      {/* Radiator panels */}
      {[0.7, 2.6, 4.1].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 1.97, -2.0, Math.cos(a) * 1.97]} rotation={[0, a, 0]}>
          <planeGeometry args={[0.9, 3.2]} />
          <meshStandardMaterial color="#f4f5f0" roughness={0.6} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {damaged && (
        <>
          {/* Exposed shelf with oxygen tanks and fuel cells */}
          {[[-1.2, 0.5], [-2.3, 0.85], [-3.3, 0.45]].map(([y, r], i) => (
            <mesh key={i} position={[Math.sin(bay / 2) * 0.95, y, Math.cos(bay / 2) * 0.95]}>
              <sphereGeometry args={[r, 20, 14]} />
              <meshStandardMaterial color={i === 0 ? "#3b3532" : "#a39a8a"} metalness={0.6} roughness={0.5} />
            </mesh>
          ))}
          <mesh position={[0, -2.35, 0]}>
            <cylinderGeometry args={[1.9, 1.9, 4.4, 24, 1, true, 0, bay]} />
            <meshStandardMaterial color="#1f1a17" side={THREE.BackSide} />
          </mesh>
        </>
      )}
      {/* RCS quads */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        return (
          <group key={i} position={[Math.sin(a) * 2.05, -0.75, Math.cos(a) * 2.05]} rotation={[0, a, 0]}>
            <mesh>
              <boxGeometry args={[0.45, 0.6, 0.2]} />
              <meshStandardMaterial color="#cfd2cc" metalness={0.6} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[0, s * 0.38, 0.05]}>
                <coneGeometry args={[0.07, 0.18, 8]} />
                <meshStandardMaterial color="#5a5f62" />
              </mesh>
            ))}
          </group>
        );
      })}
      {/* SPS engine */}
      <mesh position={[0, -4.7, 0]}>
        <cylinderGeometry args={[1.0, 1.96, 0.3, 40]} />
        <meshStandardMaterial color="#b8bcbd" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, -6.1, 0]}>
        <cylinderGeometry args={[0.45, 1.25, 2.6, 40, 1, true]} />
        <meshStandardMaterial color="#3f3a38" metalness={0.7} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* High-gain antenna */}
      <group position={[1.5, -4.4, -1.4]} rotation={[0.4, 0, 0.4]}>
        <mesh position={[0, -0.6, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 1.4, 6]} />
          <meshStandardMaterial color="#9aa1a5" />
        </mesh>
        {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b], i) => (
          <group key={i} position={[a * 0.33, -1.35, b * 0.33]}>
            <Dish radius={0.3} />
          </group>
        ))}
      </group>
    </group>
  );
}

/** Lunar module, docking hatch at y = 0 pointing +Y (mounted inverted on the CM). */
function LunarModule() {
  const gold = foil();
  return (
    <group rotation={[Math.PI, 0, 0]}>
      {/* Ascent stage */}
      <mesh position={[0, -1.4, 0]} castShadow>
        <dodecahedronGeometry args={[1.45, 0]} />
        <meshStandardMaterial color="#9a9c95" metalness={0.6} roughness={0.45} flatShading />
      </mesh>
      <mesh position={[0, -1.25, 1.1]} rotation={[0.25, 0, 0]}>
        <boxGeometry args={[1.5, 1.1, 0.4]} />
        <meshStandardMaterial color="#3e3f3c" metalness={0.5} roughness={0.5} flatShading />
      </mesh>
      {[-0.4, 0.4].map((x) => (
        <mesh key={x} position={[x, -0.95, 1.33]} rotation={[0.25, x * 0.6, 0]}>
          <planeGeometry args={[0.38, 0.3]} />
          <meshStandardMaterial color="#0c1418" metalness={0.9} roughness={0.1} />
        </mesh>
      ))}
      <mesh position={[0, -0.15, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 0.35, 20]} />
        <meshStandardMaterial color="#8c9090" metalness={0.7} />
      </mesh>
      <group position={[-1.1, -1.9, -0.6]}>
        <Dish radius={0.35} />
      </group>
      {/* Descent stage: octagonal, wrapped in gold foil */}
      <mesh position={[0, -3.4, 0]} rotation={[0, Math.PI / 8, 0]} castShadow>
        <cylinderGeometry args={[2.15, 2.15, 1.7, 8]} />
        <meshStandardMaterial color="#ffffff" map={gold} metalness={0.35} roughness={0.42} flatShading />
      </mesh>
      {/* Stowed landing legs */}
      {[0, 1, 2, 3].map((i) => {
        const a = (i * Math.PI) / 2;
        return (
          <group key={i} rotation={[0, a, 0]}>
            <mesh position={[0, -3.6, 2.35]} rotation={[0.25, 0, 0]}>
              <cylinderGeometry args={[0.07, 0.07, 2.6, 8]} />
              <meshStandardMaterial color="#c9a347" metalness={0.8} roughness={0.35} />
            </mesh>
            <mesh position={[0, -4.95, 2.65]} rotation={[0, 0, 0]}>
              <cylinderGeometry args={[0.38, 0.38, 0.08, 16]} />
              <meshStandardMaterial color="#b9b9b2" metalness={0.6} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, -4.4, 0]}>
        <cylinderGeometry args={[0.35, 0.75, 0.5, 20, 1, true]} />
        <meshStandardMaterial color="#3f3a38" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Apollo13({ frame, cutaway }: Props) {
  const [sm, cm, lm] = frame.modules;
  // Stack along +Y then turned to lie along X: SPS → SM → CM → LM.
  const anchors: Vec3[] = [
    [0, -2.2, 0],
    [0, 1.3, 0],
    [0, 5.6, 0],
  ];
  return (
    <group scale={0.42} rotation={[0, 0, -Math.PI / 2]} position={[0.6, 0.3, 0]}>
      <ServiceModule damaged />
      <CommandModule ghost={cutaway} />
      <group position={[0, 3.55, 0]}>
        <LunarModule />
      </group>
      <Fire position={[1.4, -1.5, 0.8]} intensity={frame.fireIntensity * 1.6} mode="vent" direction={[1, 0.15, 0.8]} />
      {cutaway && (
        <>
          <Crew frame={frame} anchors={anchors} pose="float" spread={0.5} scale={1.4} />
          <Label k={2.6} position={[0, -2.5, 2.6]} name={sm.name} detail="Panel 4 arrancado" level="danger" />
          <Label k={2.6} position={[0, 1.6, 2.6]} name={cm.name} detail={`Energía ${Math.round(frame.energy)} %`} level={frame.energy < 40 ? "danger" : frame.energy < 70 ? "watch" : "ok"} />
          <Label k={2.6} position={[0, 6.2, 2.8]} name={`${lm.name} Aquarius`} detail="Refugio" level="ok" />
        </>
      )}
    </group>
  );
}

function Apollo1({ frame, cutaway, config }: Props) {
  const [cabin, hatch] = frame.modules;
  const hatchOpen = config.isolation && frame.crew.some((value) => value > 0);
  const anchors: Vec3[] = [
    [0, 1.25, 0],
    [0, 1.45, 2.0],
    [0, 1.1, 3.5],
  ];
  return (
    <group scale={0.95} position={[0, -1.3, 0]} rotation={[0, Math.PI / 2, 0]}>
      <CommandModule ghost={cutaway} hatchOpen={hatchOpen} />
      <ServiceModule />
      {/* Service structure: white room and access arm on the hatch side */}
      <group position={[0, 1.4, 3.3]}>
        <mesh>
          <boxGeometry args={[1.8, 2.2, 1.2]} />
          <meshStandardMaterial color="#e9ebe6" roughness={0.7} transparent opacity={cutaway ? 0.22 : 1} depthWrite={!cutaway} />
        </mesh>
        <mesh position={[0, -1.2, 2.0]}>
          <boxGeometry args={[1.4, 0.2, 3.0]} />
          <meshStandardMaterial color="#b3402f" metalness={0.4} roughness={0.6} />
        </mesh>
        {[-0.8, 0.8].map((x) => (
          <mesh key={x} position={[x, -0.6, 3.6]}>
            <boxGeometry args={[0.12, 1.6, 0.12]} />
            <meshStandardMaterial color="#b3402f" />
          </mesh>
        ))}
      </group>
      {cutaway && (
        <>
          {/* Three couches: Grissom (left), White (centre), Chaffee (right) */}
          {[-0.75, 0, 0.75].map((x) => (
            <mesh key={x} position={[x, 0.95, 0]} rotation={[0.25, 0, 0]}>
              <boxGeometry args={[0.5, 0.12, 1.5]} />
              <meshStandardMaterial color="#7d8075" roughness={0.8} />
            </mesh>
          ))}
          {/* Main display console */}
          <mesh position={[0, 2.15, -0.2]} rotation={[0.9, 0, 0]}>
            <boxGeometry args={[2.0, 0.08, 0.7]} />
            <meshStandardMaterial color="#2c3438" emissive="#2f6f63" emissiveIntensity={0.25} />
          </mesh>
          <Crew frame={frame} anchors={anchors} pose={frame.crew.every((v) => v === 0) ? "seated" : "stand"} spread={0.75} scale={1.1} />
          <Smoke amount={cabin.smoke} center={[0, 1.3, 0]} length={2.4} radius={1.2} tint="#5d5650" />
          <Label k={2} position={[0, 3.9, 0]} name={cabin.name} detail={`${Math.round(frame.pressure)} kPa · ${cabin.visibility}`} level={frame.pressure > 160 ? "danger" : cabin.level} />
          <Label k={2} position={[0, 2.8, 2.9]} name={hatch.name} detail={hatchOpen ? "Abierta" : config.isolation ? "Apertura rápida" : "Abre hacia dentro"} level={hatchOpen ? "ok" : "danger"} />
        </>
      )}
      <Fire position={[-0.75, 0.55, 0.2]} intensity={frame.fireIntensity} mode="buoyant" />
    </group>
  );
}

function Aegis({ frame, cutaway, config }: Props) {
  const [service, habitat, refuge] = frame.modules;
  const ghost = cutaway;
  const panel = blanket("#e4e7e2");
  const closed = config.isolation && frame.time >= 19;
  const anchors: Vec3[] = [
    [-5.5, -0.5, 0],
    [0, -0.5, 0],
    [6.2, -0.5, 0],
  ];
  return (
    <group scale={0.36} position={[0, 0.2, 0]}>
      <Hull from={-8} to={-3.2} r1={1.8} map={panel} ghost={ghost} />
      <Hull from={-2.6} to={3.2} r1={2.3} map={panel} ghost={ghost} />
      <Hull from={4.0} to={8.4} r1={1.9} color="#e7ecdf" map={panel} ghost={ghost} />
      {[-2.9, 3.6].map((x) => (
        <group key={x}>
          <Hull from={x - 0.35} to={x + 0.35} r1={1.0} color="#bfc6c2" />
          <mesh position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[0.85, 32]} />
            <meshStandardMaterial
              color={closed ? "#e4a477" : "#c6ed9c"}
              emissive={closed ? "#e4a477" : "#c6ed9c"}
              emissiveIntensity={0.35}
              transparent
              opacity={closed ? 0.95 : 0.25}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>
      ))}
      {[-8, -3.2, -2.6, 3.2, 4, 8.4].map((x, i) => (
        <RingFrame key={x} x={x} r={[1.8, 1.8, 2.3, 2.3, 1.9, 1.9][i]} color="#69c8c6" />
      ))}
      {/* Truss, arrays and radiators */}
      {[-1, 1].map((side) => (
        <group key={side} position={[-1, 3.4, side * 0.3]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <SolarWing length={9} width={3.2} tint="#1d3a6b" segments={5} />
        </group>
      ))}
      <mesh position={[-1, 2.85, 0]}>
        <boxGeometry args={[0.35, 1.2, 0.6]} />
        <meshStandardMaterial color="#9aa1a5" metalness={0.7} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[-5.6, -2.4, side * 1.4]} rotation={[0, 0, 0]}>
          <boxGeometry args={[3.6, 0.05, 2.2]} />
          <meshStandardMaterial color="#f4f6f2" roughness={0.5} />
        </mesh>
      ))}
      {/* Refuge has its own power and radiator */}
      <group position={[6.2, 1.9, 0]} rotation={[0, 0, 0]}>
        <SolarWing length={4} width={1.6} tint="#1d3a6b" segments={3} />
      </group>
      <group position={[1.5, 2.3, -0.4]}>
        <Dish radius={0.7} />
      </group>
      {cutaway && (
        <>
          <mesh position={[0, -1.1, 0]}>
            <boxGeometry args={[16, 0.08, 2.6]} />
            <meshStandardMaterial color="#5c6b6a" roughness={0.8} />
          </mesh>
          {Array.from({ length: 5 }, (_, i) => (
            <mesh key={i} position={[-1.8 + i * 1.1, 0, -1.7]}>
              <boxGeometry args={[0.9, 1.9, 0.5]} />
              <meshStandardMaterial color={i % 2 ? "#a7b0a6" : "#c9cec4"} />
            </mesh>
          ))}
          <Smoke amount={service.smoke} center={[-5.6, 0, 0]} length={4.4} radius={1.6} tint="#7b736c" />
          <Smoke amount={habitat.smoke} center={[0.3, 0, 0]} length={5.6} radius={2.0} />
          <Smoke amount={refuge.smoke} center={[6.2, 0, 0]} length={4.2} radius={1.7} />
          <Crew frame={frame} anchors={anchors} pose="float" spread={0.75} scale={2.6} />
          <Label k={2.8} position={[-5.6, 3.0, 0]} name={service.name} detail={service.visibility} level={service.level} />
          <Label k={2.8} position={[0.3, 3.5, 0]} name={habitat.name} detail={habitat.visibility} level={habitat.level} />
          <Label k={2.8} position={[6.2, 3.0, 0]} name={refuge.name} detail={refuge.visibility} level={refuge.level} />
        </>
      )}
      <Fire
        position={[-6, -0.3, 0.6]}
        intensity={frame.fireIntensity}
        mode={config.gravity < 0.05 ? "micro" : "buoyant"}
        flow={config.airflow}
      />
    </group>
  );
}

const framing: Record<ScenarioId, { width: number; min: number; target: Vec3 }> = {
  mir: { width: 10, min: 5, target: [0.4, 0.1, 0] },
  apollo1: { width: 9, min: 3.5, target: [0, 0.4, 0] },
  apollo13: { width: 8.5, min: 4, target: [0.4, 0.2, 0] },
  aegis: { width: 7.5, min: 4, target: [0, 0.2, 0] },
};

function CameraFit({ scenario }: { scenario: ScenarioId }) {
  const { camera, size, controls } = useThree();
  useEffect(() => {
    const { width, target } = framing[scenario];
    const aspect = size.width / Math.max(size.height, 1);
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const distance = Math.max(width / (2 * Math.tan(fov / 2) * Math.min(aspect, 1.8)) * 1.15, 6);
    const direction = new THREE.Vector3(0.75, 0.45, 0.95).normalize();
    camera.position.copy(direction.multiplyScalar(distance).add(new THREE.Vector3(...target)));
    camera.lookAt(...target);
    const orbit = controls as unknown as { target?: THREE.Vector3; update?: () => void } | null;
    orbit?.target?.set(...target);
    orbit?.update?.();
  }, [camera, size.width, size.height, scenario, controls]);
  return null;
}

function Scene({ children }: { children: ReactNode }) {
  return (
    <>
      <ambientLight intensity={0.25} color="#b3d8e1" />
      <directionalLight position={[8, 6, 5]} intensity={3.4} color="#fff3dc" castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-6, -3, -4]} intensity={0.5} color="#5a8fbf" />
      <Environment resolution={64}>
        <Lightformer form="rect" intensity={2.2} color="#ffffff" position={[6, 5, 6]} scale={[10, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} color="#3f87c9" position={[-6, -4, -2]} scale={[12, 6, 1]} />
        <Lightformer form="ring" intensity={0.8} color="#ffd9a8" position={[0, 8, -6]} scale={4} />
      </Environment>
      <Stars radius={80} depth={30} count={1400} factor={2} saturation={0} fade speed={0.15} />
      {children}
    </>
  );
}

export default function Spacecraft(props: Props) {
  const ground = props.scenario === "apollo1";
  return (
    <Canvas
      shadows
      dpr={[1, 1.6]}
      camera={{ position: [7.6, 5.0, 8.5], fov: 34 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      aria-label={`Modelo 3D de ${scenarioInfo[props.scenario].title}. Arrastra para girar y usa la rueda para acercar.`}
    >
      <Suspense fallback={null}>
        <Scene>
          {props.scenario === "mir" ? (
            <Mir {...props} />
          ) : props.scenario === "apollo1" ? (
            <Apollo1 {...props} />
          ) : props.scenario === "apollo13" ? (
            <Apollo13 {...props} />
          ) : (
            <Aegis {...props} />
          )}
          {ground && <ContactShadows position={[0, -1.45, 0]} opacity={0.35} scale={14} blur={2.5} far={5} color="#000" />}
        </Scene>
        <OrbitControls
          makeDefault
          enablePan={false}
          minDistance={framing[props.scenario].min}
          maxDistance={40}
          enableDamping
          dampingFactor={0.08}
        />
        <CameraFit scenario={props.scenario} />
      </Suspense>
    </Canvas>
  );
}
