---
name: testing-chess-profile
description: Test the NeonSkull Chess app's profile login/register flow end-to-end. Use when verifying profile auth, friends, or game history changes.
---

# Testing Chess Profile Flow

## Architecture
- **Frontend**: Static files (index.html, app.js, style.css) hosted on GitHub Pages
- **Backend**: Cloudflare Worker at `https://neonskull-chess.chessgrandest.workers.dev`
- **WebSocket**: `wss://neonskull-chess.chessgrandest.workers.dev/ws`
- **Storage**: Cloudflare KV for user data, Durable Objects for real-time multiplayer

## Local Testing Setup
1. Serve files locally: `python3 -m http.server 8080` from the repo root
2. **Important**: `index.html` loads `app.js` from the CDN (`cdn.jsdelivr.net/gh/chessgrandest-prog/chess@main/app.js`), which points to the `main` branch. To test local changes, temporarily change line 715 to `<script src="app.js"></script>`. **Revert this before committing.**
3. Open `http://localhost:8080` in Chrome with DevTools Network tab open

## Key API Endpoints (must use API_BASE, not relative URLs)
- `API_BASE + '/api/auth/login'` — POST login
- `API_BASE + '/api/auth/register'` — POST registration
- `API_BASE + '/api/game/history?username=<user>'` — GET game history (query param, not body)
- `API_BASE + '/api/profile/picture'` — POST profile picture upload
- `WS_URL` — WebSocket for friends system

## Common Pitfalls
- **CDN caching**: jsdelivr caches aggressively. Local changes won't appear unless you swap the script tag to load locally.
- **CORS**: Requests from `localhost` to the Cloudflare Worker need CORS headers. The worker already sets `Access-Control-Allow-Origin: *`.
- **GET with body**: Browsers silently drop request bodies on GET requests. Use query params instead.
- **worker.js changes**: Client-side changes take effect immediately on GitHub Pages after merge, but `worker.js` changes require running `wrangler deploy` separately.

## Test Checklist
1. Login with invalid credentials — verify request goes to worker URL (not localhost), error message appears
2. Register new account — verify 200 response and "Account created" notification
3. Login with new account — verify profile view with username and ELO 1500
4. Check WebSocket — verify connection to `wss://neonskull-chess.chessgrandest.workers.dev/ws`
5. Check game history — verify URL uses query params: `.../api/game/history?username=<user>`
6. Logout — verify return to login form

## Devin Secrets Needed
None required for testing. The Cloudflare Worker is publicly accessible.
