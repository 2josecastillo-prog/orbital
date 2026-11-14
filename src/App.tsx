import {
  Component,
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  CircleHelp,
  Database,
  ExternalLink,
  FlaskConical,
  Layers3,
  LayoutDashboard,
  Menu,
  Orbit,
  Pause,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ExperimentalExplorer from "./components/ExperimentalExplorer";
import { investigations, sources, historicalCases } from "./data/research";
import {
  defaultConfig,
  simulate,
  scenarioInfo,
  type SimConfig,
  type ScenarioId,
} from "./lib/simulation";

const Spacecraft = lazy(() => import("./components/Spacecraft"));
type Page =
  | "overview"
  | "lab"
  | "data"
  | "research"
  | "compare"
  | "history"
  | "assistant"
  | "sources";
type Investigation = (typeof investigations)[number];
const nav = [
  { id: "overview", label: "Vista general", icon: LayoutDashboard },
  { id: "lab", label: "Laboratorio 3D", icon: Orbit },
  { id: "research", label: "Investigaciones", icon: FlaskConical },
  { id: "data", label: "Datos experimentales", icon: Activity },
  { id: "compare", label: "Comparador", icon: Layers3 },
  { id: "history", label: "Lecciones históricas", icon: BookOpen },
  { id: "assistant", label: "Asistente científico", icon: Sparkles },
  { id: "sources", label: "Fuentes y método", icon: Database },
] as const;
const scenarioNames: Record<ScenarioId, string> = {
  mir: "Estación Mir",
  apollo1: "Apollo 1",
  apollo13: "Apollo 13",
  aegis: "AEGIS · nave conceptual",
};
const cx = (...values: (string | false | undefined)[]) =>
  values.filter(Boolean).join(" ");
function download(name: string, content: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <div className="scene-error">
        <Orbit size={36} />
        <p>La vista 3D requiere WebGL disponible en tu navegador.</p>
        <span>Los controles y las gráficas siguen disponibles.</span>
      </div>
    ) : (
      this.props.children
    );
  }
}
function SourceLink({ url, children }: { url: string; children: ReactNode }) {
  return (
    <a className="source-link" href={url} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={12} />
    </a>
  );
}
function App() {
  const [page, setPage] = useState<Page>(() => {
    const hash = window.location.hash.slice(1);
    return nav.some((item) => item.id === hash) ? (hash as Page) : "overview";
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Todas");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Investigation | null>(null);
  const [config, setConfig] = useState<SimConfig>(defaultConfig);
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [cutaway, setCutaway] = useState(true);
  const [cameraReset, setCameraReset] = useState(0);
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiChecked, setAiChecked] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [aiSources, setAiSources] = useState<{ title: string; url: string }[]>(
    [],
  );
  const [aiError, setAiError] = useState("");
  const [asking, setAsking] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [compareProtection, setCompareProtection] = useState(false);
  const frames = useMemo(() => simulate(config), [config]);
  const frame = frames[Math.min(time, frames.length - 1)];
  const filtered = investigations.filter(
    (item) =>
      (category === "Todas" || item.category === category) &&
      `${item.name} ${item.fullName} ${item.fuel} ${item.summary}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const comparisons = investigations.filter((item) =>
    selected.includes(item.id),
  );
  const protectedFrames = useMemo(
    () =>
      simulate({ ...config, isolation: true, suppression: true, backup: true }),
    [config],
  );
  const smokeChart = frames
    .filter((f) => f.time <= time)
    .map((f) => ({ ...f, protectedSmoke: protectedFrames[f.time].smoke }));

  useEffect(() => {
    if (!detail && !showMethod) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = document.querySelector('[role="dialog"]');
      const controls = dialog?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), a[href], input, select, textarea",
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", trapFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", trapFocus);
      previousFocus?.focus();
    };
  }, [detail, showMethod]);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.slice(1);
      if (nav.some((item) => item.id === hash)) setPage(hash as Page);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/ai/status", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setAiConfigured(Boolean(data.configured)))
      .catch(() => setAiConfigured(false))
      .finally(() => setAiChecked(true));
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!running || page !== "lab") return;
    const interval = setInterval(
      () =>
        setTime((t) => {
          if (t >= 180) {
            setRunning(false);
            return 180;
          }
          return t + 1;
        }),
      1000 / speed,
    );
    return () => clearInterval(interval);
  }, [running, page, speed]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetail(null);
        setMobileOpen(false);
        setShowMethod(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  function navigate(next: Page) {
    setRunning(false);
    setPage(next);
    window.location.hash = next;
    setMobileOpen(false);
    window.scrollTo({ top: 0 });
  }
  function toggleCompare(id: string) {
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : current.length < 4
          ? [...current, id]
          : current,
    );
  }
  function updateConfig(change: Partial<SimConfig>) {
    setConfig((current) => ({ ...current, ...change }));
    setTime(0);
    setRunning(false);
  }
  function changeScenario(scenario: ScenarioId) {
    updateConfig({
      ...defaultConfig,
      scenario,
      ...scenarioInfo[scenario].defaults,
      isolation: scenario === "aegis",
      suppression: scenario === "mir" || scenario === "aegis",
      backup: scenario === "aegis" || scenario === "apollo13",
    });
  }
  async function ask(text = question) {
    if (!text.trim() || asking) return;
    setQuestion(text);
    setAsking(true);
    setAiError("");
    setAnswer("");
    setAiSources([]);
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          context: {
            scenario: config.scenario,
            conditions: config,
            selectedInvestigations: selected,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "La consulta no pudo completarse.");
      setAnswer(data.answer);
      setAiSources(data.sources || []);
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : "No se pudo conectar con el asistente.",
      );
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-overlay"
          aria-label="Cerrar navegación"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={cx("sidebar", mobileOpen && "is-open")}
        inert={Boolean(detail || showMethod)}
      >
        <button
          className="brand"
          onClick={() => navigate("overview")}
          aria-label="Orbital Fire Lab, inicio"
        >
          <span className="brand-icon">
            <Orbit size={28} />
          </span>
          <span>
            ORBITAL<span className="brand-sub">FIRE LAB</span>
          </span>
        </button>
        <div className="sidebar-label">ESPACIO DE INVESTIGACIÓN</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={cx("nav-item", page === item.id && "active")}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "compare" && selected.length > 0 && (
                <b>{selected.length}</b>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="orbit-mark">
            <Orbit size={34} />
          </div>
          <p>
            Ciencia para
            <br />
            <strong>volver a casa.</strong>
          </p>
          <span>Exploración espacial · Seguridad humana</span>
          <button onClick={() => navigate("sources")}>
            <CircleHelp size={15} /> Acerca de este laboratorio{" "}
            <ChevronRight size={14} />
          </button>
        </div>
      </aside>
      <div className="workspace" inert={Boolean(detail || showMethod)}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              aria-label="Abrir menú"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={20} />
            </button>
            <span>Orbital Fire Lab</span>
            <ChevronRight size={14} />
            <strong>{nav.find((item) => item.id === page)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="data-status">
              <i /> Fuentes NASA
            </span>
            <button
              className="icon-button"
              title="Buscar investigaciones"
              aria-label="Buscar investigaciones"
              onClick={() => navigate("research")}
            >
              <Search size={18} />
            </button>
            <div className="avatar">OF</div>
          </div>
        </header>
        <main>
          {page === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    LABORATORIO DE COMBUSTIÓN ESPACIAL
                  </span>
                  <h1>Ciencia que protege la misión.</h1>
                  <p>
                    Explora la evidencia. Comprende los riesgos. Diseña mejores
                    respuestas.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => navigate("sources")}
                >
                  <Database size={16} /> Explorar las fuentes
                </button>
              </div>
              <section className="hero">
                <div className="hero-image" />
                <div className="hero-shade" />
                <div className="hero-content">
                  <div className="hero-kicker">
                    <i /> DEL EXPERIMENTO A LA SEGURIDAD
                  </div>
                  <h2>
                    El fuego cambia.
                    <br />
                    La vida sigue siendo
                    <br />
                    <em>la prioridad.</em>
                  </h2>
                  <p>
                    Un laboratorio para entender la combustión en microgravedad
                    y explorar cómo proteger a quienes viajan más lejos.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => navigate("lab")}
                  >
                    Entrar al simulador <ArrowRight size={17} />
                  </button>
                </div>
                <div className="hero-coordinate">
                  <span>TIERRA · ÓRBITA BAJA</span>
                  <div className="orbit-track">
                    <i />
                  </div>
                  <strong>
                    Una nueva perspectiva
                    <br />
                    sobre el fuego.
                  </strong>
                </div>
                <div className="hero-footer">
                  <span>APOLLO 1</span>
                  <span>APOLLO 13</span>
                  <span>MIR</span>
                  <span>AEGIS · CONCEPTO</span>
                </div>
              </section>
              <div className="metric-grid">
                <div className="metric-card">
                  <FlaskConical />
                  <div>
                    <span>Investigaciones catalogadas</span>
                    <strong>
                      {investigations.length}
                      <small>con referencias</small>
                    </strong>
                  </div>
                </div>
                <div className="metric-card">
                  <ShieldCheck />
                  <div>
                    <span>Áreas de seguridad</span>
                    <strong>
                      3<small>prevenir · detectar · suprimir</small>
                    </strong>
                  </div>
                </div>
                <div className="metric-card">
                  <Orbit />
                  <div>
                    <span>Escenarios interactivos</span>
                    <strong>
                      4<small>históricos y conceptuales</small>
                    </strong>
                  </div>
                </div>
              </div>
              <div className="overview-grid">
                <section className="panel">
                  <div className="section-title">
                    <div>
                      <span className="eyebrow">BIBLIOTECA CIENTÍFICA</span>
                      <h2>De los datos a las decisiones</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("research")}
                    >
                      Ver todas <ArrowRight size={16} />
                    </button>
                  </div>
                  {["Prevención", "Detección", "Supresión"].map(
                    (cat, index) => (
                      <button
                        key={cat}
                        className="research-row"
                        onClick={() => {
                          setCategory(cat);
                          navigate("research");
                        }}
                      >
                        <span className={`category-icon color-${index}`}>
                          {index === 0 ? (
                            <ShieldCheck size={21} />
                          ) : index === 1 ? (
                            <Activity size={21} />
                          ) : (
                            <FlaskConical size={21} />
                          )}
                        </span>
                        <span>
                          <strong>{cat}</strong>
                          <small>
                            {index === 0
                              ? "Materiales, atmósfera y propagación"
                              : index === 1
                                ? "Humo, aerosoles y señales tempranas"
                                : "Extinción y respuesta al fuego"}
                          </small>
                        </span>
                        <span className="row-count">
                          {
                            investigations.filter((i) => i.category === cat)
                              .length
                          }{" "}
                          estudios
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ),
                  )}
                </section>
                <section className="panel ai-promo">
                  <div className="ai-symbol">
                    <Sparkles size={24} />
                  </div>
                  <span className="eyebrow">ASISTENTE CIENTÍFICO</span>
                  <h2>
                    Hazle preguntas
                    <br /> a la evidencia.
                  </h2>
                  <p>
                    Relaciona investigaciones, explora condiciones
                    experimentales y consulta las fuentes con Gemini.
                  </p>
                  <button
                    className="text-button"
                    onClick={() => navigate("assistant")}
                  >
                    Abrir asistente <ArrowRight size={16} />
                  </button>
                  <span className="subtle-status">
                    {aiConfigured
                      ? "Gemini conectado"
                      : "Requiere configurar una clave de Gemini"}
                  </span>
                </section>
              </div>
              <section className="lessons-section">
                <div className="section-title">
                  <div>
                    <span className="eyebrow">APRENDER DE LA HISTORIA</span>
                    <h2>Tres sucesos. Lecciones que siguen vigentes.</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => navigate("history")}
                  >
                    Explorar historias <ArrowRight size={16} />
                  </button>
                </div>
                <div className="history-teasers">
                  {historicalCases.slice(0, 3).map((item, index) => (
                    <button key={item.id} onClick={() => navigate("history")}>
                      <span className="history-date">{item.year}</span>
                      <h3>{item.title}</h3>
                      <p>
                        {
                          [
                            "Atmósfera y acceso a la salida",
                            "Independencia de los sistemas",
                            "Contención y rutas de evacuación",
                          ][index]
                        }
                      </p>
                      <ArrowRight size={18} />
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {page === "lab" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">SIMULACIÓN INTERACTIVA</span>
                  <h1>Explora cada decisión.</h1>
                  <p>
                    Modifica las condiciones y observa la evolución del
                    escenario.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => setShowMethod(true)}
                >
                  <CircleHelp size={16} /> Modelo y límites
                </button>
              </div>
              <div className="scenario-tabs">
                {(Object.keys(scenarioNames) as ScenarioId[]).map((id) => (
                  <button
                    className={config.scenario === id ? "selected" : ""}
                    key={id}
                    onClick={() => changeScenario(id)}
                  >
                    {scenarioNames[id]}
                    {id === "aegis" && <ShieldCheck size={15} />}
                  </button>
                ))}
              </div>
              <div className="simulation-layout">
                <section className="viewport-panel">
                  <div className="viewport-toolbar">
                    <div>
                      <i className={running ? "live-dot" : "paused-dot"} />
                      <strong>{scenarioNames[config.scenario]}</strong>
                      <span>
                        {config.gravity === 0
                          ? "Microgravedad"
                          : `${config.gravity} g`}
                      </span>
                    </div>
                    <div className="viewport-actions">
                      <button
                        className="icon-button"
                        aria-label="Restablecer vista 3D"
                        title="Restablecer vista 3D"
                        onClick={() => setCameraReset((value) => value + 1)}
                      >
                        <RotateCcw size={15} />
                      </button>
                      <button
                        className={cx("small-button", cutaway && "selected")}
                        onClick={() => setCutaway((value) => !value)}
                      >
                        <Layers3 size={14} /> Corte interior
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
                        <Spacecraft
                          key={cameraReset}
                          scenario={config.scenario}
                          frame={frame}
                          cutaway={cutaway}
                          gravity={config.gravity}
                        />
                      </Suspense>
                    </SceneBoundary>
                    <div className="scene-caption">
                      Reconstrucción esquemática · arrastra para girar · rueda
                      para acercar
                    </div>
                    <div className="scene-label">
                      <span>TIEMPO DEL MODELO</span>
                      <strong>T + {String(time).padStart(3, "0")} s</strong>
                    </div>
                  </div>
                  <div className="playback">
                    <button
                      className="play-button"
                      aria-label={
                        running ? "Pausar simulación" : "Reproducir simulación"
                      }
                      onClick={() => {
                        if (time === 180) setTime(0);
                        setRunning((v) => !v);
                      }}
                    >
                      {running ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="Reiniciar simulación"
                      onClick={() => {
                        setTime(0);
                        setRunning(false);
                      }}
                    >
                      <RotateCcw size={17} />
                    </button>
                    <input
                      aria-label="Tiempo del escenario"
                      type="range"
                      min={0}
                      max={180}
                      value={time}
                      onChange={(e) => {
                        setRunning(false);
                        setTime(Number(e.target.value));
                      }}
                    />
                    <span>{time} / 180 s</span>
                    <select
                      aria-label="Velocidad de reproducción"
                      value={speed}
                      onChange={(event) => setSpeed(Number(event.target.value))}
                    >
                      <option value={1}>1×</option>
                      <option value={4}>4×</option>
                      <option value={8}>8×</option>
                    </select>
                  </div>
                </section>
                <aside className="control-panel">
                  <div className="section-title">
                    <h3>Condiciones del escenario</h3>
                    <SlidersHorizontal size={17} />
                  </div>
                  <Range
                    label="Oxígeno"
                    value={config.oxygen}
                    unit="% vol."
                    min={15}
                    max={100}
                    step={1}
                    onChange={(oxygen) => updateConfig({ oxygen })}
                  />
                  <Range
                    label="Presión"
                    value={config.pressure}
                    unit="kPa"
                    min={30}
                    max={120}
                    step={0.1}
                    onChange={(pressure) => updateConfig({ pressure })}
                  />
                  <p className="partial-pressure">
                    Presión parcial de O₂{" "}
                    <strong>
                      {((config.oxygen * config.pressure) / 100).toFixed(1)} kPa
                    </strong>
                  </p>
                  <Range
                    label="Flujo de aire"
                    value={config.airflow}
                    unit="m/s"
                    min={0}
                    max={0.5}
                    step={0.01}
                    onChange={(airflow) => updateConfig({ airflow })}
                  />
                  <label className="select-label">
                    Entorno gravitacional
                    <select
                      value={config.gravity}
                      onChange={(e) =>
                        updateConfig({ gravity: Number(e.target.value) })
                      }
                    >
                      <option value={0}>Microgravedad · ~0 g</option>
                      <option value={0.16}>Luna · 0,16 g</option>
                      <option value={0.38}>Marte · 0,38 g</option>
                      <option value={1}>Tierra · 1 g</option>
                    </select>
                  </label>
                  {config.gravity > 0 && config.gravity < 1 && (
                    <p className="inline-note">
                      Gravedad parcial exploratoria, pendiente de validación
                      experimental.
                    </p>
                  )}
                  <div className="control-divider" />
                  <h4>Barreras de protección</h4>
                  <Toggle
                    label="Aislamiento de compartimentos"
                    checked={config.isolation}
                    onChange={(isolation) => updateConfig({ isolation })}
                  />
                  <Toggle
                    label="Supresión del incendio"
                    checked={config.suppression}
                    onChange={(suppression) => updateConfig({ suppression })}
                  />
                  <Toggle
                    label="Recursos de respaldo"
                    checked={config.backup}
                    onChange={(backup) => updateConfig({ backup })}
                  />
                  <button
                    className="button secondary full"
                    onClick={() =>
                      download(
                        `escenario-${config.scenario}.json`,
                        JSON.stringify(
                          {
                            config,
                            model:
                              "Modelo educativo por compartimentos, sin validación predictiva",
                            frames,
                          },
                          null,
                          2,
                        ),
                      )
                    }
                  >
                    <ArrowDownToLine size={15} /> Exportar escenario
                  </button>
                </aside>
              </div>
              <div className="model-note">
                <CircleHelp size={16} />
                <p>
                  <strong>Modelo educativo.</strong> Los valores son calculados
                  con supuestos simplificados. La geometría es esquemática. El
                  resultado permite comparar hipótesis y requiere validación
                  para decisiones de ingeniería.
                </p>
              </div>
              <div className="telemetry-grid">
                <Telemetry
                  label="Temperatura del foco"
                  value={frame.temperature.toFixed(0)}
                  unit="°C"
                  color="orange"
                />
                <Telemetry
                  label="Índice de humo"
                  value={frame.smoke.toFixed(1)}
                  unit="/ 100"
                  color="cyan"
                />
                <Telemetry
                  label="Energía disponible"
                  value={frame.energy.toFixed(0)}
                  unit="%"
                  color="lime"
                />
                <Telemetry
                  label="Personas en refugio"
                  value={String(frame.refuge)}
                  unit={`/ ${config.scenario === "mir" || config.scenario === "aegis" ? 6 : 3}`}
                  color="violet"
                />
              </div>
              <div className="comparison-control">
                <Toggle
                  label="Comparar humo con todas las barreras activas"
                  checked={compareProtection}
                  onChange={setCompareProtection}
                />
                {compareProtection && (
                  <span>
                    Curva verde discontinua · mismas condiciones atmosféricas
                  </span>
                )}
              </div>
              <div className="lab-lower">
                <section className="panel">
                  <div className="section-title">
                    <h3>Evolución del humo</h3>
                    <button
                      className="text-button"
                      onClick={() =>
                        download(
                          `telemetria-${config.scenario}.csv`,
                          "tiempo_s,temperatura_C,indice_humo,oxigeno_pct,energia_pct,personas_refugio\n" +
                            frames
                              .map((f) =>
                                [
                                  f.time,
                                  f.temperature,
                                  f.smoke,
                                  f.oxygen,
                                  f.energy,
                                  f.refuge,
                                ].join(","),
                              )
                              .join("\n"),
                          "text/csv",
                        )
                      }
                    >
                      <ArrowDownToLine size={14} /> CSV
                    </button>
                  </div>
                  <div className="chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={smokeChart}>
                        <defs>
                          <linearGradient
                            id="smokeGradient"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#8cc5df"
                              stopOpacity={0.3}
                            />
                            <stop
                              offset="100%"
                              stopColor="#8cc5df"
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          stroke="#25313c"
                          strokeDasharray="3 4"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="time"
                          type="number"
                          domain={[0, 180]}
                          tick={{ fill: "#81909c", fontSize: 11 }}
                          tickLine={false}
                          unit=" s"
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: "#81909c", fontSize: 11 }}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#15212b",
                            border: "1px solid #35434f",
                            borderRadius: 8,
                          }}
                          labelFormatter={(v) => `${v} s`}
                        />
                        <Area
                          name="Índice de humo"
                          type="monotone"
                          dataKey="smoke"
                          stroke="#8cc5df"
                          fill="url(#smokeGradient)"
                          isAnimationActive={false}
                        />
                        {compareProtection && (
                          <Area
                            name="Con todas las barreras"
                            dataKey="protectedSmoke"
                            stroke="#c6ed9c"
                            strokeDasharray="5 4"
                            fill="transparent"
                            isAnimationActive={false}
                          />
                        )}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </section>
                <section className="panel">
                  <span className="eyebrow">ESTADO DEL ESCENARIO</span>
                  <h3 className="phase-title">{frame.phase}</h3>
                  <p className="muted">
                    {scenarioInfo[config.scenario].description}
                  </p>
                  <p className="interpretation-note">
                    {scenarioInfo[config.scenario].interpretation}
                  </p>
                  <div className="module-list">
                    {frame.modules.map((module) => (
                      <div key={module.id}>
                        <span>{module.name}</span>
                        <span
                          className={
                            module.smoke > 35 ? "warning-text" : "muted"
                          }
                        >
                          {module.smoke.toFixed(0)} / 100 humo
                        </span>
                        <div className="meter">
                          <i
                            style={{ width: `${Math.min(100, module.smoke)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}

          {page === "research" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">INVESTIGACIONES NASA</span>
                  <h1>Encuentra la evidencia.</h1>
                  <p>
                    Objetivos, materiales, condiciones y mediciones en un mismo
                    lugar.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() =>
                    download(
                      "catalogo-investigaciones.json",
                      JSON.stringify(investigations, null, 2),
                    )
                  }
                >
                  <ArrowDownToLine size={16} /> Exportar catálogo
                </button>
              </div>
              <div className="research-filters">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar por investigación, material o fenómeno…"
                    aria-label="Buscar investigaciones"
                  />
                  {query && (
                    <button
                      aria-label="Borrar búsqueda"
                      onClick={() => setQuery("")}
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                <div className="filter-tabs">
                  {["Todas", "Prevención", "Detección", "Supresión"].map(
                    (cat) => (
                      <button
                        key={cat}
                        className={category === cat ? "selected" : ""}
                        onClick={() => setCategory(cat)}
                      >
                        {cat}
                      </button>
                    ),
                  )}
                </div>
              </div>
              <div className="results-bar">
                <span>{filtered.length} investigaciones</span>
                <button
                  className="text-button"
                  onClick={() => navigate("compare")}
                >
                  Comparar seleccionadas ({selected.length}/4){" "}
                  <ArrowRight size={15} />
                </button>
              </div>
              <div className="research-grid">
                {filtered.map((item) => (
                  <article className="investigation-card" key={item.id}>
                    <div className="card-top">
                      <span
                        className={`tag ${item.category === "Prevención" ? "lime" : item.category === "Detección" ? "cyan" : "peach"}`}
                      >
                        {item.category}
                      </span>
                      <label
                        className="compare-check"
                        title="Seleccionar para comparar"
                      >
                        <input
                          type="checkbox"
                          aria-label={`Comparar ${item.name}`}
                          checked={selected.includes(item.id)}
                          disabled={
                            selected.length >= 4 && !selected.includes(item.id)
                          }
                          onChange={() => toggleCompare(item.id)}
                        />
                        <Layers3 size={15} />
                      </label>
                    </div>
                    <button
                      className="card-title-button"
                      onClick={() => setDetail(item)}
                    >
                      <h2>{item.name}</h2>
                      <span>{item.fullName}</span>
                    </button>
                    <p>{item.summary}</p>
                    <div className="card-metadata">
                      <span>COMBUSTIBLE</span>
                      <strong>{item.fuel}</strong>
                      <span>INSTALACIÓN</span>
                      <strong>{item.hardware}</strong>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setDetail(item)}
                    >
                      Explorar investigación <ArrowRight size={16} />
                    </button>
                  </article>
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="empty-state">
                  <Search size={30} />
                  <h3>Sin coincidencias</h3>
                  <p>Prueba con “humo”, “gotas” o “BASS”.</p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setQuery("");
                      setCategory("Todas");
                    }}
                  >
                    Restablecer filtros
                  </button>
                </div>
              )}
              <section className="concept-banner">
                <Database size={30} />
                <div>
                  <h2>De la ficha al experimento</h2>
                  <p>
                    Abre las tablas originales de PSI, filtra ensayos y
                    representa sus columnas numéricas.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => navigate("data")}
                >
                  Explorar datos <ArrowRight size={16} />
                </button>
              </section>
            </>
          )}

          {page === "data" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    NASA PHYSICAL SCIENCES INFORMATICS
                  </span>
                  <h1>La evidencia, a tu alcance.</h1>
                  <p>
                    Explora tablas originales, filtra ensayos y relaciona sus
                    variables.
                  </p>
                </div>
              </div>
              <ExperimentalExplorer />
            </>
          )}
          {page === "compare" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">COMPARACIÓN CIENTÍFICA</span>
                  <h1>Las diferencias también enseñan.</h1>
                  <p>
                    Compara hasta cuatro investigaciones y sus condiciones de
                    ensayo.
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => navigate("research")}
                >
                  Elegir investigaciones <ArrowRight size={16} />
                </button>
              </div>
              {comparisons.length === 0 ? (
                <div className="empty-state">
                  <Layers3 size={38} />
                  <h2>Construye tu comparación</h2>
                  <p>
                    Selecciona investigaciones en la biblioteca o comienza con
                    BASS y FLEX.
                  </p>
                  <button
                    className="button primary"
                    onClick={() =>
                      setSelected(
                        investigations
                          .filter((i) => /BASS|FLEX/.test(i.name))
                          .slice(0, 3)
                          .map((i) => i.id),
                      )
                    }
                  >
                    Comparar combustibles sólidos y líquidos
                  </button>
                </div>
              ) : (
                <>
                  <div className="compare-table-wrap">
                    <table className="compare-table">
                      <thead>
                        <tr>
                          <th>Atributo</th>
                          {comparisons.map((item) => (
                            <th key={item.id}>
                              {item.name}
                              <button
                                className="icon-button"
                                aria-label={`Quitar ${item.name}`}
                                onClick={() => toggleCompare(item.id)}
                              >
                                <X size={15} />
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["fullName", "Nombre completo"],
                          ["category", "Aplicación"],
                          ["fuel", "Combustible"],
                          ["hardware", "Instalación"],
                          ["gravity", "Gravedad"],
                          ["variables", "Variables del estudio"],
                          ["measurements", "Mediciones"],
                          ["relevance", "Aplicación a seguridad"],
                          ["limitations", "Límites de interpretación"],
                        ].map(([key, label]) => (
                          <tr key={key}>
                            <th>{label}</th>
                            {comparisons.map((item) => (
                              <td key={item.id}>
                                {Array.isArray(item[key as keyof Investigation])
                                  ? (
                                      item[
                                        key as keyof Investigation
                                      ] as string[]
                                    ).join(" · ")
                                  : String(item[key as keyof Investigation])}
                              </td>
                            ))}
                          </tr>
                        ))}
                        <tr>
                          <th>Fuente</th>
                          {comparisons.map((item) => (
                            <td key={item.id}>
                              <SourceLink url={item.sourceUrl}>
                                Consultar investigación
                              </SourceLink>
                            </td>
                          ))}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="model-note">
                    <CircleHelp size={16} />
                    <p>
                      La comparación describe los estudios. Los resultados entre
                      combustibles, geometrías y aparatos distintos requieren
                      normalización antes de combinarse.
                    </p>
                  </div>
                  <button
                    className="button secondary"
                    onClick={() =>
                      download(
                        "comparacion.json",
                        JSON.stringify(comparisons, null, 2),
                      )
                    }
                  >
                    <ArrowDownToLine size={16} /> Exportar comparación
                  </button>
                </>
              )}
            </>
          )}

          {page === "history" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">MEMORIA DE LA EXPLORACIÓN</span>
                  <h1>La seguridad se aprende.</h1>
                  <p>
                    Tres incidentes para comprender cómo se encadenan los
                    fallos.
                  </p>
                </div>
              </div>
              <div className="history-list">
                {historicalCases.map((item, index) => (
                  <article className="history-card" key={item.id}>
                    <div className="history-side">
                      <span>{item.year}</span>
                      <Orbit size={65} />
                      <strong>
                        {
                          [
                            "PRUEBA EN TIERRA",
                            "VUELO TRANSLUNAR",
                            "ÓRBITA TERRESTRE",
                          ][index]
                        }
                      </strong>
                    </div>
                    <div className="history-body">
                      <h2>{item.title}</h2>
                      <p>{item.summary}</p>
                      <div className="lesson">
                        <ShieldCheck size={20} />
                        <div>
                          <span>LECCIÓN DE SEGURIDAD</span>
                          <p>{item.lesson}</p>
                        </div>
                      </div>
                      <div className="history-actions">
                        <SourceLink url={item.sourceUrl}>
                          Documentación histórica
                        </SourceLink>
                        <button
                          className="button secondary"
                          onClick={() => {
                            changeScenario(
                              (["apollo1", "apollo13", "mir"] as ScenarioId[])[
                                index
                              ],
                            );
                            navigate("lab");
                          }}
                        >
                          Explorar escenario <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <section className="concept-banner">
                <ShieldCheck size={36} />
                <div>
                  <h2>AEGIS · explorar una arquitectura más resiliente</h2>
                  <p>
                    Prueba compartimentación, supresión y reservas
                    independientes. Evalúa cómo cambian los resultados dentro de
                    los límites del modelo.
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    changeScenario("aegis");
                    navigate("lab");
                  }}
                >
                  Explorar AEGIS <ArrowRight size={16} />
                </button>
              </section>
            </>
          )}

          {page === "assistant" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">GEMINI · ASISTENTE CIENTÍFICO</span>
                  <h1>Una pregunta abre otra perspectiva.</h1>
                  <p>
                    Explora la biblioteca con respuestas acompañadas de sus
                    fuentes.
                  </p>
                </div>
                <span className={cx("tag", aiConfigured ? "lime" : "peach")}>
                  {!aiChecked
                    ? "Comprobando conexión"
                    : aiConfigured
                      ? "Conectado"
                      : "Configuración pendiente"}
                </span>
              </div>
              <section className="assistant-panel">
                <div className="assistant-intro">
                  <div className="ai-symbol">
                    <Sparkles size={28} />
                  </div>
                  <h2>¿Qué quieres investigar?</h2>
                  <p>
                    Consulta condiciones experimentales, compara métodos y
                    conecta hallazgos con problemas de seguridad.
                  </p>
                </div>
                <div className="prompt-grid">
                  {[
                    "¿Cómo influye la ventilación en la combustión en microgravedad?",
                    "Compara BASS-II y FLEX para diseñar medidas de seguridad.",
                    "¿Qué aprendimos del incendio de Mir sobre las rutas de escape?",
                    "¿Qué investigaciones ayudan a detectar humo a tiempo?",
                  ].map((text) => (
                    <button
                      key={text}
                      onClick={() => {
                        setQuestion(text);
                        if (aiConfigured) void ask(text);
                      }}
                    >
                      {text}
                      <ArrowRight size={16} />
                    </button>
                  ))}
                </div>
                {!aiConfigured && (
                  <div className="setup-note">
                    <CircleHelp size={20} />
                    <div>
                      <strong>Conecta tu cuenta de Google AI Studio</strong>
                      <p>
                        El servicio necesita una clave de Gemini guardada en el
                        servidor como GEMINI_API_KEY. El nivel gratuito está
                        sujeto a disponibilidad y límites de Google.
                      </p>
                      <SourceLink url="https://aistudio.google.com/apikey">
                        Crear una clave en AI Studio
                      </SourceLink>
                    </div>
                  </div>
                )}
                <form
                  className="question-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask();
                  }}
                >
                  <textarea
                    aria-label="Pregunta científica"
                    placeholder="Pregunta sobre los experimentos, las condiciones o las lecciones históricas…"
                    value={question}
                    maxLength={2000}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                  <div>
                    <span>
                      Respuestas basadas en el catálogo y sus referencias
                    </span>
                    <button
                      className="button primary"
                      disabled={
                        asking || question.trim().length < 3 || !aiConfigured
                      }
                    >
                      {asking ? "Consultando…" : "Consultar"}
                      <Send size={16} />
                    </button>
                  </div>
                </form>
                {aiError && (
                  <p className="error-message" role="alert">
                    {aiError}
                  </p>
                )}
                {answer && (
                  <article className="ai-answer">
                    <div className="answer-label">
                      <Sparkles size={17} /> Respuesta de Gemini
                    </div>
                    <div className="answer-text">{answer}</div>
                    <h4>Referencias recuperadas</h4>
                    {aiSources.map((source, index) => (
                      <SourceLink key={index} url={source.url}>
                        {source.title}
                      </SourceLink>
                    ))}
                  </article>
                )}
              </section>
            </>
          )}

          {page === "sources" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">TRAZABILIDAD Y MÉTODO</span>
                  <h1>Cada afirmación tiene un origen.</h1>
                  <p>
                    Consulta las fuentes, descarga recursos y conoce el alcance
                    del laboratorio.
                  </p>
                </div>
              </div>
              <div className="method-grid">
                <section className="panel">
                  <Database size={24} />
                  <h3>Evidencia experimental</h3>
                  <p>
                    El catálogo resume investigaciones documentadas por NASA.
                    Las tablas descargadas conservan sus fuentes y unidades. Los
                    valores ausentes se mantienen como no disponibles.
                  </p>
                </section>
                <section className="panel">
                  <Orbit size={24} />
                  <h3>Escenarios educativos</h3>
                  <p>
                    La simulación utiliza un modelo simplificado de
                    compartimentos y constantes ilustrativas. La supervivencia
                    real exige validación experimental y análisis de ingeniería.
                  </p>
                </section>
                <section className="panel">
                  <Sparkles size={24} />
                  <h3>Interpretación con IA</h3>
                  <p>
                    Gemini recibe contexto de la biblioteca. Revisa las
                    referencias y las condiciones del experimento antes de
                    aplicar una respuesta a un diseño.
                  </p>
                </section>
              </div>
              <section className="panel sources-panel">
                <div className="section-title">
                  <h2>Biblioteca de fuentes y descargas</h2>
                  <span className="muted">{sources.length} recursos</span>
                </div>
                {sources.map((source) => (
                  <div className="source-row" key={source.id}>
                    <div className="source-type">
                      <BookOpen size={19} />
                    </div>
                    <div>
                      <span className="eyebrow">{source.kind}</span>
                      <h3>{source.title}</h3>
                      <p>{source.description}</p>
                    </div>
                    <SourceLink url={source.url}>Abrir</SourceLink>
                  </div>
                ))}
              </section>
              <section className="panel method-detail">
                <h2>Descargas y procedencia</h2>
                <div className="resource-downloads">
                  <a
                    className="button secondary"
                    href="/resources/combustion-guide.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Guía de combustión · PDF <ArrowDownToLine size={15} />
                  </a>
                  <a
                    className="button secondary"
                    href="/resources/bass-ii-report.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Informe BASS-II · PDF <ArrowDownToLine size={15} />
                  </a>
                  <a
                    className="button secondary"
                    href="/resources/saffire-iv-model.pdf"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Modelado Saffire IV · PDF <ArrowDownToLine size={15} />
                  </a>
                </div>
                <p>
                  Tablas de PSI consultadas el 14 de noviembre de 2026. Las
                  fichas descargadas declaran CC0-1.0. La clasificación por
                  prevención, detección y supresión es editorial. Cada recurso
                  conserva su atribución y condiciones de origen.
                </p>
                <p>
                  Fotografía de la Tierra © NASA · ISS063-E-058598, 24 de julio
                  de 2020.{" "}
                  <SourceLink url="https://images.nasa.gov/details/iss063e058598">
                    Crédito y original
                  </SourceLink>
                </p>
              </section>
              <section className="panel method-detail">
                <h2>Cómo interpretar la simulación</h2>
                <p>
                  El tiempo representa una ventana educativa de 180 segundos.
                  Los incidentes históricos sirven como contexto. Los
                  coeficientes de combustión, transporte y respuesta se definen
                  para explorar relaciones y se documentan en el modelo.
                </p>
                <p>
                  Temperatura en °C, presión en kPa, oxígeno en porcentaje
                  volumétrico, ventilación en m/s y gravedad como fracción de g.
                  El humo se representa mediante un índice relativo entre 0 y
                  100. Las personas que alcanzan el refugio dependen de tiempos
                  y umbrales ilustrativos.
                </p>
                <p>
                  El comportamiento en gravedad lunar y marciana es
                  exploratorio. Una conclusión de supervivencia solo describe
                  las hipótesis y condiciones ejecutadas.
                </p>
                <button
                  className="button secondary"
                  onClick={() =>
                    download(
                      "metodo-y-configuracion.json",
                      JSON.stringify(
                        {
                          purpose:
                            "Comparación educativa de escenarios; sin validación para ingeniería",
                          units: {
                            pressure: "kPa",
                            oxygen: "% volumétrico",
                            airflow: "m/s",
                            gravity: "g",
                            temperature: "°C",
                            smoke: "índice relativo 0–100",
                          },
                          config,
                          sourceFiles: [
                            "src/lib/simulation.ts",
                            "src/data/research.ts",
                          ],
                        },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  <ArrowDownToLine size={15} /> Exportar condiciones y unidades
                </button>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              <Orbit size={14} /> ORBITAL FIRE LAB
            </span>
            <span>Investigación abierta. Decisiones informadas.</span>
            <button onClick={() => navigate("sources")}>
              Fuentes y alcance <ArrowRight size={13} />
            </button>
          </footer>
        </main>
      </div>
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label={detail.name}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close icon-button"
              aria-label="Cerrar detalle"
              autoFocus
              onClick={() => setDetail(null)}
            >
              <X size={22} />
            </button>
            <span className="tag lime">{detail.category}</span>
            <h2>{detail.name}</h2>
            <h3>{detail.fullName}</h3>
            <p>{detail.summary}</p>
            <dl>
              <dt>Combustible y muestras</dt>
              <dd>{detail.fuel}</dd>
              <dt>Instalación experimental</dt>
              <dd>{detail.hardware}</dd>
              <dt>Gravedad</dt>
              <dd>{detail.gravity}</dd>
              <dt>Variables</dt>
              <dd>{detail.variables.join(" · ")}</dd>
              <dt>Mediciones</dt>
              <dd>{detail.measurements.join(" · ")}</dd>
              <dt>Relevancia para la seguridad</dt>
              <dd>{detail.relevance}</dd>
              <dt>Límites de interpretación</dt>
              <dd>{detail.limitations}</dd>
            </dl>
            <div className="modal-actions">
              <SourceLink url={detail.sourceUrl}>Fuente original</SourceLink>
              {detail.resourceUrl && (
                <SourceLink url={detail.resourceUrl}>
                  Descargar recurso
                </SourceLink>
              )}
              <button
                className="button secondary"
                disabled={selected.length >= 4 && !selected.includes(detail.id)}
                onClick={() => toggleCompare(detail.id)}
              >
                {selected.includes(detail.id) ? (
                  <Check size={15} />
                ) : (
                  <Layers3 size={15} />
                )}{" "}
                {selected.includes(detail.id)
                  ? "En comparación"
                  : "Añadir a comparación"}
              </button>
            </div>
          </section>
        </div>
      )}
      {showMethod && (
        <div className="modal-backdrop" onClick={() => setShowMethod(false)}>
          <section
            className="detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Modelo y límites"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              autoFocus
              className="modal-close icon-button"
              aria-label="Cerrar método"
              onClick={() => setShowMethod(false)}
            >
              <X size={22} />
            </button>
            <span className="eyebrow">MODELO EDUCATIVO</span>
            <h2>Interpretar antes de concluir.</h2>
            <p>
              El modelo aproxima el crecimiento del foco, la transferencia de
              calor y humo entre compartimentos y la disponibilidad de recursos.
              Cada escenario utiliza condiciones iniciales y constantes
              ilustrativas.
            </p>
            <p>
              Los controles permiten comparar el efecto relativo de la
              ventilación, el aislamiento, la supresión y el respaldo. El
              contador de refugio depende de reglas simplificadas de acceso y
              exposición.
            </p>
            <p>
              Las cifras del simulador requieren validación para predecir un
              incendio real. Apollo 1 ocurrió en tierra. Apollo 13 se representa
              como una pérdida de recursos tras el fallo del tanque. Mir aporta
              el caso de incendio interior en microgravedad.
            </p>
            <button
              className="button primary"
              onClick={() => {
                setShowMethod(false);
                navigate("sources");
              }}
            >
              Consultar fuentes y método <ArrowRight size={16} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
function Range({
  label,
  value,
  unit,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span>
        {label}
        <strong>
          {value.toLocaleString("es", { maximumFractionDigits: 2 })}{" "}
          <small>{unit}</small>
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="range-limits">
        <span>{min}</span>
        <span>{max}</span>
      </span>
    </label>
  );
}
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="toggle-control">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track" />
    </label>
  );
}
function Telemetry({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div className={`telemetry ${color}`}>
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
      <div />
    </div>
  );
}
export default App;
