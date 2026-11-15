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
uniform float uGravity; uniform float uStretch;
varying vec2 vUv;
void main(){
  vUv = position.xy;
  // Camera-facing quad that stretches along buoyancy (local +y) and forced flow (local +x),
  // both projected on screen. Seen from above, a buoyant flame correctly looks round.
  vec4 c = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float scale = length(modelViewMatrix[0].xyz);
  vec3 upV = (modelViewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz / scale;
  vec3 flowV = (modelViewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz / scale;
  vec2 rise = upV.xy * uGravity + flowV.xy * uStretch;
  float len = length(rise);
  vec2 dir = len > 0.001 ? rise / len : vec2(0.0, 1.0);
  vec2 side = vec2(dir.y, -dir.x);
  float elong = 1.0 + 0.85 * min(len, 1.6);
  vec2 off = side * position.x + dir * (position.y * elong + (elong - 1.0));
  c.xy += off * scale;
  gl_Position = projectionMatrix * c;
}`;

const flameFragment = /* glsl */ `
uniform float uTime; uniform float uGravity; uniform float uStretch; uniform float uTurb; uniform float uSeed;
uniform float uIntensity; uniform float uSoot;
varying vec2 vUv;
${NOISE}
void main(){
  vec2 uv = vUv;
  float g = uGravity;
  float shapeG = clamp(g + uStretch * 0.5, 0.0, 1.0);
  float y01 = uv.y * 0.5 + 0.5;
  // Two octaves of rising noise: fast flicker with gravity (~10 Hz puffing), almost frozen without.
  float n1 = fbm(vec3(uv.x * 2.2, uv.y * 1.6 - uTime * (0.25 + 3.2 * g), uSeed));
  float n2 = fbm(vec3(uv.x * 4.6 + 3.0, uv.y * 3.6 - uTime * (0.4 + 5.5 * g), uSeed + 7.0));
  float turb = (n1 * 0.65 + n2 * 0.35 - 0.5) * uTurb;
  // Gravity: buoyant teardrop that breaks into tongues near the tip.
  float xw = uv.x + turb * 0.6 * y01 * shapeG;
  float width = 0.7 * pow(max(1.0 - y01, 0.0), 0.9) * sqrt(clamp((y01 + 0.02) / 0.3, 0.0, 1.0));
  float tear = 1.0 - abs(xw) / max(width, 0.001);
  tear = (tear - y01 * 0.25 + turb * 1.6 * y01) * smoothstep(0.0, 0.06, y01);
  // Microgravity: steady sphere; the reaction sits in a thin shell around the fuel (limb brightening).
  float r = length(uv) + turb * 0.07;
  float shell = exp(-pow((r - 0.6) / 0.15, 2.0)) + 0.2 * (1.0 - smoothstep(0.0, 0.6, r));
  float f = clamp(mix(shell * 0.95, tear * 1.6, shapeG), 0.0, 1.0);
  // Soot glows on a blackbody ramp: dark red edge, orange, yellow, white-hot core.
  vec3 col = mix(vec3(0.5, 0.05, 0.01), vec3(1.0, 0.36, 0.05), smoothstep(0.0, 0.35, f));
  col = mix(col, vec3(1.0, 0.74, 0.3), smoothstep(0.35, 0.72, f));
  col = mix(col, vec3(1.0, 0.93, 0.8), smoothstep(0.85, 1.0, f) * 0.7 * uSoot);
  // Blue where there is no soot: the base in gravity, nearly everything in orbit.
  float baseBlue = (1.0 - smoothstep(0.02, 0.2, y01)) * g * smoothstep(0.2, 0.6, f);
  float blueMix = clamp(max(baseBlue, 1.0 - uSoot * (0.45 + 0.9 * max(g, uStretch * 0.6))), 0.0, 1.0);
  col = mix(col, vec3(0.2, 0.38, 1.0), blueMix);
  float a = smoothstep(0.0, 0.3, f) * mix(0.5, 1.0, uSoot) * mix(0.75, 1.0, g) * uIntensity;
  // Normal blending with HDR colour: reads on pale walls and still blooms on dark ones.
  gl_FragColor = vec4(col * (1.3 + 0.9 * f), clamp(a * 0.9, 0.0, 1.0));
}`;

function makeFlameMaterial(seed: number) {
  return new THREE.ShaderMaterial({
    vertexShader: flameVertex,
    fragmentShader: flameFragment,
    uniforms: {
      uTime: { value: 0 },
      uGravity: { value: 0 },
      uStretch: { value: 0 },
      uTurb: { value: 1 },
      uSeed: { value: seed },
      uIntensity: { value: 1 },
      uSoot: { value: 0.3 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

/**
 * Physically motivated flame, drawn as camera-facing noise layers.
 * - gravity 1: buoyant teardrop, soot glows yellow-orange, blue only at the base, flickers.
 * - gravity 0: steady sphere, dim and blue (little soot): what NASA sees in orbit.
 * - flow: forced air stretches the flame downstream along the group's +x.
 * - soot: 0–1, rises with oxygen (pure oxygen burns bright yellow-white).
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
  const layers = useMemo(() => {
    const seed = Math.random() * 20;
    return [makeFlameMaterial(seed), makeFlameMaterial(seed + 11.3)];
  }, []);
  const lightRef = useRef<THREE.PointLight>(null);
  const group = useRef<THREE.Group>(null);
  const level = Math.min(Math.max(intensity, 0), 1.5);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (const material of layers) {
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
      group.current.scale.setScalar(s * flicker);
    }
    if (lightRef.current) {
      const warm = soot * (0.4 + gravity * 0.6);
      lightRef.current.intensity = level * (1.2 + 4.5 * warm) * (gravity > 0.1 ? 0.85 + Math.sin(t * 43) * 0.15 : 1);
    }
  });
  if (intensity < 0.02) return null;
  const warmColor = new THREE.Color().lerpColors(new THREE.Color("#7aa2ff"), new THREE.Color("#ff8a3d"), Math.min(1, soot * (0.4 + gravity)));
  return (
    <group position={position} rotation={rotation}>
      {light && <pointLight ref={lightRef} color={warmColor} distance={size * 22} decay={2} />}
      <group ref={group}>
        <mesh material={layers[0]} frustumCulled={false} renderOrder={5}>
          <planeGeometry args={[2, 2]} />
        </mesh>
        <mesh material={layers[1]} scale={0.7} frustumCulled={false} renderOrder={6}>
          <planeGeometry args={[2, 2]} />
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
    const count = 340;
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
      let y = Math.sin(seed.a) * seed.r * radius * 0.62;
      const z = Math.cos(seed.a) * seed.r * radius * 0.62;
      if (gravity > 0.05) {
        // Ceiling layer that thickens downward as the smoke builds up.
        const depth = radius * (0.2 + 1.2 * fill);
        y = radius * 0.6 - seed.s * depth;
      }
      data.positions.set(
        [drift * length * 0.85 + Math.sin(t * 0.3 + i) * 0.08, y + Math.sin(t * 0.4 + i * 0.7) * 0.05, z + Math.cos(t * 0.35 + i) * 0.06],
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
        size={radius * 0.9}
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
