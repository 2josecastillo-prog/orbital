import AegisInfo from "./components/AegisInfo";
import type { ImportedDataset } from "./lib/data-import";
import { useEffect, useState, type ReactNode } from "react";
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
  Microscope,
  Orbit,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import ExperimentalExplorer from "./components/ExperimentalExplorer";
import ExperimentsLab from "./components/ExperimentsLab";
import Lab from "./components/Lab";
import Overview from "./components/Overview";
import SafetyDashboard from "./components/SafetyDashboard";
import Method from "./components/Method";
import { assistantName, identityQuestion, isIdentityQuestion } from "./lib/kuma";
import { investigations, sources, historicalCases } from "./data/research";
import {
  defaultConfig,
  historicalConfig,
  runSimulation,
  type SimConfig,
  type ScenarioId,
} from "./lib/simulation";

type Page =
  | "safety"
  | "overview"
  | "lab"
  | "aegis"
  | "data"
  | "research"
  | "compare"
  | "history"
  | "experiments"
  | "method"
  | "assistant"
  | "sources";
type Investigation = (typeof investigations)[number];
const nav = [
  { id: "overview", label: "Inicio", icon: LayoutDashboard, group: "Inicio" },
  { id: "safety", label: "Panel de seguridad", icon: ShieldCheck, group: "Análisis" },
  { id: "history", label: "Los tres accidentes", icon: BookOpen, group: "Aprender" },
  { id: "experiments", label: "Simulador de experimentos", icon: Microscope, group: "Aprender" },
  { id: "lab", label: "Simulador", icon: Orbit, group: "Aprender" },
  { id: "aegis", label: "Información sobre AEGIS", icon: ShieldCheck, group: "Aprender" },
  { id: "method", label: "Cómo funciona", icon: SlidersHorizontal, group: "Aprender" },
  { id: "research", label: "Investigaciones", icon: FlaskConical, group: "Evidencia" },
  { id: "data", label: "Datos de ensayos", icon: Activity, group: "Evidencia" },
  { id: "compare", label: "Comparador", icon: Layers3, group: "Evidencia" },
  { id: "assistant", label: assistantName, icon: Sparkles, group: "Ayuda" },
  { id: "sources", label: "Fuentes y método", icon: Database, group: "Ayuda" },
] as const;
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
  const [importedDataset, setImportedDataset] = useState<ImportedDataset | null>(null);
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
    if (!detail) return;
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
  }, [detail]);

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
        inert={Boolean(detail)}
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
        <nav>
          {nav.map((item, index) => (
            <div key={item.id} className="nav-entry">
            {(index === 0 || nav[index - 1].group !== item.group) && (
              <span className="nav-group">{item.group}</span>
            )}
            <button
              className={cx("nav-item", page === item.id && "active")}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.id === "compare" && selected.length > 0 && (
                <b>{selected.length}</b>
              )}
            </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p>Datos abiertos de la NASA. Simulación educativa.</p>
          <button onClick={() => navigate("sources")}>
            <CircleHelp size={15} /> Cómo se hizo <ChevronRight size={14} />
          </button>
        </div>
      </aside>
      <div className="workspace" inert={Boolean(detail)}>
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
            <button
              className="icon-button"
              title="Buscar investigaciones"
              aria-label="Buscar investigaciones"
              onClick={() => navigate("research")}
            >
              <Search size={18} />
            </button>
          </div>
        </header>
        <main>
          {page === "safety" && (
            <SafetyDashboard
              importedDataset={importedDataset}
              config={config}
              onConfig={setConfig}
              openLab={() => navigate("lab")}
              openData={() => navigate("data")}
              openMethod={() => navigate("method")}
            />
          )}
          {page === "overview" && (
            <Overview
              go={navigate}
              openCase={(id) => {
                changeScenario(id);
                navigate("lab");
              }}
            />
          )}

          {page === "method" && <Method onOpenLab={() => navigate("lab")} />}

          {page === "experiments" && <ExperimentsLab onOpenLab={() => navigate("lab")} />}

          {page === "lab" && (
            <Lab
              config={config}
              onConfig={setConfig}
              onOpenMethod={() => navigate("method")}
              onOpenAegis={() => navigate("aegis")}
            />
          )}

          {page === "aegis" && (
            <AegisInfo config={config} onConfig={setConfig} onOpenLab={() => navigate("lab")} />
          )}

          {page === "research" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Investigaciones de la NASA</h1>
                  <p>14 experimentos sobre cómo empieza, se detecta y se apaga el fuego en órbita.</p>
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
                      <span>Combustible</span>
                      <strong>{item.fuel}</strong>
                      <span>Instalación</span>
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
                  <h1>Datos de los ensayos</h1>
                  <p>Las tablas originales de la NASA, con un gráfico para comparar dos medidas.</p>
                </div>
              </div>
              <ExperimentalExplorer onImport={setImportedDataset} onOpenDashboard={() => navigate("safety")} />
            </>
          )}
          {page === "compare" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>Comparador</h1>
                  <p>Pon hasta cuatro investigaciones lado a lado.</p>
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
                  <h1>Los tres accidentes</h1>
                  <p>Qué pasó, en qué orden y qué cambió después. Cada caso se puede revivir en el simulador.</p>
                </div>
              </div>
              <div className="history-list">
                {historicalCases.map((item) => (
                  <article className="history-card" key={item.id}>
                    <header className="history-head">
                      <span className="history-year">{item.year}</span>
                      <div>
                        <h2>{item.title}</h2>
                        <p className="history-meta">{item.date} · {item.place}</p>
                        <p className="history-meta">Tripulación: {item.crew}</p>
                      </div>
                    </header>
                    <p className="history-summary">{item.summary}</p>
                    <div className="history-grid">
                      <div>
                        <h3>Cronología</h3>
                        <ol className="history-timeline">
                          {item.timeline.map(([when, what]) => (
                            <li key={when}>
                              <time>{when}</time>
                              <span>{what}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div>
                        <h3>Qué cambió después</h3>
                        <ul className="history-changes">
                          {item.changes.map((change) => (
                            <li key={change}>
                              <Check size={14} /> {change}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <div className="lesson">
                      <ShieldCheck size={18} />
                      <p>{item.lesson}</p>
                    </div>
                    <div className="history-actions">
                      <button
                        className="button primary"
                        onClick={() => {
                          changeScenario(item.id);
                          navigate("lab");
                        }}
                      >
                        Revivir en 3D <ArrowRight size={15} />
                      </button>
                      <SourceLink url={item.sourceUrl}>Informe de la NASA</SourceLink>
                    </div>
                  </article>
                ))}
              </div>
              <section className="concept-banner">
                <ShieldCheck size={30} />
                <div>
                  <h2>AEGIS: una nave con las tres lecciones</h2>
                  <p>Una nave conceptual con compuertas automáticas, agua nebulizada y un refugio con aire propio, frente a un incendio moderno: una batería de iones de litio.</p>
                </div>
                <button
                  className="button primary"
                  onClick={() => {
                    changeScenario("aegis");
                    navigate("lab");
                  }}
                >
                  Probar AEGIS <ArrowRight size={16} />
                </button>
              </section>
            </>
          )}

          {page === "assistant" && (
            <>
              <div className="page-heading">
                <div>
                  <h1>{assistantName}</h1>
                  <p>Asistente de Orbital Fire Lab. Respuestas breves con fuentes del catálogo.</p>
                </div>
                <span className={cx("tag", aiConfigured ? "lime" : "peach")}>
                  {!aiChecked
                    ? "Comprobando conexión"
                    : aiConfigured
                      ? "Gemini conectado"
                      : "Sin conectar"}
                </span>
              </div>
              <section className="assistant-panel">
                <div className="prompt-grid">
                  {[
                    identityQuestion,
                    "¿Por qué el fuego es distinto sin gravedad?",
                    "¿Apagar los ventiladores ayuda a apagar un incendio en órbita?",
                    "¿Qué aprendimos del incendio de la Mir?",
                    "¿Cómo se detecta el humo a tiempo en una nave?",
                  ].map((text) => (
                    <button
                      key={text}
                      onClick={() => {
                        setQuestion(text);
                        if (aiConfigured || isIdentityQuestion(text)) void ask(text);
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
                      <strong>Las consultas científicas de Kuma requieren conexión con Gemini</strong>
                      <p>
                        Guárdala en el servidor como GEMINI_API_KEY. Mientras
                        tanto, puedes usar el resto del laboratorio.
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
                    aria-label="Pregunta para Kuma"
                    placeholder="Kuma, ¿por qué el humo no sube en órbita?"
                    value={question}
                    maxLength={2000}
                    onChange={(e) => setQuestion(e.target.value)}
                  />
                  <div>
                    <span>Respuestas de unas 90 palabras, con fuentes</span>
                    <button
                      className="button primary"
                      disabled={
                        asking || question.trim().length < 3 ||
                        (!aiConfigured && !isIdentityQuestion(question))
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
                      <Sparkles size={17} /> Respuesta de {assistantName}
                    </div>
                    <AnswerText text={answer} />
                    <div className="answer-actions">
                      {!isIdentityQuestion(question) && <button
                        className="button secondary"
                        disabled={asking}
                        onClick={() => void ask(question, true)}
                      >
                        Más detalle
                      </button>}
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
                  <h1>Fuentes y método</h1>
                  <p>De dónde sale cada dato y qué puede y qué no puede decir el simulador.</p>
                </div>
              </div>
              <div className="method-grid">
                <section className="panel">
                  <Database size={22} />
                  <h3>Datos reales</h3>
                  <p>Las 14 tablas son copias sin modificar de NASA Physical Sciences Informatics (licencia CC0). Las casillas vacías se dejan vacías.</p>
                </section>
                <section className="panel">
                  <Orbit size={22} />
                  <h3>Simulación educativa</h3>
                  <p>Modelo de zonas con balance de gases y dosis ISO 13571, contrastado con los tres accidentes. Sirve para entender y comparar decisiones; no certifica una nave.</p>
                </section>
                <section className="panel">
                  <Sparkles size={22} />
                  <h3>{assistantName}</h3>
                  <p>Kuma usa Gemini para consultar las fichas del catálogo y citar sus fuentes. Revisa siempre la referencia original.</p>
                </section>
              </div>
              <section className="panel sources-panel">
                <div className="section-title">
                  <h2>Fuentes</h2>
                  <span className="muted">{sources.length} recursos</span>
                </div>
                {sources.map((source) => (
                  <div className="source-row" key={source.id}>
                    <div className="source-type">
                      <BookOpen size={18} />
                    </div>
                    <div>
                      <span className="source-kind">{source.kind}</span>
                      <h3>{source.title}</h3>
                      <p>{source.description}</p>
                    </div>
                    <SourceLink url={source.url}>Abrir</SourceLink>
                  </div>
                ))}
              </section>
              <section className="panel method-detail">
                <h2>Informes técnicos</h2>
                <div className="resource-downloads">
                  <SourceLink url="https://www.nasa.gov/wp-content/uploads/2016/05/np-2015-10-034-jsc_combustion_in_reduced_gravity-iss-mini-book-011116-508.pdf">Combustión en gravedad reducida · NASA</SourceLink>
                  <SourceLink url="https://ntrs.nasa.gov/api/citations/20210011385/downloads/TM-20210011385.pdf">Informe BASS-II · NASA NTRS</SourceLink>
                  <SourceLink url="https://ntrs.nasa.gov/api/citations/20220002714/downloads/Model%20Development%20of%20Large-Scale%20Spacecraft%20Fires%20during%20the%20Saffire-IV%20Experiments.pdf">Modelado de Saffire-IV · NASA NTRS</SourceLink>
                </div>
                <p className="muted">Tablas consultadas el 14 de noviembre de 2026. La clasificación en prevención, detección y supresión es editorial. Fotografía de la Tierra: NASA ISS063-E-058598.</p>
              </section>
              <section className="panel method-detail">
                <h2>Cómo leer la simulación</h2>
                <ul className="plain-list">
                  <li>Apollo 1, Mir y AEGIS se calculan segundo a segundo; Apollo 13, en pasos de 30 minutos durante las 90 horas del regreso.</li>
                  <li>La dosis de cada persona suma calor, monóxido de carbono, falta de oxígeno y CO₂ (ISO 13571): 0,3 afecta, 1 deja inconsciente, 3 se toma como letal.</li>
                  <li>La visibilidad sale del hollín en el aire. «A salvo» significa que la persona llegó a una zona con aire respirable.</li>
                  <li>La Luna y Marte son una extrapolación: hay pocos ensayos de fuego con gravedad parcial.</li>
                </ul>
                <button
                  className="button secondary"
                  onClick={() =>
                    download(
                      "metodo-y-configuracion.json",
                      JSON.stringify(
                        {
                          purpose: "Comparación educativa de escenarios con un modelo de zonas; sin validación para ingeniería",
                          model: "Zonas por módulo (O₂, N₂, CO₂, CO, hollín, T, P) + dosis efectiva fraccional ISO 13571 / Purser",
                          units: { pressure: "kPa", oxygen: "% volumétrico", airflow: "m/s", gravity: "g", temperature: "°C", CO: "ppm", visibility: "m", dose: "FED adimensional" },
                          config,
                          sourceFiles: ["src/lib/simulation.ts", "src/data/research.ts"],
                        },
                        null,
                        2,
                      ),
                    )
                  }
                >
                  <ArrowDownToLine size={15} /> Descargar supuestos y unidades
                </button>
              </section>
            </>
          )}
          <footer className="page-footer">
            <span>
              <Orbit size={14} /> ORBITAL FIRE LAB
            </span>
            <span>NASA Space Apps Challenge</span>
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
