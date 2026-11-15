import { ExternalLink } from "lucide-react";
import { historicalCases } from "../data/research";
import { aegisSources } from "../lib/aegis";
import type { ScenarioId } from "../lib/simulation";

export const methodSources = {
  zones: "https://pages.nist.gov/cfast/",
  exposure: "https://www.iso.org/standard/56172.html",
};

export function ReferenceLink({ url, label }: { url: string; label: string }) {
  return <a className="source-link" href={url} target="_blank" rel="noreferrer">{label} <ExternalLink size={12} aria-hidden="true" /></a>;
}

export function ScenarioReference({ scenario }: { scenario: ScenarioId }) {
  const historical = historicalCases.find((item) => item.id === scenario);
  return historical
    ? <ReferenceLink url={historical.sourceUrl} label={`NASA · Informe sobre ${historical.title}`} />
    : <ReferenceLink url={aegisSources.battery} label="NASA · Investigación sobre fuga térmica" />;
}
