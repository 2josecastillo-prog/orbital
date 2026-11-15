/**
 * Educational, deterministic compartment model. Time steps are one second.
 * Oxygen is a volume fraction (%), pressure is kPa, air speed m/s, gravity g.
 * Smoke is a normalized visibility index (0–100), not optical density or toxicity.
 * Temperature integrates a prescribed heat source and first-order heat loss.
 * Smoke integrates source emission, ventilation exchange and removal.
 *
 * Qualitative behaviour follows published microgravity combustion findings:
 * - Without gravity there is no buoyant flow. A flame relies on forced
 *   ventilation, and very slow air starves it (low-flow extinction, BASS/Saffire).
 * - Higher oxygen partial pressure makes flames grow faster and hotter.
 * - A sealed cabin heats its gas and raises pressure (Apollo 1 ruptured near 200 kPa).
 * These scenario parameters are design assumptions, not fitted NASA data.
 * Reaching the refuge represents route availability in this model, not survivability.
 */
export type ScenarioId = "mir" | "apollo1" | "apollo13" | "aegis";
export type Level = "ok" | "watch" | "danger";
export type Protection = "isolation" | "suppression" | "backup";

export interface SimConfig {
  scenario: ScenarioId;
  oxygen: number;
  pressure: number;
  airflow: number;
  gravity: number;
  isolation: boolean;
  suppression: boolean;
  backup: boolean;
}

export interface ModuleState {
  id: string;
  name: string;
  smoke: number;
  temperature: number;
  level: Level;
  visibility: string;
}

export interface SimFrame {
  time: number;
  fireIntensity: number;
  temperature: number;
  smoke: number;
  oxygen: number;
  pressure: number;
  energy: number;
  refuge: number;
  phase: string;
  level: Level;
  narrative: string;
  /** Position of each crew member along the module chain (0, 1, 2; decimals while moving). */
  crew: number[];
  modules: ModuleState[];
}

export interface SimEvent {
  time: number;
  kind:
    | "ignition"
    | "detection"
    | "isolation"
    | "suppression"
    | "evacuation"
    | "blocked"
    | "first-safe"
    | "all-safe"
    | "controlled"
    | "starved"
    | "rupture"
    | "power"
    | "stir"
    | "masks"
    | "burnout";
  title: string;
  detail: string;
}

export interface SimOutcome {
  level: Level;
  title: string;
  summary: string;
  safe: number;
  crew: number;
  allSafeAt: number | null;
  peakTemperature: number;
  peakRouteSmoke: number;
  factors: { good: boolean; text: string }[];
}

export interface WhatIf {
  label: string;
  change: Partial<SimConfig>;
  safe: number;
  peakRouteSmoke: number;
  delta: number;
}

type ScenarioText = {
  title: string;
  year: string;
  hook: string;
  description: string;
  crew: number;
  interpretation: string;
  sourceLabel: string;
  startModule: number;
  modules: [string, string, string];
  ignition: string;
  protections: Record<Protection, { label: string; help: string }>;
  defaults: Pick<SimConfig, "oxygen" | "pressure" | "airflow" | "gravity">;
};

export const scenarioInfo: Record<ScenarioId, ScenarioText> = {
  mir: {
    title: "Estación Mir",
    year: "1997",
    hook: "Una vela de oxígeno se incendia y bloquea una de las dos naves de escape.",
    description:
      "Un generador químico de oxígeno se incendió en el módulo Kvant-1. La llama, de casi un metro, bloqueó el paso a la Soyuz acoplada detrás. El humo llenó la estación.",
    crew: 6,
    interpretation:
      "La vela arde unos 90 s, la cifra oficial; la tripulación habló de hasta 14 minutos. En 1997 nadie tuvo que evacuar: aquí se ensaya qué habría pasado.",
    sourceLabel: "NASA · Fire Aboard Space Station Mir",
    startModule: 1,
    modules: ["Kvant-1", "Módulo central", "Soyuz"],
    ignition:
      "Al encender una vela de oxígeno en Kvant-1, se incendia. Sale un chorro de llama de casi un metro con chispas de metal fundido.",
    protections: {
      isolation: {
        label: "Cerrar escotillas",
        help: "Aísla Kvant-1 para que el humo no pase al resto de la estación.",
      },
      suppression: {
        label: "Extintores y respiradores",
        help: "Enfrían las paredes y frenan el humo. No apagan la vela: fabrica su propio oxígeno.",
      },
      backup: {
        label: "Segunda Soyuz disponible",
        help: "Una nave de escape con ruta libre, lejos del módulo en llamas.",
      },
    },
    defaults: { oxygen: 21, pressure: 101.3, airflow: 0.12, gravity: 0 },
  },
  apollo1: {
    title: "Apollo 1",
    year: "1967",
    hook: "Oxígeno puro, una chispa y una escotilla que abría hacia dentro.",
    description:
      "Ensayo en la plataforma de lanzamiento. La cabina tenía oxígeno puro a 115 kPa. Un cable hizo chispa bajo el asiento izquierdo y el fuego se extendió en segundos. La presión rompió el casco antes de que la escotilla pudiera abrirse.",
    crew: 3,
    interpretation:
      "Ensayo en tierra con gravedad normal. El casco real se rompió unos 15 s después del primer aviso de fuego. Los tiempos de esta curva son aproximados y las protecciones son las mejoras que se aplicaron después.",
    sourceLabel: "NASA · Apollo 1 Accident Lessons Learned",
    startModule: 0,
    modules: ["Cabina", "Escotilla", "Plataforma"],
    ignition:
      "Un cable hace chispa bajo el asiento izquierdo. Con oxígeno puro, el fuego se extiende por la cabina en segundos.",
    protections: {
      isolation: {
        label: "Escotilla que abre hacia fuera",
        help: "La escotilla rediseñada tras el accidente se abre en unos segundos, incluso con presión dentro.",
      },
      suppression: {
        label: "Materiales que no arden",
        help: "Sustituye el velcro, las redes de nailon y los aislantes inflamables por materiales ignífugos.",
      },
      backup: {
        label: "Equipo de rescate preparado",
        help: "Personal con respiradores y extintores esperando junto a la escotilla.",
      },
    },
    defaults: { oxygen: 100, pressure: 115.1, airflow: 0.04, gravity: 1 },
  },
  apollo13: {
    title: "Apollo 13",
    year: "1970",
    hook: "Explota un tanque de oxígeno camino a la Luna. El módulo lunar se convierte en bote salvavidas.",
    description:
      "El tanque de oxígeno 2 del módulo de servicio se rompió a 300 000 km de la Tierra. La nave perdió oxígeno y electricidad. La tripulación se refugió en el módulo lunar Aquarius.",
    crew: 3,
    interpretation:
      "Tiempo comprimido: en la misión, el paso al módulo lunar llevó más de dos horas y el viaje de vuelta, unas 90. El fuego ocurrió dentro del tanque, donde no había nadie.",
    sourceLabel: "NASA · Apollo 13 Accident Lessons Learned",
    startModule: 1,
    modules: ["Servicio", "Mando", "Módulo lunar"],
    ignition:
      "El tanque de oxígeno 2 revienta. Arranca el panel 4 del módulo de servicio y daña el tanque 1. Dos de las tres pilas de combustible dejan de funcionar.",
    protections: {
      isolation: {
        label: "Aislar el tanque dañado",
        help: "Cierra válvulas para separar el tanque roto del resto del sistema de oxígeno.",
      },
      suppression: {
        label: "Tanque sin cables dañados",
        help: "El rediseño posterior quitó el cableado y los ventiladores del interior de los tanques.",
      },
      backup: {
        label: "Módulo lunar como refugio",
        help: "Aquarius, hecho para 2 personas durante 45 h, mantuvo a 3 durante unas 90 h.",
      },
    },
    defaults: { oxygen: 100, pressure: 34.5, airflow: 0.1, gravity: 0 },
  },
  aegis: {
    title: "AEGIS · nave conceptual",
    year: "Concepto",
    hook: "Una nave diseñada con las lecciones de los tres accidentes.",
    description:
      "Diseño propio para explorar ideas: compuertas automáticas entre módulos, supresión con agua nebulizada y un refugio con aire y energía propios.",
    crew: 6,
    interpretation:
      "Diseño conceptual. Los tiempos de detección, cierre y traslado son supuestos de ingeniería ajustables. Llegar al refugio no demuestra supervivencia ni certifica el diseño.",
    sourceLabel: "Concepto propio · supuestos declarados",
    startModule: 1,
    modules: ["Servicio", "Hábitat", "Refugio"],
    ignition:
      "Un cable se sobrecalienta detrás de un panel del módulo de servicio y empieza a arder.",
    protections: {
      isolation: {
        label: "Compuertas automáticas",
        help: "Sensores de humo cierran las compuertas entre módulos sin esperar a la tripulación.",
      },
      suppression: {
        label: "Agua nebulizada automática",
        help: "Una niebla fina enfría y apaga la llama en el compartimento afectado.",
      },
      backup: {
        label: "Refugio autónomo",
        help: "Un módulo con aire, energía y filtros propios, separado del resto.",
      },
    },
    defaults: { oxygen: 21, pressure: 101.3, airflow: 0.12, gravity: 0 },
  },
};

export const defaultConfig: SimConfig = {
  scenario: "mir",
  ...scenarioInfo.mir.defaults,
  isolation: false,
  suppression: true,
  backup: false,
};

export const IGNITION_TIME = 12;
const CANDLE_SECONDS = 90;
export const DURATION = 180;
const AIR_PP_O2 = 21.3; // kPa of oxygen in sea-level air

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;
const rounded = (value: number) => Math.round(value * 10) / 10;

export function smokeLevel(smoke: number): Level {
  return smoke >= 40 ? "danger" : smoke >= 15 ? "watch" : "ok";
}
export function visibilityText(smoke: number) {
  if (smoke < 4) return "Aire limpio";
  if (smoke < 15) return "Algo de humo";
  if (smoke < 40) return "Cuesta ver";
  if (smoke < 70) return "Humo denso";
  return "No se ve nada";
}
export function heatText(temperature: number) {
  if (temperature < 35) return "Normal";
  if (temperature < 60) return "Caliente";
  if (temperature < 150) return "Peligroso";
  return "Extremo";
}
export function heatLevel(temperature: number): Level {
  return temperature >= 60 ? "danger" : temperature >= 35 ? "watch" : "ok";
}
/** How much more oxygen the fire gets than in sea-level air. */
export function oxygenBoost(oxygen: number, pressure: number) {
  return (oxygen * pressure) / 100 / AIR_PP_O2;
}

/** Air speed a flame "feels": forced ventilation plus buoyant flow (~0.3 m/s at 1 g). */
export function effectiveFlow(airflow: number, gravity: number) {
  return Math.sqrt(airflow * airflow + 0.09 * gravity);
}
/** Below this air speed a flame in microgravity starves of oxygen. */
export function starvationLimit(oxygen: number, pressure: number) {
  return clamp(0.035 / Math.max(oxygenBoost(oxygen, pressure), 0.2), 0.004, 0.12);
}

export function simulate(config: SimConfig): SimFrame[] {
  return runSimulation(config).frames;
}

export function runSimulation(config: SimConfig): {
  frames: SimFrame[];
  events: SimEvent[];
  outcome: SimOutcome;
} {
  const info = scenarioInfo[config.scenario];
  const oxygenInitial = clamp(finite(config.oxygen, 21), 10, 100);
  const pressureInitial = clamp(finite(config.pressure, 101.3), 20, 150);
  const airflow = clamp(finite(config.airflow, 0.12), 0, 1);
  const gravity = clamp(finite(config.gravity, 0), 0, 1);
  const isTankFailure = config.scenario === "apollo13";
  const isGroundTest = config.scenario === "apollo1";
  const isConcept = config.scenario === "aegis";
  const isMir = config.scenario === "mir";

  // Detection and response times. Concept uses automatic sensors.
  const detectionTime =
    IGNITION_TIME + (isConcept ? 4 : isGroundTest ? 2 : isTankFailure ? 1 : 10);
  const isolationTime = detectionTime + (isConcept ? 3 : 8);
  const suppressTime = detectionTime + (isConcept ? 6 : isGroundTest ? 0 : 20);
  const evacuationStart =
    detectionTime + (isConcept ? 10 : isGroundTest ? (config.isolation ? 6 : 75) : 22);
  const transit = isGroundTest ? 4 : 8;

  const flow = effectiveFlow(airflow, gravity);
  // Fire growth ramp: faster with more oxygen.
  const boost0 = oxygenBoost(oxygenInitial, pressureInitial);
  const ramp = clamp(24 / Math.sqrt(Math.max(boost0, 0.25)), isGroundTest ? 5 : 6, 40) * (isGroundTest ? 0.55 : 1);

  const temperature = [22, 22, 22];
  const smoke = [0, 0, 0];
  const frames: SimFrame[] = [];
  const events: SimEvent[] = [];
  const once = new Set<string>();
  const push = (time: number, kind: SimEvent["kind"], title: string, detail: string) => {
    if (once.has(kind)) return;
    once.add(kind);
    events.push({ time, kind, title, detail });
  };

  let oxygen = oxygenInitial;
  let pressure = pressureInitial;
  let ruptured = false;
  let energy = 100;
  let refuge = 0;
  let starvedFor = 0;
  let lastNarrative = `Todo en orden. La tripulación trabaja en ${info.modules[info.startModule]}.`;

  for (let time = 0; time <= DURATION; time++) {
    const active = time >= IGNITION_TIME;
    const isolated = config.isolation && time >= isolationTime;
    const suppressed = config.suppression && time >= suppressTime;
    const growth = active ? Math.min((time - IGNITION_TIME) / ramp, 1) : 0;

    // Fire strength from current oxygen supply.
    const boost = oxygenBoost(oxygen, pressure);
    const oxygenFactor = clamp(boost, 0.25, 5.5);
    // Mir's candle produced its own oxygen: it burned whatever the cabin air.
    const sourceOxygen = isMir ? Math.max(0.9, oxygenFactor) : oxygenFactor;
    let flowFactor = 0.45 + Math.sqrt(Math.min(flow, 0.6));
    const limit = starvationLimit(oxygen, pressure);
    if (active && !isMir && !isTankFailure && flow < limit) {
      flowFactor *= Math.max(0.05, flow / limit);
      starvedFor++;
    }
    // Mir's candle carried its own oxidizer: extinguishers could not stop it.
    // It burned until the charge was used up (~90 s, official figure).
    const suppressionFactor =
      suppressed && !isMir
        ? Math.exp(-(time - suppressTime) / (isConcept ? 8 : isGroundTest ? 6 : 13))
        : 1;
    const burnout = isMir && time - IGNITION_TIME > CANDLE_SECONDS
      ? Math.exp(-(time - IGNITION_TIME - CANDLE_SECONDS) / 4)
      : 1;
    // Fire-resistant materials (Apollo 1 suppression) slow growth from the start.
    const materials = isGroundTest && config.suppression ? 0.35 : 1;
    const starvation = starvedFor > 10 ? Math.exp(-(starvedFor - 10) / 12) : 1;
    const source =
      growth * sourceOxygen * flowFactor * suppressionFactor * materials * starvation * burnout;

    const previousSmoke = [...smoke];
    const previousTemperature = [...temperature];
    const exchange = isTankFailure
      ? 0
      : isolated
        ? 0.0004
        : 0.012 + airflow * 0.11 + (ruptured ? 0.05 : 0);

    for (let module = 0; module < 3; module++) {
      let smokeTransfer = 0;
      let heatTransfer = 0;
      for (const adjacent of [module - 1, module + 1]) {
        if (adjacent < 0 || adjacent >= 3) continue;
        smokeTransfer += (previousSmoke[adjacent] - previousSmoke[module]) * exchange;
        heatTransfer +=
          (previousTemperature[adjacent] - previousTemperature[module]) * exchange;
      }
      const protectedRefuge =
        module === 2 && (config.backup || (isConcept && isolated));
      const emission =
        module === 0
          ? source * (isTankFailure ? 0.4 : isMir ? (suppressed ? 2.4 : 3.4) : 1.9)
          : 0;
      const removal = protectedRefuge ? 0.1 : suppressed ? 0.035 : 0.002;
      smoke[module] = clamp(
        previousSmoke[module] + emission + smokeTransfer - previousSmoke[module] * removal,
        0,
        100,
      );
      temperature[module] = clamp(
        previousTemperature[module] +
          (module === 0 ? source * (isTankFailure ? 0.6 : 3.1) : 0) +
          heatTransfer -
          (previousTemperature[module] - 22) * (suppressed ? 0.035 : 0.012),
        22,
        800,
      );
    }

    if (active) {
      oxygen = clamp(oxygen - (isTankFailure ? 0.004 : source * 0.008), 0, oxygenInitial);
      const loss = isTankFailure
        ? config.isolation
          ? 0.55
          : 0.9
        : 0.035 + source * 0.13;
      energy = clamp(energy - loss * (isTankFailure && config.suppression ? 0.5 : 1), config.backup ? 62 : 0, 100);
    }

    // Sealed cabins: gas heats up and pressure rises (ideal gas, fire module).
    if (isGroundTest) {
      if (!ruptured) {
        pressure = pressureInitial * ((temperature[0] + 273) / 295);
        if (pressure >= 200) {
          ruptured = true;
          push(time, "rupture", "Se rompe el casco", "La presión supera los 200 kPa y abre una grieta. El gas caliente sale a chorro y entra aire de fuera.");
        }
      } else {
        pressure = Math.max(101.3, pressure - 25);
        oxygen = Math.max(21, oxygen - 12); // outside air dilutes the oxygen
      }
    }

    // Reachability and traversal assumptions, not a physiological exposure model.
    const escapeAvailable = isGroundTest
      ? config.isolation || (config.backup && config.suppression)
      : isTankFailure
        ? config.backup
        : config.backup ||
          isolated ||
          ((suppressed || starvedFor > 12) && smoke[1] < 40) ||
          (time > detectionTime && source < 0.04 && smoke[1] < 40);
    const routeClear = isGroundTest
      ? temperature[0] < 400 || config.isolation
      : smoke[1] < 55 && temperature[1] < 85;
    const evacuating = active && escapeAvailable && time >= evacuationStart;
    if (evacuating && routeClear && (time - evacuationStart) % transit === 0) {
      refuge = Math.min(info.crew, refuge + 1);
    }

    // ---- events
    if (isTankFailure && time === 3)
      push(time, "stir", "Agitan los tanques", "Control de misión pide encender los ventiladores de los tanques de oxígeno. Dentro del tanque 2, un cable con el aislante dañado hace chispa.");
    if (isMir && time === detectionTime + 6)
      push(time, "masks", "Respiradores puestos", "La tripulación se pone máscaras de oxígeno. El humo ya llega al bloque base.");
    if (isMir && burnout < 0.2)
      push(time, "burnout", "La vela se consume", "Se agota la carga de la vela y la llama se apaga sola.");
    if (time === IGNITION_TIME) push(time, "ignition", isTankFailure ? "Explota el tanque" : "Empieza el fuego", info.ignition);
    if (time === detectionTime)
      push(time, "detection", "Alarma", isConcept
        ? "Los sensores detectan humo y avisan a toda la nave."
        : isGroundTest
          ? "La tripulación grita «¡fuego!» por la radio."
          : isTankFailure
            ? "«Houston, hemos tenido un problema». Caen la presión de oxígeno y la tensión eléctrica."
            : "La tripulación ve la llama y da la alarma.");
    if (isolated && time === isolationTime && !isGroundTest)
      push(time, "isolation", info.protections.isolation.label, info.protections.isolation.help);
    if (config.suppression && time === suppressTime && !isGroundTest && !isTankFailure)
      push(time, "suppression", info.protections.suppression.label, info.protections.suppression.help);
    if (evacuating && time === evacuationStart)
      push(time, "evacuation", "Empieza la evacuación", `La tripulación se dirige a ${info.modules[2]}.`);
    if (active && !isTankFailure && !isGroundTest && smoke[1] >= 55)
      push(time, "blocked", "Ruta bloqueada", `El humo en ${info.modules[1]} ya no deja pasar.`);
    if (refuge >= 1) push(time, "first-safe", "Primera persona a salvo", `Alguien llega a ${info.modules[2]}.`);
    if (refuge === info.crew) push(time, "all-safe", "Toda la tripulación a salvo", `Las ${info.crew} personas están en ${info.modules[2]}.`);
    if (starvedFor === 12)
      push(time, "starved", "La llama se ahoga", "Sin gravedad no hay corriente de aire caliente que suba. Con la ventilación tan baja, la llama no recibe oxígeno y se apaga sola.");
    if (active && !isTankFailure && !isMir && time > IGNITION_TIME + 5 && source < 0.04 && (suppressed || starvedFor > 12 || ruptured))
      push(time, "controlled", "Fuego apagado", ruptured
        ? "Al entrar aire normal, el oxígeno baja y el fuego se agota."
        : "Ya no hay llama. Queda el humo, que tarda más en limpiarse.");
    if (isTankFailure && energy < 25 && !config.backup)
      push(time, "power", "Energía crítica", "Quedan pocas baterías y no hay otro módulo con recursos propios.");

    // ---- plain-language narrative for this second
    const latest = events.filter((event) => event.time <= time).at(-1);
    if (!active) {
      lastNarrative = `Todo en orden. La tripulación trabaja en ${info.modules[info.startModule]}.`;
    } else if (latest && time - latest.time < 7) {
      lastNarrative = latest.detail;
    } else if (refuge === info.crew) {
      lastNarrative = `Todos a salvo en ${info.modules[2]}. ${source > 0.2 ? "El fuego sigue activo fuera." : "Ahora toca ventilar y revisar daños."}`;
    } else if (evacuating && refuge > 0) {
      lastNarrative = `${refuge} de ${info.crew} personas ya están en ${info.modules[2]}. El resto avanza por ${info.modules[1]}.`;
    } else if (isTankFailure) {
      lastNarrative = config.backup
        ? "La nave pierde oxígeno y energía. La tripulación prepara el módulo lunar."
        : `Sin refugio, la energía baja al ${Math.round(energy)} % y el oxígeno sigue escapando.`;
    } else if (!escapeAvailable && smoke[1] >= 40) {
      lastNarrative = `Humo denso en ${info.modules[1]}. No hay una ruta segura hasta ${info.modules[2]}.`;
    } else if (source > 0.6) {
      lastNarrative = `El fuego crece en ${info.modules[0]}. ${visibilityText(smoke[1])} en ${info.modules[1]}.`;
    } else if (source > 0.04) {
      lastNarrative = `El fuego pierde fuerza. ${visibilityText(smoke[1])} en ${info.modules[1]}.`;
    } else {
      lastNarrative = `Sin llama. ${visibilityText(smoke[1])} en ${info.modules[1]}.`;
    }

    // ---- crew positions
    const crewPositions = Array.from({ length: info.crew }, (_, index) => {
      if (index < refuge) return 2;
      if (isMir && index === info.crew - 1 && time < IGNITION_TIME + 10)
        return time <= IGNITION_TIME ? 0.15 : 0.15 + 0.85 * ((time - IGNITION_TIME) / 10);
      if (evacuating && routeClear && index === refuge) {
        const progress = ((time - evacuationStart) % transit) / transit;
        return info.startModule + (2 - info.startModule) * progress;
      }
      return info.startModule;
    });

    const routeSmoke = smoke[1];
    const level: Level =
      refuge === info.crew
        ? "ok"
        : !active
          ? "ok"
          : smokeLevel(routeSmoke) === "danger" || heatLevel(temperature[0]) === "danger" || energy < 25
            ? "danger"
            : "watch";
    const phase = !active
      ? "Sistemas normales"
      : time < detectionTime
        ? "Inicio del incidente"
        : refuge === info.crew
          ? "Tripulación en refugio"
          : ruptured && source < 0.04
            ? "Casco roto · fuego agotado"
            : suppressed && source < 0.04
              ? "Fuego controlado"
              : suppressed
                ? "Combatiendo el fuego"
                : isolated
                  ? "Módulo aislado"
                  : "Alarma · respuesta";

    frames.push({
      time,
      fireIntensity: rounded(Math.min(source, 1.5) * 100) / 100,
      temperature: rounded(temperature[0]),
      smoke: rounded(routeSmoke),
      oxygen: rounded(oxygen),
      pressure: rounded(pressure),
      energy: rounded(energy),
      refuge,
      phase,
      level,
      narrative: lastNarrative,
      crew: crewPositions.map((value) => Math.round(value * 100) / 100),
      modules: info.modules.map((name, index) => ({
        id: `module-${index}`,
        name,
        smoke: rounded(smoke[index]),
        temperature: rounded(temperature[index]),
        level: smokeLevel(smoke[index]),
        visibility: visibilityText(smoke[index]),
      })),
    });
  }

  events.sort((a, b) => a.time - b.time);
  return { frames, events, outcome: summarize(config, frames, events) };
}

function summarize(config: SimConfig, frames: SimFrame[], events: SimEvent[]): SimOutcome {
  const info = scenarioInfo[config.scenario];
  const last = frames[frames.length - 1];
  const safe = last.refuge;
  const allSafe = events.find((event) => event.kind === "all-safe");
  const peakTemperature = Math.max(...frames.map((frame) => frame.temperature));
  const peakRouteSmoke = Math.max(...frames.map((frame) => frame.smoke));
  const boost = oxygenBoost(config.oxygen, config.pressure);
  const factors: SimOutcome["factors"] = [];

  if (config.scenario === "mir")
    factors.push({ good: false, text: "La vela fabricaba su propio oxígeno: ni los extintores ni cortar el aire la apagaban. Solo se apagó al consumirse." });
  else if (boost >= 1.6)
    factors.push({ good: false, text: `El fuego tenía ${boost.toFixed(1).replace(".", ",")} veces más oxígeno que en el aire normal. Por eso creció tan rápido.` });
  else if (boost <= 0.8)
    factors.push({ good: true, text: "Había menos oxígeno que en el aire normal y el fuego creció despacio." });
  if (events.some((event) => event.kind === "starved"))
    factors.push({ good: true, text: "Con la ventilación casi parada y sin gravedad, la llama se quedó sin oxígeno." });
  if (events.some((event) => event.kind === "rupture"))
    factors.push({ good: false, text: "La presión rompió el casco antes de que nadie pudiera abrir la escotilla." });
  if (config.scenario === "apollo1" && !config.isolation)
    factors.push({ good: false, text: "La escotilla abría hacia dentro: con presión en la cabina era imposible abrirla a tiempo." });
  else if (config.isolation)
    factors.push({ good: true, text: `${info.protections.isolation.label}: ${info.protections.isolation.help.charAt(0).toLowerCase()}${info.protections.isolation.help.slice(1)}` });
  else if (config.scenario !== "apollo13" && config.scenario !== "apollo1")
    factors.push({ good: false, text: `Sin «${info.protections.isolation.label.toLowerCase()}», el humo pasó libremente entre módulos.` });
  if (config.suppression)
    factors.push({
      good: true,
      text:
        config.scenario === "mir"
          ? "Los extintores enfriaron el módulo y frenaron el humo, aunque la vela siguió ardiendo."
          : `${info.protections.suppression.label} redujo el fuego.`,
    });
  else factors.push({ good: false, text: "Nada frenó el fuego: siguió hasta agotar lo que podía quemar." });
  if (config.backup)
    factors.push({ good: true, text: `${info.protections.backup.label}: había a dónde ir.` });
  else if (config.scenario !== "apollo1")
    factors.push({ good: false, text: `Sin «${info.protections.backup.label.toLowerCase()}», el refugio dependía de que la ruta siguiera libre.` });
  if (events.some((event) => event.kind === "blocked"))
    factors.push({ good: false, text: `El humo bloqueó ${info.modules[1]} antes de que todos pasaran.` });

  const minutes = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m ? `${m} min ${s} s` : `${s} s`;
  };
  const level: Level = safe === info.crew ? "ok" : safe > 0 ? "watch" : "danger";
  const title =
    safe === info.crew
      ? `Las ${info.crew} personas llegan a salvo`
      : safe > 0
        ? `${safe} de ${info.crew} personas llegan a salvo`
        : config.scenario === "apollo1"
          ? "La tripulación no logra salir"
          : "Nadie llega a un lugar seguro";
  const summary =
    safe === info.crew && allSafe
      ? `Todos llegan a ${info.modules[2]} ${minutes(allSafe.time - IGNITION_TIME)} después de que empiece el incidente.`
      : safe > 0
        ? `El resto se queda atrapado por el humo o el calor en ${info.modules[info.startModule]}.`
        : config.scenario === "apollo1"
          ? "Como en 1967, la escotilla no se puede abrir a tiempo. Activa la escotilla que abre hacia fuera para ver la diferencia."
          : `No hubo una ruta segura hasta ${info.modules[2]} en los 3 minutos del ensayo.`;
  return {
    level,
    title,
    summary,
    safe,
    crew: info.crew,
    allSafeAt: allSafe?.time ?? null,
    peakTemperature: rounded(peakTemperature),
    peakRouteSmoke: rounded(peakRouteSmoke),
    factors: factors.slice(0, 5),
  };
}

/** Runs single-change variants so a reader can see what each decision is worth. */
export function whatIfs(config: SimConfig): WhatIf[] {
  const base = runSimulation(config).outcome;
  const info = scenarioInfo[config.scenario];
  const variants: { label: string; change: Partial<SimConfig> }[] = (
    ["isolation", "suppression", "backup"] as Protection[]
  ).map((key) => ({
    label: `${config[key] ? "Sin" : "Con"} ${info.protections[key].label.charAt(0).toLowerCase()}${info.protections[key].label.slice(1)}`,
    change: { [key]: !config[key] },
  }));
  if (config.scenario !== "mir" && config.scenario !== "apollo13" && config.gravity === 0 && config.airflow > 0.02)
    variants.push({ label: "Apagar la ventilación", change: { airflow: 0 } });
  if (config.oxygen > 30) variants.push({ label: "Aire normal (21 % O₂)", change: { oxygen: 21, pressure: 101.3 } });
  return variants.map(({ label, change }) => {
    const outcome = runSimulation({ ...config, ...change }).outcome;
    return {
      label,
      change,
      safe: outcome.safe,
      peakRouteSmoke: outcome.peakRouteSmoke,
      delta: outcome.safe - base.safe,
    };
  });
}
