/**
 * Orbital Fire Lab — simulation engine.
 *
 * Fire cases (Apollo 1, Mir, AEGIS) use a lumped multi-compartment ("zone")
 * model in the spirit of NIST CFAST: each module is a well-mixed gas volume with
 * its own moles of O₂, CO₂, CO and N₂, soot mass, temperature and pressure.
 * The fire releases heat (HRR) following a t² growth curve scaled by the oxygen
 * partial pressure, consumes oxygen (13.1 MJ per kg O₂) and produces CO, CO₂ and
 * soot with fuel-specific yields. Hatches exchange gas when open.
 *
 * Crew harm uses the Fractional Effective Dose method of ISO 13571:
 *   heat:     t_I(min) = 5·10⁷ · T(°C)^-3.4                  (convected heat)
 *   CO:       FED += ppm · Δt(min) / 35 000
 *   hypoxia:  t_I(min) = exp(8.13 − 0.54·(20.9 − %O₂))         (Purser)
 *   CO₂:      t_I(min) = exp(6.1623 − 0.5189·%CO₂)              (Purser, Apollo 13)
 * FED ≥ 0.3: impaired; ≥ 1: incapacitated; ≥ 3: assumed lethal (stated assumption).
 *
 * Apollo 13 uses a separate life-support model over 90 hours (power, oxygen,
 * lithium hydroxide and CO₂ partial pressure) calibrated to mission data.
 *
 * All parameters are declared below. This is an educational model: it reproduces
 * documented outcomes and trends, not exact measurements.
 */
import { aegisParameters, newAegisRack, type AegisTelemetry, type RackDesign } from "./aegis";

export type ScenarioId = "mir" | "apollo1" | "apollo13" | "aegis";
export type Level = "ok" | "watch" | "danger";
export type Protection = "isolation" | "suppression" | "backup";
export type CrewState = "ok" | "impaired" | "incapacitated" | "lethal" | "safe";

export interface SimConfig {
  scenario: ScenarioId;
  oxygen: number;
  pressure: number;
  airflow: number;
  gravity: number;
  isolation: boolean;
  suppression: boolean;
  backup: boolean;
  /** Mir only: how long the oxygen candle burns (s). Official 90 s; crew reported up to 14 min. */
  candleSeconds?: number;
  aegisRack?: RackDesign;
}

export interface ModuleState {
  id: string;
  name: string;
  temperature: number;
  co: number;
  o2: number;
  co2: number;
  pressure: number;
  visibility: number;
  smoke: number;
  level: Level;
  visibilityText: string;
}

export interface CrewMember {
  role: string;
  position: number;
  moving: boolean;
  state: CrewState;
  fed: number;
  heat: number;
  toxic: number;
  cause: string;
  module: number;
}

export interface SimFrame {
  index: number;
  time: number;
  clock: string;
  sinceIncident: number;
  phase: string;
  level: Level;
  narrative: string;
  hrr: number;
  fireIntensity: number;
  temperature: number;
  pressure: number;
  oxygen: number;
  smoke: number;
  energy: number;
  refuge: number;
  crew: number[];
  crewStatus: CrewMember[];
  modules: ModuleState[];
  flags: {
    hatchToFire: boolean;
    refugeSealed: boolean;
    hatchOpen: boolean;
    ruptured: boolean;
    inRefuge: boolean;
    smJettisoned: boolean;
    lmJettisoned: boolean;
  };
  aegis?: AegisTelemetry;
  life?: { co2mmHg: number; liohLeft: number; cmBattery: number; lmBattery: number; cabinTemp: number };
}

export interface SimEvent {
  index: number;
  time: number;
  kind: string;
  title: string;
  detail: string;
  tone: "info" | "bad" | "good";
}

export interface SimOutcome {
  level: Level;
  title: string;
  summary: string;
  safe: number;
  incapacitated: number;
  lethal: number;
  crew: number;
  people: { role: string; state: CrewState; fed: number; cause: string; when: string | null }[];
  factors: { good: boolean; text: string }[];
  peaks: { label: string; value: string; limit: string; exceeded: boolean }[];
}

export interface WhatIf {
  label: string;
  change: Partial<SimConfig>;
  safe: number;
  lethal: number;
  delta: number;
}

type Text = { label: string; help: string };
type ScenarioText = {
  title: string;
  year: string;
  hook: string;
  description: string;
  crew: number;
  roles: string[];
  interpretation: string;
  sourceLabel: string;
  modules: [string, string, string];
  hazard: string;
  protections: Record<Protection, Text>;
  defaults: Pick<SimConfig, "oxygen" | "pressure" | "airflow" | "gravity">;
  historical: Pick<SimConfig, "isolation" | "suppression" | "backup">;
  timeStep: number;
  unit: "s" | "h";
};

export const FRAMES = 180;
export const DURATION = FRAMES - 1;

export const scenarioInfo: Record<ScenarioId, ScenarioText> = {
  apollo1: {
    title: "Apollo 1",
    year: "1967",
    hook: "Oxígeno puro, una chispa y una escotilla que abría hacia dentro.",
    description:
      "Ensayo en la plataforma con la cabina sellada y oxígeno puro a 115 kPa. Un cable hace chispa bajo el asiento izquierdo; el fuego crece en segundos, la presión rompe el casco y la escotilla no puede abrirse a tiempo.",
    crew: 3,
    roles: ["Comandante (izq.)", "Piloto sénior (centro)", "Piloto (der.)"],
    interpretation:
      "Calibrado con los hitos del informe: aviso de fuego, rotura del casco a unos 200 kPa unos 15 s después y apertura de la escotilla a los 5 min. Los trajes protegen de los gases hasta que el fuego los daña.",
    sourceLabel: "NASA · Apollo 1 Accident Lessons Learned",
    modules: ["Cabina", "Escotilla", "Sala blanca"],
    hazard: "Combustión de redes de nailon, velcro y espuma en oxígeno puro",
    protections: {
      isolation: { label: "Escotilla que abre hacia fuera", help: "El diseño posterior se abre en unos segundos, incluso con presión dentro." },
      suppression: { label: "Materiales que no arden", help: "Sustituye nailon, velcro y espumas por materiales ignífugos: el fuego crece unas 10 veces más despacio." },
      backup: { label: "Rescate inmediato", help: "Personal con respiradores junto a la escotilla, listo para abrirla desde fuera en 90 s." },
    },
    defaults: { oxygen: 100, pressure: 115.1, airflow: 0.04, gravity: 1 },
    historical: { isolation: false, suppression: false, backup: false },
    timeStep: 2,
    unit: "s",
  },
  apollo13: {
    title: "Apollo 13",
    year: "1970",
    hook: "Explota un tanque de oxígeno a 322 000 km de casa. Quedan 87 horas de viaje.",
    description:
      "El tanque de oxígeno 2 revienta y deja al módulo de mando sin oxígeno ni electricidad. La única salida es usar el módulo lunar, hecho para 2 personas durante 45 h, como bote salvavidas durante 87 h.",
    crew: 3,
    roles: ["Comandante", "Piloto del módulo de mando", "Piloto del módulo lunar"],
    interpretation:
      "Cada paso de la simulación son 30 minutos. Calibrado con la misión: alarma de CO₂ a 7,5 mmHg unas 24,5 h después de la explosión y amerizaje a las 87 h.",
    sourceLabel: "NASA · Apollo 13 Accident Lessons Learned",
    modules: ["Servicio", "Mando", "Módulo lunar"],
    hazard: "Pérdida de oxígeno y energía; acumulación de CO₂",
    protections: {
      isolation: { label: "Apagar el módulo de mando", help: "Guardar sus baterías para la reentrada. Si se gastan, no hay forma de volver." },
      suppression: { label: "Adaptador de filtros de CO₂", help: "La «caja de correo»: filtros cuadrados del módulo de mando en el sistema redondo del lunar." },
      backup: { label: "Módulo lunar como refugio", help: "Aquarius: oxígeno, agua y 2181 Ah de baterías propias." },
    },
    defaults: { oxygen: 100, pressure: 34.5, airflow: 0.1, gravity: 0 },
    historical: { isolation: true, suppression: true, backup: true },
    timeStep: 1800,
    unit: "h",
  },
  mir: {
    title: "Estación Mir",
    year: "1997",
    hook: "Una vela de oxígeno se incendia y bloquea una de las dos naves de escape.",
    description:
      "Una vela química de oxígeno arde en Kvant-1 como un soplete y llena la estación de humo denso. Bloquea la Soyuz de detrás; la otra queda al otro lado de la estación.",
    crew: 6,
    roles: ["Cosmonauta en Kvant-1", "Comandante", "Ingeniero de vuelo", "Astronauta NASA", "Cosmonauta", "Cosmonauta"],
    interpretation:
      "La vela arde unos 90 s (cifra oficial); la tripulación habló de hasta 14 minutos. El humo llenó la estación mucho más tiempo. Cada paso son 5 s; el ensayo dura 15 min.",
    sourceLabel: "NASA · Fire Aboard Space Station Mir",
    modules: ["Kvant-1", "Bloque base", "Soyuz TM-25"],
    hazard: "Vela de perclorato de litio: produce su propio oxígeno y mucho humo",
    protections: {
      isolation: { label: "Cerrar la escotilla de Kvant-1", help: "Cuando sale el último, se cierra el módulo para que el humo no pase." },
      suppression: { label: "Respiradores y extintores", help: "Máscaras de oxígeno para todos y extintores para enfriar. No apagan la vela." },
      backup: { label: "Preparar la Soyuz libre", help: "La nave del otro extremo, lista para separarse. Solo tiene 3 plazas." },
    },
    defaults: { oxygen: 21, pressure: 101.3, airflow: 0.12, gravity: 0 },
    historical: { isolation: false, suppression: true, backup: true },
    timeStep: 5,
    unit: "s",
  },
  aegis: {
    title: "AEGIS · nave conceptual",
    year: "Concepto",
    hook: "Una batería de iones de litio se incendia en una nave moderna.",
    description:
      "Una falla interna en el módulo de servicio libera calor y gases. La separación de subpaquetes y el enfriamiento limitan la propagación; el aislamiento y el refugio protegen al hábitat.",
    crew: 6,
    roles: ["Técnica en servicio", "Comandante", "Piloto", "Especialista 1", "Especialista 2", "Médica"],
    interpretation:
      "Diseño conceptual con parámetros declarados. El rendimiento de las protecciones son objetivos de diseño, no datos de un sistema real. Cada paso son 5 s; el ensayo dura 15 min.",
    sourceLabel: "Concepto propio · supuestos declarados",
    modules: ["Servicio", "Hábitat", "Refugio"],
    hazard: "Fuga térmica de baterías: mucho calor y mucho CO",
    protections: {
      isolation: { label: "Compuertas automáticas", help: "Corta ventilación compartida al detectar el incidente y cierra la compuerta si la ruta está despejada." },
      suppression: { label: "Agua nebulizada", help: "Agua de reserva limitada para extraer calor del gabinete y reducir el riesgo de propagación." },
      backup: { label: "Refugio con aire propio", help: "Módulo sellado con oxígeno, filtros y energía independientes." },
    },
    defaults: { oxygen: 21, pressure: 101.3, airflow: 0.12, gravity: 0 },
    historical: { isolation: true, suppression: true, backup: true },
    timeStep: 5,
    unit: "s",
  },
};

export const defaultConfig: SimConfig = {
  scenario: "apollo1",
  ...scenarioInfo.apollo1.defaults,
  ...scenarioInfo.apollo1.historical,
};

/* ------------------------------------------------------------ constants */

const R = 8.314;
const CV = 21;
const AIR_PP_O2 = 21.3;
const SIGMA_SOOT = 8700;
const VISIBILITY_K = 3;
const E_O2 = 13100;
export const FED_IMPAIRED = 0.3;
export const FED_INCAPACITATED = 1;
export const FED_LETHAL = 3;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback);
const round = (value: number, digits = 1) => Math.round(value * 10 ** digits) / 10 ** digits;

export function oxygenBoost(oxygen: number, pressure: number) {
  return (oxygen * pressure) / 100 / AIR_PP_O2;
}
export function effectiveFlow(airflow: number, gravity: number) {
  return Math.sqrt(airflow * airflow + 0.09 * gravity);
}
export function starvationLimit(oxygen: number, pressure: number) {
  return clamp(0.035 / Math.max(oxygenBoost(oxygen, pressure), 0.2), 0.004, 0.12);
}
export function visibilityText(meters: number) {
  if (meters >= 20) return "Aire limpio";
  if (meters >= 8) return "Algo de humo";
  if (meters >= 3) return "Cuesta ver";
  if (meters >= 1) return "Humo denso";
  return "No se ve la mano";
}
export function heatText(temperature: number) {
  if (temperature < 35) return "Normal";
  if (temperature < 60) return "Caliente";
  if (temperature < 120) return "Peligroso";
  return "Mortal";
}
export const stateText: Record<CrewState, string> = {
  ok: "Bien",
  impaired: "Afectado",
  incapacitated: "Inconsciente",
  lethal: "Dosis letal",
  safe: "A salvo",
};

/** Minutes to incapacitation by convected heat (ISO 13571). */
export function heatTime(celsius: number) {
  return celsius < 35 ? Infinity : 5e7 * Math.pow(celsius, -3.4);
}
/** Minutes to incapacitation by low oxygen (Purser), sea-level-equivalent %O₂. */
export function hypoxiaTime(o2SeaLevelPercent: number) {
  return o2SeaLevelPercent >= 19.5 ? Infinity : Math.exp(8.13 - 0.54 * (20.9 - o2SeaLevelPercent));
}
/** Minutes to incapacitation by CO₂ (Purser), %CO₂ sea-level equivalent. */
export function co2Time(co2Percent: number) {
  return co2Percent < 3 ? Infinity : Math.exp(6.1623 - 0.5189 * co2Percent);
}

function levelFor(m: { temperature: number; co: number; visibility: number; o2Equivalent: number }): Level {
  if (m.temperature >= 60 || m.co >= 1400 || m.visibility < 1.5 || m.o2Equivalent < 15) return "danger";
  if (m.temperature >= 35 || m.co >= 200 || m.visibility < 8 || m.o2Equivalent < 18) return "watch";
  return "ok";
}

export function clockText(seconds: number, unit: "s" | "h") {
  const display = Math.round(seconds / (unit === "h" ? 60 : 1));
  const sign = display < 0 ? "−" : "+";
  const total = Math.abs(display);
  if (unit === "h") {
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `T ${sign} ${h} h ${String(m).padStart(2, "0")} min`;
  }
  return `T ${sign} ${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/* ------------------------------------------------------------ fire cases */

type Zone = { V: number; A: number; O2: number; N2: number; CO2: number; CO: number; soot: number; T: number };

const newZone = (V: number, oxygenPercent: number, kPa: number): Zone => {
  const n = (kPa * 1000 * V) / (R * 295);
  return { V, A: 6 * Math.pow(V, 2 / 3), O2: (n * oxygenPercent) / 100, N2: (n * (100 - oxygenPercent)) / 100, CO2: n * 0.0004, CO: 0, soot: 0, T: 295 };
};
const moles = (z: Zone) => z.O2 + z.N2 + z.CO2 + z.CO;
const pressureOf = (z: Zone) => (moles(z) * R * z.T) / z.V / 1000;
const visibilityOf = (z: Zone) => clamp(VISIBILITY_K / Math.max(1e-6, (SIGMA_SOOT * z.soot) / z.V), 0, 30);

type FireCase = {
  volumes: [number, number, number];
  outside?: number;
  ignition: number;
  detectionDelay: number;
  reaction: number;
  alpha: number;
  qMax: number;
  fuelMJ: number;
  heatOfCombustion: number;
  yields: { co: number; soot: number; co2: number };
  selfOxidized?: { seconds: number; o2MolPerSecond: number };
  path: [number, number];
  start: number[];
  hatchArea: number;
  suits?: boolean;
};

export const fireCases: Record<"apollo1" | "mir" | "aegis", FireCase> = {
  apollo1: {
    volumes: [6.2, 1.5, 60],
    outside: 400,
    ignition: 6,
    detectionDelay: 8,
    reaction: 2,
    alpha: 0.017,
    qMax: 1800,
    fuelMJ: 60,
    heatOfCombustion: 25,
    yields: { co: 0.03, soot: 0.03, co2: 1.6 },
    path: [1.6, 2.2],
    start: [0, 0, 0],
    hatchArea: 0.5,
    suits: true,
  },
  mir: {
    volumes: [40, 90, 9],
    ignition: 10,
    detectionDelay: 2,
    reaction: 20,
    alpha: 0,
    qMax: 35,
    fuelMJ: 1e9,
    heatOfCombustion: 15,
    yields: { co: 0.08, soot: 0.25, co2: 1.0 },
    selfOxidized: { seconds: 90, o2MolPerSecond: 0.3 },
    path: [9, 13],
    start: [3, 9, 10.5, 12, 13.5, 15],
    hatchArea: 0.8,
  },
  aegis: {
    volumes: [25, 60, 20],
    ignition: 10,
    detectionDelay: 4,
    reaction: 4,
    alpha: 0.5,
    qMax: 300,
    fuelMJ: 70,
    heatOfCombustion: 20,
    yields: { co: 0.25, soot: 0.08, co2: 1.2 },
    path: [7, 7.5],
    start: [1, 7, 7.8, 8.6, 9.4, 10.2],
    hatchArea: 0.8,
  },
};

const SPECIES = ["O2", "N2", "CO2", "CO"] as const;

function runFire(config: SimConfig): { frames: SimFrame[]; events: SimEvent[] } {
  const id = config.scenario as "apollo1" | "mir" | "aegis";
  const info = scenarioInfo[id];
  const fc = fireCases[id];
  const isApollo1 = id === "apollo1";
  const isMir = id === "mir";
  const rack = id === "aegis" ? newAegisRack(config.aegisRack) : null;
  const refugeSpec = aegisParameters.refuge;
  let refugeOxygen = refugeSpec.oxygenMol;
  let refugeScrubber = refugeSpec.scrubberMol;
  let refugeBattery = refugeSpec.batteryKWh;
  let rackState = rack?.step(0.25, 295, false, false);
  const oxygen0 = clamp(finite(config.oxygen, 21), 10, 100);
  const pressure0 = clamp(finite(config.pressure, 101.3), 20, 150);
  const airflow = clamp(finite(config.airflow, 0.12), 0, 1);
  const gravity = clamp(finite(config.gravity, 0), 0, 1);
  const step = info.timeStep;
  const sub = 0.25;

  const zones: Zone[] = fc.volumes.map((V, i) => (isApollo1 && i > 0 ? newZone(V, 21, 101.3) : newZone(V, oxygen0, pressure0)));
  const outside = fc.outside ? newZone(fc.outside, 21, 101.3) : null;

  const detection = fc.ignition + fc.detectionDelay;
  const moveTime = detection + fc.reaction;
  const masksOn = detection + 15;
  const suppressionTime = detection + (id === "aegis" ? 3 : 20);
  const quickHatch = isApollo1 && config.isolation;
  // 1967 inward-opening hatch: ≥ 90 s even in ideal conditions, impossible with overpressure.
  const hatchOpenTime = isApollo1 ? (quickHatch ? detection + 7 : config.backup ? detection + 90 : detection + 290) : 0;
  const flow = effectiveFlow(airflow, gravity);
  const limit = starvationLimit(oxygen0, pressure0);
  const microFlow = gravity < 0.05 ? clamp(flow / 0.15, 0.08, 1.2) : 1;
  const starving = !isMir && gravity < 0.05 && flow < limit;
  const materials = isApollo1 && config.suppression ? 0.1 : 1;
  const candle = clamp(finite(config.candleSeconds ?? 90, 90), 30, 900);

  let fuelLeft = fc.fuelMJ * 1000;
  let ruptured = false;
  let hatchFireClosed = false;
  let refugeSealed = false;
  let starvedAt = -1;
  const crew = fc.start.map((s, i) => ({ s, last: s, fed: 0, heat: 0, toxic: 0, state: "ok" as CrewState, cause: "", role: info.roles[i] }));
  const pathTotal = fc.path[0] + fc.path[1];
  const moduleAt = (s: number) => (s < fc.path[0] * 0.5 ? 0 : s < fc.path[0] + fc.path[1] * 0.6 ? 1 : 2);
  const positionAt = (s: number) => (s <= fc.path[0] ? s / fc.path[0] : 1 + Math.min(1, (s - fc.path[0]) / fc.path[1]));

  const frames: SimFrame[] = [];
  const events: SimEvent[] = [];
  const once = new Set<string>();
  const event = (t: number, kind: string, title: string, detail: string, tone: SimEvent["tone"] = "info") => {
    if (once.has(kind)) return;
    once.add(kind);
    events.push({ index: Math.round(t / step), time: t, kind, title, detail, tone });
  };
  const exchange = (a: Zone, b: Zone, F: number, dt: number) => {
    const fa = clamp((F * dt) / a.V, 0, 0.5);
    const fb = clamp((F * dt) / b.V, 0, 0.5);
    const na = moles(a);
    const nb = moles(b);
    const ea = a.T * na;
    const eb = b.T * nb;
    for (const key of [...SPECIES, "soot"] as const) {
      const move = a[key] * fa - b[key] * fb;
      a[key] -= move;
      b[key] += move;
    }
    const de = ea * fa - eb * fb;
    a.T = (ea - de) / moles(a);
    b.T = (eb + de) / moles(b);
  };

  let hrr = 0;
  let t = 0;
  for (let frame = 0; frame < FRAMES; frame++) {
    const tEnd = frame * step;
    while (t < tEnd - 1e-9) {
      const dt = Math.min(sub, tEnd - t);
      t += dt;
      const z0 = zones[0];
      const ppO2 = (z0.O2 / moles(z0)) * pressureOf(z0);
      const boost = ppO2 / AIR_PP_O2;
      const since = t - fc.ignition;
      // ---------------- heat release rate (kW)
      let q = 0;
      const ductsClosed = Boolean(rack && config.isolation && t >= detection);
      if (rack) {
        const wasPropagated = rackState?.propagated;
        rackState = rack.step(dt, z0.T, since >= 0, config.suppression && t >= suppressionTime);
        if (rackState.propagated && !wasPropagated) event(t, "propagation", "Propagación a subpaquetes vecinos", "El nodo térmico vecino alcanzó el umbral del modelo y comenzó a liberar su propia energía.", "bad");
        const localFlow = ductsClosed ? Math.min(flow, 0.025) : flow;
        const oxygenFactor = clamp((ppO2 - 8) / 5, 0, 1);
        const replenishment = gravity < 0.05 ? clamp(localFlow / 0.12, 0.04, 1) : 1;
        q = Math.min(rackState.packHeatKW * 0.78 * oxygenFactor * replenishment, fuelLeft / dt);
        if (rackState.packHeatKW > 0 && replenishment < 0.1 && since > 14) {
          event(t, "starved", "Llama secundaria limitada", "El flujo reducido limita la llama de los gases; la batería todavía libera calor.", "info");
        }
        // Uncalibrated vent-gas source independent of the secondary flame.
        z0.CO += rackState.packHeatKW * 0.000065 * dt;
        z0.T += rackState.cabinHeatKW * 1000 * dt / (moles(z0) * CV);
      } else if (since >= 0 && fuelLeft > 0) {
        if (fc.selfOxidized) {
          const ramp = clamp(since / 5, 0, 1);
          const burnout = since > candle ? Math.exp(-(since - candle) / 6) : 1;
          q = fc.qMax * ramp * burnout;
        } else {
          const alpha = fc.alpha * boost * boost * materials * (gravity >= 0.05 ? 0.6 + 0.4 * gravity : microFlow);
          q = Math.min(alpha * since * since, fc.qMax);
          q *= clamp((ppO2 - 8) / (13 - 8), 0, 1);
          if (starving) {
            q *= Math.exp(-Math.max(0, since - 8) / 6);
            if (since > 14 && starvedAt < 0) starvedAt = t;
          }
        }
      }
      fuelLeft -= q * dt;
      hrr = q;
      // ---------------- chemistry
      if (q > 0) {
        const fuel = (q / 1000 / fc.heatOfCombustion) * dt;
        const vitiation = clamp((14 - (ppO2 / 101.3) * 100) / 6, 0, 1);
        const yCO = fc.yields.co + 0.17 * vitiation;
        if (fc.selfOxidized) z0.O2 += fc.selfOxidized.o2MolPerSecond * dt * (q / fc.qMax);
        else z0.O2 = Math.max(0, z0.O2 - (q / E_O2 / 0.032) * dt);
        z0.CO2 += (fuel * fc.yields.co2) / 0.044;
        z0.CO += (fuel * yCO) / 0.028;
        z0.soot += fuel * fc.yields.soot;
        z0.T += (0.7 * q * 1000 * dt) / (moles(z0) * CV);
      }
      // ---------------- wall losses and active cooling
      for (const z of zones) {
        const h = 12 + 0.06 * Math.max(0, z.T - 295);
        z.T -= (h * z.A * (z.T - 295) * dt) / (moles(z) * CV);
      }
      if (isMir && config.suppression && t >= suppressionTime) zones[0].T -= (zones[0].T - 295) * 0.02 * dt;
      // ---------------- hatches and gas exchange
      if (!hatchFireClosed && config.isolation && !isApollo1 && t >= detection + 3) {
        const empty = crew.every((c) => moduleAt(c.s) !== 0 || c.state === "incapacitated" || c.state === "lethal");
        const clear = rack ? crew.every((c) => c.s >= fc.path[0]) : empty;
        if (clear || (!rack && t >= detection + 30)) {
          hatchFireClosed = true;
          event(t, "isolation", info.protections.isolation.label, empty ? "Ya no queda nadie dentro: se cierra el módulo del fuego." : "Se cierra por tiempo límite, aunque quede alguien dentro.", empty ? "good" : "bad");
        }
      }
      const openFlow = ductsClosed ? aegisParameters.ductExchangeM3PerS : fc.hatchArea * (airflow + 0.02) + (gravity > 0.05 ? 0.15 : 0);
      if (isApollo1) {
        const p = pressureOf(zones[0]);
        if (!ruptured && p >= 200) {
          ruptured = true;
          event(t, "rupture", "Se rompe el casco", `La presión llega a ${Math.round(p)} kPa y abre una grieta. Sale una llamarada, entra aire y el fuego empieza a producir mucho monóxido de carbono.`, "bad");
        }
        if (ruptured || t >= hatchOpenTime) {
          const target = (101.3 * 1000 * zones[0].V) / (R * zones[0].T);
          const n = moles(zones[0]);
          if (n > target) {
            const f = Math.min(n - target, n * 0.4 * dt) / n;
            for (const key of SPECIES) zones[0][key] *= 1 - f;
            zones[0].soot *= 1 - f;
          }
          exchange(zones[0], zones[1], ruptured ? 0.25 : 0.4, dt);
        }
        exchange(zones[1], zones[2], 0.5, dt);
        if (outside) exchange(zones[2], outside, 0.5, dt);
      } else {
        exchange(zones[0], zones[1], hatchFireClosed ? aegisParameters.closedLeakM3PerS : openFlow, dt);
        exchange(zones[1], zones[2], refugeSealed ? 0.0003 : openFlow * 0.8, dt);
        if (rack) {
          const z = zones[2];
          const occupants = crew.filter((c) => c.state !== "lethal" && moduleAt(c.s) === 2).length;
          const oxygen = Math.min(z.O2, occupants * refugeSpec.oxygenMolPerPersonSecond * dt);
          z.O2 -= oxygen;
          z.CO2 += occupants * refugeSpec.co2MolPerPersonSecond * dt;
          if (refugeSealed && refugeBattery > 0) {
            const dose = Math.min(oxygen, refugeOxygen);
            z.O2 += dose;
            refugeOxygen -= dose;
            const captured = Math.min(Math.max(0, z.CO2 - moles(z) * 0.00042) * 0.04 * dt, refugeScrubber);
            z.CO2 -= captured;
            refugeScrubber -= captured;
            z.CO *= 1 - 0.02 * dt;
            z.soot *= 1 - 0.03 * dt;
            refugeBattery = Math.max(0, refugeBattery - refugeSpec.loadKW * dt / 3600);
          }
        } else if (refugeSealed && config.backup) {
          const z = zones[2];
          z.CO *= 1 - 0.02 * dt;
          z.soot *= 1 - 0.03 * dt;
          z.T -= (z.T - 295) * 0.02 * dt;
        }
      }
      // ---------------- crew: dose and movement
      for (const [i, c] of crew.entries()) {
        if (c.state === "lethal") continue;
        const m = moduleAt(c.s);
        const z = zones[m];
        const n = moles(z);
        const p = pressureOf(z);
        const T = z.T - 273.15;
        const ppm = (z.CO / n) * 1e6;
        const o2Eq = (((z.O2 / n) * p) / 101.3) * 100;
        const masked = isMir && config.suppression && t >= masksOn;
        let toxicFactor = masked ? 0.05 : 1;
        let heatFactor = 1;
        if (fc.suits && m === 0) {
          // Suits on their own oxygen loop until the fire damages hoses and fabric.
          toxicFactor = !ruptured && T < 260 ? 0 : 1;
          heatFactor = 0.5;
        }
        if (!rack && m === 2 && refugeSealed && config.backup) toxicFactor *= 0.2;
        const dtMin = dt / 60;
        c.heat += (dtMin / heatTime(T)) * heatFactor;
        c.toxic += ((ppm * dtMin) / 35000 + dtMin / hypoxiaTime(o2Eq) + (rack ? dtMin / co2Time((z.CO2 / n) * 100) : 0)) * toxicFactor;
        c.fed = c.heat + c.toxic;
        const cause = c.heat > c.toxic ? "calor" : "gases tóxicos";
        if (c.fed >= FED_LETHAL) {
          c.state = "lethal";
          c.cause = cause;
          event(t, `lethal-${i}`, `${c.role}: dosis letal`, `La dosis acumulada llega a 3, sobre todo por ${cause}.`, "bad");
          continue;
        }
        if (c.fed >= FED_INCAPACITATED && c.state !== "incapacitated") {
          c.state = "incapacitated";
          c.cause = cause;
          event(t, `incap-${i}`, `${c.role} pierde el conocimiento`, `Dosis acumulada 1, sobre todo por ${cause}. Ya no puede moverse.`, "bad");
        } else if (c.fed >= FED_IMPAIRED && (c.state === "ok" || c.state === "safe")) {
          c.state = "impaired";
          event(t, `impaired-${i}`, `${c.role}, afectado`, "Dosis 0,3: mareo y confusión. Se mueve más despacio.", "bad");
        }
        const canMove = c.state !== "incapacitated";
        let speed = (gravity >= 0.1 ? 1.0 : 0.5) * (c.state === "impaired" ? 0.5 : 1);
        if (visibilityOf(z) < 1 && !masked) speed *= 0.5;
        if (isApollo1) {
          if (t >= hatchOpenTime) {
            const order = [1, 0, 2].indexOf(i);
            if (canMove && t >= hatchOpenTime + order * 4) c.s = Math.min(pathTotal, c.s + speed * 0.8 * dt);
            if (!canMove && config.backup && t >= hatchOpenTime + 20) c.s = Math.min(pathTotal, c.s + 0.4 * dt);
          }
        } else if (canMove && t >= moveTime) {
          const routeDanger = levelFor({ temperature: zones[1].T - 273.15, co: (zones[1].CO / moles(zones[1])) * 1e6, visibility: visibilityOf(zones[1]), o2Equivalent: 21 }) === "danger";
          const shouldGo = m === 0 || config.backup || routeDanger;
          // A Soyuz seats three: on Mir only the crew assigned to it can board; the rest wait in the base block.
          const seat = !isMir || [1, 2, 3].includes(i);
          const goal = config.backup && seat ? pathTotal : fc.path[0] + (isMir ? fc.path[1] * 0.55 : 2);
          if (shouldGo && c.s < goal) c.s = Math.min(goal, c.s + speed * dt);
        }
        if (c.s >= pathTotal - 0.01 && c.state === "ok" && (!rack || refugeSealed)) c.state = "safe";
      }
      if (!isApollo1 && config.backup && !refugeSealed) {
        const mobile = crew.filter((c, i) => c.state !== "incapacitated" && c.state !== "lethal" && (!isMir || [1, 2, 3].includes(i)));
        if (mobile.length && mobile.every((c) => c.s >= pathTotal - 0.01)) {
          refugeSealed = true;
          event(t, "sealed", `${info.modules[2]}, sellada`, "Todos los que pueden moverse están dentro. Se cierra la escotilla.", "good");
        }
      }
    }
    // ---------------- timeline events
    const since = tEnd - fc.ignition;
    if (since >= 0)
      event(
        fc.ignition,
        "ignition",
        isMir ? "Se incendia la vela" : isApollo1 ? "Chispa bajo el asiento izquierdo" : "Fuga térmica en la batería",
        isMir
          ? "Al encender una vela de oxígeno en Kvant-1, arde como un soplete: un metro de llama, chispas y metal fundido."
          : isApollo1
            ? "Un cable dañado hace chispa. Con oxígeno puro a 115 kPa, las redes de nailon y el velcro arden enseguida."
            : "Una falla interna inicia la liberación de calor y gases. El modelo calcula si el calor se transmite al grupo vecino.",
        "bad",
      );
    if (tEnd >= detection) event(detection, "detection", isApollo1 ? "«¡Fuego!»" : "Alarma", isApollo1 ? "La tripulación avisa por radio. Siguen atados a sus asientos." : isMir ? "La tripulación ve la llama y da la alarma." : "La alarma dispara el corte eléctrico y, si está habilitado, el aislamiento de los conductos.");
    if (rack && tEnd >= detection) event(detection, "feed-cut", "Alimentación de batería interrumpida", "El contactor abre el circuito externo. Una reacción interna ya iniciada puede continuar.");
    if (isMir && config.suppression && tEnd >= masksOn) event(masksOn, "masks", "Respiradores puestos", "Cada persona respira el oxígeno de su máscara: los gases ya no le afectan, el calor sí.", "good");
    if (isMir && config.suppression && tEnd >= suppressionTime) event(suppressionTime, "extinguish", "Extintores", "Enfrían las paredes. La vela sigue ardiendo: fabrica su propio oxígeno.");
    if (id === "aegis" && config.suppression && tEnd >= suppressionTime) event(suppressionTime, "mist", "Enfriamiento del gabinete habilitado", "El sistema extrae calor con una reserva finita. Una reacción interna ya iniciada puede continuar.", "info");
    if (isMir && since > candle + 12) event(fc.ignition + candle + 12, "burnout", "La vela se consume", "Se agota la carga y la llama se apaga sola. El humo seguirá mucho tiempo.", "good");
    if (starvedAt >= 0) event(starvedAt, "starved", "La llama se ahoga", "Sin gravedad, el aire caliente no sube. Con la ventilación casi parada no llega oxígeno nuevo y la llama se apaga sola.", "good");
    if (isApollo1 && tEnd >= hatchOpenTime)
      event(
        hatchOpenTime,
        "hatch",
        quickHatch ? "Escotilla abierta" : config.backup ? "El rescate abre la escotilla" : "Por fin se abre la escotilla",
        quickHatch ? "La escotilla rediseñada se abre en unos segundos." : config.backup ? "El equipo preparado la abre desde fuera en 90 s." : "El personal de la plataforma tardó unos 5 minutos en abrir las tres capas.",
        quickHatch || config.backup ? "good" : "bad",
      );
    if (!isApollo1 && tEnd >= moveTime) event(moveTime, "move", config.backup ? `Rumbo a ${info.modules[2]}` : "Alejarse del fuego", config.backup ? "La tripulación se dirige a la zona de refugio." : "Sin refugio preparado, se alejan del fuego y esperan en el módulo central.");

    // ---------------- snapshot
    const modules: ModuleState[] = zones.map((z, i) => {
      const n = moles(z);
      const p = pressureOf(z);
      const T = z.T - 273.15;
      const co = (z.CO / n) * 1e6;
      const o2 = (z.O2 / n) * 100;
      const vis = visibilityOf(z);
      return {
        id: `module-${i}`,
        name: info.modules[i],
        temperature: round(T),
        co: Math.round(co),
        o2: round(o2),
        co2: round((z.CO2 / n) * 100, 2),
        pressure: round(p),
        visibility: round(vis),
        smoke: round(clamp(100 * (1 - vis / 30), 0, 100)),
        level: levelFor({ temperature: T, co, visibility: vis, o2Equivalent: (o2 * p) / 101.3 }),
        visibilityText: visibilityText(vis),
      };
    });
    const crewStatus: CrewMember[] = crew.map((c) => ({
      role: c.role,
      position: round(positionAt(c.s), 2),
      moving: Math.abs(c.s - c.last) > 0.01,
      state: c.state,
      fed: round(c.fed, 2),
      heat: round(c.heat, 2),
      toxic: round(c.toxic, 2),
      cause: c.cause,
      module: moduleAt(c.s),
    }));
    for (const c of crew) c.last = c.s;
    const safe = crewStatus.filter((c) => c.state === "safe").length;
    const down = crewStatus.filter((c) => c.state === "incapacitated" || c.state === "lethal").length;
    const level: Level = since < 0 ? "ok" : down > 0 || modules[0].level === "danger" || modules[1].level === "danger" ? "danger" : "watch";
    const latest = events.filter((e) => e.time <= tEnd).sort((a, b) => a.time - b.time).at(-1);
    const m0 = modules[0];
    const narrative =
      since < 0
        ? `Todo en orden. Riesgo de este caso: ${info.hazard.toLowerCase()}.`
        : latest && tEnd - latest.time < step * 4
          ? latest.detail
          : down === info.crew
            ? "Nadie puede moverse. Solo un rescate desde fuera podría sacarlos."
            : `${m0.name}: ${Math.round(m0.temperature)} °C, ${m0.co.toLocaleString("es")} ppm de CO, visibilidad ${m0.visibility < 1 ? "menor de 1 m" : `${Math.round(m0.visibility)} m`}.${safe ? ` ${safe} a salvo.` : ""}`;
    frames.push({
      index: frame,
      time: tEnd,
      clock: clockText(tEnd - fc.ignition, "s"),
      sinceIncident: tEnd - fc.ignition,
      phase: since < 0 ? "Antes del incidente" : ruptured ? "Casco roto" : hrr > 1 ? "Fuego activo" : rackState && rackState.packHeatKW > 0 ? "Fuga térmica sin llama visible" : "Sin llama",
      level,
      narrative,
      hrr: Math.round(hrr),
      fireIntensity: round(clamp(hrr > 0.5 ? 0.25 + Math.log10(1 + hrr) / 2.4 : 0, 0, 1.5), 2),
      temperature: m0.temperature,
      pressure: m0.pressure,
      oxygen: m0.o2,
      smoke: modules[1].smoke,
      energy: 100,
      aegis: rackState ? {
        ...rackState, feedCut: tEnd >= detection, ductsClosed: config.isolation && tEnd >= detection,
        refugeBatteryPercent: 100 * refugeBattery / refugeSpec.batteryKWh,
        refugeOxygenPercent: 100 * refugeOxygen / refugeSpec.oxygenMol,
        refugeScrubberPercent: 100 * refugeScrubber / refugeSpec.scrubberMol,
      } : undefined,
      refuge: rack ? crew.filter((c) => c.s >= pathTotal - 0.01 && c.state !== "lethal").length : safe,
      crew: crewStatus.map((c) => c.position),
      crewStatus,
      modules,
      flags: { hatchToFire: hatchFireClosed, refugeSealed, hatchOpen: isApollo1 && tEnd >= hatchOpenTime, ruptured, inRefuge: safe > 0, smJettisoned: false, lmJettisoned: false },
    });
  }
  return { frames, events: events.sort((a, b) => a.time - b.time) };
}

/* ------------------------------------------------------------ Apollo 13 */

const LIOH_KNEE = 0.5;
const LIOH_SPAN = 0.9; // LiOH loses efficiency gradually after half its capacity
export const apollo13Model = {
  co2PerPerson: 0.042, // kg/h
  lmVolume: 6.7, // m³
  cmVolume: 6.2,
  cabinKPa: 33, // 4.8 psi pure O₂
  lmLiohPersonHours: 2 * 45, // designed for 2 people × 45 h; gives the 7.5 mmHg alarm ~23.5 h after the explosion (mission: 24.6 h)
  cmEntryAh: 120,
  lmAh: 2181,
};

function runApollo13(config: SimConfig): { frames: SimFrame[]; events: SimEvent[] } {
  const info = scenarioInfo.apollo13;
  const p = apollo13Model;
  const step = info.timeStep;
  const explosion = 3600;
  const events: SimEvent[] = [];
  const once = new Set<string>();
  const event = (t: number, kind: string, title: string, detail: string, tone: SimEvent["tone"] = "info") => {
    if (once.has(kind)) return;
    once.add(kind);
    events.push({ index: Math.round(t / step), time: t, kind, title, detail, tone });
  };
  const crew = info.roles.map((role) => ({ role, fed: 0, toxic: 0, state: "ok" as CrewState, cause: "", pos: 1 }));
  let co2kPa = 0.1;
  let liohUsed = 0;
  let cmAh = p.cmEntryAh;
  let lmAh = p.lmAh;
  let cabinC = 22;
  let reentryFailed = false;
  const frames: SimFrame[] = [];
  for (let frame = 0; frame < FRAMES; frame++) {
    const t = frame * step;
    const h = (t - explosion) / 3600;
    const exploded = h >= 0;
    const inLm = config.backup && h >= 1.5 && h < 83;
    const alive = crew.filter((c) => c.state !== "lethal").length;
    let o2Lost = false;
    if (exploded) {
      if (h > 2.5) {
        // Without the LM the crew must keep the CM life support running on its entry batteries.
        const cmDraw = !config.backup ? 22 : config.isolation ? (h > 82 ? 8 : 0) : 22;
        cmAh = Math.max(0, cmAh - (cmDraw * step) / 3600);
        if (inLm && h > 70 && h < 82) cmAh = Math.min(p.cmEntryAh, cmAh + (3 * step) / 3600);
      }
      if (inLm) lmAh = Math.max(0, lmAh - (15 * step) / 3600);
      const volume = inLm ? p.lmVolume : p.cmVolume;
      const n = (p.cabinKPa * 1000 * volume) / (R * 280);
      const produced = (alive * p.co2PerPerson * (step / 3600)) / 0.044;
      let scrub: number;
      if (inLm) {
        const adapterIn = config.suppression && h >= 25.5;
        const capacityLeft = 1 - liohUsed / p.lmLiohPersonHours;
        const used = 1 - capacityLeft;
        const efficiency = adapterIn ? 1 : 1 - clamp((used - LIOH_KNEE) / LIOH_SPAN, 0, 1);
        if (!adapterIn) liohUsed += (alive * step) / 3600;
        scrub = produced * efficiency;
        if (adapterIn) scrub += Math.max(0, (co2kPa - 0.2) / p.cabinKPa) * n * 0.6;
      } else {
        const powered = h < 2.5 || cmAh > 1;
        scrub = powered ? produced : 0;
      }
      co2kPa = Math.max(0.05, co2kPa + ((produced - scrub) / n) * p.cabinKPa);
      if (inLm || h > 2.5) cabinC = clamp(cabinC - 0.25, 4, 22);
      o2Lost = !config.backup && h > 2.5 && cmAh <= 1 && h > 14;
      const co2Percent = (co2kPa / 101.3) * 100;
      for (const c of crew) {
        if (c.state === "lethal") continue;
        const dMin = step / 60;
        c.toxic += dMin / co2Time(co2Percent) + (o2Lost ? dMin / hypoxiaTime(9) : 0);
        c.fed = c.toxic;
        c.pos = inLm ? 2 : 1;
        if (c.fed >= FED_LETHAL) {
          c.state = "lethal";
          c.cause = o2Lost ? "falta de oxígeno" : "CO₂";
        } else if (c.fed >= FED_INCAPACITATED) {
          c.state = "incapacitated";
          c.cause = o2Lost ? "falta de oxígeno" : "CO₂";
        } else if ((c.fed >= FED_IMPAIRED || co2kPa * 7.5 > 15) && c.state === "ok") c.state = "impaired";
      }
      if (h >= 86.5 && !reentryFailed && cmAh < 50 && crew.some((c) => c.state !== "lethal")) {
        reentryFailed = true;
        event(t, "noreentry", "Sin energía para volver", "Las baterías de reentrada están agotadas. El módulo de mando no puede encenderse para entrar en la atmósfera.", "bad");
        crew.forEach((c, i) => {
          if (c.state !== "lethal") {
            c.state = "lethal";
            c.cause = "imposible reentrar";
            event(t, `lethal-${i}`, `${c.role}: sin regreso`, "Sin energía en el módulo de mando no hay reentrada posible.", "bad");
          }
        });
      }
      if (h >= 87 && !reentryFailed) for (const c of crew) if (c.state === "ok" || c.state === "impaired") c.state = "safe";
    }
    const mmHg = co2kPa * 7.50062;
    if (t >= explosion - 1800) event(explosion - 93, "stir", "Agitan los tanques", "Control pide encender los ventiladores de los tanques de oxígeno. Dentro del tanque 2, un cable con el aislante dañado hace chispa.");
    if (exploded) event(explosion, "explosion", "Revienta el tanque 2", "Sale despedido el panel 4. «Houston, hemos tenido un problema». Caen el oxígeno y la tensión eléctrica.", "bad");
    if (h >= 1) event(explosion + 3600, "fuelcells", "Fallan las pilas de combustible", "Sin oxígeno en los tanques, al módulo de mando solo le quedan las baterías de reentrada.", "bad");
    if (config.backup && h >= 1.5) event(explosion + 5400, "lm", "A bordo de Aquarius", "La tripulación enciende el módulo lunar y lo usa como bote salvavidas.", "good");
    if (config.isolation && h >= 2.5) event(explosion + 9000, "powerdown", "Módulo de mando apagado", "Sus baterías quedan guardadas para la reentrada. La temperatura empieza a bajar.", "good");
    if (!config.isolation && h >= 2.5) event(explosion + 9000, "cmon", "El módulo de mando sigue encendido", "Gasta las baterías que harán falta para la reentrada.", "bad");
    if (config.backup && h >= 5.6) event(explosion + 5.6 * 3600, "dps", "Encendido de regreso", "El motor del módulo lunar pone la nave en trayectoria de vuelta alrededor de la Luna.");
    if (mmHg >= 7.5) event(t, "co2alarm", "Alarma de CO₂", `El CO₂ llega a ${mmHg.toFixed(1).replace(".", ",")} mmHg. Los filtros del módulo lunar eran para 2 personas.`, "bad");
    if (config.suppression && config.backup && h >= 25.5) event(explosion + 25.5 * 3600, "mailbox", "Instalan la «caja de correo»", "Con cinta, bolsas y cartón conectan los filtros cuadrados del módulo de mando. El CO₂ baja.", "good");
    if (mmHg >= 15) event(t, "co2danger", "CO₂ peligroso", "Más de 15 mmHg: dolor de cabeza, respiración agitada y errores.", "bad");
    if (o2Lost) event(t, "o2lost", "Sin aire respirable", "El módulo de mando se queda sin energía para sus ventiladores y sin oxígeno de reserva.", "bad");
    if (h >= 82 && crew.some((c) => c.state !== "lethal")) event(explosion + 82 * 3600, "smsep", "Separan el módulo de servicio", "Por primera vez ven el daño: falta un panel entero.");
    if (h >= 86.5 && !reentryFailed && config.backup) event(explosion + 86.5 * 3600, "lmsep", "Adiós a Aquarius", "Sueltan el módulo lunar y entran en la atmósfera con el de mando.", "good");
    if (h >= 87 && crew.some((c) => c.state === "safe")) event(explosion + 87 * 3600, "splash", "Amerizaje", "La tripulación llega al Pacífico.", "good");
    crew.forEach((c, i) => {
      if (c.state === "incapacitated") event(t, `incap-${i}`, `${c.role} pierde el conocimiento`, `Por ${c.cause}.`, "bad");
      if (c.state === "lethal" && c.cause !== "imposible reentrar") event(t, `lethal-${i}`, `${c.role}: dosis letal`, `Por ${c.cause}.`, "bad");
    });
    const occupied = inLm ? 2 : 1;
    const level: Level = mmHg >= 15 ? "danger" : mmHg >= 7.5 ? "watch" : "ok";
    const modules: ModuleState[] = info.modules.map((name, i) => {
      const here = i === occupied && exploded;
      const co2 = here ? (co2kPa / p.cabinKPa) * 100 : 0.3;
      return {
        id: `module-${i}`,
        name,
        temperature: i === 0 ? (exploded ? -100 : 20) : here ? round(cabinC) : exploded && h > 2.5 ? round(cabinC - 3) : 22,
        co: 0,
        o2: i === 0 && exploded ? 0 : round(100 - co2),
        co2: round(co2, 2),
        pressure: i === 0 ? 0 : p.cabinKPa,
        visibility: 30,
        smoke: 0,
        level: i === 0 ? (exploded ? "danger" : "ok") : here ? level : "ok",
        visibilityText: i === 0 && exploded ? "Dañado" : here ? `CO₂ ${mmHg.toFixed(1).replace(".", ",")} mmHg` : exploded && h > 2.5 && i === 1 ? "Apagado" : "Normal",
      };
    });
    const crewStatus: CrewMember[] = crew.map((c) => ({ role: c.role, position: c.pos, moving: false, state: c.state, fed: round(c.fed, 2), heat: 0, toxic: round(c.toxic, 2), cause: c.cause, module: c.pos }));
    const latest = events.filter((e) => e.time <= t).at(-1);
    const down = crewStatus.filter((c) => c.state === "incapacitated" || c.state === "lethal").length;
    const power = inLm ? (lmAh / p.lmAh) * 100 : h < 2.5 ? Math.max(0, 100 - Math.max(0, h) * 25) : (cmAh / p.cmEntryAh) * 100;
    frames.push({
      index: frame,
      time: t,
      clock: clockText(t - explosion, "h"),
      sinceIncident: t - explosion,
      phase: !exploded ? "Rumbo a la Luna" : h >= 87 ? "Reentrada" : inLm ? "En el bote salvavidas" : "Módulo de mando dañado",
      level: !exploded ? "ok" : down ? "danger" : !config.backup ? "danger" : level === "ok" ? "watch" : level,
      narrative: !exploded
        ? "Viaje tranquilo hacia la Luna, a 56 horas del despegue."
        : latest && t - latest.time < step * 3
          ? latest.detail
          : `CO₂ ${mmHg.toFixed(1).replace(".", ",")} mmHg · energía ${Math.round(power)} % · cabina ${Math.round(cabinC)} °C.`,
      hrr: 0,
      fireIntensity: exploded && h < 4 ? round(clamp(1.2 - h * 0.3, 0.15, 1.2), 2) : exploded && h < 82 ? 0.12 : 0,
      temperature: cabinC,
      pressure: p.cabinKPa,
      oxygen: 100,
      smoke: 0,
      energy: round(clamp(power, 0, 100)),
      refuge: crewStatus.filter((c) => c.state === "safe").length,
      crew: crewStatus.map((c) => c.position),
      crewStatus,
      modules,
      flags: { hatchToFire: false, refugeSealed: false, hatchOpen: false, ruptured: exploded, inRefuge: inLm, smJettisoned: h >= 82, lmJettisoned: h >= 86.5 },
      life: {
        co2mmHg: round(mmHg),
        liohLeft: round(clamp(1 - liohUsed / p.lmLiohPersonHours, 0, 1) * 100),
        cmBattery: round((cmAh / p.cmEntryAh) * 100),
        lmBattery: round((lmAh / p.lmAh) * 100),
        cabinTemp: round(cabinC),
      },
    });
  }
  return { frames, events: events.sort((a, b) => a.time - b.time) };
}

/* ------------------------------------------------------------ public API */

export function runSimulation(config: SimConfig) {
  const result = config.scenario === "apollo13" ? runApollo13(config) : runFire(config);
  return { ...result, outcome: summarize(config, result.frames, result.events) };
}

export function simulate(config: SimConfig): SimFrame[] {
  return runSimulation(config).frames;
}

function summarize(config: SimConfig, frames: SimFrame[], events: SimEvent[]): SimOutcome {
  const info = scenarioInfo[config.scenario];
  const last = frames[frames.length - 1];
  const people = last.crewStatus.map((c, i) => {
    const hit = events.find((e) => e.kind === `lethal-${i}`) ?? events.find((e) => e.kind === `incap-${i}`);
    return { role: c.role, state: c.state, fed: c.fed, cause: c.cause, when: hit ? frames[Math.min(hit.index, frames.length - 1)].clock : null };
  });
  const lethal = people.filter((p) => p.state === "lethal").length;
  const incapacitated = people.filter((p) => p.state === "incapacitated").length;
  const safe = info.crew - lethal - incapacitated;
  const level: Level = lethal ? "danger" : incapacitated ? "watch" : "ok";
  const title =
    lethal === info.crew
      ? "Ningún tripulante sobrevive"
      : lethal
        ? `${lethal} de ${info.crew} no sobreviven`
        : incapacitated
          ? `${incapacitated} de ${info.crew} quedan inconscientes`
          : `Las ${info.crew} personas sobreviven`;
  const peaks: SimOutcome["peaks"] = [];
  const factors: SimOutcome["factors"] = [];
  if (config.scenario === "apollo13") {
    const maxCo2 = Math.max(...frames.map((f) => f.life?.co2mmHg ?? 0));
    const minCm = Math.min(...frames.filter((f) => f.sinceIncident < 86 * 3600).map((f) => f.life?.cmBattery ?? 100));
    peaks.push({ label: "CO₂ máximo", value: `${maxCo2.toFixed(1).replace(".", ",")} mmHg`, limit: "15 mmHg", exceeded: maxCo2 >= 15 });
    peaks.push({ label: "Baterías de reentrada", value: `${Math.round(minCm)} %`, limit: "≥ 50 %", exceeded: minCm < 50 });
    factors.push(config.backup ? { good: true, text: "El módulo lunar dio oxígeno, agua y energía para 87 h, casi el doble de lo previsto." } : { good: false, text: "Sin el módulo lunar, el de mando solo tenía baterías para unas horas. Sin ventiladores, el CO₂ y la falta de oxígeno son mortales." });
    if (config.backup) factors.push(config.suppression ? { good: true, text: "La «caja de correo» mantuvo el CO₂ bajo el resto del viaje." } : { good: false, text: "Los filtros del módulo lunar eran para 2 personas. Sin el adaptador, el CO₂ sube sin control tras el primer día." });
    factors.push(config.isolation ? { good: true, text: "Apagar el módulo de mando guardó sus baterías para la reentrada." } : { good: false, text: "Mantener encendido el módulo de mando gastó las baterías necesarias para volver." });
  } else {
    const peakT = Math.max(...frames.map((f) => Math.max(...f.modules.map((m) => m.temperature))));
    const peakCo = Math.max(...frames.map((f) => Math.max(...f.modules.map((m) => m.co))));
    const minVis = Math.min(...frames.map((f) => f.modules[1].visibility));
    const peakP = Math.max(...frames.map((f) => f.modules[0].pressure));
    peaks.push({ label: "Temperatura máxima", value: `${Math.round(peakT)} °C`, limit: "60 °C", exceeded: peakT >= 60 });
    peaks.push({ label: "CO máximo", value: `${peakCo.toLocaleString("es")} ppm`, limit: "1400 ppm", exceeded: peakCo >= 1400 });
    peaks.push({ label: `Visibilidad mínima en ${info.modules[1]}`, value: minVis < 1 ? "< 1 m" : `${Math.round(minVis)} m`, limit: "3 m", exceeded: minVis < 3 });
    if (config.scenario === "aegis") {
      const peak = Math.max(...frames.map((frame) => frame.aegis?.neighborC ?? 0));
      peaks.push({
        label: "Temperatura máxima del subpaquete vecino",
        value: `${Math.round(peak)} °C`,
        limit: `${aegisParameters.propagationC} °C`,
        exceeded: last.aegis?.propagated ?? false,
      });
    }
    if (config.scenario === "apollo1") peaks.push({ label: "Presión máxima", value: `${Math.round(peakP)} kPa`, limit: "≈ 200 kPa (rotura)", exceeded: peakP >= 195 });
    const boost = oxygenBoost(config.oxygen, config.pressure);
    if (config.scenario === "apollo1") {
      factors.push(boost >= 1.6 ? { good: false, text: `Con ${boost.toFixed(1).replace(".", ",")} veces el oxígeno del aire, el fuego creció en segundos.` } : { good: true, text: "Con una atmósfera parecida al aire, el fuego crece mucho más despacio." });
      factors.push(config.isolation ? { good: true, text: "La escotilla rápida permite salir antes de que el calor sea mortal." } : { good: false, text: "La escotilla abría hacia dentro: con presión en la cabina era imposible abrirla." });
      factors.push(config.suppression ? { good: true, text: "Con materiales ignífugos, el fuego tarda mucho más en crecer." } : { good: false, text: "Redes de nailon, velcro y espuma alimentaron el fuego." });
      if (events.some((e) => e.kind === "rupture")) factors.push({ good: false, text: "Al romperse el casco entró aire, los trajes se dañaron y los gases tóxicos llegaron a la tripulación." });
    } else if (config.scenario === "mir") {
      factors.push({ good: false, text: "La vela fabricaba su propio oxígeno: ni extintores ni cortar el aire la apagaban." });
      factors.push(config.suppression ? { good: true, text: "Los respiradores protegieron de los gases durante el humo denso." } : { good: false, text: "Sin respiradores, todos respiran el humo de la vela." });
      factors.push(config.backup ? { good: true, text: "La Soyuz libre se preparó, pero solo caben 3: los otros 3 dependían de la nave bloqueada por el fuego." } : { good: false, text: "Sin preparar la Soyuz libre, nadie tenía salida si el fuego seguía." });
    } else {
      factors.push(config.isolation ? { good: true, text: "Se limitó el intercambio de aire entre servicio y hábitat al activar el aislamiento." } : { good: false, text: "Con las compuertas abiertas, la ventilación llevó el CO al hábitat." });
      factors.push(config.suppression ? { good: true, text: "El agua extrajo calor dentro del límite de la reserva." } : { good: false, text: "El enfriamiento activo del gabinete estaba deshabilitado." });
      factors.push(config.backup ? { good: true, text: "El refugio con aire propio mantuvo a salvo a quien llegó." } : { good: false, text: "Sin refugio sellado, no había aire limpio al que ir." });
      if (events.some((e) => e.kind === "starved")) factors.push({ good: true, text: "El bajo flujo redujo la llama secundaria; la batería conservó su fuente interna de calor." });
    }
  }
  const worst = people.find((p) => p.state === "lethal") ?? people.find((p) => p.state === "incapacitated");
  const summary = worst
    ? `${worst.role}: ${stateText[worst.state].toLowerCase()}${worst.when ? ` a ${worst.when}` : ""}, por ${worst.cause}.${config.scenario === "apollo1" && lethal === 3 ? " En 1967 murieron los tres." : ""}`
    : config.scenario === "apollo13"
      ? "Vuelven a casa tras 87 h en el bote salvavidas, como en 1970."
      : config.scenario === "mir"
        ? "Como en 1997, todos sobreviven. El mayor riesgo fue quedarse sin salida."
        : "La simulación termina sin incapacitación. Consulta la dosis por tripulante y el estado de las barreras.";
  return { level, title, summary, safe, incapacitated, lethal, crew: info.crew, people, factors: factors.slice(0, 5), peaks };
}

/** One-change variants so a reader can see what each decision is worth. */
export function whatIfs(config: SimConfig): WhatIf[] {
  const base = runSimulation(config).outcome;
  const info = scenarioInfo[config.scenario];
  const variants: { label: string; change: Partial<SimConfig> }[] = (["isolation", "suppression", "backup"] as Protection[]).map((key) => ({
    label: `${config[key] ? "Sin" : "Con"} ${info.protections[key].label.charAt(0).toLowerCase()}${info.protections[key].label.slice(1)}`,
    change: { [key]: !config[key] },
  }));
  if (config.scenario === "apollo1" && config.oxygen > 70) variants.push({ label: "Atmósfera de 60 % O₂ y 40 % N₂", change: { oxygen: 60, pressure: 101.3 } });
  if (config.scenario === "aegis") variants.push({ label: "Cambiar separación del paquete", change: { aegisRack: config.aegisRack === "shared" ? "separated" : "shared" } });
  if (config.scenario === "aegis" && config.airflow > 0.02) variants.push({ label: "Apagar la ventilación", change: { airflow: 0 } });
  return variants.map(({ label, change }) => {
    const outcome = runSimulation({ ...config, ...change }).outcome;
    return { label, change, safe: outcome.safe, lethal: outcome.lethal, delta: base.lethal - outcome.lethal };
  });
}

export function historicalConfig(scenario: ScenarioId): SimConfig {
  return {
    scenario,
    ...scenarioInfo[scenario].defaults,
    ...scenarioInfo[scenario].historical,
    ...(scenario === "aegis" ? { aegisRack: "separated" } : {}),
  };
}
