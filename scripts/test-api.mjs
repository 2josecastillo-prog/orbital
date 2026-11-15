import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

await mkdir("work", { recursive: true });
await build({
  entryPoints: ["server/api.ts"],
  outfile: "work/api-test.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
});
const { handleApi } = await import(
  pathToFileURL(resolve("work/api-test.mjs")).href
);
const request = (body, extra = {}) =>
  new Request("https://orbital.test/api/ask", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://orbital.test",
      ...extra,
    },
    body: JSON.stringify(body),
  });
const status = await handleApi(
  new Request("https://orbital.test/api/ai/status"),
  {},
);
assert.equal((await status.json()).configured, false);
const identity = await handleApi(
  request({ question: "Kuma, ¿cómo te llamas?" }),
  {},
  async () => assert.fail("Kuma's introduction should work without calling Gemini"),
);
assert.equal(identity.status, 200);
const identityData = await identity.json();
assert.match(identityData.answer, /^Soy Kuma/);
assert.deepEqual(identityData.sources, []);
assert.equal(
  (await handleApi(request({ question: "¿Qué mide BASS?" }), {})).status,
  503,
);
assert.equal((await handleApi(request({ question: "" }), {})).status, 400);
assert.equal(
  (
    await handleApi(
      request({ question: "Consulta" }, { Origin: "https://attacker.test" }),
      {},
    )
  ).status,
  403,
);
assert.equal(
  (
    await handleApi(
      request({ question: "Consulta", context: "x".repeat(17_000) }),
      {},
    )
  ).status,
  413,
);

const env = { GEMINI_API_KEY: "test-secret-never-exposed" };
let captured;
const success = await handleApi(
  request({ question: "Kuma, ¿qué investiga BASS sobre materiales?" }),
  env,
  async (url, init) => {
    captured = { url, init, body: JSON.parse(init.body) };
    assert.equal(init.headers["x-goog-api-key"], env.GEMINI_API_KEY);
    assert.ok(!url.includes(env.GEMINI_API_KEY));
    const evidence = JSON.parse(captured.body.contents[0].parts[0].text);
    const id = evidence.sourceDirectory[0].id;
    return Response.json({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  answer: `Respuesta fundamentada [${id}].`,
                  sourceIds: [id, "invented-source"],
                }),
              },
            ],
          },
        },
      ],
    });
  },
);
assert.equal(success.status, 200);
const answer = await success.json();
assert.equal(answer.sources.length, 1);
assert.ok(!JSON.stringify(answer).includes(env.GEMINI_API_KEY));
assert.ok(
  captured.body.systemInstruction.parts[0].text.includes("No inventes"),
);
assert.match(captured.body.systemInstruction.parts[0].text, /Te llamas Kuma/);
// Brief answers by default: a short word budget and a small token cap.
assert.ok(captured.body.systemInstruction.parts[0].text.includes("Máximo 90 palabras"));
assert.ok(captured.body.generationConfig.maxOutputTokens <= 500);
assert.equal(
  (
    await handleApi(
      request({ question: "Una consulta científica" }),
      env,
      async () => new Response("{}", { status: 429 }),
    )
  ).status,
  429,
);
assert.equal(
  (
    await handleApi(
      request({ question: "Otra consulta científica" }),
      env,
      async () => Response.json({ candidates: [] }),
    )
  ).status,
  502,
);
console.log(
  "API checks passed: validation, origin, payload size, missing key, grounded context, citation filtering, secret handling, quota and invalid upstream responses.",
);
