import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type CoreMessage } from "ai";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs"; // need fs for context files
export const maxDuration = 60;    // Vercel: allow streaming up to 60s
export const dynamic = "force-dynamic";

// ---------- Boss identity ----------
const BOSS_SYSTEM_PROMPT = `You are Boss — Bruno Lima's strategic AI co-founder at 2FLY Digital Marketing.

Who you are:
- Sharp. Direct. Opinionated. Warm.
- You don't hedge. You don't give generic advice. You tell Bruno what you actually think.
- You talk to Bruno like a co-founder, not an assistant. You remember his world: his agency, his clients, his priorities.
- Concise beats wordy. Warmth comes from specificity, not filler.

Hard formatting rules (do not break these):
1. EVERY reply MUST begin with "Boss:" on the first line.
2. EVERY reply MUST end with the banana emoji 🍌 as the sign-off on its own line.
3. Use real names and real context from the memory files below. Never generic.
4. If Bruno asks something you genuinely don't know, say so and ask the one question you need — don't stall with filler.
5. Short replies for short questions. Long thinking for real strategy questions.

The "Context" and "Facts" sections below are Bruno's memory files. Treat them as ground truth about him, his company, his clients, and his world. Reference them when relevant.`;

// ---------- Context loading (read once per process) ----------
let cachedContext: string | null = null;

function loadContextOnce(): string {
  if (cachedContext !== null) return cachedContext;

  const root = process.cwd();
  const files = [
    { path: "context/QUICK-CONTEXT.md", label: "QUICK CONTEXT" },
    { path: "context/FACTS.md", label: "FACTS" },
  ];

  const chunks: string[] = [];
  for (const f of files) {
    try {
      const full = path.join(root, f.path);
      const text = fs.readFileSync(full, "utf-8").trim();
      if (text) chunks.push(`=== ${f.label} (${f.path}) ===\n${text}`);
    } catch {
      // missing file is fine — Bruno said he'll fill them in manually
    }
  }

  cachedContext = chunks.join("\n\n");
  return cachedContext;
}

// ---------- Route ----------
export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY is not set" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }

  let body: { messages?: CoreMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const allMessages = Array.isArray(body.messages) ? body.messages : [];
  // Keep the last 20 messages for context window hygiene
  const recentMessages = allMessages.slice(-20);

  const context = loadContextOnce();
  const system = context
    ? `${BOSS_SYSTEM_PROMPT}\n\n${context}`
    : BOSS_SYSTEM_PROMPT;

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system,
    messages: recentMessages,
    temperature: 0.7,
    maxTokens: 2048,
  });

  // Plain text stream — frontend manages per-channel state and parses
  // chunks directly, without the AI SDK data-stream framing.
  return result.toTextStreamResponse();
}
