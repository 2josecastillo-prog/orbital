import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

export type Vec3 = [number, number, number];

/* Shared GLSL value noise. */
const NOISE = /* glsl */ `
float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),
                 mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                 mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }
`;

const flameVertex = /* glsl */ `
uniform float uTime; uniform float uGravity; uniform float uStretch; uniform float uTurb; uniform float uSeed;
varying vec3 vNormal; varying vec3 vView; varying float vH; varying float vN;
${NOISE}
void main(){
  vec3 p = position;
  float up = clamp(p.y*0.5+0.5, 0.0, 1.0);
  float g = uGravity;
  // Buoyancy: hot gas rises, the flame becomes a tall teardrop. Without gravity it stays round.
  if (p.y > 0.0) p.y *= 1.0 + 2.6*g;
  p.xz *= mix(1.0, 1.0 - 0.78*smoothstep(0.0, 1.0, up), g);
  // Forced air flow along +x stretches the flame downstream.
  p.x += uStretch * (max(p.x, 0.0) * 2.2 + 0.35);
  p.yz *= 1.0 - 0.35*uStretch*smoothstep(0.0, 1.0, p.x*0.5+0.5);
  // Flicker: strong in gravity, almost none in microgravity (flames there are steady).
  float n = noise(p*2.4 + vec3(0.0, -uTime*(0.6 + 5.0*g), uSeed + uTime*0.15));
  p += normal * (n - 0.5) * uTurb * (0.12 + 0.7*up*g + 0.35*uStretch);
  vH = up; vN = n;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = normalize(-mv.xyz);
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const flameFragment = /* glsl */ `
uniform float uIntensity; uniform float uSoot; uniform float uGravity; uniform float uCore;
varying vec3 vNormal; varying vec3 vView; varying float vH; varying float vN;
void main(){
  float facing = abs(dot(vNormal, vView));
  float rim = pow(1.0 - facing, 1.5);
  float body = pow(facing, 1.6);
  vec3 blue = vec3(0.22, 0.42, 1.0);
  vec3 white = vec3(1.0, 0.96, 0.84);
  vec3 yellow = vec3(1.0, 0.72, 0.28);
  vec3 orange = vec3(1.0, 0.36, 0.08);
  // Soot glows yellow-orange; it rises to the tip in gravity.
  vec3 soot = mix(white, mix(yellow, orange, smoothstep(0.55, 1.0, vH)), smoothstep(0.1, 0.6, vH));
  float base = 1.0 - smoothstep(0.04, 0.32, vH);
  float blueMix = clamp(max(base * (0.4 + 0.6*uGravity), 1.0 - uSoot), 0.0, 1.0);
  vec3 col = mix(soot, blue, blueMix);
  float a = mix(rim * 0.95, body * 0.9 + rim * 0.2, uCore) * (0.75 + 0.5*vN);
  a *= 1.0 - smoothstep(0.7, 1.0, vH) * uGravity * 0.8;
  a *= uIntensity;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

function makeFlameMaterial(core: boolean) {
  return new THREE.ShaderMaterial({
    vertexShader: flameVertex,
    fragmentShader: flameFragment,
    uniforms: {
      uTime: { value: 0 },
      uGravity: { value: 0 },
      uStretch: { value: 0 },
      uTurb: { value: 1 },
      uSeed: { value: Math.random() * 10 },
      uIntensity: { value: 1 },
      uSoot: { value: 0.3 },
      uCore: { value: core ? 1 : 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Physically motivated flame.
 * - gravity 1: teardrop, yellow from soot, blue only at the base, flickers ~10 Hz.
 * - gravity 0: sphere, blue and dim (little soot), steady.
 * - flow: stretches the flame downstream along the group's +x.
 * - soot: 0–1, rises with oxygen (pure oxygen burns bright white-yellow).
 */
export function Flame({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  size = 0.3,
  intensity,
  gravity,
  flow = 0,
  soot = 0.3,
  turbulence = 1,
  light = true,
}: {
  position?: Vec3;
  rotation?: Vec3;
  size?: number;
  intensity: number;
  gravity: number;
  flow?: number;
  soot?: number;
  turbulence?: number;
  light?: boolean;
}) {
  const shell = useMemo(() => makeFlameMaterial(false), []);
  const core = useMemo(() => makeFlameMaterial(true), []);
  const lightRef = useRef<THREE.PointLight>(null);
  const group = useRef<THREE.Group>(null);
  const level = Math.min(Math.max(intensity, 0), 1.5);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const material of [shell, core]) {
      material.uniforms.uTime.value = t;
      material.uniforms.uGravity.value = gravity;
      material.uniforms.uStretch.value = Math.min(flow, 1.6);
      material.uniforms.uTurb.value = turbulence;
      material.uniforms.uSoot.value = soot;
      material.uniforms.uIntensity.value = Math.min(1, 0.35 + level * 0.65);
    }
    if (group.current) {
      const s = size * (0.35 + Math.sqrt(level) * 0.75);
      const flicker = 1 + gravity * (Math.sin(t * 61) * 0.04 + Math.sin(t * 37) * 0.04);
      group.current.scale.set(s * flicker, s * flicker, s * flicker);
    }
    if (lightRef.current) {
      const warm = soot * (0.4 + gravity * 0.6);
      lightRef.current.intensity = level * (2 + 10 * warm) * (gravity > 0.1 ? 0.85 + Math.sin(t * 43) * 0.15 : 1);
    }
  });
  if (intensity < 0.02) return null;
  const warmColor = new THREE.Color().lerpColors(new THREE.Color("#7aa2ff"), new THREE.Color("#ff8a3d"), Math.min(1, soot * (0.4 + gravity)));
  return (
    <group position={position} rotation={rotation}>
      {light && <pointLight ref={lightRef} color={warmColor} distance={size * 22} decay={2} />}
      <group ref={group}>
        <mesh material={shell}>
          <sphereGeometry args={[1, 40, 32]} />
        </mesh>
        <mesh material={core} scale={0.62}>
          <sphereGeometry args={[1, 32, 24]} />
        </mesh>
      </group>
    </group>
  );
}

/** Sparks and molten droplets. In microgravity they fly in straight lines. */
export function Sparks({
  position,
  direction,
  intensity,
  gravity,
  count = 90,
  reach = 1.6,
}: {
  position: Vec3;
  direction: Vec3;
  intensity: number;
  gravity: number;
  count?: number;
  reach?: number;
}) {
  const ref = useRef<THREE.LineSegments>(null);
  const data = useMemo(() => {
    const dir = new THREE.Vector3(...direction).normalize();
    const seeds = Array.from({ length: count }, (_, i) => {
      const jitter = new THREE.Vector3(Math.sin(i * 12.9898), Math.cos(i * 78.233), Math.sin(i * 39.425)).multiplyScalar(0.55);
      return { v: dir.clone().add(jitter).normalize().multiplyScalar(0.6 + ((i * 0.37) % 1) * 0.8), phase: (i * 0.618) % 1 };
    });
    return { seeds, positions: new Float32Array(count * 6) };
  }, [direction, count]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    const { seeds, positions } = data;
    seeds.forEach((seed, i) => {
      const life = (t * 0.9 + seed.phase) % 1;
      const d = life * reach;
      const drop = gravity * 1.6 * life * life;
      const x = seed.v.x * d, y = seed.v.y * d - drop, z = seed.v.z * d;
      const tail = 0.05 + 0.06 * (1 - life);
      positions.set([x, y, z, x - seed.v.x * tail, y - seed.v.y * tail + gravity * 0.02, z - seed.v.z * tail], i * 6);
    });
    ref.current.geometry.attributes.position.needsUpdate = true;
    (ref.current.material as THREE.LineBasicMaterial).opacity = Math.min(1, intensity * 1.3);
  });
  if (intensity < 0.05) return null;
  return (
    <lineSegments ref={ref} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color="#ffd38a" transparent blending={THREE.AdditiveBlending} depthWrite={false} />
    </lineSegments>
  );
}

const smokeTexture = (() => {
  let texture: THREE.Texture | null = null;
  return () => {
    if (texture) return texture;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const c = canvas.getContext("2d")!;
    for (let i = 0; i < 9; i++) {
      const x = size / 2 + Math.sin(i * 2.1) * 18;
      const y = size / 2 + Math.cos(i * 1.7) * 18;
      const g = c.createRadialGradient(x, y, 0, x, y, 40);
      g.addColorStop(0, "rgba(255,255,255,0.35)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, size, size);
    }
    texture = new THREE.CanvasTexture(canvas);
    return texture;
  };
})();

/**
 * Smoke inside a cylindrical compartment along X.
 * gravity > 0: hot smoke rises and fills the ceiling first.
 * gravity = 0: it does not rise; ventilation carries it along the module.
 */
export function Smoke({
  amount,
  center,
  length,
  radius,
  gravity,
  flow = 0.1,
  tint = "#8b8e8f",
}: {
  amount: number;
  center: Vec3;
  length: number;
  radius: number;
  gravity: number;
  flow?: number;
  tint?: string;
}) {
  const ref = useRef<THREE.Points>(null);
  const data = useMemo(() => {
    const count = 220;
    const seeds = Array.from({ length: count }, (_, i) => ({
      x: ((i * 0.618) % 1) - 0.5,
      a: i * 2.39996,
      r: Math.sqrt((i * 0.371) % 1),
      s: (i * 0.137) % 1,
    }));
    return { seeds, positions: new Float32Array(count * 3) };
  }, []);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    const fill = Math.min(amount / 100, 1);
    data.seeds.forEach((seed, i) => {
      const drift = ((seed.x + 0.5 + t * (0.01 + flow * 0.12)) % 1) - 0.5;
      let y = Math.sin(seed.a) * seed.r * radius * 0.85;
      const z = Math.cos(seed.a) * seed.r * radius * 0.85;
      if (gravity > 0.05) {
        // Ceiling layer that thickens downward as the smoke builds up.
        const depth = radius * (0.25 + 1.5 * fill);
        y = radius * 0.8 - seed.s * depth;
      }
      data.positions.set(
        [drift * length * 0.95 + Math.sin(t * 0.3 + i) * 0.08, y + Math.sin(t * 0.4 + i * 0.7) * 0.05, z + Math.cos(t * 0.35 + i) * 0.06],
        i * 3,
      );
    });
    ref.current.geometry.attributes.position.needsUpdate = true;
  });
  if (amount < 1) return null;
  return (
    <points ref={ref} position={center}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={smokeTexture()}
        size={radius * 1.4}
        color={tint}
        transparent
        opacity={Math.min(0.06 + (amount / 100) * 0.62, 0.68)}
        depthWrite={false}
      />
    </points>
  );
}

/** Oxygen venting into vacuum: a sunlit cloud of ice crystals and debris, no flame. */
export function Vent({
  position,
  direction,
  intensity,
  burst,
}: {
  position: Vec3;
  direction: Vec3;
  intensity: number;
  burst: number;
}) {
  const ref = useRef<THREE.Points>(null);
  const data = useMemo(() => {
    const count = 260;
    const dir = new THREE.Vector3(...direction).normalize();
    const seeds = Array.from({ length: count }, (_, i) => {
      const spread = new THREE.Vector3(Math.sin(i * 3.1), Math.cos(i * 7.3), Math.sin(i * 1.9)).multiplyScalar(0.9);
      return { v: dir.clone().add(spread).normalize().multiplyScalar(0.5 + ((i * 0.43) % 1)), phase: (i * 0.618) % 1 };
    });
    return { seeds, positions: new Float32Array(count * 3) };
  }, [direction]);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime;
    data.seeds.forEach((seed, i) => {
      const life = (t * 0.35 + seed.phase) % 1;
      const d = life * (4 + burst * 6);
      data.positions.set([seed.v.x * d, seed.v.y * d, seed.v.z * d], i * 3);
    });
    ref.current.geometry.attributes.position.needsUpdate = true;
    (ref.current.material as THREE.PointsMaterial).opacity = Math.min(0.9, intensity);
  });
  if (intensity < 0.03) return null;
  return (
    <points ref={ref} position={position}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
      </bufferGeometry>
      <pointsMaterial map={smokeTexture()} size={0.35} color="#f2f6ff" transparent depthWrite={false} />
    </points>
  );
}

/* --------------------------------------------------------------- backdrops */

const earthFragment = /* glsl */ `
uniform vec3 uSun; varying vec3 vN; varying vec3 vP; varying vec3 vW;
${NOISE}
void main(){
  vec3 n = normalize(vN);
  float land = smoothstep(0.52, 0.56, fbm(vP*1.6));
  float cloud = smoothstep(0.5, 0.75, fbm(vP*3.2 + 7.0));
  vec3 ocean = mix(vec3(0.02,0.08,0.22), vec3(0.04,0.18,0.38), fbm(vP*6.0));
  vec3 ground = mix(vec3(0.16,0.24,0.10), vec3(0.42,0.36,0.22), fbm(vP*5.0+3.0));
  vec3 col = mix(ocean, ground, land);
  col = mix(col, vec3(0.95), cloud*0.85);
  float light = clamp(dot(n, normalize(uSun)), 0.0, 1.0);
  col *= 0.06 + 1.1*light;
  float rim = pow(1.0 - abs(dot(n, normalize(-vW))), 3.0);
  col += vec3(0.25,0.5,1.0) * rim * (0.2 + light);
  gl_FragColor = vec4(col, 1.0);
}`;
const earthVertex = /* glsl */ `
varying vec3 vN; varying vec3 vP; varying vec3 vW;
void main(){ vN = normalize(mat3(modelMatrix)*normal); vP = position/ ${"100.0"}; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz - cameraPosition; gl_Position = projectionMatrix*viewMatrix*w; }`;
const atmoFragment = /* glsl */ `
varying vec3 vN; varying vec3 vW;
void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(-vW))), 4.0); gl_FragColor = vec4(vec3(0.35,0.62,1.0)*f*1.6, f); }`;

/** Procedural Earth with atmosphere. radius in scene units. */
export function Earth({ position, radius }: { position: Vec3; radius: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: earthVertex.replace("100.0", (radius / 2).toFixed(1)),
        fragmentShader: earthFragment,
        uniforms: { uSun: { value: new THREE.Vector3(0.8, 0.5, 0.6) } },
      }),
    [radius],
  );
  const atmo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: earthVertex,
        fragmentShader: atmoFragment,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    [],
  );
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.004;
  });
  return (
    <group position={position}>
      <mesh ref={ref} material={material}>
        <sphereGeometry args={[radius, 128, 96]} />
      </mesh>
      <mesh material={atmo} scale={1.025}>
        <sphereGeometry args={[radius, 96, 64]} />
      </mesh>
    </group>
  );
}

export function Moon({ position, radius }: { position: Vec3; radius: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: earthVertex.replace("100.0", (radius / 3).toFixed(2)),
        fragmentShader: /* glsl */ `
          uniform vec3 uSun; varying vec3 vN; varying vec3 vP; varying vec3 vW;
          ${NOISE}
          void main(){
            float m = fbm(vP*2.0);
            vec3 col = mix(vec3(0.32), vec3(0.62), smoothstep(0.35,0.7,m));
            col *= 0.05 + clamp(dot(normalize(vN), normalize(uSun)),0.0,1.0);
            gl_FragColor = vec4(col,1.0);
          }`,
        uniforms: { uSun: { value: new THREE.Vector3(0.8, 0.5, 0.6) } },
      }),
    [radius],
  );
  return (
    <mesh position={position} material={material}>
      <sphereGeometry args={[radius, 64, 48]} />
    </mesh>
  );
}
