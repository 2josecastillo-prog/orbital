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
});
const { simulate, defaultConfig, scenarioInfo } = await import(
  pathToFileURL(resolve("work/simulation-test.mjs")).href
);
let scenarios = 0;
for (const scenario of Object.keys(scenarioInfo)) {
  for (const atmosphere of [
    { oxygen: 15, pressure: 30, airflow: 0, gravity: 0 },
    { oxygen: 100, pressure: 120, airflow: 0.5, gravity: 1 },
    { oxygen: NaN, pressure: Infinity, airflow: NaN, gravity: -1 },
  ]) {
    for (const protectedMode of [false, true]) {
      const config = {
        ...defaultConfig,
        ...atmosphere,
        scenario,
        isolation: protectedMode,
        suppression: protectedMode,
        backup: protectedMode,
      };
      const frames = simulate(config);
      assert.equal(frames.length, 181);
      assert.deepEqual(
        frames,
        simulate(config),
        "Simulation must replay deterministically",
      );
      for (const [index, frame] of frames.entries()) {
        assert.equal(frame.time, index);
        assert.ok(
          frame.refuge >= 0 && frame.refuge <= scenarioInfo[scenario].crew,
        );
        assert.ok(Number.isInteger(frame.refuge));
        assert.ok(frame.energy >= 0 && frame.energy <= 100);
        assert.ok(frame.oxygen >= 0 && frame.oxygen <= 100);
        assert.ok(Number.isFinite(frame.temperature));
        assert.ok(Number.isFinite(frame.fireIntensity));
        for (const module of frame.modules) {
          assert.ok(module.smoke >= 0 && module.smoke <= 100);
          assert.ok(module.temperature >= 22 && module.temperature <= 800);
        }
        if (index > 0) assert.ok(frame.refuge >= frames[index - 1].refuge);
      }
      scenarios++;
    }
  }
}
const baseline = simulate({
  ...defaultConfig,
  suppression: false,
  isolation: false,
  backup: false,
});
const protectedScenario = simulate({
  ...defaultConfig,
  suppression: true,
  isolation: true,
  backup: true,
});
assert.ok(protectedScenario.at(-1).smoke < baseline.at(-1).smoke);
assert.ok(protectedScenario.at(-1).temperature < baseline.at(-1).temperature);
assert.equal(protectedScenario.at(-1).fireIntensity < 0.01, true);
console.log(
  `Simulation checks passed for ${scenarios} scenario configurations, replay determinism, physical bounds and protection response.`,
);
