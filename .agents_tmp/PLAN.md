# Profile Feature Enhancement Plan - Phase 2

## 1. OBJECTIVE
Expand the existing user profile feature with four new capability areas:
1. **Detailed Statistics Dashboard** — Win rate analytics by time control, piece performance, trends over time
2. **Game Replay & Export** — Replay past games, share game URLs, export as PGN
3. **Profile Customization** — Custom bio, favorite opening, theme preferences stored server-side
4. **Activity Feed** — Friends' recent games, online status notifications, spectate games
5. **Chess.com-Style Game Review** — Move-by-move analysis, accuracy score, win probability graph, best move comparison, enriched timeline

## 2. CONTEXT SUMMARY

### Current Architecture
- **Backend**: Cloudflare Worker (`worker.js`) with KV storage
- **Frontend**: `app.js` + `index.html` with drawer panels
- **Auth**: PBKDF2 password hashing via Web Crypto
- **Real-time**: WebSocket via Durable Objects (LobbyRoom)

### Existing Data Structures

**User Object** (worker.js lines 118-130):
```javascript
{
  id: uuid,
  username: string,
  passwordHash: string,
  friends: [],
  profilePicture: null,     // ← extend with bio, favoriteOpening
  gameHistory: [],
  friendRequests: [],
  outgoingRequests: [],
  lastSeen: Date.now(),
  rating: 1500,
  stats: { won: 0, lost: 0, drawn: 0 }
}
```

**Game Record** (worker.js lines 1046-1054):
```javascript
{
  gameId: string,
  type: 'pvp',           // + 'puzzle', 'ai'
  result: 'win' | 'loss' | 'draw',
  opponent: { id, username },
  timestamp: Date.now(),
  moves: [{ san, from, to, flags, fen }],  // ← used for stats analysis
  fen: string,        // final position
  // MISSING: timerDuration, timeControl for analytics
}
```

### Files to Modify
1. `worker.js` — Add new API endpoints, new WebSocket events, enhance game record
2. `app.js` — Add frontend functions for stats, export, bio, activity feed
3. `index.html` — New UI sections in profile panel
4. `style.css` — New component styles (optional)

## 3. APPROACH OVERVIEW

### Implementation Phases (recommended order)

**Phase A: Game Replay & Export (Quick Wins)**
- Use existing gameHistory data — minimal backend changes needed
- Add client-side replay UI using existing notation review logic
- Add PGN/JSON export endpoints

**Phase B: Detailed Statistics (Medium)**
- Enhance game record to track timerDuration/timeControl
- Add analytics computation in frontend (use moves data)
- Display charts in profile panel

**Phase C: Profile Customization (Low)**
- Add bio and favoriteOpening to user object
- Add API endpoints to update these fields
- Display in profile header

**Phase D: Activity Feed (Medium)**
- Add new WebSocket events for friend activity
- Add "spectate" button for friends' games
- Show notifications when friends come online

### Why This Order
- Phase A uses existing data with minimal risk
- Phase B is visual and impressive but builds on Phase A data
- Phase C is independent and low effort
- Phase D requires WebSocket work but is most engaging socially
- Phase E uses existing Stockfish analysis, builds on Phase A replay

## 4. IMPLEMENTATION STEPS

### PHASE E: Chess.com-Style Game Review

#### Step E1: Store Analysis Data with Each Move
**Goal**: Capture Stockfish evaluation for every move in game history
**Method**: Extend game record to store move analysis

In worker.js, enhance game record structure:
```javascript
const gameRecord = {
  gameId: game.gameId,
  type: game.type || 'pvp',
  result: whiteResult,
  timerDuration: game.timerDuration,
  timeControl: game.timeControl,
  moves: game.moves,  // already: [{ san, from, to, flags, fen }]
  // NEW: Add analysis per move
  moveAnalysis: [],  // [{ eval, bestMove, classification, winProb }]
  finalEval: null,    // Stockfish's final evaluation
  accuracy: null,    // Player's accuracy percentage
  fen: game.moves.length > 0 ? game.moves[game.moves.length - 1].fen : null
  // ... existing fields
};
```

Also add `moveAnalysis` and `accuracy` to stored moves:
```javascript
// In game object during play:
game.moveAnalysis = game.moveAnalysis || [];
game.accuracy = null;
```

**Reference**: `worker.js` lines 856-865 (make-move handler), 1046-1054 (gameRecord)

#### Step E2: Run Analysis After Each Move
**Goal**: Get Stockfish's best move and evaluation when moves are made
**Method**: Call analysis engine during make-move in online games

In worker.js make-move handler (~line 856), after recording move:
```javascript
case 'make-move': {
  const { gameId, move, fen } = payload;
  // ... existing move recording ...
  
  // NEW: Run Stockfish analysis on resulting position
  // Note: Requires Stockfish worker accessible from main thread
  // For now, defer to game-end analysis
  break;
}
```

**Alternative**: Run analysis client-side in app.js when reviewing game:
- When loading game for review, iterate through moves
- Run Stockfish analysis at each position
- Cache results for display

**Reference**: `app.js` analysis mode (Worker-based Stockfish)

#### Step E3: Move Classification Logic
**Goal**: Categorize each move as Brilliant/Good/Mistake/Blunder
**Method**: Compare player's move eval vs Stockfish's top move

In app.js, add:
```javascript
// Classification thresholds (in centipawns)
const MOVE_CLASSIFICATION = {
  BRILLIANT: -150,    // Stockfish missed this, player found it (great sacrifice or tactic)
  GOOD: -50,          // Player's move within 50cp of top
  INACCURACY: -100,   // 50-100cp worse than best
  MISTAKE: -200,     // 100-200cp worse
  BLUNDER: -999      // >200cp worse or loses significant material
};

function classifyMove(playerEval, stockfishEval, playerMove, stockfishMove) {
  const diff = stockfishEval - playerEval;
  
  // Check for brilliant (player found move Stockfish didn't see as top)
  if (stockfishMove && playerMove !== stockfishMove) {
    // If player found a move with positive eval Stockfish had lower
    if (diff <= MOVE_CLASSIFICATION.BRILLIANT) return 'brilliant';
  }
  
  if (diff <= 30) return 'good';
  if (diff <= 70) return 'inaccuracy';
  if (diff <= 150) return 'mistake';
  return 'blunder';
}
```

**Reference**: `app.js` new functions

#### Step E4: Accuracy Score Calculation
**Goal**: Show overall accuracy percentage
**Method**: Count non-blunders/mistakes as "accurate" moves

In app.js, add:
```javascript
function calculateAccuracy(moveAnalysis) {
  if (!moveAnalysis || moveAnalysis.length === 0) return null;
  
  let accurateMoves = 0;
  for (const move of moveAnalysis) {
    // Good, Brilliant, and Inaccuracies count somewhat
    // Mistake = 50% credit, Blunder = 0%
    if (move.classification === 'brilliant') accurateMoves += 1.0;
    else if (move.classification === 'good') accurateMoves += 1.0;
    else if (move.classification === 'inaccuracy') accurateMoves += 0.5;
    else if (move.classification === 'mistake') accurateMoves += 0.25;
    // blunder = 0
  }
  
  return Math.round((accurateMoves / moveAnalysis.length) * 100);
}
```

#### Step E5: Win Probability Graph
**Goal**: Visual eval trend chart
**Method**: Plot eval over game moves

In app.js, add:
```javascript
function renderWinProbabilityGraph(moveAnalysis) {
  if (!moveAnalysis || moveAnalysis.length === 0) return '';
  
  // Convert centipawn eval to win probability
  // Formula: 50 + 50 * tanh(eval / 300)
  let dataPoints = moveAnalysis.map((m, i) => {
    const winProb = 50 + 50 * Math.tanh((m.eval || 0) / 300);
    return { move: i + 1, probability: winProb };
  });
  
  // Render as SVG line graph
  const width = 280;
  const height = 60;
  const points = dataPoints.map((d, i) => {
    const x = (i / (dataPoints.length - 1)) * width;
    const y = height - (d.probability / 100) * height;
    return `${x},${y}`;
  }).join(' ');
  
  return `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:60px;">
      <polyline fill="none" stroke="#00ff88" stroke-width="2" points="${points}" />
      <line x1="0" y1="${height/2}" x2="${width}" y2="${height/2}" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
    </svg>
  `;
}
```

#### Step E6: Enriched Move Timeline UI
**Goal**: Show moves with icons and eval in review panel
**Method**: Enhance existing history list with analysis icons

In index.html, update history item rendering:
```html
<!-- In renderHistoryList, add classification icons -->
<div class="history-item" onclick="loadGameFromHistory(gameRecord)" style="...">
  <div style="display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-weight:bold;">${game.opponent.username}</div>
      <div style="font-size:0.6rem;color:var(--color-text-secondary);">${date} · ${game.timeControl || 'rapid'}</div>
    </div>
    <!-- NEW: Accuracy badge -->
    ${game.accuracy ? `<div class="accuracy-badge" style="background:${getAccuracyColor(game.accuracy)};">${game.accuracy}%</div>` : ''}
  </div>
  <div class="move-timeline" style="margin-top:6px;display:flex;gap:2px;overflow-x:auto;">
    ${game.moveAnalysis ? game.moveAnalysis.slice(0,20).map((m, i) => `
      <div class="move-chip ${m.classification || ''}" title="${m.san}" style="font-size:0.5rem;padding:2px 3px;border-radius:3px;background:${getMoveChipColor(m.classification)};">${m.san}</div>
    `).join('') : ''}
  </div>
</div>
```

Add helper functions for colors:
```javascript
function getAccuracyColor(accuracy) {
  if (accuracy >= 90) return '#00ff88';
  if (accuracy >= 70) return '#ffcc00';
  return '#ff4466';
}

function getMoveChipColor(classification) {
  switch (classification) {
    case 'brilliant': return '#00ff88';
    case 'good': return '#00ff88';
    case 'inaccuracy': return '#ffcc00';
    case 'mistake': return '#ff8800';
    case 'blunder': return '#ff4466';
    default: return 'rgba(255,255,255,0.1)';
  }
}
```

#### Step E7: Game Review Modal with All Analysis
**Goal**: Full review panel like chess.com
**Method**: Expand existing profile-game-detail modal

In index.html, enhance game detail modal (~line 412):
```html
<div id="profile-game-detail" style="display: none; position: fixed; ...">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <div style="font-family: 'Orbitron', sans-serif; font-size: 0.9rem;">GAME DETAILS</div>
    <button class="btn-cyber" onclick="closeProfileGameDetail()"><i class="fa-solid fa-xmark"></i></button>
  </div>
  
  <!-- NEW: Review Stats Header -->
  <div class="review-stats" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 16px;">
    <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;">
      <div class="accuracy-score" style="font-family:'Orbitron',sans-serif;font-size:1.2rem;color:${getAccuracyColor(game.accuracy)};">${game.accuracy || '--'}%</div>
      <div style="font-size:0.6rem;color:var(--color-text-secondary);">ACCURACY</div>
    </div>
    <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;">
      <div class="blunder-count" style="font-family:'Orbitron',sans-serif;font-size:1.2rem;color:#ff4466;">${blunderCount}</div>
      <div style="font-size:0.6rem;color:var(--color-text-secondary);">BLUNDERS</div>
    </div>
    <div style="text-align:center;padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;">
      <div class="win-prob-trend" style="color:#00ff88;">${game.finalEval > 0 ? '+' : ''}${game.finalEval}</div>
      <div style="font-size:0.6rem;color:var(--color-text-secondary);">FINAL EVAL</div>
    </div>
  </div>
  
  <!-- NEW: Win Probability Graph -->
  <div style="margin-bottom: 16px;">
    <div style="font-size:0.65rem;color:var(--color-accent-alt);margin-bottom:4px;">WIN PROBABILITY</div>
    ${renderWinProbabilityGraph(game.moveAnalysis)}
  </div>
  
  <!-- Move List with Classifications -->
  <div id="profile-game-detail-content" style="display: flex; flex-direction: column; gap: 12px;"></div>
</div>
```

### PHASE A: Game Replay & Export

#### Step A1: Enhance Game Record Structure
**Goal**: Add missing fields for analytics and more detail
**Method**: Update `_updateGameStats` in worker.js to store timerDuration and compute timeControl

In worker.js around line 830 (challenge creation), capture timerDuration:
```javascript
// Store timerDuration in game object
game.timerDuration = timerDuration;
game.timeControl = timerDuration <= 300 ? 'blitz' 
               : timerDuration <= 600 ? 'rapid' 
               : 'classical';
```

In `_updateGameStats` (line 1046), update record:
```javascript
const gameRecord = {
  gameId: game.gameId,
  type: game.type || 'pvp',
  result: whiteResult,
  timerDuration: game.timerDuration,     // NEW
  timeControl: game.timeControl,     // NEW
  moves: game.moves,                // already stored
  fen: game.moves.length > 0 ? game.moves[game.moves.length - 1].fen : null
  // ... existing fields
};
```

**Reference**: `worker.js` lines 830, 1046-1054

#### Step A2: Add Replay UI in Profile Panel
**Goal**: Display clickable game list in history section with replay capability

In index.html, update profile-history-section (line ~407):
```html
<div id="profile-history-section" style="display: none;">
  <!-- NEW: Filter tabs -->
  <div style="display: flex; gap: 6px; margin-bottom: 8px;">
    <button class="btn-cyber active" onclick="filterHistory('all')" style="flex:1;padding:6px;font-size:0.6rem;">ALL</button>
    <button class="btn-cyber" onclick="filterHistory('win')" style="flex:1;padding:6px;font-size:0.6rem;">W</button>
    <button class="btn-cyber" onclick="filterHistory('loss')" style="flex:1;padding:6px;font-size:0.6rem;">L</button>
    <button class="btn-cyber" onclick="filterHistory('draw')" style="flex:1;padding:6px;font-size:0.6rem;">D</button>
  </div>
  <div id="profile-history-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 280px; overflow-y: auto;"></div>
</div>
```

**Reference**: `index.html` lines 407-409

#### Step A3: Add Replay Functions
**Goal**: Enable loading a game from history back onto the board

In app.js, add:
```javascript
// Load game from history for replay
function loadGameFromHistory(gameRecord) {
  if (!gameRecord || !gameRecord.moves) return;
  
  // Reset game and replay moves
  const tempGame = new Chess();
  for (const move of gameRecord.moves) {
    tempGame.move(move);
  }
  game = tempGame;
  notationHistory = gameRecord.moves;
  currentNotationIndex = notationHistory.length - 1;
  isReviewingHistory = false;
  
  // Switch to analysis mode for replay
  selectGameModeTab('analysis');
  renderBoard();
  renderNotation();
  showNotification('Game loaded for review', 'success');
}

// Export game as PGN
function exportGameAsPGN(gameRecord) {
  if (!gameRecord || !gameRecord.moves) return '';
  
  const tempGame = new Chess();
  let pgn = `[Event "NeonSkull Cyber-Chess"]
[Site "Online"]
[Date "${new Date(gameRecord.timestamp).toISOString().split('T')[0]}"]
[White "${profileUser.username}"]
[Black "${gameRecord.opponent.username}"]
[Result "${gameRecord.result === 'win' ? '1-0' : gameRecord.result === 'loss' ? '0-1' : '1/2-1/2'}"]
[TimeControl "${gameRecord.timerDuration || 600}"]
[ECO "-"]

`;

  for (let i = 0; i < gameRecord.moves.length; i++) {
    const move = gameRecord.moves[i];
    tempGame.move(move);
    if (i % 2 === 0) {
      pgn += `${Math.floor(i/2) + 1}. `;
    }
    pgn += `${move.san} `;
  }
  
  pgn += gameRecord.result === 'win' ? '1-0' 
       : gameRecord.result === 'loss' ? '0-1' 
       : '1/2-1/2';
  
  return pgn;
}

// Export game as shareable URL (simple base64)
function shareGameURL(gameRecord) {
  if (!gameRecord || !gameRecord.gameId) return '';
  // Simple approach: use gameId as shareable reference
  return `${window.location.origin}/?game=${gameRecord.gameId}`;
}
```

**Reference**: `app.js` (new functions near profile functions ~line 2500)

#### Step A4: Add Export API Endpoint
**Goal**: Enable server-side game export

In worker.js, add REST endpoint:
```javascript
// --- REST: Get Game Details ---
if (url.pathname.startsWith('/api/game/') && request.method === 'GET') {
  const gameId = url.pathname.replace('/api/game/', '');
  // Could add direct game storage for sharing
  return jsonResponse({ gameId, message: 'Game lookup not yet implemented - use client replay' });
}
```

### PHASE B: Detailed Statistics Dashboard

#### Step B1: Add Analytics to Frontend
**Goal**: Compute and display win rates by time control, trends

In app.js, add:
```javascript
// Compute detailed stats from gameHistory
function computeDetailedStats(history) {
  if (!history || history.length === 0) return null;
  
  const stats = {
    total: history.length,
    wins: 0,
    losses: 0,
    draws: 0,
    byTimeControl: { blitz: { w:0,l:0,d:0 }, rapid: { w:0,l:0,d:0 }, classical: { w:0,l:0,d:0 } },
    recentTrend: [],  // last 10 games: 'win', 'loss', 'draw'
    avgGameLength: 0,
    piecesCaptured: { w: 0, b: 0 }
  };
  
  let totalMoves = 0;
  
  for (const game of history) {
    if (game.result === 'win') stats.wins++;
    else if (game.result === 'loss') stats.losses++;
    else stats.draws++;
    
    // Time control breakdown
    const tc = game.timeControl || 'rapid';
    if (stats.byTimeControl[tc]) {
      if (game.result === 'win') stats.byTimeControl[tc].w++;
      else if (game.result === 'loss') stats.byTimeControl[tc].l++;
      else stats.byTimeControl[tc].d++;
    }
    
    // Game length
    totalMoves += game.moves ? game.moves.length : 0;
    
    // Recent trend
    if (stats.recentTrend.length < 10) {
      stats.recentTrend.unshift(game.result);
    }
  }
  
  stats.avgGameLength = Math.round(totalMoves / history.length);
  return stats;
}

// Render stats widgets in profile
function renderDetailedStats(history) {
  const stats = computeDetailedStats(history);
  if (!stats) return;
  
  // Update UI elements
  const statsContainer = document.getElementById('profile-stats-detail');
  if (statsContainer) {
    const winRate = Math.round((stats.wins / stats.total) * 100);
    statsContainer.innerHTML = `
      <div style="grid-template-columns:1fr 1fr;gap:8px;display:grid;">
        <div class="stat-item">
          <span class="stat-value">${winRate}%</span>
          <span class="stat-label">Win Rate</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${stats.avgGameLength}</span>
          <span class="stat-label">Avg Moves</span>
        </div>
      </div>
      <div style="margin-top:8px;font-size:0.65rem;color:var(--color-text-secondary);">
        <div style="display:flex;gap:4px;">
          <span style="color:#00ff88;">● ${stats.byTimeControl.blitz.w}</span>
          <span style="color:#ff4466;">● ${stats.byTimeControl.blitz.l}</span>
          <span>BLITZ</span>
        </div>
        <div style="display:flex;gap:4px;">
          <span style="color:#00ff88;">● ${stats.byTimeControl.rapid.w}</span>
          <span style="color:#ff4466;">● ${stats.byTimeControl.rapid.l}</span>
          <span>RAPID</span>
        </div>
        <div style="display:flex;gap:4px;">
          <span style="color:#00ff88;">● ${stats.byTimeControl.classical.w}</span>
          <span style="color:#ff4466;">● ${stats.byTimeControl.classical.l}</span>
          <span>CLASSICAL</span>
        </div>
      </div>
    `;
  }
}
```

**Reference**: `app.js` new functions

#### Step B2: Enable Filter Function
**Goal**: Allow filtering history list

In app.js, add:
```javascript
let currentHistoryFilter = 'all';
let filteredHistory = [];

function filterHistory(filter) {
  currentHistoryFilter = filter;
  if (!profileUser || !profileUser.gameHistory) {
    filteredHistory = [];
    return;
  }
  
  if (filter === 'all') {
    filteredHistory = profileUser.gameHistory;
  } else {
    filteredHistory = profileUser.gameHistory.filter(g => g.result === filter);
  }
  renderHistoryList(filteredHistory);
}

function renderHistoryList(history) {
  const list = document.getElementById('profile-history-list');
  if (!list) return;
  
  if (!history || history.length === 0) {
    list.innerHTML = '<div style="font-size:0.75rem;color:var(--color-text-secondary);padding:10px;text-align:center;">No games found</div>';
    return;
  }
  
  let html = '';
  for (const game of history.slice(0, 20)) {
    const date = new Date(game.timestamp).toLocaleDateString();
    const resultColor = game.result === 'win' ? '#00ff88' : game.result === 'loss' ? '#ff4466' : 'var(--color-accent-alt)';
    html += `
      <div class="history-item" onclick="loadGameFromHistory(${JSON.stringify(game).replace(/"/g, '&quot;')})" style="padding:10px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);cursor:pointer;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:0.75rem;font-weight:bold;">${game.opponent.username}</div>
            <div style="font-size:0.6rem;color:var(--color-text-secondary);">${date} · ${game.timeControl || 'rapid'}</div>
          </div>
          <div style="font-size:0.8rem;font-weight:bold;" class="result-${game.result}">${game.result.toUpperCase()}</div>
        </div>
      </div>
    `;
  }
  list.innerHTML = html;
}
```

### PHASE C: Profile Customization

#### Step C1: Extend User Object
**Goal**: Add bio and favoriteOpening fields

In worker.js register endpoint (~line 117), add:
```javascript
const user = {
  id: uuidv4(),
  username: username.trim(),
  passwordHash,
  friends: [],
  profilePicture: null,
  bio: '',                    // NEW
  favoriteOpening: null,       // NEW
  preferredTheme: 'rave',     // NEW
  gameHistory: [],
  friendRequests: [],
  outgoingRequests: [],
  lastSeen: Date.now(),
  rating: 1500,
  stats: { won: 0, lost: 0, drawn: 0 }
};
```

Also update login response (~line 151) to return these fields:
```javascript
return jsonResponse({
  success: true,
  user: {
    id: user.id,
    username: user.username,
    rating: user.rating,
    friends: user.friends,
    profilePicture: user.profilePicture,
    bio: user.bio,                      // NEW
    favoriteOpening: user.favoriteOpening, // NEW
    preferredTheme: user.preferredTheme, // NEW
    gameHistory: user.gameHistory,
    friendRequests: user.friendRequests,
    outgoingRequests: user.outgoingRequests,
    lastSeen: user.lastSeen,
    stats: user.stats
  }
});
```

#### Step C2: Add Update Bio/Opening Endpoint
**Goal**: Allow users to update their bio and favorite opening

In worker.js, add REST endpoint:
```javascript
// --- REST: Update Profile Settings ---
if (url.pathname === '/api/profile/update' && request.method === 'POST') {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ error: 'Authorization required' }, 401);
  
  const token = authHeader.replace('Bearer ', '');
  const { bio, favoriteOpening, preferredTheme } = await request.json();
  
  const key = 'user:' + token.trim().toLowerCase();
  const raw = await env.USERS_KV.get(key);
  if (!raw) return jsonResponse({ error: 'User not found' }, 404);
  
  const user = JSON.parse(raw);
  if (bio !== undefined) user.bio = bio.substring(0, 160);  // Max 160 chars
  if (favoriteOpening !== undefined) user.favoriteOpening = favoriteOpening;
  if (preferredTheme !== undefined) user.preferredTheme = preferredTheme;
  
  await env.USERS_KV.put(key, JSON.stringify(user));
  return jsonResponse({ success: true, user: { bio: user.bio, favoriteOpening: user.favoriteOpening, preferredTheme: user.preferredTheme } });
}
```

#### Step C3: Add UI for Bio/Opening
**Goal**: Display editable bio and favorite opening in profile header

In index.html, update profile header section (~line 350):
```html
<div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 10px; border: 1px solid rgba(255,255,255,0.06); margin-bottom: 14px;">
  <!-- Avatar (existing) -->
  <div id="profile-avatar-container" style="width: 60px; height: 60px; border-radius: 50%; background: var(--color-accent); display: flex; align-items: center; justify-content: center; overflow: hidden; border: 2px solid var(--color-accent);">
    <img id="profile-avatar-img" src="" style="width: 100%; height: 100%; object-fit: cover; display: none;">
    <i class="fa-solid fa-user-astronaut" style="font-size: 1.8rem; color: var(--color-bg);"></i>
  </div>
  
  <!-- Username and Bio (updated) -->
  <div style="flex: 1;">
    <div style="font-family: 'Orbitron', sans-serif; font-size: 0.9rem; font-weight: 700;" id="profile-username-display">—</div>
    <div style="font-size: 0.65rem; color: var(--color-accent-alt);" id="profile-bio-display"></div>
    <div style="font-size: 0.6rem; color: var(--color-text-secondary); margin-top: 2px;">
      ⚡ ELO: <span id="profile-rating-display">1500</span>
      <span id="profile-favorite-opening" style="margin-left: 8px;">· Favorite: —</span>
    </div>
  </div>
  
  <!-- Edit button -->
  <button class="btn-cyber" onclick="editProfileSettings()" style="padding: 6px 10px; font-size: 0.65rem;">
    <i class="fa-solid fa-pen"></i>
  </button>
  <input type="file" id="profile-picture-input" accept="image/*" style="display: none;" onchange="uploadProfilePicture(this)">
</div>
```

Add edit modal in index.html (after profile-game-detail modal):
```html
<!-- Bio/Opening Edit Modal -->
<div id="profile-edit-modal" style="display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.9); z-index: 1000; padding: 20px; overflow-y: auto;">
  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
    <div style="font-family: 'Orbitron', sans-serif; font-size: 0.9rem;">EDIT PROFILE</div>
    <button class="btn-cyber" onclick="closeProfileEditModal()" style="padding: 6px 10px;"><i class="fa-solid fa-xmark"></i></button>
  </div>
  
  <div style="display: flex; flex-direction: column; gap: 16px;">
    <div>
      <label class="control-label">BIO (MAX 160 CHARS)</label>
      <textarea id="profile-bio-input" class="select-cyber" maxlength="160" placeholder="Tell others about yourself..." style="width: 100%; height: 80px; resize: none;"></textarea>
    </div>
    
    <div>
      <label class="control-label">FAVORITE OPENING</label>
      <select id="profile-opening-select" class="select-cyber" style="width: 100%;">
        <option value="">— Select —</option>
        <option value="e4">1. e4 (King's Pawn)</option>
        <option value="d4">1. d4 (Queen's Pawn)</option>
        <option value="c4">1. c4 (English)</option>
        <option value="Nf3">1. Nf3 (Reti)</option>
        <option value="b3">1. b3 (English Accelerated)</option>
        <option value="f4">1. f4 (Bird)</option>
      </select>
    </div>
    
    <button class="btn-cyber active" onclick="saveProfileSettings()" style="width: 100%; justify-content: center; padding: 12px;">
      <i class="fa-solid fa-floppy-disk"></i> SAVE CHANGES
    </button>
  </div>
</div>
```

#### Step C4: Add Save Functions in app.js
**Goal**: Handle saving bio and favorite opening

In app.js, add:
```javascript
function editProfileSettings() {
  document.getElementById('profile-edit-modal').style.display = 'block';
  document.getElementById('profile-bio-input').value = profileUser.bio || '';
  document.getElementById('profile-opening-select').value = profileUser.favoriteOpening || '';
}

function closeProfileEditModal() {
  document.getElementById('profile-edit-modal').style.display = 'none';
}

async function saveProfileSettings() {
  const bio = document.getElementById('profile-bio-input').value.trim();
  const favoriteOpening = document.getElementById('profile-opening-select').value;
  
  try {
    const res = await fetch(API_BASE + '/api/profile/update', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + profileUser.username
      },
      body: JSON.stringify({ bio, favoriteOpening })
    });
    const data = await res.json();
    
    if (!res.ok) {
      showNotification(data.error || 'Error saving profile', 'error');
      return;
    }
    
    profileUser.bio = bio;
    profileUser.favoriteOpening = favoriteOpening;
    updateProfileDisplay();
    closeProfileEditModal();
    showNotification('Profile updated!', 'success');
  } catch (err) {
    showNotification('Error saving profile', 'error');
  }
}
```

### PHASE D: Activity Feed

#### Step D1: Add Friend Activity WebSocket Events
**Goal**: Track and broadcast when friends play games

In worker.js, add new message types:

```javascript
case 'friend-game-started': {
  // Notify friends when user starts a game
  const { gameId, timerDuration } = payload;
  const conn = this.connections.get(socketId);
  if (!conn) return;
  
  // Get friends list
  const userKey = 'user:' + conn.user.username.toLowerCase();
  const userRaw = await this.env.USERS_KV.get(userKey);
  if (!userRaw) break;
  const user = JSON.parse(userRaw);
  
  // Broadcast to online friends - need usernameIndex
  for (const friendName of user.friends || []) {
    const friendSocketId = this.usernameIndex.get(friendName.toLowerCase());
    if (friendSocketId) {
      const friendConn = this.connections.get(friendSocketId);
      if (friendConn) {
        this._send(friendConn.ws, 'friend-game-activity', {
          username: conn.user.username,
          activity: 'started',
          gameId,
          timerDuration,
          timestamp: Date.now()
        });
      }
    }
  }
  break;
}

case 'friend-game-ended': {
  // Notify friends when user finishes a game
  const { gameId, result, ratingChange } = payload;
  const conn = this.connections.get(socketId);
  if (!conn) return;
  // Similar broadcast to friends
  break;
}

// Track userId to username index
this.userIndex.set(user.id, socketId);
// Also track username for friend lookups - add this to constructor
this.usernameIndex = new Map();
this.usernameIndex.set(user.username.toLowerCase(), socketId);
```

In webSocketClose, clean up (~line 959):
```javascript
async webSocketClose(ws, code, reason, wasClean) {
  // ... existing code
  if (conn) {
    this.usernameIndex.delete(conn.user.username.toLowerCase());
  }
}
```

#### Step D2: Add Activity Feed UI
**Goal**: Show friends' recent activity in profile

In index.html, add to profile panel (after friends list):
```html
<div id="profile-activity-section" style="display: none;">
  <div style="font-family: 'Orbitron', sans-serif; font-size: 0.65rem; letter-spacing: 1px; color: var(--color-accent-alt); margin-bottom: 6px;">RECENT ACTIVITY</div>
  <div id="activity-feed-list" style="display: flex; flex-direction: column; gap: 6px; max-height: 180px; overflow-y: auto;"></div>
</div>
```

Add sub-tab for activity:
```html
<div style="display: flex; gap: 6px; margin-bottom: 12px;">
  <button class="btn-cyber active" id="profile-tab-friends" onclick="profileShowSubTab('friends')" style="flex: 1; justify-content: center; padding: 8px 4px; font-size: 0.7rem;">FRIENDS</button>
  <button class="btn-cyber" id="profile-tab-history" onclick="profileShowSubTab('history')" style="flex: 1; justify-content: center; padding: 8px 4px; font-size: 0.7rem;">HISTORY</button>
  <button class="btn-cyber" id="profile-tab-activity" onclick="profileShowSubTab('activity')" style="flex: 1; justify-content: center; padding: 8px 4px; font-size: 0.7rem;">ACTIVITY</button>
</div>
```

#### Step D3: Handle Activity Events in app.js
**Goal**: Display and respond to friend activity

In app.js, add:
```javascript
let friendActivityFeed = [];

// Handle incoming friend activity
if (message.type === 'friend-game-activity') {
  const { username, activity, gameId, timerDuration, result, ratingChange, timestamp } = message.payload;
  const activityItem = { username, activity, gameId, timerDuration, result, ratingChange, timestamp };
  friendActivityFeed.unshift(activityItem);
  if (friendActivityFeed.length > 10) friendActivityFeed.pop();
  renderActivityFeed();
  
  // Show notification for new activity
  if (activity === 'started') {
    showNotification(`${username} started a game!`, 'info');
  } else if (activity === 'ended') {
    showNotification(`${username} finished: ${result}`, 'info');
  }
}

function renderActivityFeed() {
  const list = document.getElementById('activity-feed-list');
  if (!list) return;
  
  if (!friendActivityFeed || friendActivityFeed.length === 0) {
    list.innerHTML = '<div style="font-size:0.75rem;color:var(--color-text-secondary);padding:10px;text-align:center;">No recent activity</div>';
    return;
  }
  
  let html = '';
  for (const act of friendActivityFeed) {
    const timeAgo = getTimeAgo(act.timestamp);
    if (act.activity === 'started') {
      html += `
        <div style="padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:0.7rem;">
          <span style="font-weight:bold;">${act.username}</span> started a ${act.timerDuration >= 600 ? 'rapid' : 'blitz'} game
          <span style="color:var(--color-text-secondary);margin-left:4px;">· ${timeAgo}</span>
        </div>
      `;
    } else if (act.activity === 'ended') {
      html += `
        <div style="padding:8px;background:rgba(255,255,255,0.03);border-radius:6px;font-size:0.7rem;">
          <span style="font-weight:bold;">${act.username}</span> ${act.result} (+${act.ratingChange || 0})
          <span style="color:var(--color-text-secondary);margin-left:4px;">· ${timeAgo}</span>
        </div>
      `;
    }
  }
  list.innerHTML = html;
}

function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h';
  return Math.floor(seconds / 86400) + 'd';
}
```

#### Step D4: Spectate Friend's Game
**Goal**: Watch a friend's live game

In app.js, add:
```javascript
// Spectate a friend's game
function spectateFriendGame(gameId) {
  // For now, just show a message
  showNotification('Spectating coming soon!', 'info');
  // Real implementation would connect to game's WebSocket stream
}
```

In activity feed HTML (from Step D2), add click-to-spectate:
```html
<div onclick="spectateFriendGame('${act.gameId}')" style="cursor:pointer;...
```

## 5. TESTING AND VALIDATION

### Feature Validation Checklist

**Phase A - Game Replay & Export:**
- [ ] Open profile → History tab shows recent games
- [ ] Click on a game → Board loads with game position displayed
- [ ] Use arrow keys → Navigate through game moves (existing notation review)
- [ ] Export PGN → Downloads valid PGN file (check with chess.com import)
- [ ] Filter buttons → Filter correctly shows W/L/D only

**Phase B - Statistics:**
- [ ] Win rate percentage displays correctly (wins/total * 100)
- [ ] Avg game length displays (total moves / games)
- [ ] Time control breakdown shows blitz/rapid/classical counts

**Phase C - Profile Customization:**
- [ ] Click pen icon → Edit modal opens
- [ ] Enter bio (160 char max) → Saves correctly
- [ ] Select favorite opening → Shows on profile header
- [ ] Logout and login → Bio and opening persist

**Phase D - Activity Feed:**
- [ ] Friend starts game → Notification appears (when friend online)
- [ ] Activity tab shows recent activity
- [ ] Click spectate → Attempts to join game (placeholder)

**Phase E - Chess.com-Style Game Review:**
- [ ] Click game → Stockfish analyzes each position
- [ ] Move chips show with colors (green=good, red=blunder, yellow=inaccuracy)
- [ ] Accuracy % displays on history item badges
- [ ] Win probability graph renders as SVG line chart
- [ ] Game detail modal shows: Accuracy score, Blunders count, Final eval
- [ ] "Brilliant" moves detected and highlighted

### Test Scenarios

1. **New user registration**: Check bio, favoriteOpening default to null/empty
2. **Multiple games**: Verify win rate calculation across 10+ games
3. **Time control**: Play blitz (3min) and rapid (10min), verify classification correct
4. **Export**: Import exported PGN into chess.com - verify moves match
5. **Two users**: Both online, start game → other sees activity notification

**Phase E - Game Review Test Scenarios:**
1. **Load game for review** → Click any past game → Stockfish analyzes each position → classifications appear
2. **Accuracy display** → Verify accuracy % shows in history list and detail modal
3. **Win probability graph** → Verify SVG graph renders with eval trend line
4. **Move chips** → Blunders in red, good in green, inaccuracies in yellow
5. **Brilliant detection** → Play a tactic Stockfish misses → should show as "brilliant"

---

# Original Profile Plan (Phase 1)

# 2. CONTEXT SUMMARY
**Existing System:**
- Cloudflare Workers backend (`worker.js`) with KV storage for user data
- WebSocket-based online multiplayer via `LobbyRoom` Durable Object
- Existing user schema: `id, username, passwordHash, friends[], rating, stats{won, lost, drawn}`
- Cyberpunk-themed HTML/CSS UI with sidebar navigation

**Key Files:**
- `worker.js` - Cloudflare Worker with REST API and WebSocket handling
- `index.html` - Main UI with sidebar tabs
- `users.json` - Local user data (development)

# 3. APPROACH OVERVIEW
**Storage Schema Changes:**
- Add `profilePicture` field (base64 string) to user object
- Add `gameHistory` array to store game records
- Add `friendRequests` array for incoming requests
- Add `outgoingRequests` array for sent requests

**Backend Changes:**
- New REST endpoints for profile picture upload, game history, friend requests
- Extend WebSocket messages for friend system and status updates

**Frontend Changes:**
- New "Profile" navigation tab with profile editor
- Profile view component (display picture, stats, friends list)
- Game history viewer with game replay
- Friends management UI (friends list, requests, search)

# 4. IMPLEMENTATION STEPS

## Step 1: Extend User Schema in Cloudflare Worker
**Goal:** Update user data model to support profile pictures, game history, and friend requests

**Method:** Modify `worker.js` to add new fields:
- Add `profilePicture` (string, base64 encoded image)
- Add `gameHistory` (array of game records)
- Add `friendRequests` (array of {userId, username} objects)
- Add `outgoingRequests` (array of {userId, username} objects)
- Add `lastSeen` timestamp for online status

**Reference:** `worker.js` lines 117-126 (user object creation in register)

## Step 2: Add Profile Picture Upload API
**Goal:** Allow users to upload profile pictures stored as base64

**Method:** Create new REST endpoint `POST /api/profile/picture`:
- Accept base64 image data in request body
- Validate image size (max 500KB) and format (jpeg/png/gif/webp)
- Store in user record in KV

**Reference:** New endpoint after line 156 in `worker.js`

## Step 3: Add Game History API
**Goal:** Enable storing and retrieving game history

**Method:** Create new REST endpoints:
- `POST /api/game/history` - Record completed game (called after game ends)
- `GET /api/game/history` - Retrieve user's game history
- `GET /api/game/history/:gameId` - Get specific game details

**Game record schema:**
```
{
  gameId: string,
  type: "ai" | "pvp" | "online",
  result: "win" | "loss" | "draw",
  opponent: { id, username } | "AI",
  timestamp: number,
  moves: [{from, to, san, promotion}],  // move history
  fen: string  // final position
}
```

**Reference:** New endpoints in `worker.js` fetch handler

## Step 4: Add Friend Request System API
**Goal:** Implement send/accept/decline friend requests

**Method:** Create WebSocket message handlers:
- `send-friend-request` - Add to target's friendRequests
- `accept-friend-request` - Move from requests to friends
- `decline-friend-request` - Remove from requests
- `remove-friend` - Remove from friends list
- `get-friend-requests` - Fetch pending requests

Add REST endpoints for profile data:
- `GET /api/user/:username` - Get public profile (for viewing friends)
- `GET /api/friends` - Get friends list with online status

**Reference:** New cases in `worker.js` WebSocket message handler (around line 202)

## Step 5: Update Game End to Record History
**Goal:** Automatically record games to history when they complete

**Method:** Modify existing `game-over-sync` handler to also:
- Call game history API to record the game
- Update both players' game history

**Reference:** `worker.js` around line 250-268

## Step 6: Add Profile Tab UI in HTML
**Goal:** Add new Profile navigation tab to the sidebar

**Method:** Add new tab button and drawer panel in `index.html`:
- Add `<button class="nav-tab-cyber" id="tab-profile">` in nav-tabs
- Add `<div class="drawer-panel-cyber" id="panel-profile">` with:
  - Profile picture display and upload button
  - Username display (read-only)
  - Rating display
  - Stats (wins/losses/draws)
  - Edit profile button

**Reference:** `index.html` line 41-66 (nav tabs), line 77-123 (drawer panels)

## Step 7: Add Friends Panel UI
**Goal:** Display and manage friends in the Profile tab

**Method:** Add to Profile panel:
- Friends section showing:
  - Friend cards with avatar, username, rating, online status
  - Click to view friend's full profile
  - Challenge button to invite friend to game
- Pending requests section:
  - Accept/Decline buttons for incoming requests
- Add Friend input to search and send requests

**Reference:** New panel content in `index.html`

## Step 8: Add Game History Viewer UI
**Goal:** Display and interact with game history

**Method:** Add history panel in Profile tab:
- List of past games (grouped by date)
- Show: opponent, result, date, game type
- Click game to view details
- Game detail view:
  - Replay moves (prev/next buttons)
  - Final FEN position display
  - Result and date info

**Reference:** New panel content in `index.html`

## Step 9: Add Frontend JavaScript Logic
**Goal:** Connect UI to backend APIs

**Method:** Add functions in `app.js`:
- `uploadProfilePicture(file)` - Handle image upload
- `loadProfile()` - Fetch and display user profile
- `loadFriends()` - Fetch friends list with status
- `loadGameHistory()` - Fetch and display history
- `sendFriendRequest(username)` - Send request
- `acceptFriendRequest(userId)` - Accept request
- `declineFriendRequest(userId)` - Decline request
- `removeFriend(userId)` - Remove friend
- `challengeFriend(userId)` - Start game with friend
- `viewGame(gameId)` - View/replay specific game
- Socket listeners for friend status updates

**Reference:** New functions in `app.js`

## Step 10: Update Online Status Broadcasting
**Goal:** Show real-time online/offline status for friends

**Method:** Enhance `worker.js` to:
- Track and broadcast `user-online` / `user-offline` events
- Include `lastSeen` timestamp in friend data
- Update status when users connect/disconnect

**Reference:** `worker.js` `_broadcastOnlineStatus()` around line 377

# 5. TESTING AND VALIDATION

**Verification Criteria:**
1. User can register/login and see Profile tab
2. User can upload an image as profile picture (up to 500KB)
3. User can send friend request to another user
4. User can accept/decline incoming friend requests
5. User can see friends list with online/offline status
6. User can click friend to view their profile and stats
7. User can challenge friend to a game
8. After playing any game (AI/Local/Online), game appears in history
9. User can click game in history to view details
10. User can replay moves in game history viewer

**Manual Test Scenarios:**
1. Register two users, upload different profile pictures, verify both display correctly
2. User A sends friend request to User B, verify User B sees it and can accept
3. After accepting, verify User A sees B in friends list
4. Play an AI game, verify it appears in game history
5. Play an online game, verify it appears in both players' history
6. View a past game and replay moves to verify correctness
7. One user goes online, friend's status shows "Online"
