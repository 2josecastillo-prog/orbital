import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SimFrame, SimOutcome } from "../lib/simulation";

const number = new Intl.NumberFormat("es", { maximumFractionDigits: 2 });
const chartColors = ["var(--flight-forest)", "var(--chart-mint)", "var(--chart-teal)"];

function ChartKey({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="safety-chart-key">
      {items.map(({ label, color }) => (
        <li key={label}>
          <span style={{ backgroundColor: color }} />
          {label}
        </li>
      ))}
    </ul>
  );
}

export default function SafetyCharts({
  frames,
  outcome,
  reference,
  hours,
}: {
  frames: SimFrame[];
  outcome: SimOutcome;
  reference: SimOutcome;
  hours: boolean;
}) {
  const [metric, setMetric] = useState<"co" | "temperature">("co");
  const names = frames[0].modules.map((module) => module.name);
  const history = useMemo(
    () =>
      frames.map((frame) => ({
        time: frame.sinceIncident / (hours ? 3600 : 60),
        ...Object.fromEntries(
          frame.modules.map((module, i) => [
            `module${i}`,
            hours ? (frame.life?.co2mmHg ?? 0) : module[metric],
          ]),
        ),
      })),
    [frames, hours, metric],
  );
  const unit = hours ? "mmHg" : metric === "co" ? "ppm" : "°C";
  const timeUnit = hours ? "h" : "min";
  const peaks = Math.max(...frames.map((frame) => frame.refuge));
  const fill = (100 * peaks) / outcome.crew;
  const comparison = [
    { name: "Actual", ...outcome },
    { name: "Referencia", ...reference },
  ];
  const states = [
    { key: "safe", label: "Podían actuar", color: "var(--flight)" },
    { key: "incapacitated", label: "Sin poder actuar", color: "#bc852d" },
    { key: "lethal", label: "Fallecieron", color: "#b65a50" },
  ];
  const series = hours ? ["Cabina ocupada"] : names;

  return (
    <div className="safety-chart-grid">
      <section className="safety-card safety-section safety-trend">
        <div className="safety-chart-heading">
          <div>
            <h2>Evolución del incidente</h2>
            <p>
              {hours ? "CO₂ en la cabina ocupada" : "Ambiente por módulo"} ·{" "}
              {unit}
            </p>
          </div>
          {!hours && (
            <select
              aria-label="Variable del incidente"
              value={metric}
              onChange={(event) =>
                setMetric(
                  event.target.value === "temperature" ? "temperature" : "co",
                )
              }
            >
              <option value="co">Monóxido de carbono</option>
              <option value="temperature">Temperatura</option>
            </select>
          )}
        </div>
        <div className="safety-plot">
          <ResponsiveContainer>
            <AreaChart
              data={history}
              margin={{ left: 0, top: 12, right: 18, bottom: 0 }}
            >
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(value) => `${number.format(value)} ${timeUnit}`}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                width={51}
                tickFormatter={(value) => number.format(value)}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                labelFormatter={(value) =>
                  `${number.format(Number(value))} ${timeUnit} desde el incidente`
                }
                formatter={(value) => `${value} ${unit}`}
              />
              {series.map((name, i) => (
                <Area
                  key={name}
                  dataKey={`module${i}`}
                  name={name}
                  stroke={chartColors[i]}
                  strokeWidth={2}
                  fill={chartColors[i]}
                  fillOpacity={0.11}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <ChartKey
          items={series.map((label, i) => ({ label, color: chartColors[i] }))}
        />
      </section>

      <section className="safety-card safety-section">
        <h2>Ocupación del refugio</h2>
        <p>Máximo simultáneo durante la simulación</p>
        <div
          className="safety-ring"
          style={{ background: `conic-gradient(var(--flight) ${fill}%, var(--flight-soft) 0)` }}
          aria-hidden="true"
        >
          <span>
            <strong>
              {peaks}/{outcome.crew}
            </strong>
            <small>tripulantes</small>
          </span>
        </div>
        <p className="safety-refuge-caption">
          {peaks} de {outcome.crew} personas en el momento de mayor ocupación.
        </p>
      </section>

      <section className="safety-card safety-section safety-comparison">
        <h2>Resultados frente a la referencia</h2>
        <p>Estado de la tripulación al final de cada simulación</p>
        <div className="safety-plot safety-plot-compact">
          <ResponsiveContainer>
            <BarChart
              data={comparison}
              layout="vertical"
              margin={{ right: 16 }}
              barSize={26}
            >
              <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, outcome.crew]}
                allowDecimals={false}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                dataKey="name"
                type="category"
                width={85}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip />
              {states.map((state) => (
                <Bar
                  key={state.key}
                  dataKey={state.key}
                  name={state.label}
                  fill={state.color}
                  stackId="crew"
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <ChartKey items={states} />
      </section>
    </div>
  );
}
