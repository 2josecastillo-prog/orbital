import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  Check,
  CircleHelp,
  Flame as FlameIcon,
  Layers3,
  Maximize2,
  Minimize2,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Scan,
  SkipBack,
  SkipForward,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  DURATION,
  FED_IMPAIRED,
  FED_INCAPACITATED,
  FED_LETHAL,
  historicalConfig,
  oxygenBoost,
  runSimulation,
  scenarioInfo,
  stateText,
  whatIfs,
  type Level,
  type Protection,
  type ScenarioId,
  type SimConfig,
} from "../lib/simulation";

export { historicalConfig };

const Spacecraft = lazy(() => import("./Spacecraft"));
type CameraFocus = "general" | "fire" | "crew";
const cx = (...values: (string | false | undefined | null)[]) => values.filter(Boolean).join(" ");
const es = (value: number, digits = 0) => value.toLocaleString("es", { maximumFractionDigits: digits, minimumFractionDigits: digits });

class SceneBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="scene-fallback">
        <Orbit size={32} />
        <p>La vista 3D necesita WebGL. Los datos y las gráficas siguen funcionando.</p>
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

type Metric = "temperature" | "co" | "visibility" | "dose" | "co2" | "power";
const metricInfo: Record<Metric, { label: string; unit: string; limit?: number; limitLabel?: string }> = {
  temperature: { label: "Temperatura", unit: "°C", limit: 60, limitLabel: "60 °C: el aire quema al respirar" },
  co: { label: "Monóxido de carbono", unit: "ppm", limit: 1400, limitLabel: "1400 ppm: peligro grave en 30 min" },
  visibility: { label: "Visibilidad", unit: "m", limit: 3, limitLabel: "3 m: ya no se ve la salida" },
  dose: { label: "Dosis por persona", unit: "", limit: 1, limitLabel: "1: pérdida de conocimiento" },
  co2: { label: "CO₂ en la cabina", unit: "mmHg", limit: 15, limitLabel: "15 mmHg: síntomas graves" },
  power: { label: "Baterías de reentrada", unit: "%", limit: 50, limitLabel: "50 %: mínimo para volver" },
};
const moduleColors = ["#e8501c", "#2457d6", "#1e8e5a"];
const personColors = ["#e8501c", "#2457d6", "#1e8e5a", "#b07d00", "#7a4fd6", "#c2185b"];

function levelOf(value: number, metric: "temperature" | "co" | "visibility"): Level {
  if (metric === "temperature") return value >= 60 ? "danger" : value >= 35 ? "watch" : "ok";
  if (metric === "co") return value >= 1400 ? "danger" : value >= 200 ? "watch" : "ok";
  return value < 1.5 ? "danger" : value < 8 ? "watch" : "ok";
}

export default function Lab({
  config,
  onConfig,
  onOpenMethod,
}: {
  config: SimConfig;
  onConfig: (config: SimConfig) => void;
  onOpenMethod: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [cutaway, setCutaway] = useState(true);
  const [focus, setFocus] = useState<CameraFocus>("general");
  const [cameraReset, setCameraReset] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [jumpEnd, setJumpEnd] = useState(false);
  const isA13 = config.scenario === "apollo13";
  const [metric, setMetric] = useState<Metric>("temperature");
  const viewport = useRef<HTMLDivElement>(null);

  const run = useMemo(() => runSimulation(config), [config]);
  const alternatives = useMemo(() => whatIfs(config), [config]);
  const info = scenarioInfo[config.scenario];
  const frame = run.frames[Math.min(index, DURATION)];
  const finished = index >= DURATION;
  const past = run.events.filter((e) => e.index <= index);

  useEffect(() => {
    setIndex(jumpEnd ? DURATION : 0);
    setRunning(false);
    setJumpEnd(false);
    setMetric((current) => (config.scenario === "apollo13" ? (["co2", "power", "dose"].includes(current) ? current : "co2") : ["co2", "power"].includes(current) ? "temperature" : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      setIndex((i) => {
        if (i >= DURATION) {
          setRunning(false);
          return DURATION;
        }
        return i + 1;
      });
    }, 1000 / (speed * 2));
    return () => clearInterval(timer);
  }, [running, speed]);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === viewport.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const update = (change: Partial<SimConfig>) => onConfig({ ...config, ...change });
  const go = (i: number) => {
    setRunning(false);
    setIndex(Math.max(0, Math.min(DURATION, i)));
  };
  const chooseFocus = (next: CameraFocus) => {
    setFocus(next);
    if (next !== "general") setCutaway(true);
  };
  const boost = oxygenBoost(config.oxygen, config.pressure);

  const chart = run.frames.slice(0, index + 1).map((f) => {
    const row: Record<string, number> = { t: isA13 ? f.sinceIncident / 3600 : f.sinceIncident };
    if (metric === "dose") f.crewStatus.forEach((c, i) => (row[`p${i}`] = c.fed));
    else if (metric === "co2") row.m2 = f.life?.co2mmHg ?? 0;
    else if (metric === "power") row.m1 = f.life?.cmBattery ?? 100;
    else f.modules.forEach((m, i) => (row[`m${i}`] = metric === "temperature" ? m.temperature : metric === "co" ? m.co : m.visibility));
    return row;
  });
  const metrics: Metric[] = isA13 ? ["co2", "power", "dose"] : ["temperature", "co", "visibility", "dose"];
  const lines =
    metric === "dose"
      ? frame.crewStatus.map((c, i) => ({ key: `p${i}`, name: c.role, color: personColors[i] }))
      : metric === "co2"
        ? [{ key: "m2", name: "Cabina ocupada", color: moduleColors[1] }]
        : metric === "power"
          ? [{ key: "m1", name: "Módulo de mando", color: moduleColors[1] }]
          : frame.modules.map((m, i) => ({ key: `m${i}`, name: m.name, color: moduleColors[i] }));
  const first = run.frames[0].sinceIncident;
  const last = run.frames[DURATION].sinceIncident;
  const domain: [number, number] = isA13 ? [first / 3600, last / 3600] : [first, last];

  return (
    <div className="lab">
      <header className="page-head">
        <div>
          <h1>Simulador</h1>
          <p>Reconstruye cada accidente con física: cómo crece el fuego, qué respira la tripulación y cuánto aguanta el cuerpo humano.</p>
        </div>
        <button className="button quiet" onClick={onOpenMethod}>
          <CircleHelp size={16} /> Cómo funciona
        </button>
      </header>

      <div className="case-tabs" role="tablist" aria-label="Casos">
        {(Object.keys(scenarioInfo) as ScenarioId[]).map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={config.scenario === id}
            className={cx("case-tab", config.scenario === id && "active")}
            onClick={() => {
              setFocus("general");
              onConfig(historicalConfig(id));
            }}
          >
            <span className="case-year">{scenarioInfo[id].year}</span>
            <strong>{scenarioInfo[id].title}</strong>
            <span className="case-hook">{scenarioInfo[id].hook}</span>
          </button>
        ))}
      </div>

      <section className="stage-grid">
        <div className="stage" ref={viewport}>
          <div className="stage-bar">
            <div className="stage-title">
              <span className={cx("dot", frame.level)} />
              <strong>{info.title}</strong>
              <span>{frame.phase}</span>
            </div>
            <div className="stage-tools">
              <div className="segmented dark" role="group" aria-label="Cámara">
                {(
                  [
                    ["general", "General", Scan],
                    ["fire", isA13 ? "Daño" : "Fuego", FlameIcon],
                    ["crew", "Tripulación", Users],
                  ] as const
                ).map(([id, label, Icon]) => (
                  <button key={id} aria-pressed={focus === id} onClick={() => chooseFocus(id)}>
                    <Icon size={14} /> <span>{label}</span>
                  </button>
                ))}
              </div>
              <button className={cx("tool", cutaway && "on")} aria-pressed={cutaway} onClick={() => setCutaway((v) => !v)} title="Ver por dentro" aria-label="Ver por dentro">
                <Layers3 size={15} />
              </button>
              <button
                className="tool"
                title="Restablecer cámara"
                aria-label="Restablecer cámara"
                onClick={() => {
                  setFocus("general");
                  setCameraReset((v) => v + 1);
                }}
              >
                <RotateCcw size={15} />
              </button>
              <button
                className="tool"
                title="Pantalla completa"
                aria-label="Pantalla completa"
                onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void viewport.current?.requestFullscreen?.())}
              >
                {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
            </div>
          </div>
          <div className="scene">
            <SceneBoundary key={config.scenario}>
              <Suspense
                fallback={
                  <div className="scene-fallback">
                    <Orbit className="spin" />
                    <p>Cargando la nave…</p>
                  </div>
                }
              >
                <Spacecraft key={cameraReset} scenario={config.scenario} frame={frame} cutaway={cutaway} config={config} focus={focus} />
              </Suspense>
            </SceneBoundary>
            <div className="hud-clock">
              <strong>{frame.clock}</strong>
              {!isA13 && frame.sinceIncident >= 0 && <span>Potencia del fuego {es(frame.hrr)} kW</span>}
              {isA13 && frame.life && <span>CO₂ {es(frame.life.co2mmHg, 1)} mmHg</span>}
            </div>
            <div className={cx("hud-story", frame.level)} aria-live="polite">
              <p>{frame.narrative}</p>
            </div>
          </div>
          <div className="transport">
            <button className="tool" aria-label="Al inicio" onClick={() => go(0)}>
              <SkipBack size={15} />
            </button>
            <button
              className="play"
              aria-label={running ? "Pausar" : "Reproducir"}
              onClick={() => {
                if (index >= DURATION) setIndex(0);
                setRunning((v) => !v);
              }}
            >
              {running ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <div className="track">
              <input aria-label="Momento del ensayo" type="range" min={0} max={DURATION} value={index} onChange={(e) => go(Number(e.target.value))} />
              <div className="ticks">
                {run.events.map((e) => (
                  <button
                    key={e.kind}
                    className={cx("tick", e.tone, e.index <= index && "past")}
                    style={{ left: `${(Math.min(e.index, DURATION) / DURATION) * 100}%` }}
                    title={`${run.frames[Math.min(e.index, DURATION)].clock} · ${e.title}`}
                    aria-label={`Ir a: ${e.title}`}
                    onClick={() => go(e.index)}
                  />
                ))}
              </div>
            </div>
            <select aria-label="Velocidad" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
              <option value={1}>Lento</option>
              <option value={2}>Normal</option>
              <option value={5}>Rápido</option>
            </select>
            <button className="tool" aria-label="Ver el final" onClick={() => go(DURATION)}>
              <SkipForward size={15} />
            </button>
          </div>
        </div>

        <aside className="crew-panel" aria-label="Tripulación">
          <div className="panel-head">
            <h2>Tripulación</h2>
            <span className="hint">Dosis acumulada</span>
          </div>
          <ol className="crew-list">
            {frame.crewStatus.map((c, i) => (
              <li key={c.role} className={cx("person", c.state)}>
                <div className="person-top">
                  <span className="swatch" style={{ background: personColors[i] }} />
                  <strong>{c.role}</strong>
                  <span className={cx("state", c.state)}>{stateText[c.state]}</span>
                </div>
                <div className="dose" role="meter" aria-valuemin={0} aria-valuemax={3} aria-valuenow={c.fed} aria-label={`Dosis ${es(c.fed, 2)}`}>
                  <i style={{ width: `${Math.min(100, (c.fed / FED_LETHAL) * 100)}%` }} />
                  <b style={{ left: `${(FED_IMPAIRED / FED_LETHAL) * 100}%` }} />
                  <b style={{ left: `${(FED_INCAPACITATED / FED_LETHAL) * 100}%` }} />
                </div>
                <div className="person-meta">
                  <span>{frame.modules[Math.min(2, c.module)]?.name}</span>
                  <span className="mono">{isA13 ? `CO₂ ${es(c.toxic, 2)}` : `calor ${es(c.heat, 2)} · gases ${es(c.toxic, 2)}`}</span>
                </div>
              </li>
            ))}
          </ol>
          <div className="dose-scale" aria-hidden>
            <span style={{ left: 0 }}>0</span>
            <span style={{ left: `${(FED_IMPAIRED / FED_LETHAL) * 100}%` }}>0,3</span>
            <span style={{ left: `${(FED_INCAPACITATED / FED_LETHAL) * 100}%` }}>1</span>
            <span style={{ right: 0 }}>3</span>
          </div>
          <p className="hint">0,3 afectado · 1 pierde el conocimiento · 3 dosis letal. Suma el calor, el monóxido de carbono y la falta de oxígeno que ha recibido cada persona.</p>
        </aside>
      </section>

      <section className="panel environment" aria-label="Ambiente">
        <div className="panel-head">
          <h2>{isA13 ? "Soporte vital" : "Ambiente en cada módulo"}</h2>
          <span className="hint">{isA13 ? "Alarma de CO₂ a 7,5 mmHg · peligro a 15 mmHg" : "Límites: 60 °C · 1400 ppm de CO · 3 m de visibilidad"}</span>
        </div>
        {isA13 && frame.life ? (
          <div className="life-grid">
            {(
              [
                ["CO₂ en la cabina", `${es(frame.life.co2mmHg, 1)} mmHg`, frame.life.co2mmHg >= 15 ? "danger" : frame.life.co2mmHg >= 7.5 ? "watch" : "ok", "Alarma a 7,5 · peligro a 15"],
                ["Filtros del módulo lunar", `${es(frame.life.liohLeft)} %`, frame.life.liohLeft < 20 ? "danger" : frame.life.liohLeft < 50 ? "watch" : "ok", "Pensados para 2 personas"],
                ["Baterías de reentrada", `${es(frame.life.cmBattery)} %`, frame.life.cmBattery < 50 ? "danger" : "ok", "Imprescindibles para volver"],
                ["Baterías del módulo lunar", `${es(frame.life.lmBattery)} %`, frame.life.lmBattery < 20 ? "danger" : "ok", "2181 Ah al empezar"],
                ["Temperatura de la cabina", `${es(frame.life.cabinTemp)} °C`, frame.life.cabinTemp < 8 ? "watch" : "ok", "Bajó a pocos grados"],
              ] as const
            ).map(([label, value, level, note]) => (
              <div key={label} className={cx("life-cell", level)}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{note}</small>
              </div>
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="env-table">
              <thead>
                <tr>
                  <th>Módulo</th>
                  <th>Temperatura</th>
                  <th>CO</th>
                  <th>O₂</th>
                  <th>Presión</th>
                  <th>Visibilidad</th>
                </tr>
              </thead>
              <tbody>
                {frame.modules.map((m, i) => (
                  <tr key={m.id}>
                    <th>
                      <span className="swatch" style={{ background: moduleColors[i] }} />
                      {m.name}
                      {i === 0 && <em>origen</em>}
                      {i === 2 && <em>refugio</em>}
                    </th>
                    <td className={levelOf(m.temperature, "temperature")}>{es(m.temperature)} °C</td>
                    <td className={levelOf(m.co, "co")}>{es(m.co)} ppm</td>
                    <td>{es(m.o2, 1)} %</td>
                    <td>{es(m.pressure)} kPa</td>
                    <td className={levelOf(m.visibility, "visibility")}>{m.visibility >= 30 ? "> 30 m" : m.visibility < 1 ? "< 1 m" : `${es(m.visibility)} m`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="lab-grid">
        <div className="panel decisions">
          <div className="panel-head">
            <h2>Tus decisiones</h2>
            <button className="text-button" onClick={() => onConfig(historicalConfig(config.scenario))}>
              <Undo2 size={14} /> Como en la historia
            </button>
          </div>
          {(["isolation", "suppression", "backup"] as Protection[]).map((key) => (
            <label className="switch-row" key={key}>
              <input type="checkbox" checked={config[key]} onChange={(e) => update({ [key]: e.target.checked })} />
              <span className="switch" />
              <span>
                <strong>{info.protections[key].label}</strong>
                <small>{info.protections[key].help}</small>
              </span>
            </label>
          ))}
          {!isA13 && (
            <>
              <h3>Atmósfera y entorno</h3>
              <Slider label="Oxígeno" value={config.oxygen} unit="%" min={15} max={100} step={1} hint="Aire normal: 21 %" onChange={(oxygen) => update({ oxygen })} />
              <Slider label="Presión" value={config.pressure} unit="kPa" min={30} max={120} step={0.1} hint="Nivel del mar: 101 kPa" onChange={(pressure) => update({ pressure })} />
              <p className={cx("callout", boost >= 1.6 ? "danger" : boost >= 1.15 ? "watch" : "ok")}>
                Oxígeno disponible para el fuego: <strong>{es(boost, 1)} ×</strong> el del aire normal.
              </p>
              <Slider label="Ventilación" value={config.airflow} unit="m/s" min={0} max={0.5} step={0.01} hint="0 = ventiladores apagados" onChange={(airflow) => update({ airflow })} />
              <label className="field">
                Gravedad
                <select value={config.gravity} onChange={(e) => update({ gravity: Number(e.target.value) })}>
                  <option value={0}>En órbita (casi 0 g)</option>
                  <option value={0.16}>Luna (0,16 g)</option>
                  <option value={0.38}>Marte (0,38 g)</option>
                  <option value={1}>Tierra (1 g)</option>
                </select>
              </label>
              {config.scenario === "mir" && (
                <Slider
                  label="Duración de la vela"
                  value={(config.candleSeconds ?? 90) / 60}
                  unit="min"
                  min={0.5}
                  max={14}
                  step={0.5}
                  hint="1,5 min según el informe · hasta 14 min según la tripulación"
                  onChange={(minutes) => update({ candleSeconds: minutes * 60 })}
                />
              )}
            </>
          )}
        </div>

        <div className="panel chart-panel">
          <div className="panel-head">
            <div className="segmented" role="group" aria-label="Variable">
              {metrics.map((m) => (
                <button key={m} aria-pressed={metric === m} onClick={() => setMetric(m)}>
                  {metricInfo[m].label}
                </button>
              ))}
            </div>
            <button
              className="text-button"
              onClick={() =>
                download(
                  `orbital-${config.scenario}.csv`,
                  ["t_s,modulo,temp_C,CO_ppm,O2_pct,CO2_pct,presion_kPa,visibilidad_m"]
                    .concat(run.frames.flatMap((f) => f.modules.map((m) => [f.sinceIncident, m.name, m.temperature, m.co, m.o2, m.co2, m.pressure, m.visibility].join(","))))
                    .join("\n"),
                  "text/csv",
                )
              }
            >
              <ArrowDownToLine size={14} /> Datos (CSV)
            </button>
          </div>
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chart} margin={{ top: 10, right: 12, bottom: 4, left: -6 }}>
                <CartesianGrid stroke="#e3e8ee" vertical={false} />
                {metricInfo[metric].limit !== undefined && <ReferenceLine y={metricInfo[metric].limit} stroke="#e8501c" strokeDasharray="5 4" />}
                {metric === "dose" && <ReferenceArea y1={FED_INCAPACITATED} y2={3.2} fill="#e8501c" fillOpacity={0.06} />}
                <ReferenceLine x={0} stroke="#93a1b0" strokeDasharray="2 3" />
                <XAxis
                  dataKey="t"
                  type="number"
                  domain={domain}
                  tickFormatter={(v) => (isA13 ? `${Math.round(v)} h` : `${es(v / 60, Math.abs(domain[1]) < 400 ? 1 : 0)} min`)}
                  tick={{ fill: "#5b6878", fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#cfd6de" }}
                />
                <YAxis
                  tick={{ fill: "#5b6878", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  domain={metric === "visibility" ? [0, 30] : metric === "dose" ? [0, 3.2] : metric === "power" ? [0, 100] : [0, "auto"]}
                />
                <Tooltip
                  contentStyle={{ border: "1px solid #d6dce3", borderRadius: 8, fontSize: 13 }}
                  labelFormatter={(v) => (isA13 ? `T + ${es(Number(v), 1)} h` : `T + ${Math.round(Number(v))} s`)}
                  formatter={(value, name) => [`${es(Number(value), metric === "dose" ? 2 : 0)} ${metricInfo[metric].unit}`, name]}
                />
                {lines.map((l) => (
                  <Line key={l.key} dataKey={l.key} name={l.name} stroke={l.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="legend">
            {lines.map((l) => (
              <span key={l.key}>
                <i style={{ background: l.color }} /> {l.name}
              </span>
            ))}
            {metricInfo[metric].limitLabel && (
              <span className="limit">
                <i /> {metricInfo[metric].limitLabel}
              </span>
            )}
          </div>
        </div>

        <div className="panel events">
          <div className="panel-head">
            <h2>Qué ha pasado</h2>
          </div>
          {past.length === 0 ? (
            <p className="hint">Pulsa reproducir. Los sucesos aparecerán aquí en orden.</p>
          ) : (
            <ol className="event-list">
              {past.map((e) => (
                <li key={e.kind} className={e.tone}>
                  <button onClick={() => go(e.index)}>
                    <time>{run.frames[Math.min(e.index, DURATION)].clock.replace("T ", "")}</time>
                    <span>
                      <strong>{e.title}</strong>
                      {e.detail}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className={cx("verdict", run.outcome.level, !finished && "locked")} aria-live="polite">
        {!finished ? (
          <div className="verdict-locked">
            <p>El desenlace aparece al final del ensayo.</p>
            <button className="button primary" onClick={() => go(DURATION)}>
              Ver el desenlace
            </button>
          </div>
        ) : (
          <>
            <header>
              <div className="verdict-count">
                <strong>{run.outcome.safe}</strong>
                <span>de {run.outcome.crew} sobreviven</span>
              </div>
              <div>
                <h2>{run.outcome.title}</h2>
                <p>{run.outcome.summary}</p>
              </div>
            </header>
            <div className="verdict-grid">
              <div>
                <h3>Cada persona</h3>
                <ul className="people">
                  {run.outcome.people.map((p, i) => (
                    <li key={p.role}>
                      <span className="swatch" style={{ background: personColors[i] }} />
                      <span>{p.role}</span>
                      <span className={cx("state", p.state)}>{stateText[p.state]}</span>
                      <span className="mono">{p.when ?? "—"}</span>
                    </li>
                  ))}
                </ul>
                <h3>Valores máximos frente al límite</h3>
                <ul className="peaks">
                  {run.outcome.peaks.map((p) => (
                    <li key={p.label} className={p.exceeded ? "over" : ""}>
                      <span>{p.label}</span>
                      <strong>{p.value}</strong>
                      <small>límite {p.limit}</small>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Por qué terminó así</h3>
                <ul className="factors">
                  {run.outcome.factors.map((f) => (
                    <li key={f.text} className={f.good ? "good" : "bad"}>
                      {f.good ? <Check size={15} /> : <X size={15} />}
                      {f.text}
                    </li>
                  ))}
                </ul>
                <h3>¿Y si cambias una sola cosa?</h3>
                <ul className="whatif">
                  {alternatives.map((w) => (
                    <li key={w.label}>
                      <span>{w.label}</span>
                      <b className={w.delta > 0 ? "up" : w.delta < 0 ? "down" : ""}>
                        {w.delta > 0 ? `${w.delta} ${w.delta === 1 ? "vida salvada" : "vidas salvadas"}` : w.delta < 0 ? `${-w.delta} ${w.delta === -1 ? "muerte más" : "muertes más"}` : "sin cambio"}
                      </b>
                      <button
                        className="text-button"
                        onClick={() => {
                          setJumpEnd(true);
                          update(w.change);
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
        )}
      </section>

      <p className="footnote">
        <CircleHelp size={15} /> {info.interpretation}
      </p>
    </div>
  );
}

function Slider({
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
    <label className="slider">
      <span className="slider-top">
        {label}
        <strong>
          {value.toLocaleString("es", { maximumFractionDigits: 2 })} {unit}
        </strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <small>{hint}</small>
    </label>
  );
}
