import {
  aegisParameters,
  aegisSources,
  rackDesigns,
  type AegisTelemetry,
  type RackDesign,
} from "../lib/aegis";

const materials = [
  {
    name: "Aleación de aluminio 2219",
    area: "Casco presurizado",
    properties:
      "Soldable y de baja masa estructural relativa. Conduce el calor y pierde resistencia al calentarse.",
    reason:
      "Es candidata para contener la presión. El casco queda separado del gabinete caliente. Sus soldaduras, fatiga y espesores requieren cálculo y ensayo.",
    source: aegisSources.structure,
    link: "Informe de estructuras de la NASA",
  },
  {
    name: "Acero inoxidable y barrera de mica",
    area: "Gabinete de baterías",
    properties:
      "El acero aporta rigidez y contención. La mica aporta aislamiento eléctrico y dificulta la transferencia de calor entre subpaquetes.",
    reason:
      "El modelo cambia la conductancia térmica efectiva del conjunto al retirar la barrera. Los valores incluyen uniones y contacto térmico. Para dimensionarlo hacen falta ensayos del paquete y de la contención de gases.",
    source: aegisSources.battery,
    link: "Investigación de propagación térmica",
  },
  {
    name: "Manta multicapa con cubierta de tejido Beta",
    area: "Exterior",
    properties:
      "Las capas reflectantes reducen el intercambio radiativo en vacío. El tejido Beta protege el conjunto exterior.",
    reason:
      "Estabiliza la carga térmica exterior. Su efecto queda fuera del balance de incendio interno.",
    source: aegisSources.blankets,
    link: "Materiales de blindaje de la NASA",
  },
  {
    name: "Paneles metálicos y cableado de baja propagación",
    area: "Hábitat e interiores",
    properties:
      "El metal limita el combustible expuesto. Los recubrimientos, aislantes y sellos deben evaluarse en su montaje final.",
    reason:
      "La selección reduce rutas de propagación. Las pruebas deben usar la presión, concentración de oxígeno y configuración previstas. El modelo usa rendimientos agregados de emisión.",
    source: aegisSources.materials,
    link: "NASA-STD-6001",
  },
];

const systems = [
  [
    "Detección y corte eléctrico",
    "La alarma abre el contactor de la batería. El corte elimina la alimentación externa, mientras la reacción interna de un subpaquete ya afectado agota su propia reserva. El retardo de detección se fija para este escenario.",
  ],
  [
    "Compuertas y ventilación por zonas",
    "La ventilación compartida se aísla con la alarma. La compuerta al hábitat espera que la ruta quede libre. El modelo conserva una fuga residual tras el cierre.",
  ],
  [
    "Enfriamiento del gabinete",
    "El agua extrae calor del gabinete y de los subpaquetes. El caudal y la reserva limitan el enfriamiento. Evalúa un sistema local de enfriamiento conceptual.",
  ],
  [
    "Refugio y soporte vital independiente",
    "El refugio se sella al reunir a la tripulación que puede desplazarse. El modelo descuenta energía, oxígeno y capacidad de retirar CO₂. También representa depuración de CO y partículas mediante tasas simplificadas.",
  ],
];

const number = new Intl.NumberFormat("es", { maximumFractionDigits: 1 });
const conductanceNumber = new Intl.NumberFormat("es", { maximumFractionDigits: 3 });

export default function AegisDesign({
  design = "separated",
  onDesign,
  telemetry,
}: {
  design?: RackDesign;
  onDesign: (design: RackDesign) => void;
  telemetry: AegisTelemetry;
}) {
  const rack = rackDesigns[design];
  return (
    <section
      className="panel safety-card safety-section aegis-design"
      aria-labelledby="aegis-design-title"
    >
      <h2 id="aegis-design-title">Ingeniería de AEGIS</h2>
      <p>
        Prueba el diseño del gabinete con la misma atmósfera y protecciones. Los
        parámetros numéricos son supuestos del escenario, pendientes de
        calibración con ensayos.
      </p>
      <label className="field aegis-choice">
        Montaje de la batería
        <select
          value={design}
          onChange={(event) => onDesign(event.target.value as RackDesign)}
        >
          {Object.entries(rackDesigns).map(([value, item]) => (
            <option value={value} key={value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <p>
        Conductancia efectiva entre subpaquetes:{" "}
        {conductanceNumber.format(rack.conductance)}{" "}
        kW/K. Umbral de propagación del modelo: {aegisParameters.propagationC}{" "}
        °C.
      </p>
      <dl className="aegis-telemetry">
        {[
          ["Subpaquete inicial", `${number.format(telemetry.failedC)} °C`],
          ["Subpaquete vecino", `${number.format(telemetry.neighborC)} °C`],
          ["Potencia térmica interna", `${number.format(telemetry.packHeatKW)} kW`],
          ["Propagación registrada", telemetry.propagated ? "Sí" : "No"],
          ["Agua disponible", `${number.format(telemetry.waterKG)} kg`],
          ["Contactor", telemetry.feedCut ? "Abierto" : "Cerrado"],
          [
            "Conductos de servicio",
            telemetry.ductsClosed ? "Aislados" : "Comunicados",
          ],
          [
            "Oxígeno de reserva",
            `${number.format(telemetry.refugeOxygenPercent)} %`,
          ],
          [
            "Capacidad de filtrar CO₂",
            `${number.format(telemetry.refugeScrubberPercent)} %`,
          ],
          [
            "Batería del refugio",
            `${number.format(telemetry.refugeBatteryPercent)} %`,
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <details className="aegis-details">
        <summary>Materiales, propiedades y criterio de selección</summary>
        <div className="aegis-specs">
          {materials.map((item) => (
            <article key={item.name}>
              <h3>{item.name}</h3>
              <small>{item.area}</small>
              <p>
                {item.properties} {item.reason}
              </p>
              <a
                className="source-link"
                href={item.source}
                target="_blank"
                rel="noreferrer"
              >
                {item.link}
              </a>
            </article>
          ))}
        </div>
      </details>
      <details className="aegis-details">
        <summary>Sistemas y secuencia de respuesta</summary>
        <div className="aegis-specs">
          {systems.map(([title, description]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
        <p>
          <a
            className="source-link"
            href={aegisSources.fire}
            target="_blank"
            rel="noreferrer"
          >
            Protección contra incendios de la NASA
          </a>
          {" · "}
          <a
            className="source-link"
            href={aegisSources.life}
            target="_blank"
            rel="noreferrer"
          >
            Soporte vital de la ISS
          </a>
        </p>
      </details>
      <p className="hint">
        El ensayo cubre 15 minutos. Quedan fuera la pérdida estructural del
        casco, la química detallada de gases de batería y el rescate o retorno
        de la tripulación.
      </p>
    </section>
  );
}
