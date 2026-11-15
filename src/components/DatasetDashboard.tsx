import { ReferenceLink } from "./ReferenceLink";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { investigations } from "../data/research";
import { parseDataTable, type ImportedDataset } from "../lib/data-import";

const studies = investigations.filter((item) => item.resourceUrl);
const format = new Intl.NumberFormat("es", { maximumSignificantDigits: 6 });
type Table = ReturnType<typeof parseDataTable>;

export default function DatasetDashboard({
  imported,
}: {
  imported: ImportedDataset | null;
}) {
  const [tables, setTables] = useState<Record<string, Table> | null>(null);
  const [selected, setSelected] = useState(imported ? "local" : "PSI-25");
  const [column, setColumn] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled(
      studies.map(async (study) => {
        const response = await fetch(study.resourceUrl!, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Tabla no disponible");
        return [
          study.id,
          parseDataTable(await response.text(), "csv"),
        ] as const;
      }),
    ).then((results) => {
      if (!controller.signal.aborted) {
        setTables(
          Object.fromEntries(
            results.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : [],
            ),
          ),
        );
      }
    });
    return () => controller.abort();
  }, []);

  const study = studies.find((item) => item.id === selected);
  const table = selected === "local" ? imported : tables?.[selected];
  const valuesFor = (field: string) =>
    table?.rows.flatMap((row) => {
      const value = row[field]?.trim();
      return value && Number.isFinite(Number(value)) ? [Number(value)] : [];
    }) ?? [];
  const fields =
    table?.headers.filter((field) => valuesFor(field).length > 0) ?? [];
  const field = fields.includes(column) ? column : fields[0];
  const values = field ? valuesFor(field) : [];
  const min = values.reduce((low, value) => Math.min(low, value), Infinity);
  const max = values.reduce((high, value) => Math.max(high, value), -Infinity);
  const binCount =
    min === max ? 1 : Math.min(8, Math.ceil(Math.sqrt(values.length)));
  const scale = Math.max(Math.abs(min), Math.abs(max), 1);
  const span = max / scale - min / scale;
  const bins = values.length
    ? Array.from({ length: binCount }, (_, i) => {
        const boundary = (index: number) =>
          min * (1 - index / binCount) + max * (index / binCount);
        return {
          label: format.format(boundary(i)),
          range:
            min === max
              ? format.format(min)
              : `${format.format(boundary(i))} a ${format.format(boundary(i + 1))}`,
          count: 0,
        };
      })
    : [];
  for (const value of values) {
    const index =
      span > 0
        ? Math.min(
            binCount - 1,
            Math.max(
              0,
              Math.floor(((value / scale - min / scale) / span) * binCount),
            ),
          )
        : 0;
    bins[index].count++;
  }

  return (
    <section
      className="safety-card safety-section"
      aria-labelledby="dataset-dashboard-title"
    >
      <h2 id="dataset-dashboard-title">Datos experimentales</h2>
      <p>
        Indicadores calculados del archivo seleccionado. Estos datos se
        consultan aparte de los resultados del simulador.
      </p>
      {
        <>
          {tables && (
            <p>
              NASA PSI ·{" "}
              <strong>
                {Object.keys(tables).length}/{studies.length}
              </strong>{" "}
              tablas disponibles ·{" "}
              <strong>
                {format.format(
                  Object.values(tables).reduce(
                    (total, item) => total + item.rows.length,
                    0,
                  ),
                )}
              </strong>{" "}
              registros
            </p>
          )}
          <label className="field aegis-choice">
            Investigación
            <select
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setColumn("");
              }}
            >
              {imported && (
                <option value="local">
                  {imported.name} · Archivo importado
                </option>
              )}
              {studies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.id}
                </option>
              ))}
            </select>
          </label>
          {!table ? (
            <p role="status">
              {tables
                ? "Esta tabla no está disponible."
                : "Cargando tabla experimental…"}
            </p>
          ) : (
            <>
              <p>
                {table.rows.length} registros · {table.headers.length} columnas
              </p>
              {values.length ? (
                <>
                  <label className="field aegis-choice">
                    Variable
                    <select
                      value={field}
                      onChange={(event) => setColumn(event.target.value)}
                    >
                      {fields.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <dl className="aegis-telemetry">
                    {[
                      ["Valores numéricos", values.length],
                      [
                        "Mínimo",
                        values.reduce(
                          (min, value) => Math.min(min, value),
                          Infinity,
                        ),
                      ],
                      [
                        "Promedio",
                        values.reduce((sum, value) => sum + value, 0) /
                          values.length,
                      ],
                      [
                        "Máximo",
                        values.reduce(
                          (max, value) => Math.max(max, value),
                          -Infinity,
                        ),
                      ],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt>{label}</dt>
                        <dd>{format.format(Number(value))}</dd>
                      </div>
                    ))}
                  </dl>
                  <h3>Distribución de los valores</h3>
                  <p className="hint">
                    Cada barra cuenta los registros en un intervalo de la
                    variable seleccionada.
                  </p>
                  <div className="safety-plot">
                    <ResponsiveContainer>
                      <BarChart data={bins}>
                        <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          width={40}
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          labelFormatter={(_, entries) =>
                            entries?.[0]?.payload?.range ?? ""
                          }
                        />
                        <Bar
                          dataKey="count"
                          name="Registros"
                          fill="var(--flight)"
                          radius={[6, 6, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p>La tabla no contiene columnas numéricas.</p>
              )}
              <p>{study?.limitations}</p>
              {study && (
                <ReferenceLink
                  url={study.sourceUrl}
                  label="NASA PSI · Ficha de la investigación"
                />
              )}
              {study && (
                <a className="source-link" href={study.resourceUrl} download>
                  Descargar CSV de origen
                </a>
              )}
            </>
          )}
        </>
      }
    </section>
  );
}
