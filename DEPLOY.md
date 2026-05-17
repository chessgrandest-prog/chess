# NeonSkull Cyber-Chess — Cloudflare Deployment Guide

## What you have after this rewrite

| File | Purpose |
|------|---------|
| `worker.js` | Replaces `server.js`. Runs on Cloudflare Workers + Durable Objects. |
| `wrangler.toml` | Cloudflare deployment config. |
| `app.js` | Updated: uses native WebSocket instead of socket.io. |
| `index.html` | Updated: socket.io script tag removed. |

`server.js`, `package.json`, `package-lock.json` are **no longer needed** for the hosted version.

---

## One-time setup (do this once, takes ~10 minutes)

### 1. Install Wrangler (Cloudflare's CLI)
```bash
npm install -g wrangler
```

### 2. Log in to Cloudflare
```bash
wrangler login
```
This opens a browser window. Approve it.

### 3. Create the KV namespace (user database)
```bash
wrangler kv:namespace create USERS_KV
```
Copy the `id` it prints. Open `wrangler.toml` and paste it here:
```toml
[[kv_namespaces]]
binding = "USERS_KV"
id = "PASTE_YOUR_ID_HERE"   # <-- replace this
```

For local development (optional):
```bash
wrangler kv:namespace create USERS_KV --preview
```
Paste that id as `preview_id` in the same block.

### 4. Deploy the Worker
```bash
wrangler deploy
```
It will print a URL like:
```
https://neonskull-chess.YOUR-SUBDOMAIN.workers.dev
```

### 5. Update the Worker URL in app.js
Open `app.js` and find this line near line 2678:
```js
const CF_WORKER_URL = 'https://neonskull-chess.YOUR-SUBDOMAIN.workers.dev';
```
Replace `YOUR-SUBDOMAIN` with your actual subdomain from step 4.

### 6. Host index.html on GitHub Pages
1. Push everything to a GitHub repo.
2. Go to repo Settings → Pages → Source: Deploy from branch → select `main` / `root`.
3. GitHub gives you a URL like `https://USERNAME.github.io/REPO/`.
4. Share `index.html` directly or the Pages URL — both work.

Anyone with the URL (or the raw `index.html` file) can open it and play,
including online multiplayer.

---

## File structure for your GitHub repo

```
/
├── index.html          ← the whole frontend
├── app.js              ← game engine + online client
├── style.css
├── worker.js           ← Cloudflare Worker (backend)
├── wrangler.toml       ← deployment config
├── puzzles/
│   └── puzzles_db.js
└── (svg files, etc.)
```

---

## Re-deploying after changes

Just run:
```bash
wrangler deploy
```

GitHub Pages updates automatically on every `git push`.

---

## Migrating existing users from users.json

If you have users in your old `users.json` you want to keep, run this
once to import them (requires the new password hashing format — old bcrypt
hashes won't work, so users will need to re-register):

```bash
# One-liner to list all keys in your KV namespace
wrangler kv:key list --namespace-id YOUR_KV_ID
```

For a fresh deploy it's easiest to just have users re-register.

---

## Troubleshooting

**"WebSocket connection failed"**
→ Make sure you updated `CF_WORKER_URL` in `app.js` with your real Worker URL.

**"User not found" after deploy**
→ KV is a separate store per deployment. Users registered on localhost don't
  carry over to production. Re-register on the live site.

**Wrangler says "Durable Objects not available"**
→ Durable Objects require a paid Workers plan ($5/month) OR you can enable
  them on the free plan by going to:
  Cloudflare Dashboard → Workers & Pages → your worker → Settings → Durable Objects
  and enabling the beta (free during beta).
