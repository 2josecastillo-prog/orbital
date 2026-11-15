import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Flame as FlameIcon,
  Maximize2,
  Minimize2,
  Users,
  Scan,
  Check,
  CircleHelp,
  Layers3,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  SkipForward,
  Undo2,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DURATION,
  IGNITION_TIME,
  heatLevel,
  heatText,
  oxygenBoost,
  runSimulation,
  scenarioInfo,
  starvationLimit,
  effectiveFlow,
  whatIfs,
  type Level,
  type Protection,
  type ScenarioId,
  type SimConfig,
} from "../lib/simulation";

const Spacecraft = lazy(() => import("./Spacecraft"));
type CameraFocus = "general" | "fire" | "crew";
const cx = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(" ");
const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
const decimal = (value: number, digits = 1) =>
  value.toLocaleString("es", { maximumFractionDigits: digits, minimumFractionDigits: digits });

class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="scene-error">
        <Orbit size={36} />
        <p>La vista 3D necesita WebGL en tu navegador.</p>
        <span>La narración, los controles y las gráficas siguen funcionando.</span>
      </div>
    ) : (
      this.props.children
    );
  }
}

function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function historicalConfig(scenario: ScenarioId): SimConfig {
  return {
    scenario,
    ...scenarioInfo[scenario].defaults,
    isolation: scenario === "aegis",
    suppression: scenario === "mir" || scenario === "aegis",
    backup: scenario !== "apollo1",
  };
}

const levelWord: Record<Level, string> = { ok: "Bajo control", watch: "Atención", danger: "Peligro" };
const moduleColors = ["#e4a477", "#8cc5df", "#c6ed9c"];

export default function Lab({
  config,
  onConfig,
  onOpenMethod,
}: {
  config: SimConfig;
  onConfig: (config: SimConfig) => void;
  onOpenMethod: () => void;
}) {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [cutaway, setCutaway] = useState(true);
  const [cameraReset, setCameraReset] = useState(0);
  const [jumpEnd, setJumpEnd] = useState(false);
  const [focus, setFocus] = useState<CameraFocus>("general");
  const [fullscreen, setFullscreen] = useState(false);
  const viewport = useRef<HTMLElement>(null);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === viewport.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void viewport.current?.requestFullscreen?.();
  };
  const chooseFocus = (next: CameraFocus) => {
    setFocus(next);
    if (next !== "general") setCutaway(true);
  };
  const [guide, setGuide] = useState(() => {
    try {
      return localStorage.getItem("orbital-guide") !== "hidden";
    } catch {
      return true;
    }
  });
  const run = useMemo(() => runSimulation(config), [config]);
  const alternatives = useMemo(() => whatIfs(config), [config]);
  const frame = run.frames[Math.min(time, DURATION)];
  const info = scenarioInfo[config.scenario];
  const pastEvents = run.events.filter((event) => event.time <= time);
  const finished = time >= DURATION;
  const ruptured = run.events.some((event) => event.kind === "rupture" && event.time <= time);
  const boost = oxygenBoost(config.oxygen, config.pressure);
  const starving =
    config.scenario !== "mir" &&
    config.scenario !== "apollo13" &&
    effectiveFlow(config.airflow, config.gravity) < starvationLimit(config.oxygen, config.pressure);

  useEffect(() => {
    setTime(jumpEnd ? DURATION : 0);
    setRunning(false);
    setJumpEnd(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(
      () =>
        setTime((t) => {
          if (t >= DURATION) {
            setRunning(false);
            return DURATION;
          }
          return t + 1;
        }),
      1000 / speed,
    );
    return () => clearInterval(interval);
  }, [running, speed]);

  const update = (change: Partial<SimConfig>) => onConfig({ ...config, ...change });
  const hideGuide = () => {
    setGuide(false);
    try {
      localStorage.setItem("orbital-guide", "hidden");
    } catch {
      /* storage unavailable */
    }
  };
  const chart = run.frames
    .filter((f) => f.time <= time)
    .map((f) => ({ time: f.time, a: f.modules[0].smoke, b: f.modules[1].smoke, c: f.modules[2].smoke }));

  const routeModule = frame.modules[1];
  const statusCards: { label: string; word: string; value: string; level: Level; help: string }[] = [
    {
      label: `Calor en ${frame.modules[0].name}`,
      word: heatText(frame.temperature),
      value: `${Math.round(frame.temperature)} °C`,
      level: heatLevel(frame.temperature),
      help: "Por encima de unos 60 °C el aire caliente quema las vías respiratorias.",
    },
    {
      label: `Humo en ${routeModule.name}`,
      word: routeModule.visibility,
      value: `${Math.round(routeModule.smoke)} / 100`,
      level: routeModule.level,
      help: `Es el paso hacia ${frame.modules[2].name}. Con humo denso nadie encuentra la salida.`,
    },
    config.scenario === "apollo1"
      ? {
          label: "Presión en la cabina",
          word: ruptured ? "Casco roto" : frame.pressure > 140 ? "Subiendo" : "Normal",
          value: `${Math.round(frame.pressure)} kPa`,
          level: ruptured || frame.pressure > 160 ? "danger" : frame.pressure > 125 ? "watch" : "ok",
          help: "El gas caliente empuja las paredes. La escotilla de 1967 no podía abrirse con presión dentro.",
        }
      : {
          label: "Energía de la nave",
          word: frame.energy > 70 ? "Suficiente" : frame.energy > 35 ? "Bajando" : "Crítica",
          value: `${Math.round(frame.energy)} %`,
          level: frame.energy > 70 ? "ok" : frame.energy > 35 ? "watch" : "danger",
          help: "Sin energía se apagan la ventilación, las luces y las comunicaciones.",
        },
    {
      label: "Personas a salvo",
      word: frame.refuge === info.crew ? "Todos" : frame.refuge ? "En camino" : "Ninguna aún",
      value: `${frame.refuge} de ${info.crew}`,
      level: frame.refuge === info.crew ? "ok" : frame.refuge ? "watch" : time < IGNITION_TIME ? "ok" : "danger",
      help: `Cuentan quienes llegan a ${frame.modules[2].name}.`,
    },
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>¿Qué pasa si hay fuego a bordo?</h1>
          <p>
            Elige un caso real, reprodúcelo y cambia una decisión. Verás si la tripulación llega a un lugar seguro y por qué.
          </p>
        </div>
        <button className="button secondary" onClick={onOpenMethod}>
          <CircleHelp size={16} /> Cómo funciona el modelo
        </button>
      </div>

      <div className="case-picker" role="tablist" aria-label="Casos">
        {(Object.keys(scenarioInfo) as ScenarioId[]).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={config.scenario === id}
            className={cx("case-card", config.scenario === id && "selected", id === "aegis" && "concept")}
            onClick={() => {
              setFocus("general");
              onConfig(historicalConfig(id));
            }}
          >
            <span className="case-year">{scenarioInfo[id].year}</span>
            <strong>{scenarioInfo[id].title}</strong>
            <span>{scenarioInfo[id].hook}</span>
          </button>
        ))}
      </div>

      {guide && (
        <ol className="guide-strip">
          <li>
            <b>1</b> Elige un caso arriba.
          </li>
          <li>
            <b>2</b> Pulsa <Play size={13} /> y observa lo que cuenta la narración.
          </li>
          <li>
            <b>3</b> Cambia una protección y repite. Abajo verás qué cambia.
          </li>
          <button className="icon-button" aria-label="Ocultar guía" onClick={hideGuide}>
            <X size={15} />
          </button>
        </ol>
      )}

      <div className="simulation-layout">
        <section className="viewport-panel" ref={viewport}>
          <div className="viewport-toolbar">
            <div>
              <i className={running ? "live-dot" : "paused-dot"} />
              <strong>{info.title}</strong>
              <span>{config.gravity === 0 ? "Microgravedad" : config.gravity === 1 ? "Gravedad terrestre" : `${decimal(config.gravity, 2)} g`}</span>
            </div>
            <div className="viewport-actions">
              <div className="camera-modes" role="group" aria-label="Cámara">
                {(
                  [
                    ["general", "General", Scan],
                    ["fire", "Fuego", FlameIcon],
                    ["crew", "Tripulación", Users],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button key={id} aria-pressed={focus === id} onClick={() => chooseFocus(id)}>
                    <Icon size={13} /> {label}
                  </button>
                ))}
              </div>
              <button
                className="icon-button"
                aria-label="Restablecer vista 3D"
                title="Restablecer vista 3D"
                onClick={() => {
                  setFocus("general");
                  setCameraReset((value) => value + 1);
                }}
              >
                <RotateCcw size={15} />
              </button>
              <button className="icon-button" aria-label={fullscreen ? "Salir de pantalla completa" : "Pantalla completa"} title="Pantalla completa" onClick={toggleFullscreen}>
                {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button
                className={cx("small-button", cutaway && "selected")}
                aria-pressed={cutaway}
                onClick={() => setCutaway((value) => !value)}
              >
                <Layers3 size={14} /> Ver por dentro
              </button>
            </div>
          </div>
          <div className="scene">
            <SceneBoundary key={config.scenario}>
              <Suspense
                fallback={
                  <div className="scene-error">
                    <Orbit className="spin" />
                    <p>Preparando la nave…</p>
                  </div>
                }
              >
                <Spacecraft key={cameraReset} scenario={config.scenario} frame={frame} cutaway={cutaway} config={config} focus={focus} />
              </Suspense>
            </SceneBoundary>
            <div className="scene-label">
              <span>{frame.phase}</span>
              <strong>T + {clock(time)}</strong>
            </div>
            <div className={cx("narrative", frame.level)} aria-live="polite">
              <span className="narrative-state">{time < IGNITION_TIME ? "Antes del incidente" : levelWord[frame.level]}</span>
              <p>{frame.narrative}</p>
            </div>
          </div>
          <div className="playback">
            <button
              className="play-button"
              aria-label={running ? "Pausar" : "Reproducir"}
              onClick={() => {
                if (time >= DURATION) setTime(0);
                setRunning((v) => !v);
              }}
            >
              {running ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <div className="timeline">
              <input
                aria-label="Tiempo del ensayo"
                type="range"
                min={0}
                max={DURATION}
                value={time}
                onChange={(e) => {
                  setRunning(false);
                  setTime(Number(e.target.value));
                }}
              />
              <div className="timeline-events">
                {run.events.map((event) => (
                  <button
                    key={event.kind}
                    className={cx("event-dot", event.kind, event.time <= time && "past")}
                    style={{ left: `${(event.time / DURATION) * 100}%` }}
                    title={`${clock(event.time)} · ${event.title}`}
                    aria-label={`Ir a ${event.title}, segundo ${event.time}`}
                    onClick={() => {
                      setRunning(false);
                      setTime(event.time);
                    }}
                  />
                ))}
              </div>
            </div>
            <span className="time-readout">
              {clock(time)} / {clock(DURATION)}
            </span>
            <select aria-label="Velocidad de reproducción" value={speed} onChange={(event) => setSpeed(Number(event.target.value))}>
              <option value={1}>1×</option>
              <option value={4}>4×</option>
              <option value={8}>8×</option>
            </select>
            <button
              className="icon-button"
              title="Ver el final"
              aria-label="Saltar al final"
              onClick={() => {
                setRunning(false);
                setTime(DURATION);
              }}
            >
              <SkipForward size={16} />
            </button>
          </div>
        </section>

        <aside className="control-panel">
          <h3>Tus decisiones</h3>
          <p className="panel-hint">Activa o quita protecciones. El ensayo vuelve a empezar con cada cambio.</p>
          {(["isolation", "suppression", "backup"] as Protection[]).map((key) => (
            <label className="decision" key={key}>
              <input type="checkbox" checked={config[key]} onChange={(e) => update({ [key]: e.target.checked })} />
              <span className="toggle-track" />
              <span>
                <strong>{info.protections[key].label}</strong>
                <small>{info.protections[key].help}</small>
              </span>
            </label>
          ))}
          <div className="control-divider" />
          <h4>Aire de la cabina</h4>
          <Range
            label="Oxígeno"
            value={config.oxygen}
            unit="%"
            min={15}
            max={100}
            step={1}
            hint="El aire que respiras tiene un 21 %."
            onChange={(oxygen) => update({ oxygen })}
          />
          <Range
            label="Presión"
            value={config.pressure}
            unit="kPa"
            min={30}
            max={120}
            step={0.1}
            hint="A nivel del mar: 101 kPa."
            onChange={(pressure) => update({ pressure })}
          />
          <p className={cx("oxygen-boost", boost >= 1.6 ? "danger" : boost >= 1.15 ? "watch" : "ok")}>
            El fuego recibe <strong>{decimal(boost)} ×</strong> el oxígeno del aire normal.
            {boost >= 1.6 && " Arderá mucho más rápido."}
          </p>
          <Range
            label="Ventilación"
            value={config.airflow}
            unit="m/s"
            min={0}
            max={0.5}
            step={0.01}
            hint="0 significa ventiladores apagados."
            onChange={(airflow) => update({ airflow })}
          />
          {starving && config.gravity === 0 && (
            <p className="inline-note">
              Sin gravedad el aire caliente no sube. Con tan poca ventilación, la llama se quedará sin oxígeno.
            </p>
          )}
          <label className="select-label">
            Gravedad
            <select value={config.gravity} onChange={(e) => update({ gravity: Number(e.target.value) })}>
              <option value={0}>En órbita · casi 0 g</option>
              <option value={0.16}>Luna · 0,16 g</option>
              <option value={0.38}>Marte · 0,38 g</option>
              <option value={1}>Tierra · 1 g</option>
            </select>
          </label>
          {config.gravity > 0 && config.gravity < 1 && (
            <p className="inline-note">La Luna y Marte son una extrapolación: aún hay pocos ensayos de fuego con gravedad parcial.</p>
          )}
          <button className="button secondary full" onClick={() => onConfig(historicalConfig(config.scenario))}>
            <Undo2 size={15} /> Volver a la configuración original
          </button>
        </aside>
      </div>

      <div className="telemetry-grid">
        {statusCards.map((card) => (
          <div className={cx("status-card", card.level)} key={card.label}>
            <span>{card.label}</span>
            <strong>{card.word}</strong>
            <em>{card.value}</em>
            <small>{card.help}</small>
          </div>
        ))}
      </div>

      <div className="lab-lower">
        <section className="panel">
          <div className="section-title">
            <div>
              <h3>Cómo se mueve el humo</h3>
              <p className="muted small">Cada línea es un módulo. La franja naranja es donde ya no se ve la salida.</p>
            </div>
            <div className="chart-actions">
              <button
                className="text-button"
                onClick={() =>
                  download(
                    `telemetria-${config.scenario}.csv`,
                    "tiempo_s,temperatura_C,presion_kPa,humo_ruta,oxigeno_pct,energia_pct,personas_a_salvo\n" +
                      run.frames
                        .map((f) => [f.time, f.temperature, f.pressure, f.smoke, f.oxygen, f.energy, f.refuge].join(","))
                        .join("\n"),
                    "text/csv",
                  )
                }
              >
                <ArrowDownToLine size={14} /> CSV
              </button>
              <button
                className="text-button"
                onClick={() =>
                  download(
                    `escenario-${config.scenario}.json`,
                    JSON.stringify({ config, model: "Modelo educativo por compartimentos, sin validación predictiva", events: run.events, outcome: run.outcome, frames: run.frames }, null, 2),
                  )
                }
              >
                <ArrowDownToLine size={14} /> JSON
              </button>
            </div>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                <ReferenceArea y1={40} y2={100} fill="#e4a477" fillOpacity={0.07} />
                <ReferenceLine y={40} stroke="#e4a477" strokeDasharray="4 4" strokeOpacity={0.5} />
                <ReferenceLine x={IGNITION_TIME} stroke="#81909c" strokeDasharray="2 4" />
                <CartesianGrid stroke="#25313c" strokeDasharray="3 4" vertical={false} />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={[0, DURATION]}
                  ticks={[0, 30, 60, 90, 120, 150, 180]}
                  tickFormatter={clock}
                  tick={{ fill: "#81909c", fontSize: 11 }}
                  tickLine={false}
                />
                <YAxis domain={[0, 100]} ticks={[0, 40, 100]} tick={{ fill: "#81909c", fontSize: 11 }} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "#15212b", border: "1px solid #35434f", borderRadius: 8 }}
                  labelFormatter={(v) => `T + ${clock(Number(v))}`}
                  formatter={(value) => [`${Math.round(Number(value))} / 100`]}
                />
                {(["a", "b", "c"] as const).map((key, index) => (
                  <Line
                    key={key}
                    name={frame.modules[index].name}
                    dataKey={key}
                    stroke={moduleColors[index]}
                    strokeWidth={index === 1 ? 2.5 : 1.6}
                    dot={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            {frame.modules.map((module, index) => (
              <span key={module.id}>
                <i style={{ background: moduleColors[index] }} />
                {module.name}
                {index === 1 && " (paso)"}
                {index === 2 && " (refugio)"}
              </span>
            ))}
          </div>
        </section>
        <section className="panel">
          <h3>Qué ha pasado</h3>
          {pastEvents.length === 0 ? (
            <p className="muted">Pulsa reproducir. Los sucesos aparecerán aquí en orden.</p>
          ) : (
            <ol className="event-log">
              {pastEvents.map((event) => (
                <li key={event.kind} className={event.kind}>
                  <button
                    onClick={() => {
                      setRunning(false);
                      setTime(event.time);
                    }}
                  >
                    <time>{clock(event.time)}</time>
                    <span>
                      <strong>{event.title}</strong>
                      {event.detail}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className={cx("outcome", run.outcome.level, !finished && "pending")}>
        {finished ? (
          <>
            <div className="outcome-head">
              <span className="outcome-badge">{run.outcome.safe} / {run.outcome.crew}</span>
              <div>
                <h2>{run.outcome.title}</h2>
                <p>{run.outcome.summary}</p>
              </div>
            </div>
            <div className="outcome-grid">
              <div>
                <h4>Por qué terminó así</h4>
                <ul className="factors">
                  {run.outcome.factors.map((factor) => (
                    <li key={factor.text} className={factor.good ? "good" : "bad"}>
                      {factor.good ? <Check size={15} /> : <X size={15} />}
                      {factor.text}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>¿Y si cambias una sola cosa?</h4>
                <ul className="what-ifs">
                  {alternatives.map((option) => (
                    <li key={option.label}>
                      <span>{option.label}</span>
                      <b className={option.delta > 0 ? "up" : option.delta < 0 ? "down" : ""}>
                        {option.delta > 0 ? `+${option.delta}` : option.delta < 0 ? option.delta : "="} {Math.abs(option.delta) === 1 ? "persona" : "personas"}
                      </b>
                      <button
                        className="text-button"
                        onClick={() => {
                          setJumpEnd(true);
                          update(option.change);
                        }}
                      >
                        Probar
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : (
          <p>
            El resultado aparece al terminar los 3 minutos.{" "}
            <button
              className="text-button inline"
              onClick={() => {
                setRunning(false);
                setTime(DURATION);
              }}
            >
              Ver el final ahora
            </button>
          </p>
        )}
      </section>

      <div className="model-note">
        <CircleHelp size={16} />
        <p>
          <strong>Es un modelo para aprender, no una predicción.</strong> {info.interpretation}
        </p>
      </div>
    </>
  );
}

function Range({
  label,
  value,
  unit,
  min,
  max,
  step,
  hint,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  hint: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span>
        {label}
        <strong>
          {value.toLocaleString("es", { maximumFractionDigits: 2 })} <small>{unit}</small>
        </strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <small className="range-hint">{hint}</small>
    </label>
  );
}
