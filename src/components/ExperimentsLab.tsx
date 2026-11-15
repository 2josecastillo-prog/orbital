import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Eye, EyeOff, Maximize2, Pause, Play, RotateCcw } from "lucide-react";

type Hotspot = { titulo: string; texto: string; posicion: [number, number, number] };
type Experiment = {
  id: string;
  titulo: string;
  experimento: string;
  lugar: string;
  escala: string;
  resumen: string;
  datos: [string, string][];
  hotspots: Hotspot[];
  fases: [number, string][];
  fuentes: [string, string][];
  archivo: string;
  bytes: number;
  poster?: string;
};

declare module "react" {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & Record<string, unknown>;
    }
  }
}

// model-viewer is a web component: only the members this page uses are typed.
type ModelViewerElement = HTMLElement & {
  currentTime: number;
  duration: number;
  paused: boolean;
  timeScale: number;
  loaded: boolean;
  cameraTarget: string;
  cameraOrbit: string;
  fieldOfView: string;
  play: (options?: { repetitions?: number }) => void;
  pause: () => void;
};

const VIEWER_SRC = "/vendor/model-viewer.min.js";
const DEFAULT_ORBIT = "35deg 68deg auto";
const seconds = (value: number) => `${value.toFixed(1).replace(".", ",")} s`;

let viewerReady: Promise<void> | null = null;
function loadViewer() {
  if (!viewerReady) {
    viewerReady = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = VIEWER_SRC;
      script.onload = () => customElements.whenDefined("model-viewer").then(() => resolve());
      script.onerror = () => {
        viewerReady = null;
        reject(new Error("viewer"));
      };
      document.head.append(script);
    });
  }
  return viewerReady;
}

export default function ExperimentsLab({ onOpenLab }: { onOpenLab: () => void }) {
  const [models, setModels] = useState<Experiment[]>([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [id, setId] = useState("flex");
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [labels, setLabels] = useState(true);
  const [openHotspot, setOpenHotspot] = useState<number | null>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const viewer = useRef<ModelViewerElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useMemo(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetch("/models/experimentos/manifest.json").then((r) => (r.ok ? r.json() : Promise.reject(r.status))),
      loadViewer(),
    ])
      .then(([manifest]) => {
        if (!alive) return;
        setModels(manifest.modelos);
        setReady(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  const current = models.find((m) => m.id === id) ?? models[0];

  // Each model has its own timeline: reset the player state when it changes.
  useEffect(() => {
    setOpenHotspot(null);
    setTime(0);
    setDuration(0);
  }, [id]);

  useEffect(() => {
    const el = viewer.current;
    if (!el || !ready) return;
    const onLoad = () => {
      setDuration(el.duration || 0);
      el.cameraTarget = "auto";
      el.timeScale = speed;
      if (reduceMotion) {
        el.pause();
        setPlaying(false);
      } else {
        el.currentTime = 0;
        el.play({ repetitions: Infinity });
        setPlaying(true);
      }
    };
    el.addEventListener("load", onLoad);
    return () => el.removeEventListener("load", onLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, id, reduceMotion]);

  useEffect(() => {
    if (!ready) return;
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const el = viewer.current;
      if (el?.loaded && now - last > 80) {
        last = now;
        setTime(el.currentTime);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  function togglePlay() {
    const el = viewer.current;
    if (!el) return;
    if (el.paused) {
      el.play({ repetitions: Infinity });
      setPlaying(true);
    } else {
      el.pause();
      setPlaying(false);
    }
  }
  function seek(value: number) {
    const el = viewer.current;
    if (!el) return;
    el.pause();
    setPlaying(false);
    el.currentTime = value;
    setTime(value);
  }
  function changeSpeed(value: number) {
    setSpeed(value);
    if (viewer.current) viewer.current.timeScale = value;
  }
  function reframe() {
    const el = viewer.current;
    if (!el) return;
    el.cameraTarget = "auto";
    el.cameraOrbit = DEFAULT_ORBIT;
    el.fieldOfView = "auto";
  }
  function pick(next: string) {
    setId(next);
  }
  function focusHotspot(index: number, hotspot: Hotspot) {
    const open = openHotspot !== index;
    setOpenHotspot(open ? index : null);
    if (open && viewer.current) viewer.current.cameraTarget = hotspot.posicion.map((v) => `${v}m`).join(" ");
  }

  const activePhase = current ? current.fases.reduce((n, [start], i) => (time >= start ? i : n), 0) : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Simulador de experimentos</h1>
          <p>
            Cinco experimentos reales de combustión en la Estación Espacial, reconstruidos en 3D a partir de las
            dimensiones que publica la NASA. Gira el modelo, activa la animación y toca los puntos para ver cada pieza.
          </p>
        </div>
        <button className="button secondary" type="button" onClick={onOpenLab}>
          Ir al simulador de accidentes
        </button>
      </div>

      {failed && (
        <div className="empty-state">
          <p>No se pudo cargar el visor 3D. Revisa tu conexión y recarga la página.</p>
        </div>
      )}

      {!failed && !ready && <div className="empty-state"><p>Cargando modelos…</p></div>}

      {ready && current && (
        <>
          <div className="exp-tabs" role="tablist" aria-label="Experimentos">
            {models.map((m, i) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={m.id === id}
                tabIndex={m.id === id ? 0 : -1}
                className="exp-tab"
                onClick={() => pick(m.id)}
                onKeyDown={(event) => {
                  const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                  if (!step) return;
                  const next = models[(i + step + models.length) % models.length];
                  pick(next.id);
                  (event.currentTarget.parentElement?.children[(i + step + models.length) % models.length] as HTMLElement)?.focus();
                }}
              >
                {m.poster && <img src={m.poster} alt="" loading="lazy" />}
                <span>{m.titulo}</span>
              </button>
            ))}
          </div>

          <div className="exp-layout">
            <section className="exp-stage" ref={stage} aria-label="Visor 3D">
              <div className="exp-canvas">
                <model-viewer
                  ref={viewer}
                  key={current.id}
                  src={current.archivo}
                  poster={current.poster}
                  alt={`${current.titulo}. ${current.escala}`}
                  camera-controls=""
                  touch-action="pan-y"
                  shadow-intensity="0.6"
                  exposure="1.05"
                  environment-image="neutral"
                  interaction-prompt="auto"
                  animation-name="Ensayo"
                  camera-orbit={DEFAULT_ORBIT}
                  min-camera-orbit="auto auto 0%"
                  max-camera-orbit="auto auto 400%"
                >
                  {labels &&
                    current.hotspots.map((h, i) => (
                      <button
                        key={h.titulo}
                        type="button"
                        slot={`hotspot-${i}`}
                        className={`exp-hotspot${openHotspot === i ? " open" : ""}`}
                        data-position={h.posicion.map((v) => `${v}m`).join(" ")}
                        data-normal="0m 1m 0m"
                        aria-label={`${h.titulo}: ${h.texto}`}
                        onClick={() => focusHotspot(i, h)}
                      >
                        {i + 1}
                        <span className="exp-hotspot-label">
                          <strong>{h.titulo}</strong>
                          {h.texto}
                        </span>
                      </button>
                    ))}
                </model-viewer>
                <p className="exp-scale">{current.escala}</p>
                <div className="exp-tools">
                  <button type="button" className="exp-btn" aria-pressed={labels} onClick={() => setLabels(!labels)}>
                    {labels ? <Eye size={14} /> : <EyeOff size={14} />} Etiquetas
                  </button>
                  <button type="button" className="exp-btn" onClick={reframe}>
                    <RotateCcw size={14} /> Reencuadrar
                  </button>
                  <button
                    type="button"
                    className="exp-btn icon"
                    aria-label="Pantalla completa"
                    onClick={() => stage.current?.requestFullscreen?.().catch(() => undefined)}
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>

              <div className="exp-timeline">
                <button type="button" className="exp-play" onClick={togglePlay} aria-label={playing ? "Pausar" : "Reproducir"}>
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <select value={speed} onChange={(event) => changeSpeed(Number(event.target.value))} aria-label="Velocidad">
                  <option value={0.5}>0,5×</option>
                  <option value={1}>1×</option>
                  <option value={2}>2×</option>
                </select>
                <input
                  type="range"
                  min={0}
                  max={duration || 1}
                  step={0.01}
                  value={Math.min(time, duration || 1)}
                  onChange={(event) => seek(Number(event.target.value))}
                  aria-label="Tiempo del ensayo"
                />
                <span className="exp-time">
                  {seconds(time)} / {seconds(duration)}
                </span>
                <div className="exp-phases" aria-label="Fases del ensayo">
                  {current.fases.map(([start, label], i) => (
                    <button
                      key={label}
                      type="button"
                      className={i === activePhase ? "active" : ""}
                      onClick={() => {
                        seek(start);
                        viewer.current?.play({ repetitions: Infinity });
                        setPlaying(true);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <aside className="exp-info" aria-live="polite">
              <h2>{current.titulo}</h2>
              <p className="exp-where">
                {current.experimento} · {current.lugar}
              </p>
              <p>{current.resumen}</p>
              <h3>Datos de referencia</h3>
              <dl>
                {current.datos.map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <h3>Fuentes</h3>
              <ul>
                {current.fuentes.map(([title, url]) => (
                  <li key={url}>
                    <a href={url} target="_blank" rel="noreferrer">
                      {title}
                    </a>
                  </li>
                ))}
              </ul>
              <a className="button secondary" href={current.archivo} download>
                <Download size={15} /> Descargar GLB ({Math.round(current.bytes / 1024)} KB)
              </a>
            </aside>
          </div>

          <p className="exp-note">
            Modelos interpretativos generados en Blender (<code>scripts/build_experiment_models.py</code>) con dimensiones
            publicadas por NASA. La animación es ilustrativa: el tiempo está comprimido y no reproduce velocidades medidas.
          </p>
        </>
      )}
    </>
  );
}
