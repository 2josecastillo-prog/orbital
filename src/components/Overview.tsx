import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { historicalConfig, runSimulation, scenarioInfo, type ScenarioId } from "../lib/simulation";

type Go = (page: "lab" | "history" | "method" | "research") => void;

/** Home: the point of the project in one screen, for anyone, with a path for analysts. */
export default function Overview({ go, openCase }: { go: Go; openCase: (id: ScenarioId) => void }) {
  const cases = useMemo(
    () =>
      (["apollo1", "apollo13", "mir"] as ScenarioId[]).map((id) => ({
        id,
        info: scenarioInfo[id],
        outcome: runSimulation(historicalConfig(id)).outcome,
      })),
    [],
  );
  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="kicker">Seguridad contra incendios en naves espaciales</p>
          <h1>En una nave no hay a dónde huir del fuego.</h1>
          <p className="lead">
            Sin gravedad la llama es redonda y el humo no sube. En una cabina sellada una chispa se convierte en un incendio
            en segundos. Este laboratorio reconstruye con física tres accidentes reales para entender por qué murieron o
            sobrevivieron sus tripulaciones, y qué decisiones cambian el final.
          </p>
          <div className="hero-actions">
            <button className="button primary large" onClick={() => go("lab")}>
              Abrir el simulador <ArrowRight size={18} />
            </button>
            <button className="button secondary large" onClick={() => go("history")}>
              Conocer los accidentes
            </button>
          </div>
        </div>
        <figure className="flame-compare" aria-label="Llama en la Tierra y en órbita">
          <div>
            <span className="flame earth" />
            <figcaption>
              <strong>En la Tierra</strong>
              El aire caliente sube: llama alargada y amarilla.
            </figcaption>
          </div>
          <div>
            <span className="flame orbit" />
            <figcaption>
              <strong>En órbita</strong>
              Sin gravedad: llama redonda, azul y más lenta.
            </figcaption>
          </div>
        </figure>
      </section>

      <section className="case-strip" aria-label="Los tres casos">
        {cases.map(({ id, info, outcome }) => (
          <article key={id} className={`case-card ${outcome.level}`}>
            <header>
              <span className="case-year">{info.year}</span>
              <h2>{info.title}</h2>
            </header>
            <p>{info.hook}</p>
            <div className="case-outcome">
              <strong>
                {outcome.safe}/{outcome.crew}
              </strong>
              <span>sobrevivieron</span>
            </div>
            <button className="text-button" onClick={() => openCase(id)}>
              Simular este caso <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </section>

      <section className="how" aria-labelledby="how-title">
        <div className="how-intro">
          <h2 id="how-title">Qué hace la simulación</h2>
          <p>Tres capas, de la causa a la consecuencia. Todo se calcula segundo a segundo y se puede comprobar.</p>
          <button className="text-button" onClick={() => go("method")}>
            Ver el método completo <ArrowRight size={15} />
          </button>
        </div>
        <ol className="how-steps">
          <li>
            <strong>Fuego</strong>
            <span>Crece según el oxígeno, la presión, la ventilación y la gravedad.</span>
          </li>
          <li>
            <strong>Aire</strong>
            <span>Temperatura, monóxido de carbono, oxígeno, presión y humo en cada módulo.</span>
          </li>
          <li>
            <strong>Personas</strong>
            <span>Cada tripulante acumula una dosis de calor y gases hasta quedar afectado, inconsciente o a salvo.</span>
          </li>
        </ol>
      </section>

      <section className="audiences">
        <article>
          <h2>Si no conoces el tema</h2>
          <p>Empieza por los accidentes, luego abre el simulador y pulsa reproducir. La narración te cuenta qué pasa y el panel de la tripulación muestra cómo afecta a cada persona.</p>
          <button className="text-button" onClick={() => go("history")}>
            Empezar por la historia <ArrowRight size={15} />
          </button>
        </article>
        <article>
          <h2>Si eres analista</h2>
          <p>Modelo de zonas con dosis efectiva fraccional (ISO 13571), parámetros declarados, validación frente a los hitos históricos y datos exportables. Las 14 investigaciones de la NASA tienen sus tablas originales.</p>
          <button className="text-button" onClick={() => go("method")}>
            Ver método y validación <ArrowRight size={15} />
          </button>
        </article>
      </section>
    </div>
  );
}
