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
import Lab, { historicalConfig } from "./components/Lab";
import { investigations, sources, historicalCases } from "./data/research";
import {
  defaultConfig,
  runSimulation,
  type SimConfig,
  type ScenarioId,
} from "./lib/simulation";

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
  function changeScenario(scenario: ScenarioId) {
    setConfig(historicalConfig(scenario));
  }
  async function ask(text = question, detail = false) {
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
          detail,
          context: {
            scenario: config.scenario,
            conditions: config,
            simulationResult: runSimulation(config).outcome.title,
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
              <section className="start-here" aria-labelledby="start-title">
                <h2 id="start-title">Empieza aquí</h2>
                <p>
                  No hace falta saber de química ni de datos. En diez minutos
                  puedes entender por qué el fuego en una nave es tan
                  peligroso y qué decisiones salvan vidas.
                </p>
                <ol className="start-steps">
                  <li>
                    <button onClick={() => navigate("history")}>
                      <strong>Conoce tres accidentes reales</strong>
                      <span>Apollo 1, Apollo 13 y la estación Mir en un minuto cada uno.</span>
                    </button>
                  </li>
                  <li>
                    <button onClick={() => navigate("lab")}>
                      <strong>Revívelos en 3D y cambia el final</strong>
                      <span>Activa una protección y mira cuántas personas llegan a salvo.</span>
                    </button>
                  </li>
                  <li>
                    <button onClick={() => navigate("data")}>
                      <strong>Mira los ensayos de la NASA</strong>
                      <span>Cada punto del gráfico es un experimento hecho en órbita.</span>
                    </button>
                  </li>
                </ol>
                <dl className="glossary">
                  <div>
                    <dt>Microgravedad</dt>
                    <dd>En órbita todo flota. El aire caliente no sube, así que la llama es redonda, más lenta y a veces se ahoga sola.</dd>
                  </div>
                  <div>
                    <dt>Oxígeno disponible</dt>
                    <dd>Cuanto más oxígeno hay y más presión tiene, más rápido arde todo. Apollo 1 tenía 5 veces más que el aire normal.</dd>
                  </div>
                  <div>
                    <dt>Ventilación</dt>
                    <dd>En órbita, los ventiladores son lo único que mueve el aire. Apagarlos es uno de los primeros pasos ante un fuego.</dd>
                  </div>
                  <div>
                    <dt>Refugio</dt>
                    <dd>Un lugar separado, con aire y energía propios, al que la tripulación puede ir mientras pasa el peligro.</dd>
                  </div>
                </dl>
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
            <Lab
              config={config}
              onConfig={setConfig}
              onOpenMethod={() => setShowMethod(true)}
            />
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
                    "¿Por qué el fuego es distinto sin gravedad?",
                    "¿Apagar los ventiladores ayuda a apagar un incendio en órbita?",
                    "¿Qué aprendimos del incendio de la Mir?",
                    "¿Cómo se detecta el humo a tiempo en una nave?",
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
                    <AnswerText text={answer} />
                    <div className="answer-actions">
                      <button
                        className="button secondary"
                        disabled={asking}
                        onClick={() => void ask(question, true)}
                      >
                        Más detalle
                      </button>
                      <button
                        className="text-button"
                        onClick={() => {
                          setAnswer("");
                          setQuestion("");
                        }}
                      >
                        Hacer otra pregunta
                      </button>
                    </div>
                    {aiSources.length > 0 && <h4>Fuentes usadas</h4>}
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
            <h2>Cómo funciona el modelo</h2>
            <p>
              La nave se divide en tres compartimentos: donde empieza el fuego,
              el paso por el que hay que huir y el refugio. Cada segundo, el
              modelo calcula cuánto calor y humo produce el fuego y cuánto pasa
              al compartimento de al lado.
            </p>
            <p>
              El fuego crece más rápido con más oxígeno y más presión. Sin
              gravedad, el aire caliente no sube: si la ventilación es muy baja,
              la llama se queda sin oxígeno y se apaga, como se ha visto en los
              ensayos BASS y Saffire. En una cabina cerrada, el calor sube la
              presión; así se rompió el casco del Apollo 1.
            </p>
            <p>
              Una persona llega al refugio si la ruta tiene poco humo y poco
              calor. Es una regla simplificada: no mide la toxicidad ni
              garantiza la supervivencia. Las constantes son ilustrativas y no
              se han ajustado con los datos de la NASA, que se muestran aparte.
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
/** Renders short answers: plain sentences plus "- " bullets, with [ID] citations as chips. */
function AnswerText({ text }: { text: string }) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const cite = (line: string) =>
    line.split(/(\[[^\]]+\])/g).map((part, index) =>
      /^\[[^\]]+\]$/.test(part) ? (
        <span className="cite" key={index}>
          {part.slice(1, -1)}
        </span>
      ) : (
        part
      ),
    );
  const bullets = lines.filter((line) => /^[-•*]\s/.test(line));
  const prose = lines.filter((line) => !/^[-•*]\s/.test(line));
  return (
    <div className="answer-text">
      {prose.map((line, index) => (
        <p key={index}>{cite(line)}</p>
      ))}
      {bullets.length > 0 && (
        <ul>
          {bullets.map((line, index) => (
            <li key={index}>{cite(line.replace(/^[-•*]\s/, ""))}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
export default App;
