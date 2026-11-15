import { Suspense, createContext, useContext, useEffect, useMemo, useRef, type MutableRefObject, type ReactNode } from "react";

const LabelsVisible = createContext(true);
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Environment, Lightformer, OrbitControls, Stars } from "@react-three/drei";
import * as THREE from "three";
import { Bloom, EffectComposer, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import {
  oxygenBoost,
  scenarioInfo,
  type ScenarioId,
  type SimConfig,
  type SimFrame,
} from "../lib/simulation";
import { Earth, Flame, Moon, Smoke, Sparks, Vent, type Vec3 } from "./three/effects";
import Person, { CREW_HIP_HEIGHT, CREW_ROUTE_RATE, type CrewRoute, type Outfit, type Pose } from "./three/Person";
import { surface } from "./three/surfaces";

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
  lightweight?: boolean;
  scenario: ScenarioId;
  frame: SimFrame;
  cutaway: boolean;
  config: SimConfig;
  focus?: CameraFocus;
  seek?: number;
};
type VehicleProps = Props & { markers: Markers };

/** A hull section along +X. In cutaway mode the shell becomes a translucent "ghost". */
function Hull({
  from,
  to,
  r1,
  r2 = r1,
  color = "#d9dcd6",
  ghost = false,
  finish = "metal",
  segments = 40,
}: {
  from: number;
  to: number;
  r1: number;
  r2?: number;
  color?: string;
  ghost?: boolean;
  finish?: "metal" | "blanket";
  segments?: number;
}) {
  const length = Math.abs(to - from);
  const skin = ghost ? null : surface(finish);
  return (
    <mesh position={[(from + to) / 2, 0, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow={!ghost} receiveShadow>
      <cylinderGeometry args={[r2, r1, length, segments, 1, ghost]} />
      <meshStandardMaterial
        color={color}
        {...skin}
        metalness={skin?.metalness ?? 0.25}
        roughness={skin ? 1 : 0.62}
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
  const piece = (length - 0.12 * (segments - 1)) / segments;
  const panel = useMemo(() => {
    const skin = surface("solar", tint);
    const tile = (source: THREE.DataTexture) => {
      const texture = source.clone();
      texture.repeat.set(Math.max(1, Math.round(width / 1.25)), Math.max(1, Math.round(piece / 1.25)));
      texture.needsUpdate = true;
      return texture;
    };
    return { ...skin, map: tile(skin.map), bumpMap: tile(skin.bumpMap), roughnessMap: tile(skin.roughnessMap) };
  }, [tint, width, piece]);
  useEffect(() => () => {
    panel.map.dispose();
    panel.bumpMap.dispose();
    panel.roughnessMap.dispose();
  }, [panel]);
  return (
    <group>
      <mesh position={[0, 0, length / 2]}>
        <boxGeometry args={[0.07, 0.07, length]} />
        <meshStandardMaterial color="#9aa1a5" metalness={0.8} roughness={0.3} />
      </mesh>
      {Array.from({ length: segments }, (_, index) => (
        <mesh key={index} position={[0, 0, piece / 2 + index * (piece + 0.12) + 0.15]} castShadow>
          <boxGeometry args={[width, 0.035, piece]} />
          <meshPhysicalMaterial {...panel} roughness={1} clearcoat={0.65} clearcoatRoughness={0.21} />
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

function couchRoute(index: number, seat: Vec3, progress: number, floor: number) {
  const stand = THREE.MathUtils.smoothstep(progress, 0, 0.42);
  const approach = THREE.MathUtils.smoothstep(progress, 0.20, 0.72);
  const cleared = THREE.MathUtils.smoothstep(progress, 1.45, 2);
  const target: Vec3 = [
    THREE.MathUtils.lerp(seat[0] * (1 - approach), (index - 1) * 0.65, cleared),
    THREE.MathUtils.lerp(seat[1], floor + CREW_HIP_HEIGHT, stand),
    progress < 1 ? THREE.MathUtils.lerp(seat[2], 2.1, progress) : 2.1 + (progress - 1) * 1.3 + cleared * (index % 2) * 0.45,
  ];
  const pose: Pose = progress === 0 ? "supine" : progress < 0.43 ? "rise" : "walk";
  return { target, pose };
}

/**
 * Places each crew member from the simulation. Idle people stay where the model
 * puts them; moving people travel along the anchor path facing where they go;
 * unconscious people go limp (orbit) or fall (gravity).
 */
function Crew({
  frame,
  path,
  outfit,
  gravity,
  floor,
  seats,
  closedHatches,
  markers,
}: {
  frame: SimFrame;
  path: Vec3[];
  outfit: Outfit;
  gravity: number;
  floor?: number;
  seats?: Vec3[];
  closedHatches?: number[];
  markers: Markers;
}) {
  const grounded = gravity >= 0.1;
  const followIndex = frame.crewStatus.findIndex((crew) => crew.moving);
  const focused = followIndex < 0 ? 0 : followIndex;
  const targets = frame.crewStatus.map(({ position }) => along(path, THREE.MathUtils.clamp(position, 0, 2)));

  // Two lanes along the cylindrical cabins. Keep space between successive suits
  // in each lane, including when several crew reach the same refuge coordinate.
  if (!seats) {
    for (const lane of [0, 1]) {
      const queue = targets.map((target, index) => ({ target, index }))
        .filter(({ index }) => index % 2 === lane)
        .sort((a, b) => b.target[0] - a.target[0] || a.index - b.index);
      let ahead = Infinity;
      for (const { target, index } of queue) {
        const rearWall = closedHatches?.filter((x) => x < target[0]).at(-1);
        const frontWall = closedHatches?.find((x) => x >= target[0]);
        const padding = 1.07;
        const minimum = rearWall === undefined ? -Infinity : rearWall + padding;
        const maximum = frontWall === undefined ? Infinity : frontWall - padding;
        const gap = frame.crewStatus[index].moving ? (grounded ? 1.4 : 1.8) : 0.95;
        target[0] = Math.max(minimum, Math.min(target[0], maximum, ahead - gap));
        target[2] = lane === 0 ? -0.4 : 0.4;
        ahead = target[0];
      }
    }
  }

  return (
    <>
      {frame.crewStatus.map((crew, index) => {
        const down = crew.state === "incapacitated" || crew.state === "lethal";
        let target = targets[index];
        let heading = seats ? 0 : Math.PI / 2;
        let pose: Pose = down ? (grounded ? "down" : "limp") : (grounded ? "stand" : "neutral");
        let route: CrewRoute | undefined;
        let key = String(index);

        if (seats) {
          const seat = seats[index];
          if (!down) {
            route = { progress: crew.position, sample: (progress) => couchRoute(index, seat, progress, floor!) };
            ({ target, pose } = route.sample(route.progress));
          } else if (crew.position === 0) {
            target = seat;
            pose = "slumped";
          } else if (crew.position < 2) {
            route = {
              progress: crew.position,
              halted: true,
              sample: (progress) => progress === 0
                ? { target: seat, pose: "slumped" }
                : { target: couchRoute(index, seat, progress, floor!).target, pose: "down" },
            };
            ({ target, pose } = route.sample(route.progress));
          } else {
            // The rescue event moves an incapacitated person to the white room.
            target = [(index - 1) * 0.65, floor! + CREW_HIP_HEIGHT, 3.08 + (index % 2) * 0.3];
            heading = Math.PI;
            key += "-rescued";
          }
        } else if (grounded && floor !== undefined) {
          target[1] = floor + CREW_HIP_HEIGHT;
        }

        const status = down ? "down" : crew.state === "safe" ? "safe" : crew.state === "impaired" ? "danger" : "ok";
        return (
          <Person
            key={key}
            target={target}
            heading={heading}
            pose={pose}
            outfit={outfit}
            seed={index}
            status={status}
            closedHatches={closedHatches}
            route={route}
            onRoot={index === focused ? (node) => { markers.current.crew = node; } : undefined}
          />
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
  return (
    <group>
      <Hull from={-0.25} to={0} r1={1.22} r2={1.18} color="#879573" finish="blanket" ghost={ghost} />
      <Hull from={-2.1} to={-0.25} r1={1.25} r2={1.22} color="#879573" finish="blanket" ghost={ghost} />
      <Hull from={-2.4} to={-2.1} r1={0.6} r2={1.25} color="#879573" finish="blanket" ghost={ghost} />
      <Hull from={-2.4} to={-4.5} r1={0.6} r2={1.08} color="#6f7d5c" finish="blanket" ghost={ghost} />
      <Hull from={-4.5} to={-4.65} r1={1.1} color="#3a3330" />
      <Hull from={-4.65} to={-7.0} r1={1.36} color="#c9cbc4" ghost={ghost} />
      <Hull from={-6.6} to={-7.0} r1={1.45} r2={1.36} color="#8f969a" />
      {[-1, 1].map((side) => (
        <group key={side} position={[-6.0, 0, side * 1.35]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <SolarWing length={4.2} width={1.15} tint="#25335a" segments={4} />
        </group>
      ))}
      <mesh position={[-0.1, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[1.18, 1.18, 0.3, 32, 1, true]} />
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
  return (
    <group>
      <Hull from={0} to={1.4} r1={0.8} r2={1.3} finish="blanket" />
      <Hull from={1.4} to={length * 0.55} r1={1.45} finish="blanket" />
      <Hull from={length * 0.55} to={length * 0.62} r1={1.45} r2={radius} finish="blanket" />
      <Hull from={length * 0.62} to={length} r1={radius} finish="blanket" />
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
function CommandModule({ ghost = false, hatchOpen = false, dockingTunnel = false }: { ghost?: boolean; hatchOpen?: boolean; dockingTunnel?: boolean }) {
  const hatchAngle = 0.49;
  const profile = useMemo(
    () =>
      [
        [0.0, 0.0],
        [1.95, 0.25],
        [1.95, 0.42],
        [1.06, 2.15],
        [0.62, 3.0],
        [0.5, 3.05],
        [0.5, 3.4],
        ...(!dockingTunnel ? [[0.0, 3.4]] : []),
      ].map(([x, y]) => new THREE.Vector2(x, y)),
    [dockingTunnel],
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
        <latheGeometry args={[profile, 48, hatchOpen ? hatchAngle : 0, hatchOpen ? Math.PI * 2 - 2 * hatchAngle : Math.PI * 2]} />
        <meshStandardMaterial
          color="#dfe2e1"
          {...(!ghost && surface("metal"))}
          metalness={ghost ? 0.2 : 0.72}
          roughness={ghost ? 0.35 : 1}
          transparent={ghost}
          opacity={ghost ? 0.16 : 1}
          depthWrite={!ghost}
          side={THREE.DoubleSide}
        />
      </mesh>
      {hatchOpen && (
        [profile.slice(0, 2), profile.slice(3)].map((section, index) => (
          <mesh key={index} castShadow>
            <latheGeometry args={[section, 12, -hatchAngle, 2 * hatchAngle]} />
            <meshStandardMaterial color="#dfe2e1" {...surface("metal")} roughness={0.7} transparent={ghost} opacity={ghost ? 0.16 : 1} depthWrite={!ghost} side={THREE.DoubleSide} />
          </mesh>
        ))
      )}
      <mesh>
        <latheGeometry args={[shield, 48]} />
        <meshStandardMaterial {...surface("shield")} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* Windows */}
      {[-0.55, 0.55].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 1.25, 1.95, Math.cos(a) * 1.25]} rotation={[-0.6, a, 0]}>
          <planeGeometry args={[0.32, 0.26]} />
          <meshStandardMaterial color="#152b39" metalness={0.42} roughness={0.12} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* Side hatch */}
      <mesh position={hatchOpen ? [0.97, 1.2, 1.78] : [0, 1.2, 1.58]} rotation={[-0.48, hatchOpen ? -1.2 : 0, 0]}>
        <boxGeometry args={[0.95, 1.65, 0.045]} />
        <meshStandardMaterial color="#9ca4a7" {...surface("metal")} roughness={1} />
      </mesh>
      {/* Docking probe */}
      {!dockingTunnel && <mesh position={[0, 3.62, 0]}>
        <coneGeometry args={[0.15, 0.45, 12]} />
        <meshStandardMaterial color="#9aa1a5" metalness={0.8} />
      </mesh>}
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
        <meshStandardMaterial {...surface("metal")} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      {/* Radiator panels */}
      {[0.7, 2.6, 4.1].map((a) => (
        <mesh key={a} position={[Math.sin(a) * 1.97, -2.0, Math.cos(a) * 1.97]} rotation={[0, a, 0]}>
          <planeGeometry args={[0.9, 3.2]} />
          <meshStandardMaterial {...surface("radiator")} roughness={1} side={THREE.DoubleSide} />
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
  const ascentProfile = useMemo(() => [
    [0, -2.55], [1.13, -2.55], [1.46, -2.05], [1.46, -0.93], [0.55, -0.42], [0.5, 0.15],
  ].map(([radius, height]) => new THREE.Vector2(radius, height)), []);
  return (
    <group rotation={[Math.PI, 0, 0]}>
      {/* Ascent stage */}
      <mesh castShadow>
        <latheGeometry args={[ascentProfile, 12]} />
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
      <group position={[-1.1, -1.9, -0.6]}>
        <Dish radius={0.35} />
      </group>
      {/* Descent stage: octagonal, wrapped in gold foil */}
      <mesh position={[0, -3.4, 0]} rotation={[0, Math.PI / 8, 0]} castShadow>
        <cylinderGeometry args={[2.15, 2.15, 1.7, 8]} />
        <meshStandardMaterial {...surface("foil")} roughness={1} flatShading />
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
  mir: { suit: "#2e4a72", trim: "#c9ccc4" },
  apollo1: { suit: "#e7e4d9", trim: "#9aa0a2" },
  apollo13: { suit: "#d8d2bf", trim: "#7d7a70" },
  aegis: { suit: "#3d4b5c", trim: "#9aa6b2" },
};

function Mir({ frame, cutaway, config, markers }: VehicleProps) {
  // 1 unit = 1 m; group scaled to fit. Core runs along +X from x = 0.
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
      <Hull from={0} to={6.4} r1={2.07} finish="blanket" ghost={ghost} />
      <Hull from={6.4} to={7.6} r1={2.07} r2={1.45} finish="blanket" ghost={ghost} />
      <Hull from={7.6} to={11.6} r1={1.45} finish="blanket" ghost={ghost} />
      <RingFrame x={0} r={2.07} />
      <RingFrame x={6.4} r={2.07} />
      <Hull from={11.6} to={12.35} r1={1.45} r2={1.2} ghost={ghost} />
      <Hull from={12.35} to={13.45} r1={1.2} ghost={ghost} />
      <Hull from={13.45} to={13.8} r1={1.2} r2={1.18} ghost={ghost} />
      {[-1, 1].map((side) => (
        <group key={side} position={[3.5, 1.2, side * 2.07]} rotation={[0, side > 0 ? 0 : Math.PI, 0]}>
          <SolarWing length={11.5} width={3.4} tint="#2a2f6a" segments={8} />
        </group>
      ))}
      <group position={[9.5, 1.5, 0]}>
        <Dish radius={0.55} />
      </group>
      {/* Kvant-1 and the Sofora truss */}
      <Hull from={-5.8} to={0} r1={2.07} finish="blanket" ghost={ghost} />
      <RingFrame x={-5.8} r={2.07} />
      <group position={[-3, 2.07, 0]}>
        <Lattice length={14} width={0.7} />
        <mesh position={[0, 14.4, 0]}>
          <boxGeometry args={[1.1, 0.9, 1.1]} />
          <meshStandardMaterial color="#d3d4cb" {...surface("blanket")} roughness={1} />
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
          <Interior from={-5.6} to={11.6} radius={1.95} narrowFrom={6.6} narrowRadius={1.4} floor={-0.87} />
          <mesh position={[13.7, -0.9, 0]} receiveShadow>
            <boxGeometry args={[4.2, 0.06, 1.2]} />
            <meshStandardMaterial {...surface("deck")} roughness={1} />
          </mesh>
          {/* Oxygen candle (SFOG) mounted low on the Kvant-1 wall */}
          <mesh position={[-4.7, -1.35, -1.35]}>
            <boxGeometry args={[0.45, 0.6, 0.35]} />
            <meshStandardMaterial color="#5f6058" metalness={0.5} roughness={0.5} />
          </mesh>
          <Smoke amount={kvant.smoke} center={[-2.9, 0, 0]} length={5.6} radius={1.9} gravity={config.gravity} flow={config.airflow} tint="#a29d94" />
          <Smoke amount={core.smoke} center={[5.5, 0, 0]} length={11} radius={1.7} gravity={config.gravity} flow={config.airflow} tint="#a6a49e" />
          <Smoke amount={soyuz.smoke} center={[15, 0, 0]} length={2.2} radius={1.0} gravity={config.gravity} flow={config.airflow} />
          <Crew frame={frame} path={path} outfit={outfits.mir} gravity={config.gravity} floor={-0.87} markers={markers} />
          <Label k={6.5} position={[-2.9, 3.4, 0]} name={kvant.name} detail={kvant.visibilityText} level={kvant.level} />
          <Label k={6.5} position={[5, 3.1, 0]} name={core.name} detail={core.visibilityText} level={core.level} />
          <Label k={6.5} position={[15.2, 2.4, 0]} name="Soyuz TM-25" detail={soyuz.visibilityText} level={soyuz.level} />
          <Label k={6.5} position={[-10, 2.6, 0]} name="Soyuz TM-24" detail="Detrás del fuego" level="danger" />
        </>
      )}
      <Marker name="fire" position={firePos} markers={markers} />
      {/* Lithium perchlorate candle: a torch-like jet. Without gravity the sparks fly straight. */}
      <Flame
        position={[-4.7, -1.05, -1.1]}
        rotation={[0.25, -Math.PI / 2, 0]}
        size={0.65}
        intensity={frame.fireIntensity}
        gravity={config.gravity}
        flow={1.3}
        soot={0.55}
        turbulence={1.6}
      />
      <Sparks position={[-4.7, -1.05, -1.1]} direction={[0.15, 0.25, 1]} intensity={frame.fireIntensity} gravity={config.gravity} reach={1.9} />
      {frame.flags.hatchToFire && (
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
  floor,
}: {
  from: number;
  to: number;
  radius: number;
  narrowFrom?: number;
  narrowRadius?: number;
  floor?: number;
}) {
  const bays = Math.floor((to - from) / 1.1);
  return (
    <group>
      {Array.from({ length: bays }, (_, i) => {
        const x = from + 0.55 + i * 1.1;
        const r = narrowFrom !== undefined && x > narrowFrom ? narrowRadius! : radius;
        return (
          <group key={i} position={[x, 0, 0]}>
            <mesh position={[0, floor === undefined ? -r * 0.82 : floor - 0.03, 0]} receiveShadow>
              <boxGeometry args={[1.1, 0.06, r]} />
              <meshStandardMaterial {...surface("deck")} roughness={1} />
            </mesh>
            {/* Equipment racks on the far wall only, so the crew stays visible. */}
            <mesh position={[0, -0.1, -r * 0.78]}>
              <boxGeometry args={[0.95, r * 0.95, 0.26]} />
              <meshStandardMaterial color={i % 3 ? "#b9bdb3" : "#9fa79d"} {...surface("metal")} metalness={0.3} roughness={1} />
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

const DOCKING_TRANSFER = 1.5;
const TRANSFER_SECONDS = DOCKING_TRANSFER / CREW_ROUTE_RATE;

function dockingRoute(index: number, progress: number, down: boolean) {
  const step = THREE.MathUtils.clamp((progress - index * 0.32) / 0.86, 0, 1);
  const lineUp = THREE.MathUtils.smoothstep(step, 0, 0.22);
  const spreadOut = THREE.MathUtils.smoothstep(step, 0.79, 1);
  const advance = THREE.MathUtils.smoothstep(step, 0.16, 0.84);
  const cabinOffset = 1 - lineUp + spreadOut;
  const target: Vec3 = [
    (index - 1) * 0.78 * cabinOffset,
    THREE.MathUtils.lerp(1.18, 5.17, advance),
    (index === 1 ? 0.62 : 0) * cabinOffset,
  ];
  const pose: Pose = step > 0 && step < 1 ? "tunnel" : down ? "limp" : "neutral";
  return { target, pose };
}

function Apollo13({ frame, cutaway, config, markers }: VehicleProps) {
  const [sm] = frame.modules;
  // Stack along +Y then laid along X: SPS engine → SM → CM → LM.
  const since = frame.sinceIncident / 3600; // hours since the explosion
  const serviceOffset = frame.flags.smJettisoned ? -Math.min(30, (since - 82) * 6 + 2) : 0;
  const lunarOffset = frame.flags.lmJettisoned ? Math.min(30, (since - 86.5) * 12 + 2) : 0;
  const service = useRef<THREE.Group>(null);
  const lander = useRef<THREE.Group>(null);
  const hatch = useRef<THREE.Mesh>(null);
  const separation = useRef({ service: serviceOffset, lunar: lunarOffset, inRefuge: frame.flags.inRefuge, hold: 0 });
  const initialOffsets = useRef({ service: serviceOffset, lunar: lunarOffset });

  useFrame((_, delta) => {
    const state = separation.current;
    if (state.inRefuge && !frame.flags.inRefuge) state.hold = TRANSFER_SECONDS;
    state.inRefuge = frame.flags.inRefuge;
    state.hold = Math.max(0, state.hold - delta);
    state.service = THREE.MathUtils.damp(state.service, serviceOffset, 1.75, delta);
    state.lunar = THREE.MathUtils.damp(state.lunar, state.hold > 0 ? 0 : lunarOffset, 1.75, delta);
    if (service.current) service.current.position.y = state.service;
    if (lander.current) lander.current.position.y = 3.55 + state.lunar;
    if (hatch.current) hatch.current.visible = state.lunar > 0.05;
  });

  const bay = Math.PI / 6;
  const out: Vec3 = [Math.sin(bay), 0, Math.cos(bay)];
  return (
    <group scale={0.42} rotation={[0, 0, -Math.PI / 2]} position={[0.6, 0.3, 0]}>
      {/* The service module is jettisoned ~4.5 h before entry, the LM ~1 h before. */}
      <group ref={service} position={[0, initialOffsets.current.service, 0]}>
        <ServiceModule damaged={since >= 0} />
      </group>
      <CommandModule ghost={cutaway} dockingTunnel />
      <mesh ref={hatch} position={[0, 3.39, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={initialOffsets.current.lunar > 0}>
        <circleGeometry args={[0.5, 48]} />
        <meshStandardMaterial color="#b9c0bf" metalness={0.5} roughness={0.65} side={THREE.DoubleSide} />
      </mesh>
      <group ref={lander} position={[0, 3.55 + initialOffsets.current.lunar, 0]}>
        <LunarModule ghost={cutaway} />
      </group>
      <Marker name="fire" position={[out[0] * 1.9, -2.3, out[2] * 1.9]} markers={markers} />
      {/* No flame is visible: the tank ruptured inside the module. Oxygen escapes as a sunlit cloud. */}
      <Vent position={[out[0] * 1.95, -2.3, out[2] * 1.95]} direction={out} intensity={frame.flags.smJettisoned ? 0 : frame.fireIntensity} burst={since >= 0 && since < 1 ? 1 - since : 0} />
      {since >= 0 && since < 0.6 && <pointLight position={[out[0] * 2.5, -2.3, out[2] * 2.5]} intensity={60} distance={20} color="#fff3d6" />}
      {/* Bay 4 panel drifting away */}
      {since >= 0 && since < 2 && (
        <group position={[out[0] * (2.2 + since * 9), -2.3 + since * 1.2, out[2] * (2.2 + since * 9)]} rotation={[since * 2.4, bay + since * 1.5, since * 0.9]}>
          <mesh>
            <cylinderGeometry args={[1.96, 1.96, 4.2, 12, 1, true, -Math.PI / 6, Math.PI / 3]} />
            <meshStandardMaterial color="#e3e5e2" metalness={0.7} roughness={0.3} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
      {cutaway && (
        <>
          {frame.crewStatus.map((crew, index) => {
            if (crew.state === "lethal" && crew.module === 2 && frame.flags.lmJettisoned) return null;
            const down = crew.state === "incapacitated" || crew.state === "lethal";
            const progress = crew.module === 2 ? DOCKING_TRANSFER : 0;
            const sample = (value: number) => dockingRoute(index, value, down);
            const { target, pose } = sample(progress);
            return <Person
              key={index}
              target={target}
              heading={Math.PI}
              pose={pose}
              outfit={outfits.apollo13}
              seed={index}
              status={down ? "down" : crew.state === "impaired" ? "danger" : crew.state === "safe" ? "safe" : "ok"}
              route={{ progress, sample }}
              onRoot={index === 0 ? (node) => { markers.current.crew = node; } : undefined}
            />;
          })}
          <Label k={2.6} position={[0, -2.5, 2.6]} name="Servicio" detail={since >= 0 ? "Panel 4 arrancado" : "Normal"} level={since >= 0 ? "danger" : "ok"} />
          <Label k={2.6} position={[0, 1.6, 2.6]} name="Mando Odyssey" detail={`Baterías de reentrada ${Math.round(frame.life?.cmBattery ?? 100)} %`} level={(frame.life?.cmBattery ?? 100) < 50 ? "danger" : "ok"} />
          <Label k={2.6} position={[0, 6.2, 2.8]} name="Lunar Aquarius" detail={config.backup ? (frame.life ? `CO₂ ${frame.life.co2mmHg.toFixed(1).replace(".", ",")} mmHg` : "Refugio") : "Sin usar"} level={frame.modules[2].level} />
          <Label k={2.6} position={[0, -0.4, -2.6]} name={sm.name === "Servicio" ? "Tanque O₂ 2" : sm.name} detail={since >= 0 ? "Roto" : "Agitando"} level={since >= 0 ? "danger" : "watch"} />
        </>
      )}
    </group>
  );
}

function Apollo1({ frame, cutaway, config, markers }: VehicleProps) {
  const [cabin, hatch] = frame.modules;
  const hatchOpen = frame.flags.hatchOpen;
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
  const ruptured = frame.flags.ruptured;
  const soot = sootFor(config);
  return (
    <group scale={0.95} position={[0, -1.3, 0]} rotation={[0, Math.PI / 2, 0]}>
      <CommandModule ghost={cutaway} hatchOpen={hatchOpen} />
      <ServiceModule />
      {/* Adapter and S-IVB stage of the Saturn IB below, fading into the night */}
      <mesh position={[0, -6.6, 0]}>
        <cylinderGeometry args={[1.96, 3.3, 4.2, 48, 1, true]} />
        <meshStandardMaterial {...surface("metal")} metalness={0.18} roughness={1} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, -13.5, 0]}>
        <cylinderGeometry args={[3.3, 3.3, 9.6, 48]} />
        <meshStandardMaterial {...surface("metal")} metalness={0.18} roughness={1} />
      </mesh>
      {/* Service structure: white room, access arm and the launch tower */}
      <group position={[0, 1.4, 3.3]}>
        {[-1.03, 1.03].map((x) => (
          <mesh key={x} position={[x, 0, 0]}>
            <boxGeometry args={[0.08, 2.2, 1.65]} />
            <meshStandardMaterial color="#e9ebe6" roughness={0.7} transparent opacity={cutaway ? 0.22 : 1} depthWrite={!cutaway} />
          </mesh>
        ))}
        <mesh position={[0, 1.1, 0]}>
          <boxGeometry args={[2.14, 0.08, 1.65]} />
          <meshStandardMaterial color="#e9ebe6" roughness={0.7} />
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
          <mesh position={[0, 0.22, 1.05]} receiveShadow>
            <boxGeometry args={[1.78, 0.06, 5.4]} />
            <meshStandardMaterial {...surface("deck")} roughness={1} />
          </mesh>
          {seats.map((seat, i) => (
            <group key={i} position={[seat[0], 0.55, -0.1]}>
              {/* Back pan, thigh pan and raised leg pan: the launch posture, knees up. */}
              <mesh position={[0, 0.02, -0.52]}>
                <boxGeometry args={[0.56, 0.07, 0.95]} />
                <meshStandardMaterial color="#737e6d" {...surface("fabric")} roughness={1} />
              </mesh>
              <mesh position={[0, 0.22, 0.08]} rotation={[-1.0, 0, 0]}>
                <boxGeometry args={[0.56, 0.07, 0.48]} />
                <meshStandardMaterial color="#737e6d" {...surface("fabric")} roughness={1} />
              </mesh>
              <mesh position={[0, 0.44, 0.42]}>
                <boxGeometry args={[0.5, 0.06, 0.48]} />
                <meshStandardMaterial color="#737e6d" {...surface("fabric")} roughness={1} />
              </mesh>
              {/* Strut down to the floor */}
              <mesh position={[0, -0.25, -0.3]}>
                <boxGeometry args={[0.06, 0.5, 0.06]} />
                <meshStandardMaterial color="#8a8f90" metalness={0.6} roughness={0.4} />
              </mesh>
            </group>
          ))}
          {/* Main display console above the crew */}
          <mesh position={[0, 2.05, -0.15]} rotation={[0.35, 0, 0]}>
            <boxGeometry args={[2.1, 0.08, 0.75]} />
            <meshStandardMaterial color="#2c3438" emissive="#2f6f63" emissiveIntensity={0.25} />
          </mesh>
          <Crew frame={frame} path={path} seats={seats} outfit={outfits.apollo1} gravity={1} floor={0.25} markers={markers} />
          <Smoke amount={cabin.smoke} center={[0, 1.3, 0]} length={2.6} radius={1.25} gravity={1} tint="#4a4540" />
          <Label k={2} position={[0, 3.9, 0]} name="Cabina" detail={`${Math.round(cabin.temperature)} °C · ${Math.round(frame.pressure)} kPa`} level={frame.pressure > 160 || ruptured ? "danger" : cabin.level} />
          <Label k={2} position={[0, 2.9, 2.9]} name={hatch.name} detail={hatchOpen ? "Abierta" : config.isolation ? "Apertura rápida" : `Cerrada · ${Math.round(frame.pressure)} kPa dentro`} level={hatchOpen ? "ok" : "danger"} />
        </>
      )}
      <Marker name="fire" position={[-0.6, 0.7, 0.1]} markers={markers} />
      {/* Starts below the left couch, then spreads left to right across nets and Velcro. */}
      {[
        [-1.05, 0.32, 0.3, 0],
        [-1.25, 0.85, -0.45, 0.25],
        [-0.35, 0.3, 0.75, 0.45],
        [0.45, 0.3, 0.8, 0.62],
        [1.2, 0.75, -0.35, 0.8],
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
  const closed = frame.flags.hatchToFire;
  const path: Vec3[] = [
    [-5.5, 0, 0],
    [0.2, 0, 0],
    [6.85, 0, 0],
  ];
  return (
    <group scale={0.36} position={[0, 0.2, 0]}>
      <Hull from={-8} to={-3.2} r1={1.8} ghost={ghost} />
      <Hull from={-2.6} to={3.2} r1={2.3} ghost={ghost} />
      <Hull from={4.0} to={8.4} r1={1.9} color="#e7ecdf" ghost={ghost} />
      {[-2.9, 3.6].map((x, index) => {
        const sealed = index === 0 ? closed : frame.flags.refugeSealed;
        return (
        <group key={x}>
          <mesh position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[1.18, 1.18, 0.8, 40, 1, true]} />
            <meshStandardMaterial color="#bfc6c2" metalness={0.35} roughness={0.7} side={THREE.DoubleSide} />
          </mesh>
          {sealed && (
          <mesh position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <circleGeometry args={[1.18, 40]} />
            <meshStandardMaterial
              color="#e4a477"
              emissive="#e4a477"
              emissiveIntensity={0.35}
              side={THREE.DoubleSide}
            />
          </mesh>
          )}
        </group>
        );
      })}
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
          <meshStandardMaterial {...surface("radiator")} roughness={1} />
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
          <Interior from={-7.8} to={8.2} radius={1.75} floor={-0.87} />
          <group position={[-6, -0.9, 1.27]}>
            <mesh position={[0, -0.12, 0]}>
              <boxGeometry args={[1.35, 0.08, 0.65]} />
              <meshStandardMaterial {...surface("metal")} roughness={1} />
            </mesh>
            {[-0.35, 0.35].map((x, index) => {
              const telemetry = frame.aegis;
              const temperature = telemetry ? (index === 0 ? telemetry.failedC : telemetry.neighborC) : 22;
              return (
                <mesh key={x} position={[x, 0.12, 0]}>
                  <boxGeometry args={[0.54, 0.42, 0.48]} />
                  <meshStandardMaterial {...surface("metal")} color="#8b959a" roughness={1} emissive="#ae350c" emissiveIntensity={THREE.MathUtils.clamp((temperature - 60) / 180, 0, 0.48)} />
                </mesh>
              );
            })}
            {config.aegisRack !== "shared" && (
              <mesh position={[0, 0.17, 0]}>
                <boxGeometry args={[0.075, 0.54, 0.58]} />
                <meshStandardMaterial color="#cbb390" roughness={0.95} />
              </mesh>
            )}
          </group>
          <Smoke amount={service.smoke} center={[-5.6, 0, 0]} length={4.4} radius={1.6} gravity={config.gravity} flow={config.airflow} tint="#8b847c" />
          <Smoke amount={habitat.smoke} center={[0.3, 0, 0]} length={5.6} radius={2.0} gravity={config.gravity} flow={config.airflow} />
          <Smoke amount={refuge.smoke} center={[6.2, 0, 0]} length={4.2} radius={1.7} gravity={config.gravity} flow={config.airflow} />
          <Crew frame={frame} path={path} outfit={outfits.aegis} gravity={config.gravity} floor={-0.87} markers={markers} closedHatches={[...(closed ? [-2.9] : []), ...(frame.flags.refugeSealed ? [3.6] : [])]} />
          <Label k={2.8} position={[-5.6, 3.0, 0]} name={service.name} detail={service.visibilityText} level={service.level} />
          <Label k={2.8} position={[0.3, 3.5, 0]} name={habitat.name} detail={habitat.visibilityText} level={habitat.level} />
          <Label k={2.8} position={[6.2, 3.0, 0]} name={refuge.name} detail={refuge.visibilityText} level={refuge.level} />
        </>
      )}
      <Marker name="fire" position={[-6, -0.6, 1.27]} markers={markers} />
      {/* Secondary flame from the battery vent gases. */}
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

const framing: Record<ScenarioId, { width: number; min: number; target: Vec3; close: number; lift: number }> = {
  mir: { width: 10, min: 1.2, target: [0.4, 0.1, 0], close: 1.7, lift: 0.3 },
  apollo1: { width: 9, min: 1.2, target: [0, 0.4, 0], close: 4.2, lift: 0.45 },
  apollo13: { width: 8.5, min: 1.2, target: [0.4, 0.2, 0], close: 4.5, lift: 0.15 },
  aegis: { width: 7.5, min: 1.2, target: [0, 0.2, 0], close: 2.4, lift: -0.1 },
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
      const distance = framing[scenario].close * (focus === "fire" ? 1 : 1.1);
      // Look from slightly above so the crew is not hidden behind hull and couches.
      const offset = camera.position.clone().sub(orbit.target).normalize();
      offset.y = Math.max(offset.y, framing[scenario].lift);
      offset.normalize().multiplyScalar(distance);
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
      <color attach="background" args={[night ? "#04070b" : "#03060b"]} />
      <ambientLight intensity={night ? 0.12 : 0.18} color="#b3d8e1" />
      {!night && <directionalLight position={[8, 5, 6]} intensity={3.6} color="#fff6e6" castShadow shadow-mapSize={[1024, 1024]} />}
      <directionalLight position={[-6, -3, -4]} intensity={night ? 0.2 : 0.45} color="#5a8fbf" />
      <Environment resolution={128}>
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
      shadows={!props.lightweight}
      dpr={props.lightweight ? 1 : [1, 1.75]}
      camera={{ position: [7.6, 5.0, 8.5], fov: 34, near: 0.05, far: 2000 }}
      gl={{ antialias: false, alpha: false, toneMapping: props.lightweight ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping }}
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
            <Apollo13 key={props.seek} {...vehicle} />
          ) : (
            <Aegis {...vehicle} />
          )}
        </Scene>
        </LabelsVisible.Provider>
        {!props.lightweight && <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={0.9} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <Vignette offset={0.3} darkness={0.55} />
        </EffectComposer>}
        <OrbitControls makeDefault enablePan={false} minDistance={framing[props.scenario].min} maxDistance={45} enableDamping dampingFactor={0.08} />
        <CameraRig scenario={props.scenario} focus={focus} markers={markers} />
      </Suspense>
    </Canvas>
  );
}
