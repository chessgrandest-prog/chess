// =============================================================================
// NEONSKULL CYBER-CHESS — CLOUDFLARE WORKER
// Replaces server.js entirely. Runs on Cloudflare Workers + Durable Objects.
//
// Architecture:
//   - REST API  (/api/auth/register, /api/auth/login, /api/friends/add)
//     handled directly in the Worker fetch() handler.
//   - WebSocket real-time hub (/ws) forwarded to the single LobbyRoom
//     Durable Object which holds all online state (connections, games).
//   - User data stored in Cloudflare KV (binding: USERS_KV).
//   - Password hashing via Web Crypto (PBKDF2) — no npm packages needed.
//
// Bindings required in wrangler.toml (see that file):
//   - USERS_KV        : KV namespace
//   - LOBBY           : Durable Object binding → LobbyRoom class
// =============================================================================

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uuidv4() {
  return crypto.randomUUID ? crypto.randomUUID()
    : ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
        (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    }
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// PBKDF2-based password hashing (Web Crypto, works in Workers)
async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const hashArr = Array.from(new Uint8Array(bits));
  const saltArr = Array.from(salt);
  // Store as "salt:hash" both base64-encoded
  return btoa(String.fromCharCode(...saltArr)) + ':' + btoa(String.fromCharCode(...hashArr));
}

async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split(':');
  if (!saltB64 || !hashB64) return false;
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const expectedHash = atob(hashB64);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const actualHash = String.fromCharCode(...new Uint8Array(bits));
  // Constant-time comparison
  if (actualHash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actualHash.length; i++) {
    diff |= actualHash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Main Worker fetch() handler
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // --- WebSocket upgrade → forward to LobbyRoom Durable Object ---
    if (url.pathname === '/ws') {
      const id = env.LOBBY.idFromName('global');
      const lobby = env.LOBBY.get(id);
      return lobby.fetch(request);
    }

    // --- REST: Register ---
    if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      const { username, password } = await request.json();
      if (!username || !password) {
        return jsonResponse({ error: 'Username and password required' }, 400);
      }
      const key = 'user:' + username.trim().toLowerCase();
      const existing = await env.USERS_KV.get(key);
      if (existing) {
        return jsonResponse({ error: 'Username already exists' }, 400);
      }
      const passwordHash = await hashPassword(password);
      const user = {
        id: uuidv4(),
        username: username.trim(),
        passwordHash,
        friends: [],
        rating: 1500,
        stats: { won: 0, lost: 0, drawn: 0 }
      };
      await env.USERS_KV.put(key, JSON.stringify(user));
      return jsonResponse({ success: true, message: 'Account created successfully!' });
    }

    // --- REST: Login ---
    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      const { username, password } = await request.json();
      if (!username || !password) {
        return jsonResponse({ error: 'Username and password required' }, 400);
      }
      const key = 'user:' + username.trim().toLowerCase();
      const raw = await env.USERS_KV.get(key);
      if (!raw) {
        return jsonResponse({ error: 'Invalid username or password' }, 400);
      }
      const user = JSON.parse(raw);
      const ok = await verifyPassword(password, user.passwordHash);
      if (!ok) {
        return jsonResponse({ error: 'Invalid username or password' }, 400);
      }
      return jsonResponse({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          rating: user.rating,
          friends: user.friends,
          stats: user.stats
        }
      });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }
};

// =============================================================================
// DURABLE OBJECT — LobbyRoom
// One single global instance holds all connected sockets and active games.
// This replaces the entire socket.io section of server.js.
// =============================================================================

export class LobbyRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // socketId -> { ws, user }
    this.connections = new Map();
    // userId -> socketId
    this.userIndex = new Map();
    // gameId -> gameDetails
    this.activeGames = new Map();
  }

  // Every WebSocket connection arrives here as a normal fetch()
  async fetch(request) {
    const upgradeHeader = request.headers.get('Upgrade');
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.state.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Called by the runtime for every incoming WebSocket message
  async webSocketMessage(ws, rawMessage) {
    let msg;
    try { msg = JSON.parse(rawMessage); } catch { return; }

    const { type, payload } = msg;
    const socketId = this._socketId(ws);

    switch (type) {

      case 'register-active-user': {
        const user = payload;
        if (!user || !user.id) return;
        this.connections.set(socketId, { ws, user });
        this.userIndex.set(user.id, socketId);
        this._broadcastOnlineStatus();
        break;
      }

      case 'get-online-users': {
        this._send(ws, 'online-users-list', this._onlineList());
        break;
      }

      case 'add-friend': {
        const { targetUsername } = payload;
        const conn = this.connections.get(socketId);
        if (!conn) return;
        const sender = conn.user;

        const senderKey = 'user:' + sender.username.toLowerCase();
        const targetKey = 'user:' + targetUsername.trim().toLowerCase();

        const [senderRaw, targetRaw] = await Promise.all([
          this.env.USERS_KV.get(senderKey),
          this.env.USERS_KV.get(targetKey)
        ]);

        if (!targetRaw) {
          return this._send(ws, 'notification', { type: 'error', message: `User "${targetUsername}" not found.` });
        }
        if (targetKey === senderKey) {
          return this._send(ws, 'notification', { type: 'error', message: 'You cannot add yourself as a friend.' });
        }

        const senderDb = JSON.parse(senderRaw);
        const targetDb = JSON.parse(targetRaw);

        if (senderDb.friends.includes(targetDb.username)) {
          return this._send(ws, 'notification', { type: 'error', message: `"${targetDb.username}" is already your friend.` });
        }

        senderDb.friends.push(targetDb.username);
        if (!targetDb.friends.includes(senderDb.username)) {
          targetDb.friends.push(senderDb.username);
        }

        await Promise.all([
          this.env.USERS_KV.put(senderKey, JSON.stringify(senderDb)),
          this.env.USERS_KV.put(targetKey, JSON.stringify(targetDb))
        ]);

        this._send(ws, 'friend-added-success', {
          friends: senderDb.friends,
          message: `Successfully added ${targetDb.username} as a friend!`
        });

        const targetSocketId = this.userIndex.get(targetDb.id);
        if (targetSocketId) {
          const targetConn = this.connections.get(targetSocketId);
          if (targetConn) {
            this._send(targetConn.ws, 'friend-added-notify', {
              friendName: senderDb.username,
              friends: targetDb.friends
            });
          }
        }
        this._broadcastOnlineStatus();
        break;
      }

      case 'send-challenge': {
        const { targetUserId, timerDuration } = payload;
        const conn = this.connections.get(socketId);
        if (!conn) return;
        const challenger = conn.user;

        const targetSocketId = this.userIndex.get(targetUserId);
        if (!targetSocketId) {
          return this._send(ws, 'notification', { type: 'error', message: 'User is currently offline.' });
        }

        const challengeId = uuidv4();
        const targetConn = this.connections.get(targetSocketId);
        if (targetConn) {
          this._send(targetConn.ws, 'incoming-challenge', {
            challengeId,
            challenger: { id: challenger.id, username: challenger.username, rating: challenger.rating || 1500 },
            timerDuration
          });
        }
        this._send(ws, 'challenge-sent', { challengeId, targetUserId });
        break;
      }

      case 'accept-challenge': {
        const { challengeId, challengerId, timerDuration } = payload;
        const conn = this.connections.get(socketId);
        if (!conn) return;
        const accepter = conn.user;

        const challengerSocketId = this.userIndex.get(challengerId);
        if (!challengerSocketId) {
          return this._send(ws, 'notification', { type: 'error', message: 'Challenger went offline.' });
        }

        const challengerConn = this.connections.get(challengerSocketId);
        if (!challengerConn) return;

        const gameId = challengeId;
        const challengerColor = Math.random() < 0.5 ? 'w' : 'b';
        const accepterColor = challengerColor === 'w' ? 'b' : 'w';
        const challenger = challengerConn.user;

        const gameDetails = {
          gameId,
          players: {
            white: challengerColor === 'w' ? challengerId : accepter.id,
            black: challengerColor === 'b' ? challengerId : accepter.id,
            whiteName: challengerColor === 'w' ? challenger.username : accepter.username,
            blackName: challengerColor === 'b' ? challenger.username : accepter.username,
          },
          timerDuration,
          status: 'active',
          moves: []
        };
        this.activeGames.set(gameId, gameDetails);

        this._send(ws, 'game-started', {
          gameId,
          yourColor: accepterColor,
          opponentName: challenger.username,
          opponentRating: challenger.rating || 1500,
          timerDuration,
          gameDetails
        });
        this._send(challengerConn.ws, 'game-started', {
          gameId,
          yourColor: challengerColor,
          opponentName: accepter.username,
          opponentRating: accepter.rating || 1500,
          timerDuration,
          gameDetails
        });
        break;
      }

      case 'decline-challenge': {
        const { challengerId } = payload;
        const conn = this.connections.get(socketId);
        const challengerSocketId = this.userIndex.get(challengerId);
        if (challengerSocketId) {
          const challengerConn = this.connections.get(challengerSocketId);
          if (challengerConn) {
            this._send(challengerConn.ws, 'challenge-declined', {
              declinerName: conn ? conn.user.username : 'Opponent'
            });
          }
        }
        break;
      }

      case 'make-move': {
        const { gameId, move, fen } = payload;
        const game = this.activeGames.get(gameId);
        if (!game) return;
        const conn = this.connections.get(socketId);
        if (!conn) return;

        game.moves.push(move);
        const sender = conn.user;
        const opponentId = game.players.white === sender.id ? game.players.black : game.players.white;
        const opponentSocketId = this.userIndex.get(opponentId);
        if (opponentSocketId) {
          const oppConn = this.connections.get(opponentSocketId);
          if (oppConn) this._send(oppConn.ws, 'receive-move', { move, fen });
        }
        break;
      }

      case 'game-over-sync': {
        const { gameId, result, winnerId } = payload;
        const game = this.activeGames.get(gameId);
        if (!game) return;
        game.status = 'finished';

        const conn = this.connections.get(socketId);
        if (!conn) return;
        const opponentId = game.players.white === conn.user.id ? game.players.black : game.players.white;
        const opponentSocketId = this.userIndex.get(opponentId);
        if (opponentSocketId) {
          const oppConn = this.connections.get(opponentSocketId);
          if (oppConn) this._send(oppConn.ws, 'game-over-notify', { result, winnerId });
        }

        await this._updateGameStats(game, winnerId);
        this.activeGames.delete(gameId);
        break;
      }

      case 'resign': {
        const { gameId } = payload;
        const game = this.activeGames.get(gameId);
        if (!game) return;
        game.status = 'finished';

        const conn = this.connections.get(socketId);
        if (!conn) return;
        const opponentId = game.players.white === conn.user.id ? game.players.black : game.players.white;
        const winnerId = opponentId;

        const opponentSocketId = this.userIndex.get(opponentId);
        if (opponentSocketId) {
          const oppConn = this.connections.get(opponentSocketId);
          if (oppConn) this._send(oppConn.ws, 'game-over-notify', { result: 'resignation', winnerId });
        }
        this._send(ws, 'game-over-notify', { result: 'resignation', winnerId });

        await this._updateGameStats(game, winnerId);
        this.activeGames.delete(gameId);
        break;
      }

      case 'offer-draw': {
        const { gameId } = payload;
        const game = this.activeGames.get(gameId);
        if (!game) return;
        const conn = this.connections.get(socketId);
        if (!conn) return;
        const opponentId = game.players.white === conn.user.id ? game.players.black : game.players.white;
        const opponentSocketId = this.userIndex.get(opponentId);
        if (opponentSocketId) {
          const oppConn = this.connections.get(opponentSocketId);
          if (oppConn) this._send(oppConn.ws, 'draw-offered', {});
        }
        break;
      }

      case 'accept-draw': {
        const { gameId } = payload;
        const game = this.activeGames.get(gameId);
        if (!game) return;
        game.status = 'finished';

        const conn = this.connections.get(socketId);
        if (!conn) return;
        const opponentId = game.players.white === conn.user.id ? game.players.black : game.players.white;
        const opponentSocketId = this.userIndex.get(opponentId);
        if (opponentSocketId) {
          const oppConn = this.connections.get(opponentSocketId);
          if (oppConn) this._send(oppConn.ws, 'game-over-notify', { result: 'draw_agreed', winnerId: null });
        }
        this._send(ws, 'game-over-notify', { result: 'draw_agreed', winnerId: null });

        await this._updateGameStats(game, null);
        this.activeGames.delete(gameId);
        break;
      }
    }
  }

  async webSocketClose(ws) {
    const socketId = this._socketId(ws);
    const conn = this.connections.get(socketId);
    if (conn) {
      this.userIndex.delete(conn.user.id);
      this.connections.delete(socketId);
    }
    this._broadcastOnlineStatus();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _socketId(ws) {
    // Use the WebSocket object reference as a key via a WeakMap-style approach.
    // CF Durable Objects give us hibernatable WebSockets; we tag them on first use.
    if (!ws.__neonskullId) {
      ws.__neonskullId = uuidv4();
    }
    return ws.__neonskullId;
  }

  _send(ws, type, payload) {
    try {
      ws.send(JSON.stringify({ type, payload }));
    } catch {}
  }

  _onlineList() {
    return Array.from(this.connections.values()).map(c => ({
      id: c.user.id,
      username: c.user.username,
      rating: c.user.rating
    }));
  }

  _broadcastOnlineStatus() {
    const list = this._onlineList();
    for (const { ws } of this.connections.values()) {
      this._send(ws, 'online-users-list', list);
    }
  }

  async _updateGameStats(game, winnerId) {
    try {
      const whiteKey = await this._findUserKeyById(game.players.white);
      const blackKey = await this._findUserKeyById(game.players.black);
      if (!whiteKey || !blackKey) return;

      const [wRaw, bRaw] = await Promise.all([
        this.env.USERS_KV.get(whiteKey),
        this.env.USERS_KV.get(blackKey)
      ]);
      if (!wRaw || !bRaw) return;

      const wUser = JSON.parse(wRaw);
      const bUser = JSON.parse(bRaw);

      if (winnerId === game.players.white) {
        wUser.stats.won++;  bUser.stats.lost++;
        wUser.rating += 15; bUser.rating -= 15;
      } else if (winnerId === game.players.black) {
        bUser.stats.won++;  wUser.stats.lost++;
        bUser.rating += 15; wUser.rating -= 15;
      } else {
        wUser.stats.drawn++; bUser.stats.drawn++;
      }

      await Promise.all([
        this.env.USERS_KV.put(whiteKey, JSON.stringify(wUser)),
        this.env.USERS_KV.put(blackKey, JSON.stringify(bUser))
      ]);

      // Notify both players of their updated stats
      const updateAndNotify = (userId, updatedUser) => {
        const sid = this.userIndex.get(userId);
        if (!sid) return;
        const conn = this.connections.get(sid);
        if (!conn) return;
        // Update cached rating in connection
        conn.user.rating = updatedUser.rating;
        this._send(conn.ws, 'stats-updated', {
          rating: updatedUser.rating,
          stats: updatedUser.stats
        });
      };
      updateAndNotify(game.players.white, wUser);
      updateAndNotify(game.players.black, bUser);

      this._broadcastOnlineStatus();
    } catch (e) {
      console.error('Error updating game stats:', e);
    }
  }

  // KV keys are "user:username" but we only have userId — scan online connections
  // first (fast), then fall back to a KV list scan (slow, rare).
  async _findUserKeyById(userId) {
    // Check in-memory connections first
    for (const { user } of this.connections.values()) {
      if (user.id === userId) {
        return 'user:' + user.username.toLowerCase();
      }
    }
    // Fallback: list KV (only needed when both players disconnected mid-game)
    const list = await this.env.USERS_KV.list({ prefix: 'user:' });
    for (const { name } of list.keys) {
      const raw = await this.env.USERS_KV.get(name);
      if (raw) {
        const u = JSON.parse(raw);
        if (u.id === userId) return name;
      }
    }
    return null;
  }
}
