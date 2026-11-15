import SafetyCharts from "./SafetyCharts";
import {
  ScenarioReference,
  ReferenceLink,
  methodSources,
} from "./ReferenceLink";
import type { ImportedDataset } from "../lib/data-import";
import DatasetDashboard from "./DatasetDashboard";
import AegisDesign from "./AegisDesign";
import { useMemo, useState } from "react";
import { ArrowUpRight, ShieldCheck, FileUp } from "lucide-react";
import { historicalCases } from "../data/research";
import {
  historicalConfig,
  runSimulation,
  scenarioInfo,
  stateText,
  type Protection,
  type ScenarioId,
  type SimConfig,
} from "../lib/simulation";
import "./safety-dashboard.css";

const scenarios: ScenarioId[] = ["apollo1", "apollo13", "mir", "aegis"];
const protections: Protection[] = ["isolation", "suppression", "backup"];
const number = new Intl.NumberFormat("es", { maximumFractionDigits: 2 });

export default function SafetyDashboard({
  importedDataset,
  config,
  onConfig,
  openLab,
  openData,
  openMethod,
}: {
  importedDataset: ImportedDataset | null;
  config: SimConfig;
  onConfig: (config: SimConfig) => void;
  openLab: () => void;
  openData: () => void;
  openMethod: () => void;
}) {
  const [step, setStep] = useState<number | null>(null);
  const info = scenarioInfo[config.scenario];
  const referenceConfig = useMemo(
    () => historicalConfig(config.scenario),
    [config.scenario],
  );
  const reference = useMemo(
    () => runSimulation(referenceConfig),
    [referenceConfig],
  );
  const current = useMemo(() => runSimulation(config), [config]);
  const impact = useMemo(
    () =>
      protections.map((key) => ({
        key,
        outcome: runSimulation({ ...config, [key]: !config[key] }).outcome,
      })),
    [config],
  );
  const final = current.frames[current.frames.length - 1];
  const active =
    current.frames[Math.min(step ?? final.index, current.frames.length - 1)] ??
    final;
  const source = historicalCases.find((item) => item.id === config.scenario);
  const { outcome } = current;

  return (
    <div className="safety-dashboard">
      <header className="safety-heading">
        <div>
          <p className="safety-label">
            <ShieldCheck size={16} /> Orbital Fire Lab
          </p>
          <h1>Panel de seguridad</h1>
          <p>
            Compara condiciones, exposición de la tripulación y respuesta ante
            un incidente.
          </p>
        </div>
        <div className="safety-heading-actions">
          <button className="button secondary" onClick={openData}>
            <FileUp size={16} /> Importar datos
          </button>
          <button className="button primary" onClick={openLab}>
            Abrir simulador 3D <ArrowUpRight size={16} />
          </button>
        </div>
      </header>

      <section
        className="safety-card safety-controls"
        aria-labelledby="safety-scenario"
      >
        <div>
          <label id="safety-scenario" htmlFor="safety-select">
            Escenario
          </label>
          <select
            id="safety-select"
            value={config.scenario}
            onChange={(e) => {
              setStep(null);
              onConfig(historicalConfig(e.target.value as ScenarioId));
            }}
          >
            {scenarios.map((id) => (
              <option key={id} value={id}>
                {scenarioInfo[id].title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <h2>{info.hazard}</h2>
          <p>
            O₂ {number.format(config.oxygen)} % ·{" "}
            {number.format(config.pressure)} kPa · Ventilación{" "}
            {number.format(config.airflow)} m/s ·{" "}
            {number.format(config.gravity)} g
          </p>
        </div>
        <button
          className="button secondary"
          onClick={() => {
            setStep(null);
            onConfig(referenceConfig);
          }}
        >
          Restaurar referencia
        </button>
      </section>

      <p className="safety-note">
        Resultados del modelo educativo. Los umbrales sirven para comparar
        simulaciones. La supervivencia real requiere validación independiente.{" "}
        <button className="text-button" onClick={openMethod}>
          Ver método
        </button>
      </p>

      {importedDataset && <DatasetDashboard imported={importedDataset} />}
      <section
        className="safety-kpis"
        aria-label="Resultados al final de la simulación"
      >
        {[
          [
            "Podían actuar al final",
            outcome.safe + "/" + outcome.crew,
            "Referencia " +
              reference.outcome.safe +
              "/" +
              reference.outcome.crew,
          ],
          [
            "Vivos, sin poder actuar",
            outcome.incapacitated,
            "Referencia " + reference.outcome.incapacitated,
          ],
          [
            "Fallecieron en la simulación",
            outcome.lethal,
            "Referencia " + reference.outcome.lethal,
          ],
          [
            "Mayor número de personas juntas en el refugio",
            Math.max(...current.frames.map((frame) => frame.refuge)) +
              "/" +
              outcome.crew,
            "Durante toda la simulación",
          ],
        ].map(([label, value, detail]) => (
          <article className="safety-card safety-kpi" key={label}>
            <h2>{label}</h2>
            <strong>{value}</strong>
            <p>{detail}</p>
          </article>
        ))}
      </section>

      <SafetyCharts
        frames={current.frames}
        outcome={outcome}
        reference={reference.outcome}
        hours={config.scenario === "apollo13"}
      />

      <div className="safety-grid">
        <section className="safety-card safety-section">
          <h2>Protecciones y alternativas</h2>
          <p>
            Activa cada protección para actualizar el panel. La última columna
            estima el resultado al invertir solo esa opción.
          </p>
          <div
            className="safety-scroll"
            tabIndex={0}
            role="region"
            aria-label="Comparación de protecciones"
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Protección</th>
                  <th scope="col">Configuración</th>
                  <th scope="col">Alternativa individual</th>
                </tr>
              </thead>
              <tbody>
                {impact.map(({ key, outcome: alternative }) => (
                  <tr key={key}>
                    <th scope="row">
                      {info.protections[key].label}
                      <small>{info.protections[key].help}</small>
                    </th>
                    <td>
                      <label className="safety-toggle">
                        <input
                          type="checkbox"
                          checked={config[key]}
                          aria-label={info.protections[key].label}
                          onChange={(e) =>
                            onConfig({ ...config, [key]: e.target.checked })
                          }
                        />
                        {config[key] ? "Activa" : "Inactiva"}
                      </label>
                    </td>
                    <td>
                      {config[key] ? "Al desactivar" : "Al activar"}
                      <small>
                        {alternative.safe}/{alternative.crew} sin incapacitación
                        al cierre · {alternative.lethal} fallecimientos
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="safety-card safety-section">
          <h2>Variables críticas</h2>
          <ReferenceLink
            url={methodSources.exposure}
            label="ISO · Referencia sobre exposición"
          />
          <p>Extremos durante la simulación y umbrales del modelo.</p>
          <dl className="safety-limits">
            {outcome.peaks.map((metric) => (
              <div key={metric.label}>
                <dt>
                  {metric.label}
                  <small>Umbral {metric.limit}</small>
                </dt>
                <dd>
                  <strong>{metric.value}</strong>
                  <small>
                    Referencia{" "}
                    {reference.outcome.peaks.find(
                      (peak) => peak.label === metric.label,
                    )?.value ?? "—"}
                  </small>
                  <small className={metric.exceeded ? "safety-alert" : ""}>
                    {metric.exceeded ? "Alerta del modelo" : "Sin alerta"}
                  </small>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <section className="safety-card safety-section">
        <h2>
          {active.life ? "Soporte vital y reservas" : "Condiciones por módulo"}
        </h2>
        <p>
          {active.clock} · {active.phase}
        </p>
        <input
          id="safety-timeline"
          className="safety-timeline"
          aria-label="Momento de la simulación"
          aria-valuetext={active.clock}
          type="range"
          min={0}
          max={current.frames.length - 1}
          value={active.index}
          onChange={(e) => setStep(Number(e.target.value))}
        />
        {active.life ? (
          <dl className="safety-limits">
            {[
              ["CO₂ en cabina", active.life.co2mmHg, "mmHg"],
              ["Temperatura de cabina", active.life.cabinTemp, "°C"],
              ["Capacidad restante del filtro", active.life.liohLeft, "%"],
              ["Batería del módulo de mando", active.life.cmBattery, "%"],
              ["Batería del módulo lunar", active.life.lmBattery, "%"],
            ].map(([label, value, unit]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {number.format(Number(value))} {unit}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <div
            className="safety-scroll"
            role="region"
            aria-label="Telemetría por módulo"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  {[
                    "Módulo",
                    "Temperatura",
                    "Presión",
                    "O₂",
                    "CO",
                    "CO₂",
                    "Visibilidad",
                  ].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.modules.map((module) => (
                  <tr key={module.id}>
                    <th scope="row">{module.name}</th>
                    <td>{number.format(module.temperature)} °C</td>
                    <td>{number.format(module.pressure)} kPa</td>
                    <td>{number.format(module.o2)} %</td>
                    <td>{number.format(module.co)} ppm</td>
                    <td>{number.format(module.co2)} %</td>
                    <td>{module.visibilityText}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="safety-grid">
        <section className="safety-card safety-section">
          <h2>Tripulación al cierre</h2>
          <div
            className="safety-scroll"
            role="region"
            aria-label="Estado por tripulante"
            tabIndex={0}
          >
            <table>
              <thead>
                <tr>
                  <th scope="col">Tripulante</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Causa registrada</th>
                </tr>
              </thead>
              <tbody>
                {outcome.people.map((person) => (
                  <tr key={person.role}>
                    <th scope="row">{person.role}</th>
                    <td>{stateText[person.state]}</td>
                    <td>
                      {person.cause || "—"}{" "}
                      {person.when && <small>{person.when}</small>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="safety-card safety-section">
          <h2>Cronología del modelo</h2>
          <ScenarioReference scenario={config.scenario} />
          {current.events.length ? (
            <ol className="safety-events">
              {current.events.map((event, index) => (
                <li key={index}>
                  <button
                    className="text-button"
                    onClick={() => {
                      setStep(event.index);
                      document.getElementById("safety-timeline")?.focus();
                    }}
                  >
                    {current.frames[Math.min(event.index, final.index)]?.clock}{" "}
                    · {event.title}
                  </button>
                  <small>{event.detail}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p>Sin eventos registrados.</p>
          )}
        </section>
      </div>
      {!importedDataset && <DatasetDashboard imported={null} />}
      {active.aegis && (
        <AegisDesign
          design={config.aegisRack}
          onDesign={(aegisRack) => onConfig({ ...config, aegisRack })}
          telemetry={active.aegis}
        />
      )}
      {source && (
        <section className="safety-card safety-section">
          <h2>Lección del caso histórico</h2>
          <p>{source.lesson}</p>
          {source && (
            <a
              className="source-link"
              href={source.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Informe de la NASA <ArrowUpRight size={14} />
            </a>
          )}
        </section>
      )}
    </div>
  );
}
