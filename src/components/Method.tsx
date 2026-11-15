import { useMemo } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { apollo13Model, fireCases, historicalConfig, runSimulation, scenarioInfo } from "../lib/simulation";

const es = (value: number, digits = 0) => value.toLocaleString("es", { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** "Cómo funciona": the model in plain language, its equations, parameters and validation. */
export default function Method({ onOpenLab }: { onOpenLab: () => void }) {
  const validation = useMemo(() => {
    const a1 = runSimulation(historicalConfig("apollo1"));
    const call = a1.events.find((e) => e.kind === "detection")!;
    const rupture = a1.events.find((e) => e.kind === "rupture");
    const peakP = Math.max(...a1.frames.map((f) => f.modules[0].pressure));
    const mir = runSimulation(historicalConfig("mir"));
    const mirVis = Math.min(...mir.frames.map((f) => f.modules[1].visibility));
    const a13 = runSimulation(historicalConfig("apollo13"));
    const alarm = a13.events.find((e) => e.kind === "co2alarm");
    const a13noLm = runSimulation({ ...historicalConfig("apollo13"), backup: false });
    return [
      {
        case: "Apollo 1",
        item: "Rotura del casco tras el aviso de fuego",
        history: "≈ 14 s",
        model: rupture ? `${Math.round(rupture.time - call.time)} s` : "—",
        ok: !!rupture && Math.abs(rupture.time - call.time - 14) <= 6,
      },
      { case: "Apollo 1", item: "Presión de rotura", history: "≈ 200 kPa", model: `${es(peakP)} kPa (pico registrado)`, ok: peakP > 180 },
      { case: "Apollo 1", item: "Supervivientes", history: "0 de 3", model: `${a1.outcome.safe} de 3`, ok: a1.outcome.safe === 0 },
      { case: "Mir", item: "Supervivientes", history: "6 de 6", model: `${mir.outcome.safe} de 6`, ok: mir.outcome.safe === 6 },
      { case: "Mir", item: "Humo denso en la estación", history: "Visibilidad casi nula", model: mirVis < 1 ? "< 1 m" : `${es(mirVis)} m`, ok: mirVis < 3 },
      {
        case: "Apollo 13",
        item: "Alarma de CO₂ (7,5 mmHg) tras la explosión",
        history: "≈ 24,6 h",
        model: alarm ? `${es((alarm.time - 3600) / 3600, 1)} h` : "—",
        ok: !!alarm && Math.abs((alarm.time - 3600) / 3600 - 24.6) < 3,
      },
      { case: "Apollo 13", item: "Supervivientes con el módulo lunar", history: "3 de 3", model: `${a13.outcome.safe} de 3`, ok: a13.outcome.safe === 3 },
      { case: "Apollo 13", item: "Sin módulo lunar", history: "Sin opción de volver (análisis de la NASA)", model: `${a13noLm.outcome.lethal} de 3 sin regreso`, ok: a13noLm.outcome.lethal === 3 },
    ];
  }, []);
  const passed = validation.filter((v) => v.ok).length;

  return (
    <div className="method">
      <header className="page-head">
        <div>
          <h1>Cómo funciona la simulación</h1>
          <p>Un modelo físico sencillo y transparente. Cada número sale de una ecuación publicada o de un dato de las misiones.</p>
        </div>
        <button className="button primary" onClick={onOpenLab}>
          Abrir el simulador <ArrowRight size={16} />
        </button>
      </header>

      <section className="flow" aria-label="Las tres capas del modelo">
        <article>
          <span className="flow-step">1</span>
          <h2>El fuego</h2>
          <p>Crece como en los ensayos de incendios: cada vez más rápido. Con más oxígeno crece mucho más deprisa. Sin gravedad depende de la ventilación y, si el aire no se mueve, se ahoga.</p>
          <code>Q(t) = α · (pO₂ / 21,3 kPa)² · t²</code>
        </article>
        <article>
          <span className="flow-step">2</span>
          <h2>El aire de cada módulo</h2>
          <p>Cada módulo es una caja de gas con su volumen real. El fuego gasta oxígeno, produce monóxido de carbono, CO₂ y hollín, y calienta el aire. Si la nave está sellada, sube la presión.</p>
          <code>P = n·R·T / V   ·   visibilidad = 3 / (σ · hollín / V)</code>
        </article>
        <article>
          <span className="flow-step">3</span>
          <h2>Las personas</h2>
          <p>Cada tripulante acumula una «dosis» de calor, gases y falta de oxígeno según el módulo donde está. Es el método de la norma ISO 13571, el que usan los ingenieros de incendios.</p>
          <code>FED = Σ Δt / t_calor(T) + Σ CO·Δt / 35 000</code>
        </article>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Qué significa la dosis</h2>
        </div>
        <div className="dose-explainer">
          <div className="dose-bar-big">
            <i />
            <span style={{ left: "10%" }}>0,3</span>
            <span style={{ left: "33.3%" }}>1</span>
            <span style={{ right: 0 }}>3</span>
          </div>
          <dl className="dose-defs">
            <div>
              <dt>0,3 · Afectado</dt>
              <dd>Mareo, confusión y movimientos lentos. Es el umbral que la norma usa para proteger a personas sensibles.</dd>
            </div>
            <div>
              <dt>1 · Inconsciente</dt>
              <dd>Pierde el conocimiento y no puede escapar por sí mismo. Solo sobrevive si lo rescatan pronto.</dd>
            </div>
            <div>
              <dt>3 · Dosis letal</dt>
              <dd>Supuesto declarado del modelo: tres veces la dosis que deja inconsciente. Por encima no hay supervivencia.</dd>
            </div>
          </dl>
        </div>
        <div className="limits">
          <div>
            <strong>120 °C</strong>
            <span>Unos 4 min hasta perder el conocimiento</span>
          </div>
          <div>
            <strong>200 °C</strong>
            <span>Menos de 1 min</span>
          </div>
          <div>
            <strong>1 400 ppm CO</strong>
            <span>Peligro grave en 30 min</span>
          </div>
          <div>
            <strong>8 000 ppm CO</strong>
            <span>Pérdida de conocimiento en unos 4 min</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Validación frente a la historia</h2>
          <span className={passed === validation.length ? "badge ok" : "badge watch"}>
            {passed} de {validation.length} hitos reproducidos
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Caso</th>
                <th>Qué se compara</th>
                <th>Dato histórico</th>
                <th>Modelo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {validation.map((v) => (
                <tr key={v.case + v.item}>
                  <td>{v.case}</td>
                  <td>{v.item}</td>
                  <td>{v.history}</td>
                  <td className="mono">{v.model}</td>
                  <td>{v.ok ? <Check size={16} className="ok-icon" /> : <X size={16} className="bad-icon" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Parámetros de cada caso</h2>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Caso</th>
                <th>Volúmenes (m³)</th>
                <th>Fuego</th>
                <th>Rendimientos (kg/kg)</th>
                <th>Paso</th>
              </tr>
            </thead>
            <tbody>
              {(["apollo1", "mir", "aegis"] as const).map((id) => {
                const fc = fireCases[id];
                return (
                  <tr key={id}>
                    <td>{scenarioInfo[id].title}</td>
                    <td className="mono">{fc.volumes.join(" · ")}</td>
                    <td>{fc.selfOxidized ? `Vela de ${fc.qMax} kW con oxígeno propio` : `α = ${fc.alpha} kW/s² · máx. ${es(fc.qMax)} kW · ${fc.fuelMJ} MJ`}</td>
                    <td className="mono">CO {fc.yields.co} · hollín {fc.yields.soot}</td>
                    <td>{scenarioInfo[id].timeStep} s</td>
                  </tr>
                );
              })}
              <tr>
                <td>Apollo 13</td>
                <td className="mono">{apollo13Model.cmVolume} · {apollo13Model.lmVolume}</td>
                <td>Sin fuego en cabina: CO₂ de 3 personas ({apollo13Model.co2PerPerson} kg/h cada una)</td>
                <td className="mono">LiOH para {apollo13Model.lmLiohPersonHours} persona·h</td>
                <td>30 min</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <h2>Qué hace bien</h2>
          <ul className="plain">
            <li>Reproduce los desenlaces de los tres accidentes y sus hitos principales.</li>
            <li>Explica por qué: oxígeno, presión, gases, calor, rutas y tiempos.</li>
            <li>Permite comparar decisiones con las mismas reglas para todos los casos.</li>
          </ul>
        </div>
        <div>
          <h2>Qué no hace</h2>
          <ul className="plain">
            <li>No calcula el flujo detallado del aire (CFD): cada módulo está bien mezclado.</li>
            <li>No sustituye un análisis de seguridad ni certifica una nave.</li>
            <li>La dosis letal (3) y algunas constantes son supuestos declarados.</li>
          </ul>
        </div>
      </section>

      <section className="panel refs">
        <h2>Referencias del método</h2>
        <ul className="plain">
          <li>ISO 13571:2012 · Componentes letales del fuego. Estimación del tiempo hasta condiciones insostenibles.</li>
          <li>Purser, D. A. · Modelos de dosis efectiva fraccional para calor, CO, hipoxia y CO₂ (SFPE Handbook).</li>
          <li>NIST CFAST · Modelo de incendios por zonas en compartimentos.</li>
          <li>NFPA 72 · Curvas de crecimiento t²: media α = 0,012 y rápida α = 0,047 kW/s². Apollo 1 usa 0,017 en aire, escalado por el oxígeno.</li>
          <li>Informes de la NASA sobre Apollo 1, Apollo 13 y el incendio de la Mir.</li>
        </ul>
      </section>
    </div>
  );
}
