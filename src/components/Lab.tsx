import { ScenarioReference, ReferenceLink, methodSources } from "./ReferenceLink";
import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
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
import {
  DURATION,
  clockText,
  historicalConfig,
  runSimulation,
  scenarioInfo,
  stateText,
  whatIfs,
  type Protection,
  type ScenarioId,
  type SimConfig,
  type SimFrame,
} from "../lib/simulation";

export { historicalConfig };

const Spacecraft = lazy(() => import("./Spacecraft"));
type CameraFocus = "general" | "fire" | "crew";
const cx = (...values: (string | false | undefined | null)[]) => values.filter(Boolean).join(" ");
const es = (value: number, digits = 0) => value.toLocaleString("es", { maximumFractionDigits: digits, minimumFractionDigits: digits });

class SceneBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? this.props.fallback : this.props.children;
  }
}

function SceneDiagram({ frame, retry }: { frame: SimFrame; retry: () => void }) {
  return (
    <div className="scene-fallback scene-diagram">
      <h2>Vista esquemática</h2>
      <p>No se pudo iniciar la vista 3D. El esquema se actualiza al reproducir el ensayo.</p>
      <ul aria-label="Módulos y estado en el instante actual">
        {frame.modules.map((module, index) => (
          <li key={module.id} className={module.level}>
            <strong>{module.name}</strong>
            <span>{es(module.temperature, 1)} °C · {es(module.co)} ppm de CO</span>
            <span>{frame.crewStatus.filter((person) => person.module === index).length} tripulantes</span>
          </li>
        ))}
      </ul>
      <button className="button secondary" onClick={retry}>Reintentar vista 3D</button>
    </div>
  );
}

const personColors = ["var(--flight-forest)", "var(--chart-mint)", "var(--chart-teal)", "#8e682e", "#756086", "#97566b"];

export default function Lab({
  config,
  onConfig,
  onOpenMethod,
  onOpenAegis,
}: {
  config: SimConfig;
  onConfig: (config: SimConfig) => void;
  onOpenMethod: () => void;
  onOpenAegis: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [seek, setSeek] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [cutaway, setCutaway] = useState(true);
  const [focus, setFocus] = useState<CameraFocus>("general");
  const [cameraReset, setCameraReset] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [jumpEnd, setJumpEnd] = useState(false);
  const isA13 = config.scenario === "apollo13";
  const viewport = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLElement>(null);
  const cursor = useRef(0);

  const run = useMemo(() => runSimulation(config), [config]);
  const alternatives = useMemo(() => whatIfs(config), [config]);
  const info = scenarioInfo[config.scenario];
  const frame = run.frames[Math.min(index, DURATION)];

  useEffect(() => {
    cursor.current = jumpEnd ? DURATION : 0;
    setIndex(cursor.current);
    setSeek((value) => value + 1);
    setRunning(false);
    setJumpEnd(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
  useEffect(() => {
    if (!running) return;
    let previous: number | undefined;
    let request: number;
    const tick = (now: number) => {
      // Ignore time spent in a background tab rather than skipping mission events.
      const elapsed = previous === undefined ? 0 : Math.min(now - previous, 100);
      previous = now;
      const previousSample = Math.floor(cursor.current);
      cursor.current = Math.min(DURATION, cursor.current + elapsed * speed / 500);
      const sample = Math.floor(cursor.current);
      if (sample !== previousSample) setIndex(sample);
      if (isA13 && clock.current) {
        const from = run.frames[sample].sinceIncident;
        const to = run.frames[Math.min(sample + 1, DURATION)].sinceIncident;
        const label = clockText(from + (to - from) * (cursor.current - sample), "h");
        if (clock.current.textContent !== label) clock.current.textContent = label;
      }
      if (sample < DURATION) request = requestAnimationFrame(tick);
      else setRunning(false);
    };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
  }, [running, speed, run, isA13]);
  useEffect(() => {
    if (isA13 && !running && clock.current) {
      const next = run.frames[Math.min(index + 1, DURATION)];
      clock.current.textContent = clockText(frame.sinceIncident + (next.sinceIncident - frame.sinceIncident) * (cursor.current - index), "h");
    }
  }, [isA13, running, index, frame, run, seek]);
  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === viewport.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const update = (change: Partial<SimConfig>) => onConfig({ ...config, ...change });
  const go = (i: number) => {
    setRunning(false);
    cursor.current = Math.max(0, Math.min(DURATION, i));
    setIndex(cursor.current);
    setSeek((value) => value + 1);
  };
  const chooseFocus = (next: CameraFocus) => {
    setFocus(next);
    if (next !== "general") setCutaway(true);
  };
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

      <section aria-label="Vista de la nave">
        <div className="stage" ref={viewport}>
          <div className="stage-bar">
            <div className="stage-title">
              <span className={cx("dot", frame.level)} />
              <strong>{info.title}</strong>
              <span>{frame.phase}</span>
            </div>
            <div className="stage-tools">
              <div className="segmented" role="group" aria-label="Cámara">
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
            <SceneBoundary key={`${config.scenario}:${cameraReset}`} fallback={
              <SceneBoundary fallback={<SceneDiagram frame={frame} retry={() => setCameraReset((value) => value + 1)} />}>
                <Suspense fallback={<div className="scene-fallback"><p>Activando el modo 3D ligero…</p></div>}>
                  <Spacecraft scenario={config.scenario} frame={frame} cutaway={cutaway} config={config} focus={focus} seek={seek} lightweight />
                </Suspense>
              </SceneBoundary>
            }>
              <Suspense
                fallback={
                  <div className="scene-fallback">
                    <Orbit className="spin" />
                    <p>Cargando la nave…</p>
                  </div>
                }
              >
                <Spacecraft key={cameraReset} scenario={config.scenario} frame={frame} cutaway={cutaway} config={config} focus={focus} seek={seek} />
              </Suspense>
            </SceneBoundary>
            <div className="hud-clock">
              {isA13 ? <strong ref={clock} /> : <strong>{frame.clock}</strong>}
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
                if (index >= DURATION) {
                  cursor.current = 0;
                  setIndex(0);
                  setSeek((value) => value + 1);
                }
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

      </section>

      <div className="module-references">
        <ScenarioReference scenario={config.scenario} />
        {config.scenario === "aegis" && <button className="text-button" onClick={onOpenAegis}>Información sobre AEGIS</button>}
        <ReferenceLink url={methodSources.zones} label="NIST · Referencia para el modelo por zonas" />
        <ReferenceLink url={methodSources.exposure} label="ISO · Referencia sobre exposición" />
      </div>
      <section className="lab-summary-grid">
        <div className="panel decisions">
          <div className="panel-head">
            <h2>Tus decisiones</h2>
            <button className="text-button" onClick={() => onConfig(historicalConfig(config.scenario))}>
              <Undo2 size={14} /> {config.scenario === "aegis" ? "Restaurar diseño" : "Como en la historia"}
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
        </div>

        <div className="panel events">
          <div className="panel-head">
            <h2>Qué ha pasado</h2>
          </div>
          {run.events.length === 0 ? (
            <p className="hint">Esta configuración no registra eventos.</p>
          ) : (
            <>
            <p className="hint">Selecciona un evento para ir a ese momento del ensayo.</p>
            <ol className="event-list">
              {run.events.map((e) => (
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
            </>
          )}
        </div>
      </section>

      <section className={cx("verdict", run.outcome.level)} aria-label="Desenlace simulado" aria-live="polite">
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
      </section>

      <p className="footnote">
        <CircleHelp size={15} /> {info.interpretation}
      </p>
    </div>
  );
}
