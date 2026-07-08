/**
 * claude.service.js — integración única con la API de Claude.
 * Antes había dos copias casi idénticas de este código (phases.routes.js y
 * tasks.routes.js). Se consolida acá para que cada nuevo caso de uso de IA
 * (fases, generador de tareas, Product Coach) no repita la lógica de request/error.
 */

const MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 900;

async function callClaude(system, userContent, { maxTokens = DEFAULT_MAX_TOKENS } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null; // el caller decide qué hacer (fallback, 503, etc.)

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? `Claude ${res.status}`);
  return data.content?.[0]?.text ?? "";
}

// Claude a veces envuelve el JSON en fences de markdown pese a que se le pide no hacerlo.
function parseJsonFromClaude(text) {
  let raw = (text || "").trim();
  raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return JSON.parse(raw);
}

export { callClaude, parseJsonFromClaude, MODEL };
