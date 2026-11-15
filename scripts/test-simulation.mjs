import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

await mkdir("work", { recursive: true });
await build({
  entryPoints: ["src/lib/simulation.ts"],
  outfile: "work/simulation-test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  logLevel: "error",
});
const { runSimulation, historicalConfig, whatIfs, scenarioInfo, FRAMES, heatTime, co2Time } = await import(
  pathToFileURL(resolve("work/simulation-test.mjs")).href
);

// ---- 1. Physical sanity for every scenario and protection combination
let runs = 0;
for (const scenario of Object.keys(scenarioInfo)) {
  for (const mask of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const config = { ...historicalConfig(scenario), isolation: !!(mask & 1), suppression: !!(mask & 2), backup: !!(mask & 4) };
    const { frames, outcome } = runSimulation(config);
    assert.equal(frames.length, FRAMES);
    assert.deepEqual(frames, runSimulation(config).frames, "deterministic replay");
    for (const frame of frames) {
      for (const m of frame.modules) {
        assert.ok(Number.isFinite(m.temperature) && m.temperature > -200 && m.temperature < 1200, `${scenario} temperature`);
        assert.ok(m.co >= 0 && m.co < 200000, `${scenario} CO`);
        assert.ok(m.visibility >= 0 && m.visibility <= 30);
      }
      for (const c of frame.crewStatus) assert.ok(c.fed >= 0 && Number.isFinite(c.fed));
    }
    // Dose never decreases and nobody "recovers" from a lethal dose.
    for (let i = 0; i < scenarioInfo[scenario].crew; i++) {
      for (let f = 1; f < frames.length; f++) {
        assert.ok(frames[f].crewStatus[i].fed >= frames[f - 1].crewStatus[i].fed - 1e-9);
        if (frames[f - 1].crewStatus[i].state === "lethal") assert.equal(frames[f].crewStatus[i].state, "lethal");
      }
    }
    assert.equal(outcome.safe + outcome.incapacitated + outcome.lethal, scenarioInfo[scenario].crew);
    runs++;
  }
}

// ---- 2. Tenability models (ISO 13571 / Purser)
assert.ok(heatTime(120) > 3 && heatTime(120) < 6, "~4 min to incapacitation at 120 °C");
assert.ok(heatTime(200) < 1, "< 1 min at 200 °C");
assert.ok(co2Time(7) > 10 && co2Time(7) < 15);

// ---- 3. Historical validation
const a1 = runSimulation(historicalConfig("apollo1"));
const call = a1.events.find((e) => e.kind === "detection");
const rupture = a1.events.find((e) => e.kind === "rupture");
assert.ok(rupture, "Apollo 1 hull ruptures");
assert.ok(rupture.time - call.time >= 8 && rupture.time - call.time <= 20, `rupture ~15 s after the call (got ${rupture.time - call.time})`);
assert.equal(a1.outcome.lethal, 3, "Apollo 1 as in 1967: the three crew members die");
assert.equal(runSimulation({ ...historicalConfig("apollo1"), isolation: true }).outcome.lethal, 0, "a quick-opening hatch saves them");

const mir = runSimulation(historicalConfig("mir"));
assert.equal(mir.outcome.lethal + mir.outcome.incapacitated, 0, "Mir as in 1997: everybody survives");
assert.ok(mir.events.some((e) => e.kind === "burnout"), "the candle burns out by itself");
assert.ok(Math.min(...mir.frames.map((f) => f.modules[1].visibility)) < 3, "dense smoke in the base block");

const a13 = runSimulation(historicalConfig("apollo13"));
assert.equal(a13.outcome.lethal, 0, "Apollo 13 as in 1970: they come home");
const alarm = a13.events.find((e) => e.kind === "co2alarm");
const hoursToAlarm = (alarm.time - 3600) / 3600;
assert.ok(hoursToAlarm > 20 && hoursToAlarm < 28, `CO₂ alarm near 24.6 h (got ${hoursToAlarm})`);
assert.equal(runSimulation({ ...historicalConfig("apollo13"), backup: false }).outcome.lethal, 3, "without the LM nobody survives");
assert.equal(runSimulation({ ...historicalConfig("apollo13"), suppression: false }).outcome.lethal, 3, "without the CO₂ adapter nobody survives");

const aegis = runSimulation(historicalConfig("aegis"));
assert.equal(aegis.outcome.lethal + aegis.outcome.incapacitated, 0, "AEGIS design protects the crew");
const aegisBase = historicalConfig("aegis");
const unprotected = { ...aegisBase, isolation: false, suppression: false, backup: false };
const bare = runSimulation({ ...unprotected, aegisRack: "shared" });
const passiveOnly = runSimulation(unprotected);
assert.equal(aegis.frames.at(-1).aegis.propagated, false);
assert.equal(passiveOnly.frames.at(-1).aegis.propagated, false);
assert.equal(bare.frames.at(-1).aegis.propagated, true, "shared rack can propagate");
assert.ok(bare.events.some((event) => event.kind === "propagation"));
assert.ok(Math.max(...bare.frames.map((frame) => frame.modules[1].co)) >
  Math.max(...passiveOnly.frames.map((frame) => frame.modules[1].co)),
  "propagation raises peak exposure in the habitat");
assert.ok(aegis.frames.some((frame) => frame.aegis.feedCut && frame.aegis.packHeatKW > 0),
  "opening the contactor does not end active thermal runaway");
assert.ok(aegis.frames.at(-1).aegis.waterKG < aegis.frames[0].aegis.waterKG);
assert.equal(passiveOnly.frames.at(-1).aegis.waterKG, passiveOnly.frames[0].aegis.waterKG);
assert.ok(aegis.frames.at(-1).aegis.refugeBatteryPercent < 100);
assert.equal(passiveOnly.frames.at(-1).aegis.refugeBatteryPercent, 100);
for (const { aegis: systems } of aegis.frames) {
  assert.ok(systems.waterKG >= 0 && systems.waterKG <= 5);
  for (const reserve of [systems.refugeBatteryPercent, systems.refugeOxygenPercent, systems.refugeScrubberPercent]) {
    assert.ok(Number.isFinite(reserve) && reserve >= 0 && reserve <= 100);
  }
}
assert.ok(runSimulation({ ...historicalConfig("aegis"), airflow: 0, isolation: false, suppression: false, backup: false }).events.some((e) => e.kind === "starved"), "microgravity flame starves without airflow");

// ---- 4. No one survives extreme heat
for (const scenario of ["apollo1", "aegis"]) {
  const { frames } = runSimulation({ ...historicalConfig(scenario), isolation: false, suppression: false, backup: false });
  for (const frame of frames) {
    frame.crewStatus.forEach((c, i) => {
      const hot = frames.slice(0, frame.index + 1).filter((f) => f.modules[f.crewStatus[i].module].temperature >= 200).length;
      if (hot * scenarioInfo[scenario].timeStep >= 120) assert.ok(c.fed >= 1, `${scenario}: ${c.role} cannot stay conscious after 2 min above 200 °C, even in a suit`);
    });
  }
}
assert.ok(whatIfs(historicalConfig("apollo1")).some((w) => w.delta > 0), "what-ifs show improvements");

console.log(`Simulation checks passed: ${runs} configurations, tenability models and historical validation (Apollo 1, Mir, Apollo 13, AEGIS).`);
