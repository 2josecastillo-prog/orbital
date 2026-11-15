import * as THREE from "three";

type Finish =
  | "metal"
  | "blanket"
  | "foil"
  | "shield"
  | "solar"
  | "fabric"
  | "deck"
  | "radiator";

interface Surface {
  map: THREE.DataTexture;
  bumpMap: THREE.DataTexture;
  roughnessMap: THREE.DataTexture;
  bumpScale: number;
  metalness: number;
}

const cache = new Map<string, Surface>();
const fract = (value: number) => value - Math.floor(value);
const smooth = (a: number, b: number, value: number) => {
  const t = THREE.MathUtils.clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const edge = (value: number) => Math.min(fract(value), 1 - fract(value));

function noise(x: number, y: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

const defaults: Record<
  Finish,
  { base: string; bumpScale: number; metalness: number }
> = {
  metal: { base: "#e2e4e3", bumpScale: 0.018, metalness: 0.64 },
  blanket: { base: "#d5d8cf", bumpScale: 0.025, metalness: 0.12 },
  foil: { base: "#d4a632", bumpScale: 0.035, metalness: 0.75 },
  shield: { base: "#846048", bumpScale: 0.015, metalness: 0.04 },
  solar: { base: "#223860", bumpScale: 0.0015, metalness: 0.28 },
  fabric: { base: "#e4e4e1", bumpScale: 0.0035, metalness: 0.02 },
  deck: { base: "#7c827a", bumpScale: 0.004, metalness: 0.14 },
  radiator: { base: "#e4e6e4", bumpScale: 0.014, metalness: 0.32 },
};

function texture(data: Uint8Array, size: number, color = false) {
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

/** Tileable, deterministic material maps. One pack per finish and tint, shared by every mesh. */
export function surface(finish: Finish, tint = defaults[finish].base): Surface {
  const key = `${finish}:${tint}`;
  const existing = cache.get(key);
  if (existing) return existing;

  const size = finish === "fabric" || finish === "deck" ? 256 : 512;
  const color = new Uint8Array(size * size * 4);
  const relief = new Uint8Array(color.length);
  const gloss = new Uint8Array(color.length);
  const hex = Number.parseInt(tint.slice(1), 16);
  const red = hex >> 16;
  const green = (hex >> 8) & 255;
  const blue = hex & 255;
  const tau = Math.PI * 2;
  const byte = (value: number) =>
    Math.round(THREE.MathUtils.clamp(value, 0, 255));

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = (i + 0.5) / size;
      const v = (j + 0.5) / size;
      const grain = noise(i, j) - 0.5;
      const brushed = noise(0, j) - 0.5;
      let light = 1 + grain * 0.03;
      let height = 0.5 + grain * 0.04;
      let rough = 0.5;
      let neutral = 0;

      switch (finish) {
        case "metal": {
          const x = u * 12;
          const y = v * 4;
          const joint = smooth(0.008, 0.036, Math.min(edge(x), edge(y)));
          const fastener =
            1 -
            smooth(
              0.04,
              0.062,
              Math.hypot((fract(x) - 0.12) * 0.8, edge(y - 0.09)),
            );
          const patch = noise(Math.floor(x), Math.floor(y));
          light *=
            (0.74 + 0.26 * joint) * (0.92 + patch * 0.12) + brushed * 0.038;
          height = 0.32 + 0.22 * joint + 0.14 * fastener + brushed * 0.045;
          rough = 0.3 + patch * 0.11 + (1 - joint) * 0.19;
          neutral = fastener * 0.42;
          break;
        }
        case "blanket": {
          const x = u * 8;
          const y = v * 4;
          const quilt =
            Math.sin(Math.PI * fract(x)) * Math.sin(Math.PI * fract(y));
          const seam = 1 - smooth(0.02, 0.065, Math.min(edge(x), edge(y)));
          const stitch =
            seam * smooth(0.04, 0.14, Math.max(edge(x * 12), edge(y * 12)));
          const wrinkle = Math.sin(
            tau * (18 * u + 6 * v + 0.42 * Math.sin(tau * 3 * v)),
          );
          light *= 0.97 + 0.08 * quilt - 0.15 * seam + 0.035 * wrinkle * quilt;
          height = 0.29 + 0.43 * quilt + 0.07 * stitch + 0.05 * wrinkle * quilt;
          rough = 0.7 + 0.14 * seam - 0.09 * quilt;
          break;
        }
        case "foil": {
          const fold = (x: number) => 1 - Math.abs(Math.sin(tau * x));
          const broad = fold(
            5 * u + 4 * v + 0.38 * Math.sin(tau * (2 * u - v)),
          );
          const fine = fold(
            13 * u - 9 * v + 0.61 * Math.sin(tau * (u + 3 * v)),
          );
          const fineCross = fold(9 * u + 17 * v + 0.24 * Math.cos(tau * 4 * u));
          const overlap = smooth(0.004, 0.027, edge(v * 4));
          light *= 0.74 + 0.19 * broad + 0.14 * fine + 0.1 * overlap;
          height =
            0.24 +
            0.31 * broad +
            0.17 * fine +
            0.11 * fineCross +
            0.07 * overlap;
          rough = 0.23 + 0.25 * (1 - fine) + (1 - overlap) * 0.14;
          break;
        }
        case "shield": {
          const row = Math.floor(v * 24);
          const x = u * 24 + (row % 2) * 0.5;
          const joint = smooth(0.025, 0.11, Math.min(edge(x), edge(v * 24)));
          const tile = noise(Math.floor(x) % 24, row);
          light *= (0.77 + 0.23 * joint) * (0.89 + 0.2 * tile + 0.1 * grain);
          height = 0.35 + 0.2 * joint + grain * 0.15;
          rough = 0.83 + grain * 0.1;
          break;
        }
        case "solar": {
          const x = u * 4;
          const y = v * 6;
          const cell = smooth(0.023, 0.045, Math.min(edge(x), edge(y)));
          const bus = (1 - smooth(0.012, 0.025, edge(x * 2))) * cell;
          const finger = (1 - smooth(0.03, 0.12, edge(y * 12))) * cell;
          const lot = noise(Math.floor(x), Math.floor(y));
          light *= 0.85 + 0.22 * lot + 0.07 * fract(x);
          neutral = Math.max((1 - cell) * 0.36, bus * 0.63, finger * 0.12);
          height = 0.44 + 0.13 * cell + 0.04 * bus;
          rough = 0.28 + 0.07 * lot + (1 - cell) * 0.32;
          break;
        }
        case "fabric": {
          const weave = Math.sin(tau * 32 * u) * Math.sin(tau * 32 * v);
          light *= 1 + weave * 0.045;
          height = 0.5 + weave * 0.13 + grain * 0.035;
          rough = 0.89 + weave * 0.04;
          break;
        }
        case "deck": {
          const row = Math.floor(v * 16);
          const tread =
            1 -
            smooth(
              0.12,
              0.29,
              Math.hypot(
                edge(u * 12 + (row % 2) * 0.5) * 1.1,
                fract(v * 16) - 0.5,
              ),
            );
          light *= 0.95 + 0.1 * tread;
          height = 0.4 + 0.27 * tread + grain * 0.08;
          rough = 0.79 - tread * 0.09;
          break;
        }
        case "radiator": {
          const fin = smooth(0.07, 0.34, edge(u * 24));
          light *= 0.82 + 0.18 * fin;
          height = 0.32 + 0.32 * fin + brushed * 0.023;
          rough = 0.66 - 0.2 * fin;
          break;
        }
      }

      const offset = (j * size + i) * 4;
      color[offset] = byte(red * light * (1 - neutral) + 186 * neutral);
      color[offset + 1] = byte(green * light * (1 - neutral) + 193 * neutral);
      color[offset + 2] = byte(blue * light * (1 - neutral) + 198 * neutral);
      color[offset + 3] = 255;
      relief[offset] =
        relief[offset + 1] =
        relief[offset + 2] =
          byte(height * 255);
      relief[offset + 3] = 255;
      gloss[offset] = gloss[offset + 1] = gloss[offset + 2] = byte(rough * 255);
      gloss[offset + 3] = 255;
    }
  }

  const result = {
    map: texture(color, size, true),
    bumpMap: texture(relief, size),
    roughnessMap: texture(gloss, size),
    bumpScale: defaults[finish].bumpScale,
    metalness: defaults[finish].metalness,
  };
  cache.set(key, result);
  return result;
}
