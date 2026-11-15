import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import AegisDesign from "./AegisDesign";
import { historicalConfig, runSimulation, type SimConfig } from "../lib/simulation";

const reference = historicalConfig("aegis");

export default function AegisInfo({ config, onConfig, onOpenLab }: {
  config: SimConfig;
  onConfig: (config: SimConfig) => void;
  onOpenLab: () => void;
}) {
  const design = config.scenario === "aegis" ? config : reference;
  const telemetry = useMemo(() => runSimulation(design).frames.at(-1)?.aegis, [design]);

  return (
    <>
      <header className="page-heading">
        <div>
          <h1>Información sobre AEGIS</h1>
          <p>Nave conceptual con módulos separados de servicio, hábitat y refugio.</p>
        </div>
        <button className="button primary" onClick={() => {
          onConfig(design);
          onOpenLab();
        }}>
          Simular AEGIS <ArrowUpRight size={16} />
        </button>
      </header>
      <p className="hint">Las lecturas de ingeniería corresponden al final del ensayo con el montaje seleccionado.</p>
      {telemetry && (
        <AegisDesign
          design={design.aegisRack}
          telemetry={telemetry}
          onDesign={(aegisRack) => onConfig({ ...design, aegisRack })}
        />
      )}
    </>
  );
}
