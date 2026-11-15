import { Suspense, createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";

const LabelsVisible = createContext(true);
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import {
  IGNITION_TIME,
  oxygenBoost,
  scenarioInfo,
  type ScenarioId,
  type SimConfig,
  type SimFrame,
} from "../lib/simulation";
import { Earth, Flame, Moon, Smoke, Sparks, Vent, type Vec3 } from "./three/effects";
import Person, { type Outfit, type Pose } from "./three/Person";

/*
 * Reconstrucciones a escala a partir de dimensiones publicadas (metros):
 * - Mir 1997: bloque base 13,1 m × 4,15 m; Kvant-1 5,8 m; Kvant-2 12,4 m;
 *   Kristall 11,9 m; Spektr 14,4 m; Priroda 11,6 m; Soyuz TM 7,0 m.
 * - Apollo: módulo de mando Ø 3,9 m × 3,2 m; módulo de servicio Ø 3,9 m × 7,5 m
 *   con tobera; módulo lunar 4,2 m de ancho (etapa de descenso) y 7 m de alto.
 * - Tripulación: figuras articuladas de 1,75 m.
 * La disposición interior es esquemática.
 */

export type CameraFocus = "general" | "fire" | "crew";
type Markers = MutableRefObject<{ fire?: THREE.Object3D | null; crew?: THREE.Object3D | null }>;
type Props = {
  scenario: ScenarioId;
  frame: SimFrame;
  cutaway: boolean;
  config: SimConfig;
  focus?: CameraFocus;
};
type VehicleProps = Props & { markers: Markers };

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
  const visible = useContext(LabelsVisible);
  if (!visible) return null;
  return (
    <sprite position={position} scale={[1.6 * k, 0.4 * k, 1]} center={new THREE.Vector2(0.5, 0)} renderOrder={10}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

/** Interpolates a position (0..2) along three anchor points. */
function along(anchors: Vec3[], value: number): Vec3 {
  const i = Math.min(Math.floor(value), anchors.length - 2);
  const t = value - i;
  const a = anchors[i];
  const b = anchors[i + 1];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * Places each crew member from the simulation: idle people spread inside their
 * module, moving people travel along the anchor path facing where they go.
 */
function Crew({
  frame,
  path,
  outfit,
  gravity,
  floor,
  seats,
  spacing = 0.9,
  markers,
}: {
  frame: SimFrame;
  path: Vec3[];
  outfit: Outfit;
  gravity: number;
  floor?: number;
  seats?: Vec3[];
  spacing?: number;
  markers: Markers;
}) {
  const grounded = gravity >= 0.1;
  const byModule: Record<number, number[]> = {};
  frame.crew.forEach((value, index) => {
    if (Number.isInteger(value)) (byModule[value] ??= []).push(index);
  });
  const followIndex = Math.max(
    0,
    frame.crew.findIndex((value) => !Number.isInteger(value)) >= 0
      ? frame.crew.findIndex((value) => !Number.isInteger(value))
      : frame.crew.findIndex((value) => value < 2),
  );
  return (
    <>
      {frame.crew.map((value, index) => {
        const moving = !Number.isInteger(value) || (value > 0 && value < 2 && !Number.isInteger(value));
        let target: Vec3;
        let heading = (index * 1.9) % (Math.PI * 2);
        let pose: Pose;
        if (seats && value === 0) {
          target = seats[index];
          heading = 0;
          pose = "supine";
        } else if (moving) {
          target = along(path, value);
          const ahead = along(path, Math.min(2, value + 0.05));
          heading = Math.atan2(ahead[0] - target[0], ahead[2] - target[2]);
          pose = grounded ? "walk" : "translate";
        } else {
          const group = byModule[value] ?? [index];
          const slot = group.indexOf(index);
          const offset = (slot - (group.length - 1) / 2) * spacing;
          const base = path[Math.round(value)];
          target = [base[0] + offset, base[1] + (grounded ? 0 : ((slot % 2) - 0.5) * 0.35), base[2] + (slot % 2 ? 0.35 : -0.35)];
          pose = grounded ? "stand" : "neutral";
        }
        if (grounded && floor !== undefined && pose !== "supine") target = [target[0], floor + 0.98, target[2]];
        const module = frame.modules[Math.min(2, Math.round(value))];
        const status = value >= 2 ? "safe" : module.level === "danger" ? "danger" : "ok";
        return (
          <group key={index}>
            <Person target={target} heading={heading} pose={pose} outfit={outfit} seed={index} status={status} />
            {index === followIndex && (
              <group
                position={target}
                ref={(node) => {
                  markers.current.crew = node;
                }}
              />
            )}
          </group>
        );
      })}
    </>
  );
}

function Marker({ name, position, markers }: { name: "fire"; position: Vec3; markers: Markers }) {
  return (
    <group
      position={position}
      ref={(node) => {
        markers.current[name] = node;
      }}
    />
  );
}

/** Oxygen-dependent soot: more oxygen, brighter and yellower flames. */
const sootFor = (config: SimConfig) => Math.min(1, 0.15 + 0.22 * oxygenBoost(config.oxygen, config.pressure));

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
function LunarModule({ ghost = false }: { ghost?: boolean }) {
  const gold = foil();
  return (
    <group rotation={[Math.PI, 0, 0]}>
      {/* Ascent stage */}
      <mesh position={[0, -1.4, 0]} castShadow>
        <dodecahedronGeometry args={[1.45, 0]} />
        <meshStandardMaterial color="#9a9c95" metalness={0.6} roughness={0.45} flatShading transparent={ghost} opacity={ghost ? 0.25 : 1} depthWrite={!ghost} />
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

/* --------------------------------------------------------------- scenes */

const outfits: Record<ScenarioId, Outfit> = {
  mir: { suit: "#2e4a72", trim: "#c9ccc4" }, // blue flight overalls
  apollo1: { suit: "#e7e4d9", trim: "#9aa0a2", helmet: true }, // A1C pressure suits
  apollo13: { suit: "#d8d2bf", trim: "#7d7a70" }, // constant-wear garments
  aegis: { suit: "#3d4b5c", trim: "#e4a477" },
};

function Mir({ frame, cutaway, config, markers }: VehicleProps) {
  // 1 unit = 1 m; group scaled to fit. Core runs along +X from x = 0.
  const white = blanket("#dcdcd2");
  const ghost = cutaway;
  const [kvant, core, soyuz] = frame.modules;
  const path: Vec3[] = [
    [-2.9, 0, 0],
    [5.2, 0, 0],
    [14.9, 0, 0],
  ];
  const firePos: Vec3 = [-4.7, -1.1, -1.25];
  return (
    <group scale={0.2} position={[-0.5, 0.2, 0.5]} rotation={[0, 0.67, 0]}>
      {/* Base block */}
      <Hull from={0} to={6.4} r1={2.07} map={white} ghost={ghost} />
      <Hull from={6.4} to={7.6} r1={2.07} r2={1.45} map={white} ghost={ghost} />
      <Hull from={7.6} to={11.6} r1={1.45} map={white} ghost={ghost} />
      <RingFrame x={0} r={2.07} />
      <RingFrame x={6.4} r={2.07} />
      <mesh position={[12.7, 0, 0]} castShadow>
        <sphereGeometry args={[1.1, 32, 24]} />
        <meshStandardMaterial color="#cfd1ca" metalness={0.3} roughness={0.6} transparent={ghost} opacity={ghost ? 0.3 : 1} depthWrite={!ghost} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[3.5, 1.2, side * 2.07]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <SolarWing length={11.5} width={3.4} tint="#2a2f6a" segments={8} />
        </group>
      ))}
      <group position={[9.5, 1.5, 0]}>
        <Dish radius={0.55} />
      </group>
      {/* Kvant-1 and the Sofora truss */}
      <Hull from={-5.8} to={0} r1={2.07} map={white} ghost={ghost} />
      <RingFrame x={-5.8} r={2.07} />
      <group position={[-3, 2.07, 0]}>
        <Lattice length={14} width={0.7} />
        <mesh position={[0, 14.4, 0]}>
          <boxGeometry args={[1.1, 0.9, 1.1]} />
          <meshStandardMaterial color="#c8c9c2" map={white} />
        </mesh>
      </group>
      {/* Soyuz TM-24 behind Kvant-1, cut off by the fire */}
      <group position={[-5.8, 0, 0]}>
        <Soyuz blocked={frame.fireIntensity > 0.1} />
      </group>
      {/* Soyuz TM-25 on the forward port: the escape route that stayed open */}
      <group position={[13.8, 0, 0]} rotation={[0, Math.PI, 0]}>
        <Soyuz ghost={ghost} />
      </group>
      {/* Kvant-2 (up), Kristall (down), Spektr (+Z), Priroda (−Z) */}
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
          <Interior from={-5.6} to={11.4} radius={1.95} narrowFrom={6.6} narrowRadius={1.4} />
          {/* Oxygen candle (SFOG) mounted low on the Kvant-1 wall */}
          <mesh position={[-4.7, -1.35, -1.35]}>
            <boxGeometry args={[0.45, 0.6, 0.35]} />
            <meshStandardMaterial color="#5f6058" metalness={0.5} roughness={0.5} />
          </mesh>
          <Smoke amount={kvant.smoke} center={[-2.9, 0, 0]} length={5.6} radius={1.9} gravity={config.gravity} flow={config.airflow} tint="#a29d94" />
          <Smoke amount={core.smoke} center={[5.5, 0, 0]} length={11} radius={1.7} gravity={config.gravity} flow={config.airflow} tint="#a6a49e" />
          <Smoke amount={soyuz.smoke} center={[15, 0, 0]} length={2.2} radius={1.0} gravity={config.gravity} flow={config.airflow} />
          <Crew frame={frame} path={path} outfit={outfits.mir} gravity={config.gravity} floor={-1.75} markers={markers} spacing={1.1} />
          <Label k={6.5} position={[-2.9, 3.4, 0]} name={kvant.name} detail={kvant.visibility} level={kvant.level} />
          <Label k={6.5} position={[5, 3.1, 0]} name={core.name} detail={core.visibility} level={core.level} />
          <Label k={6.5} position={[15.2, 2.4, 0]} name="Soyuz TM-25" detail={soyuz.visibility} level={soyuz.level} />
          <Label k={6.5} position={[-10, 2.6, 0]} name="Soyuz TM-24" detail="Detrás del fuego" level="danger" />
        </>
      )}
      <Marker name="fire" position={firePos} markers={markers} />
      {/* Lithium perchlorate candle: a torch-like jet. Without gravity the sparks fly straight. */}
      <Flame
        position={[-4.7, -1.05, -1.1]}
        rotation={[0.25, -Math.PI / 2, 0]}
        size={0.32}
        intensity={frame.fireIntensity}
        gravity={config.gravity}
        flow={1.3}
        soot={0.95}
        turbulence={1.6}
      />
      <Sparks position={[-4.7, -1.05, -1.1]} direction={[0.15, 0.25, 1]} intensity={frame.fireIntensity} gravity={config.gravity} reach={1.9} />
      {config.isolation && frame.time >= 30 && (
        <mesh position={[0.05, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <circleGeometry args={[0.55, 24]} />
          <meshStandardMaterial color="#c6ed9c" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

/** Generic pressurized interior: floor, racks on both walls, handrails and lights. */
function Interior({
  from,
  to,
  radius,
  narrowFrom,
  narrowRadius,
}: {
  from: number;
  to: number;
  radius: number;
  narrowFrom?: number;
  narrowRadius?: number;
}) {
  const bays = Math.floor((to - from) / 1.1);
  return (
    <group>
      {Array.from({ length: bays }, (_, i) => {
        const x = from + 0.55 + i * 1.1;
        const r = narrowFrom !== undefined && x > narrowFrom ? narrowRadius! : radius;
        return (
          <group key={i} position={[x, 0, 0]}>
            <mesh position={[0, -r * 0.82, 0]} receiveShadow>
              <boxGeometry args={[1.0, 0.06, r * 1.0]} />
              <meshStandardMaterial color="#6d7871" roughness={0.85} />
            </mesh>
            {/* Equipment racks on the far wall only, so the crew stays visible. */}
            <mesh position={[0, -0.1, -r * 0.78]}>
              <boxGeometry args={[0.95, r * 0.95, 0.26]} />
              <meshStandardMaterial color={i % 3 ? "#b9bdb3" : "#9fa79d"} roughness={0.7} />
            </mesh>
            <mesh position={[0.2, 0.15, -r * 0.64]}>
              <boxGeometry args={[0.32, 0.22, 0.02]} />
              <meshStandardMaterial color="#14262b" emissive="#2f6f63" emissiveIntensity={0.4} />
            </mesh>
            <mesh position={[0, r * 0.74, 0]}>
              <boxGeometry args={[0.6, 0.03, 0.18]} />
              <meshStandardMaterial color="#f4f1e2" emissive="#f4f1e2" emissiveIntensity={0.6} />
            </mesh>
            <mesh position={[0, r * 0.3, r * 0.52]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.025, 0.025, 0.9, 8]} />
              <meshStandardMaterial color="#c9a347" metalness={0.6} roughness={0.4} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Apollo13({ frame, cutaway, config, markers }: VehicleProps) {
  const [sm] = frame.modules;
  // Stack along +Y then laid along X: SPS engine → SM → CM → LM.
  const path: Vec3[] = [
    [0, -2.2, 0],
    [0, 1.25, 0],
    [0, 5.0, 0],
  ];
  const since = frame.time - IGNITION_TIME;
  const bay = Math.PI / 6;
  const out: Vec3 = [Math.sin(bay), 0, Math.cos(bay)];
  return (
    <group scale={0.42} rotation={[0, 0, -Math.PI / 2]} position={[0.6, 0.3, 0]}>
      <ServiceModule damaged={since >= 0} />
      <CommandModule ghost={cutaway} />
      <group position={[0, 3.55, 0]}>
        <LunarModule ghost={cutaway} />
      </group>
      <Marker name="fire" position={[out[0] * 1.9, -2.3, out[2] * 1.9]} markers={markers} />
      {/* No flame is visible: the tank ruptured inside the module. Oxygen escapes as a sunlit cloud. */}
      <Vent position={[out[0] * 1.95, -2.3, out[2] * 1.95]} direction={out} intensity={since >= 0 ? Math.max(0.15, 1 - since / 140) : 0} burst={since >= 0 && since < 6 ? 1 - since / 6 : 0} />
      {since >= 0 && since < 3 && <pointLight position={[out[0] * 2.5, -2.3, out[2] * 2.5]} intensity={40 * (1 - since / 3)} distance={20} color="#fff3d6" />}
      {/* Bay 4 panel drifting away */}
      {since >= 0 && since < 60 && (
        <group position={[out[0] * (2 + since * 0.35), -2.3 + since * 0.05, out[2] * (2 + since * 0.35)]} rotation={[since * 0.08, bay + since * 0.05, since * 0.03]}>
          <mesh>
            <cylinderGeometry args={[1.96, 1.96, 4.2, 12, 1, true, -Math.PI / 6, Math.PI / 3]} />
            <meshStandardMaterial color="#e3e5e2" metalness={0.7} roughness={0.3} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
      {cutaway && (
        <>
          <Crew frame={frame} path={path} outfit={outfits.apollo13} gravity={config.gravity} markers={markers} spacing={0.55} />
          <Label k={2.6} position={[0, -2.5, 2.6]} name="Servicio" detail={since >= 0 ? "Panel 4 arrancado" : "Normal"} level={since >= 0 ? "danger" : "ok"} />
          <Label k={2.6} position={[0, 1.6, 2.6]} name="Mando Odyssey" detail={`Energía ${Math.round(frame.energy)} %`} level={frame.energy < 40 ? "danger" : frame.energy < 70 ? "watch" : "ok"} />
          <Label k={2.6} position={[0, 6.2, 2.8]} name="Lunar Aquarius" detail={config.backup ? "Refugio" : "Sin preparar"} level={config.backup ? "ok" : "watch"} />
          <Label k={2.6} position={[0, -0.4, -2.6]} name={sm.name === "Servicio" ? "Tanque O₂ 2" : sm.name} detail={since >= 0 ? "Roto" : "Agitando"} level={since >= 0 ? "danger" : "watch"} />
        </>
      )}
    </group>
  );
}

function Apollo1({ frame, cutaway, config, markers }: VehicleProps) {
  const [cabin, hatch] = frame.modules;
  const hatchOpen = config.isolation && frame.crew.some((value) => value > 0);
  const path: Vec3[] = [
    [0, 1.05, 0],
    [0, 1.0, 2.1],
    [0, 0.98, 3.4],
  ];
  // Couches: Grissom (left), White (centre), Chaffee (right).
  const seats: Vec3[] = [
    [-0.72, 0.74, -0.15],
    [0, 0.74, -0.15],
    [0.72, 0.74, -0.15],
  ];
  const spread = Math.min(1, frame.fireIntensity / 1.2);
  const ruptured = frame.pressure < 140 && frame.time > 20 && frame.temperature > 100;
  const soot = sootFor(config);
  return (
    <group scale={0.95} position={[0, -1.3, 0]} rotation={[0, Math.PI / 2, 0]}>
      <CommandModule ghost={cutaway} hatchOpen={hatchOpen} />
      <ServiceModule />
      {/* Adapter and S-IVB stage of the Saturn IB below, fading into the night */}
      <mesh position={[0, -6.6, 0]}>
        <cylinderGeometry args={[1.96, 3.3, 4.2, 48, 1, true]} />
        <meshStandardMaterial color="#e8e9e4" roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -13.5, 0]}>
        <cylinderGeometry args={[3.3, 3.3, 9.6, 48]} />
        <meshStandardMaterial color="#eeeeea" roughness={0.6} />
      </mesh>
      {/* Service structure: white room, access arm and the launch tower */}
      <group position={[0, 1.4, 3.3]}>
        <mesh>
          <boxGeometry args={[1.8, 2.2, 1.2]} />
          <meshStandardMaterial color="#e9ebe6" roughness={0.7} transparent opacity={cutaway ? 0.22 : 1} depthWrite={!cutaway} />
        </mesh>
        <mesh position={[0, -1.2, 2.4]}>
          <boxGeometry args={[1.4, 0.2, 3.8]} />
          <meshStandardMaterial color="#b3402f" metalness={0.4} roughness={0.6} />
        </mesh>
      </group>
      <group position={[0, -18, 7.4]}>
        <Lattice length={22} width={2.6} />
      </group>
      {cutaway && (
        <>
          {seats.map((seat, i) => (
            <group key={i} position={[seat[0], 0.55, -0.1]}>
              <mesh rotation={[-0.15, 0, 0]}>
                <boxGeometry args={[0.55, 0.08, 1.7]} />
                <meshStandardMaterial color="#6f7368" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0.35, 0.75]} rotation={[0.9, 0, 0]}>
                <boxGeometry args={[0.55, 0.08, 0.6]} />
                <meshStandardMaterial color="#6f7368" roughness={0.85} />
              </mesh>
            </group>
          ))}
          {/* Main display console above the crew */}
          <mesh position={[0, 2.05, -0.15]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[2.1, 0.08, 0.75]} />
            <meshStandardMaterial color="#2c3438" emissive="#2f6f63" emissiveIntensity={0.25} />
          </mesh>
          <Crew frame={frame} path={path} seats={seats} outfit={outfits.apollo1} gravity={1} floor={0.25} markers={markers} spacing={0.6} />
          <Smoke amount={cabin.smoke} center={[0, 1.3, 0]} length={2.6} radius={1.25} gravity={1} tint="#4a4540" />
          <Label k={2} position={[0, 3.9, 0]} name="Cabina" detail={`${Math.round(frame.pressure)} kPa · ${cabin.visibility}`} level={frame.pressure > 160 || ruptured ? "danger" : cabin.level} />
          <Label k={2} position={[0, 2.9, 2.9]} name={hatch.name} detail={hatchOpen ? "Abierta" : config.isolation ? "Apertura rápida" : "Abre hacia dentro"} level={hatchOpen ? "ok" : "danger"} />
        </>
      )}
      <Marker name="fire" position={[-0.75, 0.6, 0.2]} markers={markers} />
      {/* Starts below the left couch, then spreads left to right across nets and Velcro. */}
      {[
        [-0.85, 0.42, 0.25, 0],
        [-0.55, 0.7, -0.3, 0.25],
        [-0.1, 0.55, 0.45, 0.45],
        [0.35, 0.8, -0.2, 0.62],
        [0.8, 0.5, 0.3, 0.8],
      ].map(([x, y, z, threshold], i) => (
        <Flame
          key={i}
          position={[x, y, z]}
          size={0.22 + 0.06 * (1 - threshold)}
          intensity={spread > threshold ? frame.fireIntensity * (1 - threshold * 0.4) : 0}
          gravity={config.gravity}
          soot={soot}
          light={i % 2 === 0}
        />
      ))}
    </group>
  );
}

function Aegis({ frame, cutaway, config, markers }: VehicleProps) {
  const [service, habitat, refuge] = frame.modules;
  const ghost = cutaway;
  const panel = blanket("#e4e7e2");
  const closed = config.isolation && frame.time >= 19;
  const path: Vec3[] = [
    [-5.5, 0, 0],
    [0.2, 0, 0],
    [6.2, 0, 0],
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
        <mesh key={side} position={[-5.6, -2.4, side * 1.4]}>
          <boxGeometry args={[3.6, 0.05, 2.2]} />
          <meshStandardMaterial color="#f4f6f2" roughness={0.5} />
        </mesh>
      ))}
      <group position={[6.2, 1.9, 0]}>
        <SolarWing length={4} width={1.6} tint="#1d3a6b" segments={3} />
      </group>
      <group position={[1.5, 2.3, -0.4]}>
        <Dish radius={0.7} />
      </group>
      {cutaway && (
        <>
          <Interior from={-7.8} to={8.2} radius={1.75} />
          <Smoke amount={service.smoke} center={[-5.6, 0, 0]} length={4.4} radius={1.6} gravity={config.gravity} flow={config.airflow} tint="#8b847c" />
          <Smoke amount={habitat.smoke} center={[0.3, 0, 0]} length={5.6} radius={2.0} gravity={config.gravity} flow={config.airflow} />
          <Smoke amount={refuge.smoke} center={[6.2, 0, 0]} length={4.2} radius={1.7} gravity={config.gravity} flow={config.airflow} />
          <Crew frame={frame} path={path} outfit={outfits.aegis} gravity={config.gravity} floor={-1.4} markers={markers} spacing={0.95} />
          <Label k={2.8} position={[-5.6, 3.0, 0]} name={service.name} detail={service.visibility} level={service.level} />
          <Label k={2.8} position={[0.3, 3.5, 0]} name={habitat.name} detail={habitat.visibility} level={habitat.level} />
          <Label k={2.8} position={[6.2, 3.0, 0]} name={refuge.name} detail={refuge.visibility} level={refuge.level} />
        </>
      )}
      <Marker name="fire" position={[-6, -0.6, 0.9]} markers={markers} />
      {/* Overheated cable behind a panel. In orbit: round, blue, carried by the fan airflow. */}
      <Flame
        position={[-6, -0.6, 0.9]}
        size={0.28}
        intensity={frame.fireIntensity}
        gravity={config.gravity}
        flow={config.airflow * 4}
        soot={sootFor(config) * (0.4 + config.gravity * 0.6)}
      />
    </group>
  );
}

/* --------------------------------------------------------------- camera */

const framing: Record<ScenarioId, { width: number; min: number; target: Vec3 }> = {
  mir: { width: 10, min: 1.2, target: [0.4, 0.1, 0] },
  apollo1: { width: 9, min: 1.2, target: [0, 0.4, 0] },
  apollo13: { width: 8.5, min: 1.2, target: [0.4, 0.2, 0] },
  aegis: { width: 7.5, min: 1.2, target: [0, 0.2, 0] },
};

/** Frames the vehicle, then glides to the fire or follows the crew on request. */
function CameraRig({ scenario, focus, markers }: { scenario: ScenarioId; focus: CameraFocus; markers: Markers }) {
  const { camera, size, controls } = useThree();
  const goal = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | null;
  useEffect(() => {
    const { width, target } = framing[scenario];
    const aspect = size.width / Math.max(size.height, 1);
    const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const distance = Math.max((width / (2 * Math.tan(fov / 2) * Math.min(aspect, 1.8))) * 1.15, 6);
    const direction = new THREE.Vector3(0.75, 0.45, 0.95).normalize();
    goal.current = {
      position: direction.multiplyScalar(distance).add(new THREE.Vector3(...target)),
      target: new THREE.Vector3(...target),
    };
    if (focus === "general") {
      camera.position.copy(goal.current.position);
      orbit?.target.copy(goal.current.target);
      orbit?.update();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, size.width, size.height, scenario, controls]);
  useEffect(() => {
    if (focus === "general") {
      const { width, target } = framing[scenario];
      const aspect = size.width / Math.max(size.height, 1);
      const fov = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
      const distance = Math.max((width / (2 * Math.tan(fov / 2) * Math.min(aspect, 1.8))) * 1.15, 6);
      goal.current = {
        position: new THREE.Vector3(0.75, 0.45, 0.95).normalize().multiplyScalar(distance).add(new THREE.Vector3(...target)),
        target: new THREE.Vector3(...target),
      };
    } else goal.current = null;
  }, [focus, scenario, camera, size.width, size.height]);
  const scratch = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, delta) => {
    if (!orbit) return;
    const k = 1 - Math.exp(-delta * 2.5);
    if (focus !== "general") {
      const node = focus === "fire" ? markers.current.fire : markers.current.crew;
      if (!node) return;
      node.getWorldPosition(scratch);
      const distance = focus === "fire" ? 2.2 : 2.6;
      const offset = camera.position.clone().sub(orbit.target).normalize().multiplyScalar(distance);
      orbit.target.lerp(scratch, k);
      camera.position.lerp(scratch.clone().add(offset), k);
      orbit.update();
    } else if (goal.current) {
      orbit.target.lerp(goal.current.target, k);
      camera.position.lerp(goal.current.position, k);
      orbit.update();
      if (camera.position.distanceTo(goal.current.position) < 0.02) goal.current = null;
    }
  });
  return null;
}

function Backdrop({ scenario }: { scenario: ScenarioId }) {
  if (scenario === "apollo1")
    return (
      <>
        {/* Launch Complex 34 at night: floodlights and the pad far below. */}
        <spotLight position={[10, 6, 14]} angle={0.5} penumbra={0.6} intensity={180} color="#ffe9c4" />
        <mesh position={[0, -22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[80, 48]} />
          <meshStandardMaterial color="#1a1e1f" roughness={1} />
        </mesh>
      </>
    );
  if (scenario === "apollo13")
    return (
      <>
        {/* ~322 000 km from Earth and ~70 000 km from the Moon: both look small. */}
        <Earth position={[-70, 12, -90]} radius={2.4} />
        <Moon position={[80, -6, -70]} radius={2.6} />
      </>
    );
  // Low Earth orbit, ~400 km up: Earth fills the lower view.
  return <Earth position={[0, -520, -120]} radius={480} />;
}

function Scene({ scenario, children }: { scenario: ScenarioId; children: ReactNode }) {
  const night = scenario === "apollo1";
  return (
    <>
      <ambientLight intensity={night ? 0.12 : 0.18} color="#b3d8e1" />
      {!night && <directionalLight position={[8, 5, 6]} intensity={3.6} color="#fff6e6" castShadow shadow-mapSize={[1024, 1024]} />}
      <directionalLight position={[-6, -3, -4]} intensity={night ? 0.2 : 0.45} color="#5a8fbf" />
      <Environment resolution={64}>
        <Lightformer form="rect" intensity={night ? 0.6 : 2.2} color="#ffffff" position={[6, 5, 6]} scale={[10, 6, 1]} />
        <Lightformer form="rect" intensity={night ? 0.3 : 1.2} color="#3f87c9" position={[-6, -4, -2]} scale={[12, 6, 1]} />
      </Environment>
      <Stars radius={150} depth={40} count={2200} factor={2.2} saturation={0} fade speed={0.1} />
      <Backdrop scenario={scenario} />
      {children}
    </>
  );
}

export default function Spacecraft(props: Props) {
  const markers: Markers = useRef({});
  const focus = props.focus ?? "general";
  const vehicle = { ...props, markers };
  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [7.6, 5.0, 8.5], fov: 34, near: 0.05, far: 2000 }}
      gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      aria-label={`Modelo 3D de ${scenarioInfo[props.scenario].title}. Arrastra para girar y usa la rueda para acercar.`}
    >
      <Suspense fallback={null}>
        <LabelsVisible.Provider value={focus === "general"}>
        <Scene scenario={props.scenario}>
          {props.scenario === "mir" ? (
            <Mir {...vehicle} />
          ) : props.scenario === "apollo1" ? (
            <Apollo1 {...vehicle} />
          ) : props.scenario === "apollo13" ? (
            <Apollo13 {...vehicle} />
          ) : (
            <Aegis {...vehicle} />
          )}
        </Scene>
        </LabelsVisible.Provider>
        <OrbitControls makeDefault enablePan={false} minDistance={framing[props.scenario].min} maxDistance={45} enableDamping dampingFactor={0.08} />
        <CameraRig scenario={props.scenario} focus={focus} markers={markers} />
      </Suspense>
    </Canvas>
  );
}
