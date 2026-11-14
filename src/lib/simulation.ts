/**
 * Educational, deterministic compartment model. Time steps are one second.
 * Oxygen is a volume fraction (%), pressure is kPa, air speed m/s, gravity g.
 * Smoke is a normalized visualization index, not optical density or toxicity.
 * Temperature integrates a prescribed heat source and first-order heat loss.
 * Smoke integrates source emission, ventilation exchange and removal.
 * These scenario parameters are design assumptions, not fitted NASA data.
 * Crew arrival represents route availability in this model, not survivability.
 */
export type ScenarioId = "mir" | "apollo1" | "apollo13" | "aegis";

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

export interface SimFrame {
  time: number;
  fireIntensity: number;
  temperature: number;
  smoke: number;
  oxygen: number;
  energy: number;
  refuge: number;
  phase: string;
  modules: { id: string; name: string; smoke: number; temperature: number }[];
}

export const scenarioInfo: Record<
  ScenarioId,
  {
    title: string;
    description: string;
    crew: number;
    interpretation: string;
    sourceLabel: string;
    defaults: Pick<SimConfig, "oxygen" | "pressure" | "airflow" | "gravity">;
  }
> = {
  mir: {
    title: "Estación Mir",
    description:
      "Incendio del generador de oxígeno, humo en módulos conectados y una ruta de evacuación comprometida.",
    crew: 6,
    interpretation:
      "Ventana ilustrativa de 180 s. El incendio real tuvo una fuente de oxígeno propia. La evacuación aquí es un ensayo alternativo, no la cronología histórica.",
    sourceLabel: "NASA · Fire Aboard Space Station Mir",
    defaults: { oxygen: 21, pressure: 101.3, airflow: 0.12, gravity: 0 },
  },
  apollo1: {
    title: "Apollo 1",
    description:
      "Prueba terrestre en una cabina presurizada con oxígeno puro. El aumento de presión y la escotilla dificultaron el escape.",
    crew: 3,
    interpretation:
      "Escenario terrestre de aprendizaje. Las temperaturas y los tiempos de esta curva son supuestos ilustrativos. Las protecciones ensayan una modificación hipotética.",
    sourceLabel: "NASA · Apollo 1 Accident Lessons Learned",
    defaults: { oxygen: 100, pressure: 115.1, airflow: 0.04, gravity: 1 },
  },
  apollo13: {
    title: "Apollo 13",
    description:
      "Fallo de un tanque del módulo de servicio y pérdida de suministros. El módulo lunar actúa como refugio independiente.",
    crew: 3,
    interpretation:
      "180 s de una secuencia conceptual de sistemas. La llama está en el módulo de servicio. Los índices de recursos aceleran la pérdida para visualizarla, no representan la duración real de la misión.",
    sourceLabel: "NASA · Apollo 13 Accident Lessons Learned",
    defaults: { oxygen: 100, pressure: 34.5, airflow: 0.1, gravity: 0 },
  },
  aegis: {
    title: "AEGIS · Nave conceptual",
    description:
      "Compartimentos aislables, energía de respaldo y refugio independiente sometidos al mismo tipo de emergencia.",
    crew: 6,
    interpretation:
      "Diseño conceptual. Sus tiempos de detección, aislamiento y traslado son supuestos ajustables de ingeniería. Llegar al refugio no demuestra supervivencia ni certifica el diseño.",
    sourceLabel: "Concepto propio · supuestos declarados",
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

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const finite = (value: number, fallback: number) =>
  Number.isFinite(value) ? value : fallback;
const rounded = (value: number) => Math.round(value * 10) / 10;

export function simulate(config: SimConfig): SimFrame[] {
  const info = scenarioInfo[config.scenario];
  const oxygenInitial = clamp(finite(config.oxygen, 21), 10, 100);
  const pressure = clamp(finite(config.pressure, 101.3), 20, 150);
  const airflow = clamp(finite(config.airflow, 0.12), 0, 1);
  const gravity = clamp(finite(config.gravity, 0), 0, 1);
  const isTankFailure = config.scenario === "apollo13";
  const isGroundTest = config.scenario === "apollo1";
  const isConcept = config.scenario === "aegis";
  const moduleNames = isGroundTest
    ? ["Cabina", "Escotilla", "Exterior"]
    : isTankFailure
      ? ["Servicio", "Mando", "Módulo lunar"]
      : isConcept
        ? ["Servicio", "Hábitat", "Refugio"]
        : ["Kvant-1", "Módulo central", "Soyuz"];

  // The prescribed source responds to atmosphere and flow. It is not an
  // ignition-limit correlation. MIR's oxygen-generating source has a floor.
  const oxygenFactor = clamp(
    (oxygenInitial / 21) * (pressure / 101.3),
    0.25,
    5.5,
  );
  const sourceFactor =
    config.scenario === "mir" ? Math.max(0.9, oxygenFactor) : oxygenFactor;
  const detectionTime = isConcept ? 16 : isGroundTest ? 19 : 24;
  const isolationTime = detectionTime + 8;
  const suppressTime = detectionTime + (isConcept ? 9 : 25);
  const temperature = [22, 22, 22];
  const smoke = [0, 0, 0];
  const frames: SimFrame[] = [];
  let oxygen = oxygenInitial;
  let energy = 100;
  let refuge = 0;

  for (let time = 0; time <= 180; time++) {
    const active = time >= 12;
    const isolated = config.isolation && time >= isolationTime;
    const suppressed = config.suppression && time >= suppressTime;
    const growth = active ? Math.min((time - 12) / 24, 1) : 0;
    const suppressionFactor = suppressed
      ? Math.exp(-(time - suppressTime) / 13)
      : 1;
    const source =
      growth *
      sourceFactor *
      (0.55 + Math.sqrt(airflow) + 0.25 * gravity) *
      suppressionFactor;
    const previousSmoke = [...smoke];
    const previousTemperature = [...temperature];
    const exchange = isTankFailure
      ? 0
      : isolated
        ? 0.0004
        : 0.008 + airflow * 0.065;

    for (let module = 0; module < 3; module++) {
      // Pairwise exchange uses the previous state to avoid update-order bias.
      let smokeTransfer = 0;
      let heatTransfer = 0;
      for (const adjacent of [module - 1, module + 1]) {
        if (adjacent < 0 || adjacent >= 3) continue;
        smokeTransfer +=
          (previousSmoke[adjacent] - previousSmoke[module]) * exchange;
        heatTransfer +=
          (previousTemperature[adjacent] - previousTemperature[module]) *
          exchange;
      }
      const protectedRefuge =
        module === 2 && (config.backup || (isConcept && isolated));
      const emission = module === 0 ? source * (isTankFailure ? 1 : 1.9) : 0;
      const removal = protectedRefuge ? 0.1 : suppressed ? 0.035 : 0.002;
      smoke[module] = clamp(
        previousSmoke[module] +
          emission +
          smokeTransfer -
          previousSmoke[module] * removal,
        0,
        100,
      );
      temperature[module] = clamp(
        previousTemperature[module] +
          (module === 0 ? source * 3.1 : 0) +
          heatTransfer -
          (previousTemperature[module] - 22) * (suppressed ? 0.035 : 0.012),
        22,
        800,
      );
    }
    if (active) {
      oxygen = clamp(
        oxygen - (isTankFailure ? 0.004 : source * 0.008),
        0,
        oxygenInitial,
      );
      // Energy is an illustrative capacity index. Apollo 13 loss is accelerated.
      const loss = isTankFailure ? 0.9 : 0.035 + source * 0.13;
      energy = clamp(energy - loss, config.backup ? 62 : 0, 100);
    }

    // Reachability and traversal assumptions, not a physiological exposure model.
    const escapeAvailable = isGroundTest
      ? config.isolation && config.backup
      : isTankFailure
        ? config.backup
        : config.backup || isolated || (suppressed && smoke[1] < 40);
    const evacuationStart = detectionTime + (isConcept ? 12 : 28);
    const routeClear = smoke[1] < 55 && temperature[1] < 85;
    if (
      escapeAvailable &&
      routeClear &&
      time >= evacuationStart &&
      (time - evacuationStart) % 8 === 0
    ) {
      refuge = Math.min(info.crew, refuge + 1);
    }
    const phase = !active
      ? "Sistemas nominales"
      : time < detectionTime
        ? "Inicio del incidente"
        : refuge === info.crew
          ? "Tripulación en refugio"
          : suppressed && source < 0.04
            ? "Fuente controlada · recuperación"
            : suppressed
              ? "Supresión activa"
              : isolated
                ? "Compartimento aislado"
                : "Alarma · respuesta de la tripulación";
    frames.push({
      time,
      fireIntensity: Math.min(source, 1.5),
      temperature: rounded(temperature[0]),
      smoke: rounded(smoke[1]),
      oxygen: rounded(oxygen),
      energy: rounded(energy),
      refuge,
      phase,
      modules: moduleNames.map((name, index) => ({
        id: `module-${index}`,
        name,
        smoke: rounded(smoke[index]),
        temperature: rounded(temperature[index]),
      })),
    });
  }
  return frames;
}
