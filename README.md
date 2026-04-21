# Boss Stack Chat

Direct line to **Boss** — Bruno's strategic AI co-founder at 2FLY Digital Marketing. No middleware. Discord-style workspace talking straight to the Anthropic API.

- **Frontend:** Next.js 14 (App Router) + Tailwind CSS
- **Layout:** Discord-style — left sidebar with dynamic categories and channels, main chat pane
- **Streaming:** Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) via plain text stream
- **Model:** `claude-sonnet-4-6`
- **Auth:** single password, httpOnly cookie, 7-day session
- **Memory:** `context/QUICK-CONTEXT.md` + `context/FACTS.md` loaded into Boss's system prompt on startup
- **State:** every channel's history lives in `localStorage` — no database

## Channels at a glance

- Each channel is an isolated conversation with Boss (its own history, its own `slice(-20)` context window).
- Switching channels loads that channel's history; new channels start blank.
- Mid-stream channel switch keeps the old stream running in the background; the channel lights up bold (unread) when Boss finishes.
- Default layout on first load:
  - **COMMAND CENTER** — `morning-brief`, `daily-priorities`
  - **AGENCY** — `client-alerts`, `team-ops`
  - **PROJECTS** — `offbounds`, `boss-stack`
- All CRUD lives in the sidebar: `+` next to a category adds a channel, `+` in the header adds a category. Double-click a name to rename, right-click (or the × icon) to delete.

## localStorage keys

| key | value |
| --- | --- |
| `boss_channels` | `{ categories: Category[], channels: Channel[] }` |
| `boss_active_channel` | channel id of the last active channel |
| `boss_unread` | array of channel ids with unread replies |
| `boss_chat_{channelId}` | `Message[]` for that channel |

> The per-channel key uses the channel **id** (not name) so renames don't orphan history.

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
ANTHROPIC_API_KEY=sk-ant-...
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

`/api/chat` receives the conversation, trims it to the last 20 messages, prepends Boss's system prompt + both memory files, and streams the response via `streamText(...).toTextStreamResponse()` — a plain text stream.

The frontend manages per-channel state itself (rather than `useChat`), so a stream that started in channel A keeps writing to channel A's history even if you switch to channel B mid-reply. When the stream closes, A gets a bold unread indicator until you visit it.

## Keyboard & mouse

- `Enter` — send, `Shift+Enter` — newline
- Click channel — switch
- Double-click channel name — inline rename
- Double-click category name — inline rename
- Right-click channel — delete (confirm prompt)
- Hover channel — reveal ✎ / × icons (desktop)
- `☰` in the chat header — toggle sidebar on mobile

## Changing the model

Edit `app/api/chat/route.ts`:

```ts
model: anthropic("claude-sonnet-4-6"),
```

Swap the string for any current Anthropic model id you have access to.

## Security notes

- Cookie is httpOnly + SameSite=Lax, secure in production.
- The password value itself is stored in the cookie (no session DB, kept intentionally simple per spec). Use a strong `BOSS_PASSWORD` and don't share it.
- `ANTHROPIC_API_KEY` is only read server-side.

## License

Private. Ship it, Bruno. 🍌
