// Local judge tool for OpenCode, mirroring plugins/jev/index.ts.
// Calls a judge model served via LM Studio (local or LM Link remote) at
// http://127.0.0.1:1234/v1 — OpenAI-compatible, no key needed.
// Exposed as a tool (not a model): LLMs call `judge_ask` for a fast
// heuristic verdict and keep generating text themselves.

export function buildPrompt(state: unknown, questions: Record<string, any>): string {
  const s = typeof state === "string" ? state : JSON.stringify(state);
  const qs = Object.entries(questions)
    .map(([k, q]: [string, any]) => {
      const t = q?.type ?? "choice";
      const ins = q?.instructions ?? q?.question ?? "";
      const extra = q?.criteria
        ? `criteria: ${JSON.stringify(q.criteria)}`
        : q?.options
          ? `options: ${JSON.stringify(q.options)}`
          : "";
      return `- "${k}" [${t}]: ${ins} ${extra}`.trim();
    })
    .join("\n");
  return (
    `STATE:\n${s}\n\nQUESTIONS:\n${qs}\n\n` +
    `Reply with ONLY JSON, one key per question: {"<key>": {"verdict": "<choice or pass|fail>", "score": 0-10, "reason": "<one short line>"}}. No prose.`
  );
}

export function extractJSON(text: string): any {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/) ?? null;
  const raw = (m ? m[1] : text).trim();
  const a = raw.indexOf("{");
  const b = raw.lastIndexOf("}");
  if (a < 0 || b <= a) throw new Error(`judge_ask: no JSON in reply: ${text.slice(0, 200)}`);
  return JSON.parse(raw.slice(a, b + 1));
}

export default {
  id: "local-judge",

  async setup(ctx: any) {
    const options = (ctx.options ?? {}) as { model?: string; baseURL?: string };
    // ponytail: single hardcoded default; remote LM Link model surfaces on localhost.
    const model = options.model ?? "qwen-2.5-14b-instruct-1m-k-m";
    const baseURL = (options.baseURL ?? "http://127.0.0.1:1234/v1").replace(/\/$/, "");

    await ctx.session.hook("context", (event: any) => {
      event.system.push({
        type: "text",
        text: "Local judge: route heuristic judgments through `judge_ask` (verdict/score/reason via LM Studio judge model); use Jev (`jev_ask`) when calibrated probabilities are needed. Gate: small state + explicit questions. Transport: LM Studio OpenAI-compatible, no key.",
      });
    });

    await ctx.tool.transform((editor: any) => {
      editor.add({
        name: "judge_ask",
        description:
          "Ask the local/LM-Link judge model for a fast heuristic verdict. " +
          "Pass state plus questions map like jev_ask, e.g. {q:{type:'choice',instructions:'...',criteria:{a:'...',b:'...'}}}." +
          "Returns {<key>:{verdict,score,reason}}. NOT calibrated — use jev_ask when probabilities matter.",
        input: {
          type: "object",
          properties: {
            state: { description: "Text or object to judge" },
            questions: { description: "Questions map, same shape as jev_ask" },
            model: { type: "string", description: `Override model (default ${model})` },
          },
          required: ["state", "questions"],
          additionalProperties: false,
        },
        execute: async (input: any) => {
          const res = await fetch(`${baseURL}/chat/completions`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model: input.model ?? model,
              temperature: 0,
              max_tokens: 800,
              messages: [
                { role: "system", content: "You are a strict technical judge. Reply with ONLY JSON." },
                { role: "user", content: buildPrompt(input.state, input.questions) },
              ],
            }),
          });
          if (!res.ok) throw new Error(`judge_ask: ${res.status} ${await res.text()}`);
          const data: any = await res.json();
          const text: string = data.choices?.[0]?.message?.content ?? "";
          return { content: JSON.stringify(extractJSON(text)) };
        },
      });
    });
  },
};
