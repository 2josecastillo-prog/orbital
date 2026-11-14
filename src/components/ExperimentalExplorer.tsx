import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Database,
  ExternalLink,
  FileUp,
  Search,
} from "lucide-react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { investigations } from "../data/research";

type Row = Record<string, string>;
const numeric = (value: unknown) =>
  typeof value === "string" &&
  value.trim() !== "" &&
  Number.isFinite(Number(value));

export default function ExperimentalExplorer() {
  const [dataset, setDataset] = useState("PSI-25");
  const [rows, setRows] = useState<Row[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [x, setX] = useState("");
  const [y, setY] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [imported, setImported] = useState(false);
  const requestId = useRef(0);
  const study = investigations.find((item) => item.id === dataset)!;
  const numericHeaders = useMemo(
    () => headers.filter((header) => rows.some((row) => numeric(row[header]))),
    [headers, rows],
  );
  const filtered = useMemo(
    () =>
      rows.filter((row) =>
        Object.values(row)
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [rows, query],
  );
  const points = useMemo(
    () =>
      filtered
        .filter((row) => numeric(row[x]) && numeric(row[y]))
        .map((row, index) => ({
          x: Number(row[x]),
          y: Number(row[y]),
          test: row["Test #"] || row["Test"] || `Registro ${index + 1}`,
          material: row["Fuel Sample Material"] || "",
        })),
    [filtered, x, y],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / 20));
  const displayed = filtered.slice(page * 20, page * 20 + 20);

  function parse(text: string, title: string, local = false) {
    const result = Papa.parse<Row>(text, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (header) => header.trim(),
    });
    const fields = result.meta.fields || [];
    if (result.errors.length || fields.length < 2 || !result.data.length) {
      setError(
        "La tabla no se pudo interpretar. Revisa los encabezados, las comillas y el separador del CSV.",
      );
      setRows([]);
      setHeaders([]);
      return;
    }
    const columns = fields.filter((field) =>
      result.data.some((row) => numeric(row[field])),
    );
    setRows(result.data);
    setHeaders(fields);
    setName(title);
    setImported(local);
    setPage(0);
    setQuery("");
    setError("");
    setX(
      columns.find((column) => /initial O2/i.test(column)) || columns[0] || "",
    );
    setY(
      columns.find((column) => /final O2/i.test(column)) || columns[1] || "",
    );
  }

  useEffect(() => {
    const controller = new AbortController();
    const id = ++requestId.current;
    setLoading(true);
    setError("");
    fetch(study.resourceUrl!, { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error("No se pudo descargar la tabla seleccionada.");
        return response.text();
      })
      .then((text) => {
        if (id === requestId.current) parse(text, study.name);
      })
      .catch((reason) => {
        if (!controller.signal.aborted && id === requestId.current) {
          setError(reason.message);
          setRows([]);
        }
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    return () => controller.abort();
  }, [study]);

  return (
    <>
      <section className="panel dataset-header">
        <div>
          <span className="eyebrow">TABLAS ORIGINALES · NASA PSI</span>
          <label className="select-label">
            Investigación
            <select
              value={dataset}
              onChange={(event) => {
                setDataset(event.target.value);
                setImported(false);
              }}
              aria-label="Seleccionar dataset"
            >
              {investigations.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name} · {item.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="dataset-description">
          <h3>{imported ? name : study.fullName}</h3>
          <p>
            {imported
              ? "Archivo local. Verifica las unidades y la procedencia antes de interpretar los resultados."
              : study.limitations}
          </p>
          <span className="tag cyan">
            {imported ? "Archivo del usuario" : "CC0-1.0 · NASA PSI"}
          </span>
        </div>
        <div className="dataset-actions">
          <a className="button secondary" href={study.resourceUrl} download>
            <ArrowDownToLine size={15} /> Descargar CSV NASA
          </a>
          <label className="button secondary file-label">
            <FileUp size={15} /> Importar CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 10_000_000) {
                  setError("El tamaño máximo por archivo es 10 MB.");
                  return;
                }
                const id = ++requestId.current;
                setLoading(true);
                try {
                  const text = await file.text();
                  if (id === requestId.current) parse(text, file.name, true);
                } catch {
                  setError("No se pudo leer el archivo.");
                } finally {
                  if (id === requestId.current) setLoading(false);
                }
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="empty-state" role="status">
          <Database size={32} />
          <h3>Cargando tabla experimental…</h3>
        </div>
      ) : (
        rows.length > 0 && (
          <>
            <section className="panel experimental-chart">
              <div className="section-title">
                <div>
                  <span className="eyebrow">EXPLORACIÓN DE MEDICIONES</span>
                  <h2>{name}</h2>
                </div>
                <span className="tag lime">
                  {rows.length} registros originales
                </span>
              </div>
              {numericHeaders.length >= 2 ? (
                <>
                  <div className="data-controls">
                    <label>
                      Eje X
                      <select
                        value={x}
                        aria-label="Columna del eje X"
                        onChange={(event) => setX(event.target.value)}
                      >
                        {numericHeaders.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Eje Y
                      <select
                        value={y}
                        aria-label="Columna del eje Y"
                        onChange={(event) => setY(event.target.value)}
                      >
                        {numericHeaders.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="experimental-plot">
                    <ResponsiveContainer width="100%" height="100%">
                      <ScatterChart
                        margin={{ top: 25, right: 25, bottom: 35, left: 25 }}
                      >
                        <CartesianGrid stroke="#273b47" strokeDasharray="3 5" />
                        <XAxis
                          type="number"
                          dataKey="x"
                          name={x}
                          domain={["auto", "auto"]}
                          tick={{ fill: "#9aaeb9", fontSize: 11 }}
                          label={{
                            value: x,
                            position: "bottom",
                            fill: "#b0c5ce",
                            fontSize: 10,
                            offset: 15,
                          }}
                        />
                        <YAxis
                          type="number"
                          dataKey="y"
                          name={y}
                          domain={["auto", "auto"]}
                          tick={{ fill: "#9aaeb9", fontSize: 11 }}
                        />
                        <Tooltip
                          cursor={{ strokeDasharray: "3 4" }}
                          content={({ active, payload }) =>
                            active && payload?.length ? (
                              <div className="data-tooltip">
                                <strong>{payload[0].payload.test}</strong>
                                <span>
                                  {x} · {payload[0].payload.x}
                                </span>
                                <span>
                                  {y} · {payload[0].payload.y}
                                </span>
                                <span>{payload[0].payload.material}</span>
                              </div>
                            ) : null
                          }
                        />
                        <Scatter
                          name={name}
                          data={points}
                          fill="#bfdf9b"
                          fillOpacity={0.8}
                          isAnimationActive={false}
                        />
                      </ScatterChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="plot-footnote">
                    <span>
                      {points.length} pares numéricos de {filtered.length}{" "}
                      registros filtrados · los campos vacíos se omiten del
                      gráfico.
                    </span>
                    <span>Eje Y · {y}</span>
                  </div>
                </>
              ) : (
                <p className="muted">
                  Esta tabla contiene principalmente descriptores del ensayo.
                  Puedes consultarlos y descargarlos abajo.
                </p>
              )}
            </section>
            <section className="panel raw-data-panel">
              <div className="section-title">
                <h2>Registros experimentales</h2>
                <label className="search-field">
                  <Search size={15} />
                  <input
                    aria-label="Filtrar registros"
                    placeholder="Filtrar material, ensayo o investigador…"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(0);
                    }}
                  />
                </label>
              </div>
              <div className="raw-table-wrap">
                <table className="raw-table">
                  <thead>
                    <tr>
                      {headers.map((header) => (
                        <th key={header}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map((row, index) => (
                      <tr key={index}>
                        {headers.map((header) => (
                          <td key={header}>{row[header]?.trim() || "—"}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-pagination">
                <span>
                  {filtered.length} registros · página{" "}
                  {Math.min(page + 1, pageCount)} de {pageCount}
                </span>
                <button
                  className="icon-button"
                  disabled={page === 0}
                  aria-label="Página anterior"
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ArrowLeft size={16} />
                </button>
                <button
                  className="icon-button"
                  disabled={page >= pageCount - 1}
                  aria-label="Página siguiente"
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </section>
          </>
        )
      )}
      <div className="dataset-provenance">
        <a
          className="source-link"
          href={study.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ficha original en PSI <ExternalLink size={12} />
        </a>
        <a
          className="source-link"
          href={`/resources/${study.id}-metadata.json`}
          download
        >
          Metadatos de procedencia <ArrowDownToLine size={12} />
        </a>
        <span>Consulta del repositorio · 14 nov 2026</span>
      </div>
    </>
  );
}
