import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars, ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type { ScenarioId, SimFrame } from "../lib/simulation";

type SpacecraftProps = {
  scenario: ScenarioId;
  frame: SimFrame;
  cutaway: boolean;
  gravity?: number;
};
const metal = "#a4b3b8";
const dark = "#1b2935";
const accent = "#69c8c6";

function ModuleLabel({
  text,
  position,
  warning,
}: {
  text: string;
  position: [number, number, number];
  warning: boolean;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#0e1b27";
    context.fillRect(0, 0, 512, 96);
    context.strokeStyle = "#587383";
    context.lineWidth = 3;
    context.strokeRect(2, 2, 508, 92);
    context.fillStyle = warning ? "#e4a477" : "#c6ed9c";
    context.beginPath();
    context.arc(34, 48, 7, 0, Math.PI * 2);
    context.fill();
    context.font = "30px sans-serif";
    context.textBaseline = "middle";
    context.fillStyle = "#d2e1e6";
    context.fillText(text, 60, 49, 435);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    return map;
  }, [text, warning]);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <sprite position={position} scale={[1.75, 0.33, 1]} renderOrder={5}>
      <spriteMaterial map={texture} transparent depthTest={false} />
    </sprite>
  );
}

function SolarArray({
  position,
  width = 3.8,
  height = 1.6,
}: {
  position: [number, number, number];
  width?: number;
  height?: number;
}) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[width + 0.12, 0.055, height + 0.1]} />
        <meshStandardMaterial
          color="#344450"
          metalness={0.85}
          roughness={0.3}
        />
      </mesh>
      {Array.from({ length: 12 }, (_, column) =>
        Array.from({ length: 5 }, (_, row) => (
          <mesh
            key={`${column}-${row}`}
            position={[
              -width / 2 + ((column + 0.5) * width) / 12,
              0.034,
              -height / 2 + ((row + 0.5) * height) / 5,
            ]}
          >
            <boxGeometry
              args={[width / 12 - 0.018, 0.012, height / 5 - 0.018]}
            />
            <meshStandardMaterial
              color={(column + row) % 3 === 0 ? "#203a63" : "#172e50"}
              metalness={0.72}
              roughness={0.28}
            />
          </mesh>
        )),
      )}
      <mesh position={[0, -0.075, 0]}>
        <boxGeometry args={[width, 0.08, 0.08]} />
        <meshStandardMaterial color={metal} metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

function Ring({
  x,
  radius = 0.66,
  color = "#c1ccce",
}: {
  x: number;
  radius?: number;
  color?: string;
}) {
  return (
    <mesh position={[x, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
      <torusGeometry args={[radius, 0.035, 6, 40]} />
      <meshStandardMaterial color={color} metalness={0.8} roughness={0.28} />
    </mesh>
  );
}

function Module({
  position,
  length = 2.5,
  radius = 0.66,
  rotation = [0, 0, 0],
  cutaway,
  conceptual = false,
}: {
  position: [number, number, number];
  length?: number;
  radius?: number;
  rotation?: [number, number, number];
  cutaway: boolean;
  conceptual?: boolean;
}) {
  return (
    <group position={position} rotation={rotation}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry
          args={[
            radius,
            radius,
            length,
            48,
            1,
            true,
            cutaway ? 1.85 : 0,
            cutaway ? 4.3 : Math.PI * 2,
          ]}
        />
        <meshStandardMaterial
          color={conceptual ? "#e1e7e1" : metal}
          metalness={0.64}
          roughness={0.42}
          side={THREE.DoubleSide}
        />
      </mesh>
      {[-length / 2, -length / 3, 0, length / 3, length / 2].map((x, index) => (
        <Ring
          key={index}
          x={x}
          radius={radius}
          color={conceptual && index % 2 ? accent : "#85969e"}
        />
      ))}
      {[-1, 1].map((side) => (
        <group key={side} position={[(side * length) / 2, 0, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[radius * 0.87, radius * 0.87, 0.13, 40]} />
            <meshStandardMaterial
              color={dark}
              metalness={0.6}
              roughness={0.55}
            />
          </mesh>
          <Ring
            x={side * 0.1}
            radius={radius * 0.58}
            color={conceptual ? accent : "#c6aa70"}
          />
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[radius * 0.53, radius * 0.53, 0.15, 32]} />
            <meshStandardMaterial
              color="#324a54"
              metalness={0.8}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
      {cutaway && (
        <group>
          <mesh position={[0, -radius * 0.53, 0]}>
            <boxGeometry args={[length - 0.13, 0.055, radius * 1.4]} />
            <meshStandardMaterial
              color="#526572"
              metalness={0.4}
              roughness={0.6}
            />
          </mesh>
          {Array.from({ length: 5 }, (_, index) => (
            <group
              key={index}
              position={[
                -length * 0.38 + index * length * 0.19,
                -radius * 0.1,
                -radius * 0.55,
              ]}
            >
              <mesh>
                <boxGeometry args={[length * 0.17, radius * 0.65, 0.2]} />
                <meshStandardMaterial
                  color={index % 2 ? "#60737d" : "#bdc5be"}
                  metalness={0.3}
                  roughness={0.55}
                />
              </mesh>
              <mesh position={[0, 0.06, 0.106]}>
                <boxGeometry args={[length * 0.1, 0.11, 0.01]} />
                <meshStandardMaterial
                  color="#153a43"
                  emissive={accent}
                  emissiveIntensity={0.35}
                />
              </mesh>
              <mesh position={[0.035, -0.085, 0.11]}>
                <sphereGeometry args={[0.018, 8, 8]} />
                <meshBasicMaterial color="#ebae65" />
              </mesh>
            </group>
          ))}
          <mesh position={[0, -radius * 0.44, radius * 0.4]}>
            <boxGeometry args={[length * 0.85, 0.015, 0.025]} />
            <meshBasicMaterial color={accent} />
          </mesh>
        </group>
      )}
      {!cutaway &&
        Array.from({ length: 4 }, (_, index) => (
          <mesh
            key={index}
            position={[
              -length * 0.3 + index * length * 0.2,
              radius * 0.71,
              radius * 0.71,
            ]}
            rotation={[Math.PI / 4, 0, 0]}
          >
            <boxGeometry args={[length * 0.15, 0.08, 0.28]} />
            <meshStandardMaterial
              color="#263f4e"
              metalness={0.75}
              roughness={0.25}
            />
          </mesh>
        ))}
    </group>
  );
}

function Fire({
  position,
  intensity,
  microgravity,
}: {
  position: [number, number, number];
  intensity: number;
  microgravity: boolean;
}) {
  const fire = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (fire.current) {
      const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.045;
      fire.current.scale.setScalar(pulse * Math.max(0.05, intensity));
    }
  });
  if (intensity < 0.03) return null;
  return (
    <group position={position} ref={fire}>
      <pointLight
        color="#ff7e3b"
        intensity={2.4 * intensity}
        distance={3}
        decay={2}
      />
      <mesh scale={microgravity ? [0.32, 0.32, 0.32] : [0.23, 0.55, 0.23]}>
        <sphereGeometry args={[1, 24, 20]} />
        <meshBasicMaterial
          color={microgravity ? "#66baf7" : "#ffad55"}
          transparent
          opacity={0.45}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh scale={[0.19, microgravity ? 0.19 : 0.35, 0.19]}>
        <sphereGeometry args={[1, 16, 12]} />
        <meshBasicMaterial
          color="#ffb273"
          transparent
          opacity={0.85}
          depthWrite={false}
        />
      </mesh>
      <mesh scale={[0.09, microgravity ? 0.09 : 0.22, 0.09]}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial color="#fff4c9" />
      </mesh>
    </group>
  );
}

function Smoke({
  amount,
  position,
}: {
  amount: number;
  position: [number, number, number];
}) {
  const points = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        x: Math.sin(i * 5.21) * 0.8,
        y: Math.cos(i * 2.11) * 0.26 + 0.1,
        z: Math.sin(i * 3.91) * 0.33,
        size: 0.14 + ((i * 7) % 9) * 0.018,
      })),
    [],
  );
  return (
    <group position={position}>
      {points.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[p.size, 10, 8]} />
          <meshBasicMaterial
            color="#a0acb3"
            transparent
            opacity={Math.min(amount / 100, 1) * 0.11}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function Antenna({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[0.02, 0.02, 0.8, 8]} />
        <meshStandardMaterial color={metal} metalness={0.8} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.4, 0]} rotation={[0.45, 0, 0]}>
        <sphereGeometry args={[0.34, 20, 12, 0, Math.PI * 2, 0, 0.55]} />
        <meshStandardMaterial
          color="#b7c0b9"
          metalness={0.7}
          roughness={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

function Station({ scenario, frame, cutaway, gravity = 0 }: SpacecraftProps) {
  const conceptual = scenario === "aegis";
  return (
    <group rotation={[0, -0.15, 0]}>
      <Module
        position={[0, 0, 0]}
        length={3}
        radius={0.73}
        cutaway={cutaway}
        conceptual={conceptual}
      />
      <Module
        position={[-2.65, 0, 0]}
        length={2.1}
        radius={0.57}
        cutaway={cutaway}
        conceptual={conceptual}
      />
      <Module
        position={[2.6, 0, 0]}
        length={1.9}
        radius={0.54}
        cutaway={cutaway}
        conceptual={conceptual}
      />
      <Module
        position={[0, 0, -1.65]}
        length={1.8}
        radius={0.48}
        rotation={[0, Math.PI / 2, 0]}
        cutaway={cutaway}
        conceptual={conceptual}
      />
      <Module
        position={[0, 0, 1.65]}
        length={1.8}
        radius={0.48}
        rotation={[0, Math.PI / 2, 0]}
        cutaway={cutaway}
        conceptual={conceptual}
      />
      <Module
        position={[0, 1.45, 0]}
        length={1.45}
        radius={0.43}
        rotation={[0, 0, Math.PI / 2]}
        cutaway={false}
        conceptual={conceptual}
      />
      <SolarArray position={[-2.3, 0.1, -2.9]} width={3.1} height={1.35} />
      <SolarArray position={[-2.3, 0.1, 2.9]} width={3.1} height={1.35} />
      <SolarArray position={[2.2, 0.1, -2.75]} width={2.4} height={1.1} />
      <SolarArray position={[2.2, 0.1, 2.75]} width={2.4} height={1.1} />
      {[-2.3, 2.2].map((x) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.07, 0.07, 6]} />
          <meshStandardMaterial
            color={metal}
            metalness={0.85}
            roughness={0.3}
          />
        </mesh>
      ))}
      <Antenna position={[1, 1.0, -0.2]} />
      <Antenna position={[-2.8, 0.9, 0]} />
      {conceptual && (
        <group position={[2.6, 0, 0]}>
          <Ring x={0} radius={0.59} color={accent} />
          <Ring x={0.1} radius={0.59} color={accent} />
        </group>
      )}
      <Fire
        position={[-2.55, 0.06, 0.2]}
        intensity={frame.fireIntensity}
        microgravity={gravity < 0.05}
      />
      {cutaway &&
        frame.modules.map((module, i) => (
          <Smoke
            key={module.id}
            position={[[-2.55, 0, 2.6][i], 0.1, 0.1]}
            amount={module.smoke}
          />
        ))}
      {cutaway &&
        frame.modules.map((module, i) => (
          <ModuleLabel
            key={module.id}
            position={[[-2.65, 0, 2.6][i], 1.3, 0]}
            text={module.name}
            warning={module.smoke > 35}
          />
        ))}
    </group>
  );
}

function Aegis({ frame, cutaway, gravity = 0 }: SpacecraftProps) {
  return (
    <group>
      <Module
        position={[-3.2, 0, 0]}
        length={2.2}
        radius={0.66}
        cutaway={cutaway}
        conceptual
      />
      <Module
        position={[0, 0, 0]}
        length={2.6}
        radius={0.92}
        cutaway={cutaway}
        conceptual
      />
      <Module
        position={[3.1, 0, 0]}
        length={2}
        radius={0.78}
        cutaway={cutaway}
        conceptual
      />
      {[-1.7, 1.65].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Module
            position={[0, 0, 0]}
            length={0.7}
            radius={0.45}
            cutaway={false}
            conceptual
          />
          <Ring x={-0.28} radius={0.51} color="#c6ed9c" />
          <Ring x={0.28} radius={0.51} color="#c6ed9c" />
        </group>
      ))}
      <SolarArray position={[-1.8, -0.7, -2.8]} width={4.5} height={1.8} />
      <SolarArray position={[-1.8, -0.7, 2.8]} width={4.5} height={1.8} />
      <mesh position={[-1.8, -0.7, 0]}>
        <boxGeometry args={[0.12, 0.12, 6]} />
        <meshStandardMaterial color="#a4b3b8" metalness={0.8} />
      </mesh>
      <Antenna position={[0.7, 1.3, -0.25]} />
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[3.1, -0.45, side * 1.3]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <mesh>
            <capsuleGeometry args={[0.33, 0.95, 8, 24]} />
            <meshStandardMaterial
              color="#d8e0d8"
              metalness={0.6}
              roughness={0.35}
            />
          </mesh>
          <mesh position={[0, 0.65, 0]}>
            <sphereGeometry args={[0.26, 16, 12]} />
            <meshStandardMaterial
              color="#1f4856"
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
        </group>
      ))}
      <Fire
        position={[-3.2, 0.1, 0.2]}
        intensity={frame.fireIntensity}
        microgravity={gravity < 0.05}
      />
      {cutaway &&
        frame.modules.map((module, i) => (
          <group key={module.id}>
            <Smoke
              position={[[-3.2, 0, 3.1][i], 0.1, 0.1]}
              amount={module.smoke}
            />
            <ModuleLabel
              position={[[-3.2, 0, 3.1][i], 1.5, 0]}
              text={module.name}
              warning={module.smoke > 35}
            />
          </group>
        ))}
      {cutaway &&
        Array.from({ length: 6 }, (_, i) => (
          <mesh
            key={i}
            position={[
              frame.refuge > i ? 2.65 + (i % 3) * 0.35 : -0.7 + (i % 3) * 0.55,
              -0.2,
              0.05 + Math.floor(i / 3) * 0.3,
            ]}
          >
            <capsuleGeometry args={[0.07, 0.16, 4, 8]} />
            <meshStandardMaterial
              color={frame.refuge > i ? "#c6ed9c" : "#ece7cf"}
            />
          </mesh>
        ))}
    </group>
  );
}

function Apollo({ scenario, frame, cutaway, gravity = 0 }: SpacecraftProps) {
  const ground = scenario === "apollo1";
  return (
    <group rotation={[0, -0.18, -0.08]} scale={ground ? 1.15 : 1}>
      <group
        position={ground ? [0, 0, 0] : [1.1, 0, 0]}
        rotation={[0, 0, -Math.PI / 2]}
      >
        <mesh>
          <cylinderGeometry
            args={[
              0.32,
              1.22,
              1.75,
              48,
              1,
              true,
              cutaway ? 0.8 : 0,
              cutaway ? 4.3 : Math.PI * 2,
            ]}
          />
          <meshStandardMaterial
            color="#d1d6d3"
            metalness={0.8}
            roughness={0.3}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, -0.88, 0]}>
          <cylinderGeometry args={[1.23, 1.18, 0.14, 48]} />
          <meshStandardMaterial color="#574a40" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.96, 0]}>
          <cylinderGeometry args={[0.25, 0.32, 0.2, 32]} />
          <meshStandardMaterial
            color="#8797a1"
            metalness={0.8}
            roughness={0.3}
          />
        </mesh>
        {cutaway &&
          [-0.48, 0, 0.48].map((x, i) => (
            <group key={i} position={[x, -0.3, 0.05]} rotation={[0.12, 0, 0]}>
              <mesh>
                <boxGeometry args={[0.33, 0.55, 0.12]} />
                <meshStandardMaterial color="#b7aa8a" roughness={0.85} />
              </mesh>
              <mesh position={[0, 0.38, 0.1]}>
                <sphereGeometry args={[0.125, 14, 10]} />
                <meshStandardMaterial color="#dfdfd4" roughness={0.45} />
              </mesh>
              <mesh position={[0, 0.14, 0.13]}>
                <capsuleGeometry args={[0.1, 0.22, 5, 12]} />
                <meshStandardMaterial color="#d5d9ce" roughness={0.6} />
              </mesh>
            </group>
          ))}
      </group>
      {!ground && (
        <>
          <Module
            position={[-1, 0, 0]}
            length={2.1}
            radius={1.05}
            cutaway={cutaway}
          />
          <mesh position={[-2.38, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.68, 0.34, 0.65, 32, 1, true]} />
            <meshStandardMaterial
              color="#6d7370"
              metalness={0.8}
              roughness={0.35}
              side={THREE.DoubleSide}
            />
          </mesh>
          <group position={[3.5, 0, 0]}>
            <mesh>
              <sphereGeometry args={[0.7, 6, 4]} />
              <meshStandardMaterial
                color="#c9c9be"
                metalness={0.65}
                roughness={0.5}
                flatShading
              />
            </mesh>
            <mesh position={[0.7, 0, 0]}>
              <boxGeometry args={[0.65, 1.2, 1.2]} />
              <meshStandardMaterial
                color="#b19550"
                metalness={0.85}
                roughness={0.4}
              />
            </mesh>
            {[-1, 1].map((side) => (
              <mesh
                key={side}
                position={[0.95, side * 0.8, 0]}
                rotation={[0, 0, side * -0.5]}
              >
                <boxGeometry args={[0.08, 0.8, 0.08]} />
                <meshStandardMaterial
                  color="#9c854b"
                  metalness={0.8}
                  roughness={0.4}
                />
              </mesh>
            ))}
          </group>
          <Antenna position={[-1.5, 1.35, 0]} />
        </>
      )}
      <Fire
        position={ground ? [0, 0.1, 0.25] : [-1.2, 0.35, 0.65]}
        intensity={frame.fireIntensity}
        microgravity={gravity < 0.05}
      />
      {cutaway && (
        <Smoke
          position={ground ? [0, 0.1, 0.2] : [-1.2, 0.2, 0.3]}
          amount={frame.modules[0]?.smoke || 0}
        />
      )}
    </group>
  );
}

function CameraFit({scenario}: {scenario: ScenarioId}) {
  const {camera, size} = useThree();
  useEffect(()=> {
    const width = scenario==='apollo1'?4.2:10;
    const aspect = size.width / Math.max(size.height,1);
    const distance = Math.max(scenario==='apollo1'?7:13, width / (2 * Math.tan(18*Math.PI/180) * aspect));
    camera.position.copy(new THREE.Vector3(7.6,5,8.5).normalize().multiplyScalar(distance));
    camera.lookAt(0,0,0);
    camera.updateProjectionMatrix();
  },[camera,size.width,size.height,scenario]);
  return null;
}

export default function Spacecraft(props: SpacecraftProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [7.6, 5.0, 8.5], fov: 36 }}
      gl={{ antialias: true, alpha: true }}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
      aria-label="Modelo 3D interactivo de la nave. Arrastra para girar y usa la rueda para acercar."
    >
      <CameraFit scenario={props.scenario}/>
      <Suspense fallback={null}>
        <ambientLight intensity={0.75} color="#b3d8e1" />
        <directionalLight
          position={[3, 8, 5]}
          intensity={3.1}
          color="#fff4d8"
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        <directionalLight
          position={[-6, 2, -3]}
          intensity={2.0}
          color="#6cadd7"
        />
        <pointLight position={[2, -3, 4]} intensity={10} color="#6cc5c0" />
        <Stars
          radius={80}
          depth={30}
          count={900}
          factor={1.8}
          saturation={0}
          fade
          speed={0.1}
        />
        {props.scenario === "mir" ? (
          <Station {...props} />
        ) : props.scenario === "aegis" ? (
          <Aegis {...props} />
        ) : (
          <Apollo {...props} />
        )}
        <ContactShadows
          position={[0, -2.0, 0]}
          opacity={0.18}
          scale={18}
          blur={3}
          far={6}
          color="#01090e"
        />
        <OrbitControls
          makeDefault
          enablePan={false}
        minDistance={props.scenario==='apollo1'?3.5:5.5}
        maxDistance={34}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI * 0.8}
          enableDamping
          dampingFactor={0.08}
          autoRotate={false}
        />
      </Suspense>
    </Canvas>
  );
}
