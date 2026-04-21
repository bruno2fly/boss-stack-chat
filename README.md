# Boss Stack Chat

Direct line to **Boss** — Bruno's strategic AI co-founder at 2FLY Digital Marketing. No middleware. Just a clean streaming chat UI talking straight to the Anthropic API.

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **Streaming:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)
- **Model:** `claude-sonnet-4-6`
- **Auth:** single password, httpOnly cookie, 7-day session
- **Memory:** `context/QUICK-CONTEXT.md` + `context/FACTS.md` loaded into Boss's system prompt on startup

---

## 1. Install

```bash
cd boss-stack-chat
npm install
```

## 2. Configure

Copy the env example and fill it in:

```bash
cp .env.example .env.local
```

Then edit `.env.local`:

```
ANTHROPIC_API_KEY=your-anthropic-key-here
BOSS_PASSWORD=pick-something-strong
```

## 3. Fill Boss's memory

Two files control Boss's context — edit them with anything you want Boss to know:

- `context/QUICK-CONTEXT.md` — tight, high-signal working memory
- `context/FACTS.md` — long-lived facts (company, clients, goals)

Both files are read into the system prompt on every API invocation (cached per server process). Restart the server after editing them in dev.

## 4. Run it

```bash
npm run dev
```

Open <http://localhost:3000>. You'll hit the password gate first — enter `BOSS_PASSWORD`, then you're in.

## 5. Deploy to Vercel

Push to GitHub, then:

```bash
npx vercel
```

…or import the repo in the Vercel dashboard. Once it's linked, add your env vars:

```bash
npx vercel env add ANTHROPIC_API_KEY
npx vercel env add BOSS_PASSWORD
```

Then deploy:

```bash
npx vercel --prod
```

Because the app reads `context/*.md` from disk at runtime, those files **must be committed to the repo** so Vercel ships them in the serverless bundle. They are tracked by default; only `.env*` is gitignored.

---

## Project layout

```
boss-stack-chat/
├── app/
│   ├── api/
│   │   ├── chat/route.ts       # Streaming Claude endpoint
│   │   └── login/route.ts      # Password check → sets cookie
│   ├── login/page.tsx          # Password gate UI
│   ├── globals.css             # Tailwind + tiny app CSS
│   ├── layout.tsx              # Root layout (dark theme, viewport)
│   └── page.tsx                # Chat UI
├── context/
│   ├── QUICK-CONTEXT.md        # Working memory (edit me)
│   └── FACTS.md                # Long-lived facts (edit me)
├── middleware.ts               # Cookie-based auth guard
├── .env.example
├── next.config.js
├── package.json
├── postcss.config.js
├── tailwind.config.ts
└── tsconfig.json
```

## How auth works

1. Unauthed visit to `/` → middleware redirects to `/login`.
2. User posts password to `/api/login` → route sets `boss_auth` httpOnly cookie (7 days).
3. Middleware compares cookie value to `process.env.BOSS_PASSWORD` on every protected request.
4. `POST /api/chat` is blocked with 401 if the cookie is missing or wrong.

To log out, hit `DELETE /api/login` (wire a button to it if you want one in the UI).

## How streaming works

`/api/chat` receives the conversation, trims it to the last 20 messages, prepends Boss's system prompt + both memory files, and streams the response via `streamText(...).toDataStreamResponse()`. The frontend uses `useChat` from `ai/react`, so tokens render as they arrive.

## Changing the model

Edit `app/api/chat/route.ts`:

```ts
model: anthropic("claude-sonnet-4-6"),
```

Swap the string for any current Anthropic model id you have access to.

## Keyboard shortcuts

- `Enter` — send
- `Shift+Enter` — newline
- The **Stop** button cancels a streaming reply mid-flight.
- The **Retry** button re-runs the last turn.

## Security notes

- Cookie is httpOnly + SameSite=Lax, secure in production.
- The password value itself is stored in the cookie (no session DB, kept intentionally simple per spec). Use a strong `BOSS_PASSWORD` and don't share it.
- `ANTHROPIC_API_KEY` is only read server-side.

## License

Private. Ship it, Bruno. 🍌
