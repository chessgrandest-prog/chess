/* =========================================================================
   NEONSKULL CYBER-CHESS CORE ENGINE & PUZZLE SOLVER
   =========================================================================
   Governs local game configurations, Minimax searches, particle splash,
   sound synthesis, Lichess Daily API integration, and tactical offline mission grids.
   ========================================================================= */

// =========================================================================
// CSS-INDEPENDENT WEBAUDIO SOUND SYNTHESIS
// =========================================================================
class WebAudioSynth {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
  }

  play(type) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    const now = this.ctx.currentTime;

    try {
      if (type === 'move') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

        osc.start(now);
        osc.stop(now + 0.08);

      } else if (type === 'capture') {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);

        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

        osc.start(now);
        osc.stop(now + 0.12);

        const highOsc = this.ctx.createOscillator();
        const highGain = this.ctx.createGain();
        highOsc.connect(highGain);
        highGain.connect(this.ctx.destination);
        highOsc.type = 'triangle';
        highOsc.frequency.setValueAtTime(900, now);
        highOsc.frequency.exponentialRampToValueAtTime(300, now + 0.05);

        highGain.gain.setValueAtTime(0.05, now);
        highGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

        highOsc.start(now);
        highOsc.stop(now + 0.05);

      } else if (type === 'check') {
        const alarmFrequencies = [587.33, 698.46];
        alarmFrequencies.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          osc.frequency.exponentialRampToValueAtTime(freq * 1.3, now + idx * 0.08 + 0.15);

          gain.gain.setValueAtTime(0.1, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.15);

          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.15);
        });

      } else if (type === 'win') {
        const arpeggio = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
        arpeggio.forEach((freq, idx) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.07);

          gain.gain.setValueAtTime(0.12, now + idx * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.35);

          osc.start(now + idx * 0.07);
          osc.stop(now + idx * 0.07 + 0.35);
        });

      } else if (type === 'lose') {
        const chords = [196.00, 233.08, 277.18];
        chords.forEach((freq) => {
          const osc = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          osc.connect(gain);
          gain.connect(this.ctx.destination);

          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now);
          osc.frequency.linearRampToValueAtTime(freq * 0.5, now + 0.65);

          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

          osc.start(now);
          osc.stop(now + 0.65);
        });
      }
    } catch (e) {
      console.error("Audio synth error: ", e);
    }
  }
}

const soundCtrl = new WebAudioSynth();

function toggleMute() {
  soundCtrl.muted = !soundCtrl.muted;
  const icon = document.querySelector('#mute-btn i');
  const text = document.getElementById('mute-text');
  if (soundCtrl.muted) {
    icon.className = 'fa-solid fa-volume-xmark';
    text.innerText = 'SOUND OFF';
    document.getElementById('mute-btn').classList.remove('active');
  } else {
    icon.className = 'fa-solid fa-volume-high';
    text.innerText = 'SOUND ON';
    document.getElementById('mute-btn').classList.add('active');
    soundCtrl.play('move');
  }
}

// =========================================================================
// PIECE-SQUARE TABLES (PST) FOR POSITION VALUATION
// =========================================================================
const PAWN_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5, 5, 10, 25, 25, 10, 5, 5],
  [0, 0, 0, 20, 20, 0, 0, 0],
  [5, -5, -10, 0, 0, -10, -5, 5],
  [5, 10, 10, -20, -20, 10, 10, 5],
  [0, 0, 0, 0, 0, 0, 0, 0]
];

const KNIGHT_PST = [
  [-50, -40, -30, -30, -30, -30, -40, -50],
  [-40, -20, 0, 0, 0, 0, -20, -40],
  [-30, 0, 10, 15, 15, 10, 0, -30],
  [-30, 5, 15, 20, 20, 15, 5, -30],
  [-30, 0, 15, 20, 20, 15, 0, -30],
  [-30, 5, 10, 15, 15, 10, 5, -30],
  [-40, -20, 0, 5, 5, 0, -20, -40],
  [-50, -40, -30, -30, -30, -30, -40, -50]
];

const BISHOP_PST = [
  [-20, -10, -10, -10, -10, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 10, 10, 5, 0, -10],
  [-10, 5, 5, 10, 10, 5, 5, -10],
  [-10, 0, 10, 10, 10, 10, 0, -10],
  [-10, 10, 10, 10, 10, 10, 10, -10],
  [-10, 5, 0, 0, 0, 0, 5, -10],
  [-20, -10, -10, -10, -10, -10, -10, -20]
];

const ROOK_PST = [
  [0, 0, 0, 0, 0, 0, 0, 0],
  [5, 10, 10, 10, 10, 10, 10, 5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [-5, 0, 0, 0, 0, 0, 0, -5],
  [0, 0, 0, 5, 5, 0, 0, 0]
];

const QUEEN_PST = [
  [-20, -10, -10, -5, -5, -10, -10, -20],
  [-10, 0, 0, 0, 0, 0, 0, -10],
  [-10, 0, 5, 5, 5, 5, 0, -10],
  [-5, 0, 5, 5, 5, 5, 0, -5],
  [0, 0, 5, 5, 5, 5, 0, -5],
  [-10, 5, 5, 5, 5, 5, 0, -10],
  [-10, 0, 5, 0, 0, 5, 0, -10],
  [-20, -10, -10, -5, -5, -10, -10, -20]
];

const KING_PST = [
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-30, -40, -40, -50, -50, -40, -40, -30],
  [-20, -30, -30, -40, -40, -30, -30, -20],
  [-10, -20, -20, -20, -20, -20, -20, -10],
  [20, 20, 0, 0, 0, 0, 20, 20],
  [20, 30, 10, 0, 0, 10, 30, 20]
];

function getPieceValue(piece) {
  if (!piece) return 0;
  switch (piece.type) {
    case 'p': return 100;
    case 'n': return 320;
    case 'b': return 330;
    case 'r': return 500;
    case 'q': return 900;
    case 'k': return 20000;
    default: return 0;
  }
}

function getPositionalValue(piece, r, c) {
  const row = (piece.color === 'w') ? r : 7 - r;
  switch (piece.type) {
    case 'p': return PAWN_PST[row][c];
    case 'n': return KNIGHT_PST[row][c];
    case 'b': return BISHOP_PST[row][c];
    case 'r': return ROOK_PST[row][c];
    case 'q': return QUEEN_PST[row][c];
    case 'k': return KING_PST[row][c];
    default: return 0;
  }
}

// =========================================================================
// CORE CHESS AI: MINIMAX SEARCH AGENT WITH PRUNING
// =========================================================================
function evaluateBoard(board) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (piece) {
        let val = getPieceValue(piece);
        let posVal = getPositionalValue(piece, r, c);
        let pieceValTotal = val + posVal;
        if (piece.color === 'w') {
          score += pieceValTotal;
        } else {
          score -= pieceValTotal;
        }
      }
    }
  }
  return score;
}

function minimax(gameInstance, depth, alpha, beta, isMaximizing) {
  if (depth === 0 || gameInstance.game_over()) {
    return [evaluateBoard(gameInstance.board()), null];
  }

  const moves = gameInstance.moves({ verbose: true });

  moves.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    if (a.captured) scoreA += 10 + getPieceValue({ type: a.captured });
    if (b.captured) scoreB += 10 + getPieceValue({ type: b.captured });
    if (a.flags.includes('p')) scoreA += 50;
    if (b.flags.includes('p')) scoreB += 50;
    return scoreB - scoreA;
  });

  let bestMove = null;

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const move of moves) {
      gameInstance.move(move);
      const [evalVal] = minimax(gameInstance, depth - 1, alpha, beta, false);
      gameInstance.undo();

      if (evalVal > maxEval) {
        maxEval = evalVal;
        bestMove = move;
      }
      alpha = Math.max(alpha, evalVal);
      if (beta <= alpha) break;
    }
    return [maxEval, bestMove];
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      gameInstance.move(move);
      const [evalVal] = minimax(gameInstance, depth - 1, alpha, beta, true);
      gameInstance.undo();

      if (evalVal < minEval) {
        minEval = evalVal;
        bestMove = move;
      }
      beta = Math.min(beta, evalVal);
      if (beta <= alpha) break;
    }
    return [minEval, bestMove];
  }
}

// =========================================================================
// CHESS GAME UI STATE CONTROLLER
// =========================================================================
let game = new Chess();
let boardFlipped = false;
let selectedSquare = null;
let possibleMoves = [];
let isAITurn = false;
let aiSearchStartTime = 0;

// Clocks State
let timeWhite = 600;
let timeBlack = 600;
let timerInterval = null;
let activePlayer = 'w';
let isInfiniteTimer = false;

// -------------------------------------------------------------------------
// NEW ADVANCED TACTICAL PUZZLES SOLVER ENGINE
// -------------------------------------------------------------------------
let puzzleMode = false;
let currentPuzzle = null;
let puzzleStep = 0;
let currentPuzzleSource = 'lichess'; // 'lichess' | 'daily' | 'history'
let analysisModeActive = false;
let _puzzlePerfect = true; // false if player made any incorrect move this puzzle
let sessionHistory = [];

// Filters
let currentDifficultyFilter = 'all';
let currentThemeFilter = 'all';

// localStorage Retention
let playerStats = {
  tacticalRating: 1500,
  solvedPuzzles: [],
  failedPuzzles: []
};

// Interaction Pointer state
let isDragging = false;
let dragStartSquare = null;
let dragClone = null;
let shouldDeselectOnClick = false;

// Spark Particles variables
let particles = [];
const canvas = document.getElementById('particles-canvas');
const ctxCanvas = canvas.getContext('2d');

// On load hooks
window.addEventListener('load', () => {
  initParticles();
  loadUserStats();
  onGameModeChange(); // Loads VS AI first by default
  animateParticles();
});

window.addEventListener('resize', resizeCanvas);

function resizeCanvas() {
  if (canvas) {
    const parent = canvas.parentElement;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
  }
}

function loadUserStats() {
  const ratingStr = localStorage.getItem('cyberChess_tacticalRating');
  const solvedStr = localStorage.getItem('cyberChess_solvedPuzzles');
  const failedStr = localStorage.getItem('cyberChess_failedPuzzles');

  if (ratingStr) playerStats.tacticalRating = parseInt(ratingStr);
  if (solvedStr) playerStats.solvedPuzzles = JSON.parse(solvedStr);
  if (failedStr) playerStats.failedPuzzles = JSON.parse(failedStr);

  updateProgressWidget();
}

function saveUserStats() {
  localStorage.setItem('cyberChess_tacticalRating', playerStats.tacticalRating);
  localStorage.setItem('cyberChess_solvedPuzzles', JSON.stringify(playerStats.solvedPuzzles));
  localStorage.setItem('cyberChess_failedPuzzles', JSON.stringify(playerStats.failedPuzzles));
}

function updateProgressWidget() {
  const ratingVal = document.getElementById('stat-rating');
  const solvedVal = document.getElementById('stat-solved');
  const rateVal = document.getElementById('stat-rate');

  if (ratingVal) ratingVal.innerText = playerStats.tacticalRating;
  if (solvedVal) solvedVal.innerText = playerStats.solvedPuzzles.length;

  if (rateVal) {
    const totalPlayed = playerStats.solvedPuzzles.length + playerStats.failedPuzzles.length;
    if (totalPlayed === 0) {
      rateVal.innerText = "0%";
    } else {
      const percentage = Math.round((playerStats.solvedPuzzles.length / totalPlayed) * 100);
      rateVal.innerText = `${percentage}%`;
    }
  }
}

// Global theme updates
function changeTheme() {
  const theme = document.getElementById('theme-select').value;
  document.documentElement.setAttribute('data-theme', theme);

  const whiteGlow = getComputedStyle(document.documentElement).getPropertyValue('--color-white-glow').trim();
  const whitePiece = getComputedStyle(document.documentElement).getPropertyValue('--color-white-piece').trim();
  const promoOverlay = document.getElementById('promotion-overlay');

  if (promoOverlay) {
    promoOverlay.style.setProperty('--promo-color', whitePiece);
    promoOverlay.style.setProperty('--promo-glow', whiteGlow);

    // Update promotion SVGs dynamically
    const buttons = promoOverlay.querySelectorAll('.promo-btn');
    buttons.forEach(btn => {
      const type = btn.dataset.promo;
      const pieceName = getPieceName(type);
      btn.innerHTML = `<svg viewBox="-2 -2 49 49"><use href="#piece-${pieceName}"></use></svg>`;
    });
  }

  writeLog(`System Theme changed to ${theme.toUpperCase()}.`);

  // Re-render board and captured pieces so the new piece SVGs appear immediately!
  renderBoard();
  updateCapturedPieces();
}

// Mode Selection Handler
function onGameModeChange() {
  const mode = document.getElementById('game-mode').value;

  const pvpGroup = document.getElementById('pvp-controls-group');
  const puzzlesGroup = document.getElementById('puzzles-center-group');

  const blackName = document.getElementById('name-black');
  const blackAvatar = document.getElementById('avatar-black');
  const whiteName = document.getElementById('name-white');
  const whiteAvatar = document.getElementById('avatar-white');

  const hintBtn = document.getElementById('hint-btn');
  const flipBtn = document.getElementById('flip-btn');

  // Disengage active Stockfish analysis if moving to another mode
  if (isAnalysisActive) {
    isAnalysisActive = false;
    const evalBar = document.getElementById('eval-bar-wrapper');
    if (evalBar) evalBar.style.display = 'none';
    if (stockfishWorker) {
      stockfishWorker.postMessage('stop');
    }
    clearStockfishArrows();
  }

  // Cleanup solved stamp and dots
  const stamp = document.getElementById('puzzle-solved-stamp');
  if (stamp) stamp.classList.remove('active');
  const dotsHeader = document.getElementById('puzzle-dots-header');
  if (dotsHeader) dotsHeader.style.display = 'none';

  if (mode === 'ai') {
    puzzleMode = false;
    if (pvpGroup) pvpGroup.style.display = 'grid';
    if (puzzlesGroup) puzzlesGroup.style.display = 'none';
    if (hintBtn) hintBtn.style.display = 'none';
    if (flipBtn) flipBtn.style.display = 'flex';

    if (whiteName) whiteName.innerText = "NEON PLAYER";
    if (whiteAvatar) whiteAvatar.innerHTML = '<i class="fa-solid fa-user"></i>';
    if (blackName) blackName.innerText = "CYBER AI";
    if (blackAvatar) blackAvatar.innerHTML = '<i class="fa-solid fa-microchip"></i>';

    writeLog("Game Mode updated: VS CYBER AI.");
    initStockfish(); // Preload Stockfish so it's ready when the game starts!
    resetGame();
  } else if (mode === 'pvp') {
    puzzleMode = false;
    if (pvpGroup) pvpGroup.style.display = 'grid';
    if (puzzlesGroup) puzzlesGroup.style.display = 'none';
    if (hintBtn) hintBtn.style.display = 'none';
    if (flipBtn) flipBtn.style.display = 'flex';

    if (whiteName) whiteName.innerText = "NEON PLAYER";
    if (whiteAvatar) whiteAvatar.innerHTML = '<i class="fa-solid fa-user"></i>';
    if (blackName) blackName.innerText = "DARK PLAYER";
    if (blackAvatar) blackAvatar.innerHTML = '<i class="fa-solid fa-user-ninja"></i>';

    writeLog("Game Mode updated: LOCAL PASS & PLAY.");
    resetGame();
  } else if (mode === 'puzzle') {
    puzzleMode = true;
    if (pvpGroup) pvpGroup.style.display = 'none';
    if (puzzlesGroup) puzzlesGroup.style.display = 'flex';
    if (hintBtn) hintBtn.style.display = 'flex';
    if (flipBtn) flipBtn.style.display = 'none'; // Auto-flips, manual flip disabled!

    if (whiteName) whiteName.innerText = "NEON TACTICIAN";
    if (whiteAvatar) whiteAvatar.innerHTML = '<i class="fa-solid fa-brain"></i>';
    if (blackName) blackName.innerText = "PUZZLE BOT";
    if (blackAvatar) blackAvatar.innerHTML = '<i class="fa-solid fa-robot"></i>';

    writeLog("Game Mode updated: TACTICAL CHALLENGE CENTER.");

    // Load next Lichess matching puzzle continuously!
    loadNextLichessPuzzle();
  } else if (mode === 'analysis') {
    puzzleMode = false;
    isAnalysisActive = true;

    if (pvpGroup) pvpGroup.style.display = 'none';
    if (puzzlesGroup) puzzlesGroup.style.display = 'none';
    if (hintBtn) hintBtn.style.display = 'none';
    if (flipBtn) flipBtn.style.display = 'flex';

    if (whiteName) whiteName.innerText = "WHITE ANALYST";
    if (whiteAvatar) whiteAvatar.innerHTML = '<i class="fa-solid fa-graduation-cap"></i>';
    if (blackName) blackName.innerText = "BLACK ANALYST";
    if (blackAvatar) blackAvatar.innerHTML = '<i class="fa-solid fa-graduation-cap"></i>';

    const evalBar = document.getElementById('eval-bar-wrapper');
    if (evalBar) evalBar.style.display = 'flex';

    document.getElementById('terminal-state').innerText = "ANALYSIS BOARD";
    writeLog("<span style='color: #00f0ff; font-weight: bold;'>[SYSTEM ONLINE] Cyber Analysis board activated. Free play enabled.</span>");

    initStockfish();
    analyzePosition();
  }

  // Sync sidebar tabs visually with the active game mode
  if (!isTabSwitchingInProgress) {
    const sidebarTabName = mode === 'puzzle' ? 'puzzle' : mode;
    if (typeof switchSidebarTab === 'function' && activeSidebarTab !== sidebarTabName) {
      switchSidebarTab(sidebarTabName);
    }
  }
}

// -------------------------------------------------------------------------
// CONTINUOUS LICHESS PUZZLE DATABASE ENGINE
// -------------------------------------------------------------------------
function getDifficultyLabel(rating) {
  if (rating < 1200) return 'recruit';
  if (rating < 1600) return 'agent';
  if (rating < 2000) return 'specialist';
  return 'neuromancer';
}

function changeDifficultyFilter(diff) {
  currentDifficultyFilter = diff;
  const pills = document.querySelectorAll('#difficulty-pills .btn-filter');
  pills.forEach(p => {
    p.classList.toggle('active', p.dataset.filter === diff);
  });

  writeLog(`Difficulty filter calibrated: ${diff.toUpperCase()}`);
  loadNextLichessPuzzle();
}

function changeThemeFilter(theme) {
  currentThemeFilter = theme;
  const pills = document.querySelectorAll('#theme-pills .btn-filter');
  pills.forEach(p => {
    p.classList.toggle('active', p.dataset.filter === theme);
  });

  writeLog(`Tactical motif tag calibrated: ${theme.toUpperCase()}`);
  loadNextLichessPuzzle();
}

function loadNextLichessPuzzle() {
  if (!window.LICHESS_PUZZLES || window.LICHESS_PUZZLES.length === 0) {
    writeLog("CRITICAL: Puzzles database not fully loaded or empty.");
    return;
  }

  let pool = window.LICHESS_PUZZLES;

  // 1. Theme Filter
  if (currentThemeFilter !== 'all') {
    pool = pool.filter(p => {
      if (currentThemeFilter === 'mate') {
        return p.themes.some(t => t.toLowerCase().includes('mate'));
      } else {
        return p.themes.some(t => t.toLowerCase() === currentThemeFilter.toLowerCase());
      }
    });
  }

  // 2. Difficulty Filter
  if (currentDifficultyFilter !== 'all') {
    pool = pool.filter(p => {
      const r = p.rating;
      if (currentDifficultyFilter === 'recruit') return r < 1200;
      if (currentDifficultyFilter === 'agent') return r >= 1200 && r < 1600;
      if (currentDifficultyFilter === 'specialist') return r >= 1600 && r < 2000;
      if (currentDifficultyFilter === 'neuromancer') return r >= 2000;
      return true;
    });
  } else {
    // Relative progression matching player rating
    const targetRating = playerStats.tacticalRating;
    let tolerance = 150;
    let matched = pool.filter(p => Math.abs(p.rating - targetRating) <= tolerance);

    while (matched.length === 0 && tolerance < 1000) {
      tolerance += 150;
      matched = pool.filter(p => Math.abs(p.rating - targetRating) <= tolerance);
    }
    if (matched.length > 0) {
      pool = matched;
    }
  }

  if (pool.length === 0) {
    writeLog("[RECOVERY] No tag matches. Loading organic random selection...");
    pool = window.LICHESS_PUZZLES;
  }

  const randomIndex = Math.floor(Math.random() * pool.length);
  const selectedPuzzle = pool[randomIndex];

  currentPuzzleSource = 'lichess';
  initializePuzzleState(selectedPuzzle);
}

function renderSessionHistoryList() {
  const grid = document.getElementById('missions-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (sessionHistory.length === 0) {
    grid.innerHTML = `<div style="text-align: center; color: var(--color-text-secondary); font-size: 0.8rem; padding: 20px;">History logs offline. Begin training!</div>`;
    return;
  }

  // Render newest logs on top
  [...sessionHistory].reverse().forEach((puzz) => {
    let statusHTML = '<i class="fa-regular fa-circle mission-status-icon"></i>';
    if (puzz.status === 'solved') {
      statusHTML = '<i class="fa-solid fa-circle-check mission-status-icon solved"></i>';
    } else if (puzz.status === 'failed') {
      statusHTML = '<i class="fa-solid fa-circle-xmark mission-status-icon failed"></i>';
    }

    const diff = getDifficultyLabel(puzz.rating);
    const card = document.createElement('div');
    card.className = `mission-card ${currentPuzzle && currentPuzzle.id === puzz.id ? 'active-loading' : ''}`;

    card.onclick = () => {
      currentPuzzleSource = 'history';
      initializePuzzleState(puzz);
      setTimeout(() => {
        const btn = document.getElementById('analysis-btn');
        if (btn) btn.style.display = 'block';
        if (!analysisModeActive) toggleAnalysisMode();
      }, 50);
    };

    const primaryTheme = puzz.themes.length > 0 ? puzz.themes[0] : 'tactics';
    const capTheme = primaryTheme.charAt(0).toUpperCase() + primaryTheme.slice(1);

    card.innerHTML = `
      <div class="mission-left">
        ${statusHTML}
        <div class="mission-info">
          <div class="mission-title-text">${capTheme} Mission</div>
          <div class="mission-meta-text">
            <span class="rating-badge alt" style="padding: 1px 4px; font-size: 0.55rem;">${puzz.rating}</span>
            <span class="mission-difficulty-badge ${diff}">${diff}</span>
          </div>
        </div>
      </div>
      <i class="fa-solid fa-clock-rotate-left" style="font-size: 0.75rem; color: var(--color-accent-alt);"></i>
    `;
    grid.appendChild(card);
  });
}

// -------------------------------------------------------------------------
// LICHESS LIVE DAILY PUZZLE API HANDLER
// -------------------------------------------------------------------------
async function fetchLichessDailyPuzzle() {
  const terminalLog = document.getElementById('term-log');
  writeLog("Initiating connection with lichess.org API...");

  const dailyBtn = document.getElementById('load-daily-btn');
  if (dailyBtn) {
    dailyBtn.disabled = true;
    dailyBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> SYNCING...';
  }

  try {
    const response = await fetch('https://lichess.org/api/puzzle/daily');
    if (!response.ok) {
      throw new Error(`Lichess server responded with status: ${response.status}`);
    }

    const text = await response.text();
    const data = JSON.parse(text.trim());

    if (!data.puzzle || !data.puzzle.fen) {
      throw new Error("Invalid response shape received from Lichess.");
    }

    currentPuzzleSource = 'daily';

    // Map to unified schema safely
    const p1 = data.game?.players?.[0]?.name || data.game?.players?.white?.user?.name || "Player 1";
    const p2 = data.game?.players?.[1]?.name || data.game?.players?.black?.user?.name || "Player 2";
    const side = (data.puzzle?.fen?.split(' ')?.[1] === 'w') ? 'Black' : 'White';

    const puzzle = {
      id: "daily_" + (data.puzzle?.id || "today"),
      title: `Daily: ${data.game?.perf?.name || "Tactical Challenge"}`,
      description: `Target: Find the optimal path for ${side}. Played by ${p1} vs ${p2}.`,
      rating: data.puzzle?.rating || 1500,
      themes: data.puzzle?.themes || ["middlegame"],
      fen: data.puzzle?.fen,
      solution: data.puzzle?.solution || [],
      lastMove: data.puzzle?.lastMove
    };

    writeLog(`[API SUCCESS] Live Daily Puzzle synchronized. Rating: ${puzzle.rating}`);

    // De-select curated cards in list
    const cards = document.querySelectorAll('.mission-card');
    cards.forEach(c => c.classList.remove('active-loading'));

    // Render the daily card metrics
    renderDailyCardWidget(puzzle);
    initializePuzzleState(puzzle);

  } catch (error) {
    console.error("Lichess API fetch error: ", error);
    writeLog("<span style='color: #ff073a;'>[API CRITICAL] Synchronization failed: " + error.message + "</span>");
    writeLog("[RECOVERY] Offline Mode engaged. Loading random database challenge...");

    // Graceful fallback to random database
    loadNextLichessPuzzle();
  } finally {
    if (dailyBtn) {
      dailyBtn.disabled = false;
      dailyBtn.innerHTML = '<i class="fa-solid fa-earth-americas"></i> LOAD DAILY PUZZLE';
    }
  }
}

function renderDailyCardWidget(puzzle) {
  const container = document.getElementById('daily-mission-container');
  if (!container) return;

  const themePills = puzzle.themes.slice(0, 3).map(t => `<span class="pill-theme">${t}</span>`).join('');

  container.innerHTML = `
    <div class="daily-mission-card">
      <div class="daily-mission-title">${puzzle.title}</div>
      <div class="daily-mission-desc">${puzzle.description}</div>
      <div class="pills-container" style="margin-top: 3px;">
        ${themePills}
      </div>
      <div class="daily-mission-meta">
        <span class="rating-badge">${puzzle.rating} FIDE</span>
        <button class="btn-cyber active" style="padding: 4px 10px; font-size: 0.65rem;" onclick="fetchLichessDailyPuzzle()">
          <i class="fa-solid fa-arrows-rotate"></i> RE-SYNC
        </button>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------------------
// CORE INTERACTIVE SOLVER HUD & STATE MACHINE
// -------------------------------------------------------------------------
function initializePuzzleState(puzzle) {
  currentPuzzle = puzzle;
  puzzleStep = 0;
  _puzzlePerfect = true;
  notationReset();

  // Clean up analysis state unless reviewing from history
  if (currentPuzzleSource !== 'history') {
    analysisModeActive = false;
    const analysisBtn = document.getElementById('analysis-btn');
    if (analysisBtn) {
      analysisBtn.style.display = 'none';
      analysisBtn.classList.remove('active');
    }
  }

  // Set up board game state
  game = new Chess(puzzle.fen);

  if (puzzle.moves && puzzle.moves.length > 0) {
    // -------------------------------------------------------------
    // CSV PREPROCESSED SCHEMA (Requires executing setup move)
    // -------------------------------------------------------------
    const opponentColor = game.turn();
    const solverColor = opponentColor === 'w' ? 'b' : 'w';
    activePlayer = solverColor;
    boardFlipped = (solverColor === 'b');

    // Execute opponent's setup move!
    const setupMoveStr = puzzle.moves[0];
    const setupUci = parseUCIMove(setupMoveStr);
    const setupMove = game.move({
      from: setupUci.from,
      to: setupUci.to,
      promotion: setupUci.promotion
    });
    if (setupMove) notationOnMove(setupMove);

    currentPuzzle.solution = puzzle.moves.slice(1);
    currentPuzzle.lastMove = setupMoveStr;
  } else {
    // -------------------------------------------------------------
    // LIVE DAILY API SCHEMA (Setup already executed in FEN)
    // -------------------------------------------------------------
    const solverColor = game.turn();
    activePlayer = solverColor;
    boardFlipped = (solverColor === 'b');

    currentPuzzle.solution = puzzle.solution;
    currentPuzzle.lastMove = puzzle.lastMove;
  }

  // Clocks visually display infinite/puzzle
  isInfiniteTimer = true;
  const whiteClock = document.getElementById('timer-white');
  const blackClock = document.getElementById('timer-black');
  if (whiteClock) whiteClock.innerText = "MISSION";
  if (blackClock) blackClock.innerText = "SOLVER";

  const wCard = document.getElementById('card-white');
  const bCard = document.getElementById('card-black');
  if (wCard) wCard.classList.toggle('active', activePlayer === 'w');
  if (bCard) bCard.classList.toggle('active', activePlayer === 'b');

  selectedSquare = null;
  possibleMoves = [];

  // Remove solved stamp overlay if visible
  const stamp = document.getElementById('puzzle-solved-stamp');
  if (stamp) {
    stamp.classList.remove('active');
    stamp.classList.remove('failed-state');
  }

  // Load step dots indicators above board
  const dotsHeader = document.getElementById('puzzle-dots-header');
  const dotsList = document.getElementById('puzzle-dots-list');
  if (dotsHeader && dotsList) {
    dotsHeader.style.display = 'flex';
    dotsList.innerHTML = '';

    const playerSteps = Math.ceil(currentPuzzle.solution.length / 2);
    for (let i = 0; i < playerSteps; i++) {
      const dot = document.createElement('span');
      dot.className = 'step-dot';
      dot.id = `step-dot-${i}`;
      dotsList.appendChild(dot);
    }
  }

  renderBoard();

  // Add to session history safely
  const existing = sessionHistory.find(p => p.id === puzzle.id);
  if (!existing) {
    sessionHistory.push({
      id: puzzle.id,
      fen: puzzle.fen,
      moves: puzzle.moves,
      solution: puzzle.solution,
      lastMove: puzzle.lastMove,
      rating: puzzle.rating,
      themes: puzzle.themes,
      status: 'solving'
    });
  }
  renderSessionHistoryList();

  document.getElementById('terminal-state').innerText = "SOLVING";
  writeLog(`Mission loaded: #${puzzle.id.replace('daily_', '')}`);
  writeLog(`Parameters: [Rating: ${puzzle.rating}] [Themes: ${puzzle.themes.slice(0, 4).join(', ')}]`);
  writeLog(`<span style="color: var(--color-accent-alt)">GOAL: Find the tactical continuation for ${activePlayer === 'w' ? 'White' : 'Black'}.</span>`);
}

// Translate UCI string e.g. e2e4 or e7e8q into chess.js format
function parseUCIMove(uciStr) {
  const from = uciStr.substring(0, 2);
  const to = uciStr.substring(2, 4);
  const promotion = uciStr.length > 4 ? uciStr.charAt(4) : undefined;
  return { from, to, promotion };
}

// User correct moves handler
function handleCorrectPuzzleMove(finishedMove) {
  if (!finishedMove) return;

  // Sound triggers
  if (finishedMove.captured) {
    soundCtrl.play('capture');
    spawnParticles(finishedMove.to);
  } else {
    soundCtrl.play('move');
  }

  writeLog(`Sub-ply validated: <span class="move" style="color: #39ff14;">${finishedMove.san}</span> (Correct!)`);
  notationOnMove(finishedMove);

  // Mark step dot as active
  const playerStepIndex = Math.floor(puzzleStep / 2);
  const dot = document.getElementById(`step-dot-${playerStepIndex}`);
  if (dot) dot.className = 'step-dot active';

  puzzleStep++; // Now pointing to opponent's reply
  renderBoard();

  if (puzzleStep >= currentPuzzle.solution.length) {
    handlePuzzleSolved();
  } else {
    document.getElementById('terminal-state').innerText = "AI REPLYING";
    setTimeout(playPuzzleReply, 600);
  }
}

// Opponent's reply automation
function playPuzzleReply() {
  if (!currentPuzzle || puzzleStep >= currentPuzzle.solution.length) return;

  const replyStr = currentPuzzle.solution[puzzleStep];
  const uciObj = parseUCIMove(replyStr);

  const finishedMove = game.move({
    from: uciObj.from,
    to: uciObj.to,
    promotion: uciObj.promotion
  });

  if (finishedMove.captured) {
    soundCtrl.play('capture');
    spawnParticles(finishedMove.to);
  } else {
    soundCtrl.play('move');
  }

  writeLog(`Opponent replies: <span class="move">${finishedMove.san}</span>`);
  notationOnMove(finishedMove);

  puzzleStep++; // Points to next player move
  activePlayer = game.turn();

  const wCard = document.getElementById('card-white');
  const bCard = document.getElementById('card-black');
  if (wCard) wCard.classList.toggle('active', activePlayer === 'w');
  if (bCard) bCard.classList.toggle('active', activePlayer === 'b');

  document.getElementById('terminal-state').innerText = "SOLVING";
  renderBoard();

  if (puzzleStep >= currentPuzzle.solution.length) {
    handlePuzzleSolved();
  }
}

function handlePuzzleSolved() {
  soundCtrl.play('win');
  document.getElementById('terminal-state').innerText = "SOLVED";

  // Celebrate!
  const corners = ['a1', 'a8', 'h1', 'h8', 'd4', 'e5'];
  corners.forEach((sq, idx) => {
    setTimeout(() => spawnParticles(sq), idx * 100);
  });

  // Solved stamp flash
  const stamp = document.getElementById('puzzle-solved-stamp');
  if (stamp) {
    stamp.innerText = "TACTICAL SUCCESS";
    stamp.classList.remove('failed-state');
    stamp.classList.add('active');
  }

  // Show Analysis mode button
  const analysisBtn = document.getElementById('analysis-btn');
  if (analysisBtn) {
    analysisBtn.style.display = 'block';
  }

  // Update session history
  const historyItem = sessionHistory.find(p => p.id === currentPuzzle.id);
  if (historyItem) historyItem.status = 'solved';

  // Update progress local retention
  if (!playerStats.solvedPuzzles.includes(currentPuzzle.id)) {
    playerStats.solvedPuzzles.push(currentPuzzle.id);

    const idx = playerStats.failedPuzzles.indexOf(currentPuzzle.id);
    if (idx !== -1) playerStats.failedPuzzles.splice(idx, 1);

    // Only award ELO if solved without any mistakes
    if (_puzzlePerfect) {
      updateTacticalRating(true, currentPuzzle.rating);
    } else {
      writeLog("<span style='color: var(--color-text-secondary);'>Puzzle solved after mistake — no ELO awarded.</span>");
    }
  }

  saveUserStats();
  updateProgressWidget();
  renderSessionHistoryList();

  writeLog("<span style='color: #39ff14;'>SYSTEM SUCCESS: Mission successfully resolved. Tactics complete!</span>");
}

function handleIncorrectPuzzleMove(playedMoveStr) {
  _puzzlePerfect = false; // Mark puzzle as no longer solvable for full ELO gain
  soundCtrl.play('check'); // warning bell
  writeLog("<span style='color: #ff073a;'>[SYSTEM WARNING] suboptimal tactical branch. Try again!</span>");

  // Red Try Again stamp splash
  const stamp = document.getElementById('puzzle-solved-stamp');
  if (stamp) {
    stamp.innerText = "TRY AGAIN";
    stamp.classList.add('failed-state');
    stamp.classList.add('active');
    setTimeout(() => {
      if (!analysisModeActive) {
        stamp.classList.remove('active');
        stamp.classList.remove('failed-state');
      }
    }, 1000);
  }

  // Show Analysis mode button so players can immediately figure out why
  const analysisBtn = document.getElementById('analysis-btn');
  if (analysisBtn) {
    analysisBtn.style.display = 'block';
  }

  // Mark current dot as failed
  const playerStepIndex = Math.floor(puzzleStep / 2);
  const dot = document.getElementById(`step-dot-${playerStepIndex}`);
  if (dot) {
    dot.classList.add('failed');
    setTimeout(() => dot.classList.remove('failed'), 500);
  }

  // Update session history
  const historyItem = sessionHistory.find(p => p.id === currentPuzzle.id);
  if (historyItem) historyItem.status = 'failed';

  // Update failed logs if not solved
  if (!playerStats.solvedPuzzles.includes(currentPuzzle.id) && !playerStats.failedPuzzles.includes(currentPuzzle.id)) {
    playerStats.failedPuzzles.push(currentPuzzle.id);

    updateTacticalRating(false, currentPuzzle.rating);
    saveUserStats();
    updateProgressWidget();
    renderSessionHistoryList();
  }

  selectedSquare = null;
  possibleMoves = [];
  renderBoard();
}

function updateTacticalRating(success, puzzleRating) {
  const K = 32;
  const expectedScore = 1 / (1 + Math.pow(10, (puzzleRating - playerStats.tacticalRating) / 400));
  const actualScore = success ? 1 : 0;

  const delta = Math.round(K * (actualScore - expectedScore));

  // Standard Elo boundary limits
  playerStats.tacticalRating = Math.max(100, playerStats.tacticalRating + delta);

  writeLog(`Tactical Rating adjusted: <span style="color: ${success ? '#39ff14' : '#ff073a'}; font-weight: bold;">${delta > 0 ? '+' + delta : delta} Elo</span> (New Rating: ${playerStats.tacticalRating})`);
}

// -------------------------------------------------------------------------
// ACTION PANEL UTILITY CONTROLS (HINTS, REVEALS, RETRY, NEXT)
// -------------------------------------------------------------------------
function showPuzzleHint() {
  if (!puzzleMode || !currentPuzzle) return;

  const targetMoveStr = currentPuzzle.solution[puzzleStep];
  const fromSquare = targetMoveStr.substring(0, 2);
  const piece = game.get(fromSquare);

  if (piece) {
    // Pulse lightbulb
    writeLog(`<span style="color: var(--color-accent-alt)">[HINT] Focus on your ${getPieceName(piece.type).toUpperCase()} at ${fromSquare.toUpperCase()}...</span>`);

    // Visually highlight the source square on the board!
    const tile = document.querySelector(`[data-square="${fromSquare}"]`);
    if (tile) {
      tile.classList.add('selected');
      soundCtrl.play('move');
      setTimeout(() => {
        tile.classList.remove('selected');
      }, 800);
    }
  }
}

function revealPuzzleSolution() {
  if (!puzzleMode || !currentPuzzle) return;

  writeLog("<span style='color: var(--color-accent)'>[SYSTEM OVERRIDE] Automating puzzle trajectory...</span>");

  // Recursive delay player to execute solution
  function autoPlayNext() {
    if (puzzleStep >= currentPuzzle.solution.length) {
      return;
    }

    const moveStr = currentPuzzle.solution[puzzleStep];
    const uciObj = parseUCIMove(moveStr);

    const finished = game.move({
      from: uciObj.from,
      to: uciObj.to,
      promotion: uciObj.promotion
    });

    if (finished.captured) {
      soundCtrl.play('capture');
      spawnParticles(finished.to);
    } else {
      soundCtrl.play('move');
    }
    notationOnMove(finished);

    // Mark dots
    if (puzzleStep % 2 === 0) {
      const stepIdx = Math.floor(puzzleStep / 2);
      const dot = document.getElementById(`step-dot-${stepIdx}`);
      if (dot) dot.className = 'step-dot active';
    }

    puzzleStep++;
    renderBoard();

    if (puzzleStep >= currentPuzzle.solution.length) {
      soundCtrl.play('win');
      document.getElementById('terminal-state').innerText = "REVEALED";

      const stamp = document.getElementById('puzzle-solved-stamp');
      if (stamp) {
        stamp.innerText = "TACTICAL SUCCESS";
        stamp.classList.remove('failed-state');
        stamp.classList.add('active');
      }

      const analysisBtn = document.getElementById('analysis-btn');
      if (analysisBtn) {
        analysisBtn.style.display = 'block';
      }
    } else {
      setTimeout(autoPlayNext, 850);
    }
  }

  // Clear state back to current step
  autoPlayNext();
}

function retryPuzzle() {
  if (!currentPuzzle) return;
  initializePuzzleState(currentPuzzle);
  writeLog("Mission re-initialized. Solver system cleared.");
}

function nextPuzzle() {
  loadNextLichessPuzzle();
}

function toggleAnalysisMode() {
  if (!puzzleMode) return;
  analysisModeActive = !analysisModeActive;

  const btn = document.getElementById('analysis-btn');
  const stamp = document.getElementById('puzzle-solved-stamp');

  if (btn) {
    if (analysisModeActive) {
      btn.classList.add('active');
      if (stamp) stamp.classList.remove('active'); // Hide victory stamps
      writeLog("<span style='color: var(--color-accent-alt)'>[ANALYSIS ENGAGED] Free movement unlocked. Engine online.</span>");
      document.getElementById('terminal-state').innerText = "ANALYSIS";
    } else {
      btn.classList.remove('active');
      writeLog("[ANALYSIS DISENGAGED] Puzzle training state restored.");
      document.getElementById('terminal-state').innerText = "SOLVING";
      retryPuzzle();
    }
  }
}

// -------------------------------------------------------------------------
// STANDARD VS AI & PVP GAMEPLAY HANDLERS
// -------------------------------------------------------------------------
function resetClocks() {
  clearInterval(timerInterval);
  timerInterval = null;

  const timerVal = document.getElementById('match-timer').value;
  const whiteClock = document.getElementById('timer-white');
  const blackClock = document.getElementById('timer-black');

  if (timerVal === 'infinite') {
    isInfiniteTimer = true;
    if (whiteClock) whiteClock.innerText = "∞";
    if (blackClock) blackClock.innerText = "∞";
    writeLog("Timer Disabled: Playing with infinite thinking time.");
  } else {
    isInfiniteTimer = false;
    const mins = parseInt(timerVal);
    timeWhite = mins * 60;
    timeBlack = mins * 60;
    updateClockDisplay();
    writeLog(`Timer initialized for ${mins} minutes per side.`);
  }
}

function updateClockDisplay() {
  const whiteClock = document.getElementById('timer-white');
  const blackClock = document.getElementById('timer-black');

  const currentMode = document.getElementById('game-mode') ? document.getElementById('game-mode').value : 'ai';
  if (isInfiniteTimer || puzzleMode || currentMode === 'analysis') {
    if (whiteClock) whiteClock.innerText = '--:--';
    if (blackClock) blackClock.innerText = '--:--';
    return;
  }

  const formatTime = (totalSecs) => {
    const mm = Math.floor(totalSecs / 60).toString().padStart(2, '0');
    const ss = (totalSecs % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };

  if (whiteClock) whiteClock.innerText = formatTime(timeWhite);
  if (blackClock) blackClock.innerText = formatTime(timeBlack);
}

function startTimer() {
  if (isInfiniteTimer || puzzleMode) return;
  if (timerInterval) return;

  timerInterval = setInterval(() => {
    if (game.game_over()) {
      clearInterval(timerInterval);
      return;
    }

    if (activePlayer === 'w') {
      timeWhite--;
      if (timeWhite <= 0) {
        timeWhite = 0;
        clearInterval(timerInterval);
        handleGameOver("TIME OUT", "Black wins on time!");
      }
    } else {
      timeBlack--;
      if (timeBlack <= 0) {
        timeBlack = 0;
        clearInterval(timerInterval);
        handleGameOver("TIME OUT", "White wins on time!");
      }
    }
    updateClockDisplay();
  }, 1000);
}

function writeLog(message, isEngine = false) {
  const container = document.getElementById('term-log');
  if (!container) return;
  const line = document.createElement('div');
  line.className = 'terminal-line';
  line.innerHTML = `<span class="tag">${isEngine ? '&gt;&gt;' : '&gt;'}</span> <span>${message}</span>`;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function resetGame() {
  if (puzzleMode && currentPuzzle) {
    initializePuzzleState(currentPuzzle);
    return;
  }

  game = new Chess();
  selectedSquare = null;
  possibleMoves = [];
  isAITurn = false;
  activePlayer = 'w';
  boardFlipped = false;
  
  const boardEl = document.getElementById('board');
  if (boardEl) boardEl.classList.remove('flipped');
  const cBlack = document.getElementById('card-black');
  const cWhite = document.getElementById('card-white');
  if (cBlack) cBlack.style.order = '1';
  if (cWhite) cWhite.style.order = '4';

  if (!window._onlineMode) {
    const nBlack = document.getElementById('name-black');
    const nWhite = document.getElementById('name-white');
    const aBlack = document.getElementById('avatar-black');
    const aWhite = document.getElementById('avatar-white');
    if (nBlack) nBlack.textContent = "CYBER AI";
    if (nWhite) nWhite.textContent = "NEON PLAYER";
    if (aBlack) aBlack.innerHTML = '<i class="fa-solid fa-microchip"></i>';
    if (aWhite) aWhite.innerHTML = '<i class="fa-solid fa-user"></i>';
  }

  if (stockfishWorker) {
    stockfishWorker.postMessage('stop');
  }
  const aiOverlay = document.getElementById('ai-overlay');
  if (aiOverlay) aiOverlay.classList.remove('active');

  resetClocks();
  updateCapturedPieces();
  renderBoard();
  notationReset();

  const wCard = document.getElementById('card-white');
  const bCard = document.getElementById('card-black');
  if (wCard) wCard.classList.add('active');
  if (bCard) bCard.classList.remove('active');
  document.getElementById('terminal-state').innerText = "PLAYING";

  writeLog("New Match initialized. System Ready.");
}

function flipBoard() {
  if (puzzleMode) return; // Board auto-flips to solver color in puzzle mode!
  boardFlipped = !boardFlipped;
  const boardEl = document.getElementById('board');
  
  const cBlack = document.getElementById('card-black');
  const cWhite = document.getElementById('card-white');
  
  if (boardFlipped) {
    boardEl.classList.add('flipped');
    if (cBlack) cBlack.style.order = '4';
    if (cWhite) cWhite.style.order = '1';
  } else {
    boardEl.classList.remove('flipped');
    if (cBlack) cBlack.style.order = '1';
    if (cWhite) cWhite.style.order = '4';
  }
  
  if (!window._onlineMode) {
    const nBlack = document.getElementById('name-black');
    const nWhite = document.getElementById('name-white');
    const aBlack = document.getElementById('avatar-black');
    const aWhite = document.getElementById('avatar-white');
    if (nBlack && nWhite) {
      const tempName = nBlack.textContent;
      nBlack.textContent = nWhite.textContent;
      nWhite.textContent = tempName;
      
      const tempAvatar = aBlack.innerHTML;
      aBlack.innerHTML = aWhite.innerHTML;
      aWhite.innerHTML = tempAvatar;
    }
  }
  
  renderBoard();
  writeLog(`Board rotation mirrored.`);
}

function renderBoard() {
  const boardElement = document.getElementById('board');
  if (!boardElement) return;
  boardElement.innerHTML = '';
  resizeCanvas();

  const lastMove = game.history({ verbose: true }).pop();
  const inCheck = game.in_check();

  for (let i = 0; i < 64; i++) {
    const fileIdx = i % 8;
    const rowIdx = Math.floor(i / 8);

    const r = boardFlipped ? 7 - rowIdx : rowIdx;
    const c = boardFlipped ? 7 - fileIdx : fileIdx;

    const square = algebraic(r, c);
    const tile = document.createElement('div');

    tile.className = `tile ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
    tile.dataset.square = square;
    tile.dataset.row = r;
    tile.dataset.col = c;

    const rankLabel = 8 - r;
    const fileLabel = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'][c];

    tile.setAttribute('data-rank', rankLabel);
    tile.setAttribute('data-file', fileLabel);

    if (c === (boardFlipped ? 7 : 0)) {
      tile.classList.add('show-rank');
      const rankSpan = document.createElement('span');
      rankSpan.className = 'coord-rank';
      rankSpan.textContent = rankLabel;
      tile.appendChild(rankSpan);
    }
    if (r === (boardFlipped ? 0 : 7)) {
      tile.classList.add('show-file');
      const fileSpan = document.createElement('span');
      fileSpan.className = 'coord-file';
      fileSpan.textContent = fileLabel;
      tile.appendChild(fileSpan);
    }

    if (square === selectedSquare) {
      tile.classList.add('selected');
    }

    // In puzzle mode, visually highlight Lichess's last setup move!
    if (puzzleMode && currentPuzzle && puzzleStep === 0 && currentPuzzle.lastMove) {
      const fromS = currentPuzzle.lastMove.substring(0, 2);
      const toS = currentPuzzle.lastMove.substring(2, 4);
      if (square === fromS || square === toS) {
        tile.classList.add('last-move');
      }
    } else if (lastMove && (square === lastMove.from || square === lastMove.to)) {
      tile.classList.add('last-move');
    }

    if (inCheck && game.board()[r][c] && game.board()[r][c].type === 'k' && game.board()[r][c].color === game.turn()) {
      tile.classList.add('in-check');
    }
    if (possibleMoves.some(m => m.to === square)) {
      tile.classList.add('possible-move');
      if (game.get(square)) {
        tile.classList.add('has-piece');
      }
    }

    const piece = game.get(square);
    if (piece) {
      const pieceContainer = document.createElement('div');
      pieceContainer.className = 'piece-container';
      pieceContainer.dataset.square = square;

      const colorClass = piece.color === 'w' ? 'piece-white' : 'piece-black';

      pieceContainer.innerHTML = `
        <svg class="chess-piece ${colorClass}" viewBox="-2 -2 49 49">
          <use href="#piece-${getPieceName(piece.type)}"></use>
        </svg>
      `;

      pieceContainer.addEventListener('pointerdown', onPointerDown);
      tile.appendChild(pieceContainer);
    }

    tile.addEventListener('click', () => onTileClick(square));
    boardElement.appendChild(tile);
  }
}

function getPieceName(type) {
  switch (type) {
    case 'p': return 'pawn';
    case 'r': return 'rook';
    case 'n': return 'knight';
    case 'b': return 'bishop';
    case 'q': return 'queen';
    case 'k': return 'king';
  }
}

function algebraic(r, c) {
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  return files[c] + (8 - r);
}

function updateCapturedPieces() {
  if (puzzleMode) return; // Captures not tracked in puzzle mode

  const initialPieces = {
    w: { p: 8, n: 2, b: 2, r: 2, q: 1 },
    b: { p: 8, n: 2, b: 2, r: 2, q: 1 }
  };

  const currentPieces = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 }
  };

  for (const row of game.board()) {
    for (const piece of row) {
      if (piece && piece.type !== 'k') {
        currentPieces[piece.color][piece.type]++;
      }
    }
  }

  const capturedByWhite = [];
  const capturedByBlack = [];

  for (const type of ['p', 'n', 'b', 'r', 'q']) {
    const capturedWhiteCount = initialPieces.w[type] - currentPieces.w[type];
    for (let i = 0; i < capturedWhiteCount; i++) {
      capturedByBlack.push(type);
    }

    const capturedBlackCount = initialPieces.b[type] - currentPieces.b[type];
    for (let i = 0; i < capturedBlackCount; i++) {
      capturedByWhite.push(type);
    }
  }

  const renderCaptured = (list, color) => {
    const colorClass = color === 'w' ? 'piece-white' : 'piece-black';
    return list.map(type => `
      <svg class="captured-icon ${colorClass}" viewBox="-2 -2 49 49" style="width: 18px; height: 18px; margin-right: 2px;">
        <use href="#piece-${getPieceName(type)}"></use>
      </svg>
    `).join('');
  };

  const capWhite = document.getElementById('captured-by-white');
  const capBlack = document.getElementById('captured-by-black');
  if (capWhite) capWhite.innerHTML = renderCaptured(capturedByWhite, 'b');
  if (capBlack) capBlack.innerHTML = renderCaptured(capturedByBlack, 'w');
}

// -------------------------------------------------------------------------
// CLICK & ADVANCED POINTER DRAG INTERACTION HANDLERS
// -------------------------------------------------------------------------
function onTileClick(square) {
  if (isAITurn) return;
  // In review/branch mode we allow moves — they create a branch
  // But block online moves when not your turn
  if (window._onlineMode && game.turn() !== window._onlineColor) return;

  const piece = game.get(square);

  if (possibleMoves.some(m => m.to === square)) {
    const moveDetails = possibleMoves.find(m => m.to === square);
    executePlayerMove(moveDetails);
    return;
  }

  if (piece && piece.color === game.turn()) {
    selectedSquare = square;
    possibleMoves = game.moves({ square: square, verbose: true });
    renderBoard();
  } else {
    selectedSquare = null;
    possibleMoves = [];
    renderBoard();
  }
}

function onPointerDown(e) {
  if (isAITurn) return;
  if (window._onlineMode && game.turn() !== window._onlineColor) return;
  if (e.button !== 0) return; // Only drag pieces with left-click!
  e.stopPropagation();
  e.preventDefault();

  const pieceContainer = e.currentTarget;
  const square = pieceContainer.dataset.square;
  const piece = game.get(square);

  if (piece && piece.color === game.turn()) {
    isDragging = true;
    dragStartSquare = square;

    // Check if the piece was already selected before pointerdown
    shouldDeselectOnClick = (selectedSquare === square);

    selectedSquare = square;
    possibleMoves = game.moves({ square: square, verbose: true });
    renderBoard();

    const cloneHTML = pieceContainer.innerHTML;
    dragClone = document.createElement('div');
    dragClone.className = 'piece-clone';
    dragClone.innerHTML = cloneHTML;
    document.body.appendChild(dragClone);

    updateDragClonePos(e);

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
  }
}

function onPointerMove(e) {
  if (!isDragging || !dragClone) return;
  updateDragClonePos(e);
}

function onPointerUp(e) {
  if (!isDragging) return;
  isDragging = false;

  dragClone.style.display = 'none';
  const elementUnder = document.elementFromPoint(e.clientX, e.clientY);
  dragClone.style.display = 'block';

  let targetTile = null;
  if (elementUnder) {
    targetTile = elementUnder.closest('.tile');
  }

  document.removeEventListener('pointermove', onPointerMove);
  document.removeEventListener('pointerup', onPointerUp);
  if (dragClone) {
    dragClone.remove();
    dragClone = null;
  }

  if (targetTile) {
    const toSquare = targetTile.dataset.square;
    const moveDetails = possibleMoves.find(m => m.from === dragStartSquare && m.to === toSquare);

    if (moveDetails) {
      executePlayerMove(moveDetails);
      return;
    }

    // Single click / Drag-and-drop back to start square: Keep piece selection!
    if (toSquare === dragStartSquare) {
      if (shouldDeselectOnClick) {
        selectedSquare = null;
        possibleMoves = [];
      } else {
        // Keep selected, it was already set in pointerdown
      }
      renderBoard();
      return;
    }
  }

  selectedSquare = null;
  possibleMoves = [];
  renderBoard();
}

function updateDragClonePos(e) {
  if (dragClone) {
    dragClone.style.left = (e.pageX - dragClone.offsetWidth / 2) + 'px';
    dragClone.style.top = (e.pageY - dragClone.offsetHeight / 2) + 'px';
  }
}

// Player move dispatcher
function executePlayerMove(moveDetails) {
  selectedSquare = null;
  possibleMoves = [];

  if (typeof clearDrawingOverlay === 'function') {
    clearDrawingOverlay();
  }

  // =======================================================================
  // PUZZLE MODE MOVE INTERCEPTION
  // =======================================================================
  if (puzzleMode && currentPuzzle) {
    // If Analysis mode is active, allow free legal movement and evaluate!
    if (analysisModeActive) {
      const finishedMove = game.move({
        from: moveDetails.from,
        to: moveDetails.to,
        promotion: moveDetails.flags.includes('p') ? 'q' : undefined
      });

      if (finishedMove) {
        if (finishedMove.captured) {
          soundCtrl.play('capture');
          spawnParticles(finishedMove.to);
        } else {
          soundCtrl.play('move');
        }
        renderBoard();
        notationOnMove(finishedMove);

        // Standard analysis log output with recommended path
        const playerStepIndex = Math.floor(puzzleStep / 2);
        writeLog(`Analysis Ply: <span class="move">${finishedMove.san}</span>`);

        // Execute background minimax engine search
        setTimeout(() => {
          const isWhiteTurn = (game.turn() === 'w');
          const [evalVal, best] = minimax(game, 3, -Infinity, Infinity, isWhiteTurn);
          const score = (evalVal / 100).toFixed(1);
          const sign = evalVal > 0 ? '+' : '';
          writeLog(`Engine Evaluation: <span style="color: var(--color-accent-alt); font-weight: bold;">${sign}${score}</span> // Candidate: ${best ? best.san : 'none'}`, true);
        }, 50);
      }
      return;
    }

    const playedMoveStr = moveDetails.from + moveDetails.to;
    const correctMoveStr = currentPuzzle.solution[puzzleStep];
    const isPromoMove = moveDetails.flags.includes('p');

    // Check match including possible promo letter e.g. e7e8q
    const isCorrect = isPromoMove
      ? correctMoveStr.startsWith(playedMoveStr)
      : playedMoveStr === correctMoveStr;

    if (isCorrect) {
      if (isPromoMove) {
        // Auto-promote or prompt promotion in puzzle
        const promoChoice = correctMoveStr.charAt(4) || 'q';
        const finishedMove = game.move({
          from: moveDetails.from,
          to: moveDetails.to,
          promotion: promoChoice
        });
        handleCorrectPuzzleMove(finishedMove);
      } else {
        const finishedMove = game.move({
          from: moveDetails.from,
          to: moveDetails.to
        });
        handleCorrectPuzzleMove(finishedMove);
      }
    } else {
      // Incorrect move
      const tile = document.querySelector(`[data-square="${moveDetails.to}"]`);
      const startTile = document.querySelector(`[data-square="${moveDetails.from}"]`);

      if (tile) tile.classList.add('incorrect-highlight');
      if (startTile) startTile.classList.add('incorrect-highlight');

      handleIncorrectPuzzleMove();

      setTimeout(() => {
        if (tile) tile.classList.remove('incorrect-highlight');
        if (startTile) startTile.classList.remove('incorrect-highlight');
        renderBoard();
      }, 400);
    }
    return;
  }

  // =======================================================================
  // STANDARD VS AI / PVP MOVE PROCESSING
  // =======================================================================
  if (moveDetails.flags.includes('p')) {
    promptPromotion(moveDetails, (promoChoice) => {
      const finishedMove = game.move({
        from: moveDetails.from,
        to: moveDetails.to,
        promotion: promoChoice
      });
      onMoveExecuted(finishedMove);
    });
  } else {
    const finishedMove = game.move({
      from: moveDetails.from,
      to: moveDetails.to
    });
    onMoveExecuted(finishedMove);
  }
}

function promptPromotion(moveDetails, callback) {
  const overlay = document.getElementById('promotion-overlay');
  if (!overlay) return;
  overlay.classList.add('active');

  const choices = document.querySelectorAll('.promo-btn');

  const handler = (e) => {
    const btn = e.currentTarget;
    const choice = btn.dataset.promo;
    overlay.classList.remove('active');

    choices.forEach(b => b.removeEventListener('click', handler));
    callback(choice);
  };

  choices.forEach(b => {
    b.addEventListener('click', handler);
  });
}

function onMoveExecuted(move) {
  if (!move) return;

  if (move.captured) {
    soundCtrl.play('capture');
    spawnParticles(move.to);
  } else {
    soundCtrl.play('move');
  }

  startTimer();
  updateCapturedPieces();

  const activeColorText = move.color === 'w' ? 'White' : 'Black';
  writeLog(`${activeColorText} played: <span class="move">${move.san}</span>`);

  activePlayer = game.turn();

  const wCard = document.getElementById('card-white');
  const bCard = document.getElementById('card-black');
  if (wCard) wCard.classList.toggle('active', activePlayer === 'w');
  if (bCard) bCard.classList.toggle('active', activePlayer === 'b');

  if (game.in_check() && !game.game_over()) {
    soundCtrl.play('check');
    writeLog("WARNING: Active King in CHECK!", false);
  }

  renderBoard();
  notationOnMove(move);

  if (isAnalysisActive) {
    analyzePosition();
  }

  // Emit move to online opponent before checking game over
  if (window._onlineMode && onlineGameId) {
    onlineEmitMove({ from: move.from, to: move.to, promotion: move.promotion || null }, game.fen());
  }

  if (game.game_over()) {
    // Sync game-over to online opponent
    if (window._onlineMode && onlineGameId) {
      const result = game.in_checkmate() ? 'checkmate' : game.in_draw() ? 'draw' : 'game_over';
      const winnerId = game.in_checkmate()
        ? (move.color === onlineMyColor ? onlineUser.id : null)
        : null;
      socket.emit('game-over-sync', { gameId: onlineGameId, result, winnerId });
    }
    checkGameStatus();
    return;
  }

  // Trigger Cyber AI moves
  const mode = document.getElementById('game-mode').value;
  if (mode === 'ai' && activePlayer === 'b' && !window._onlineMode) {
    isAITurn = true;
    document.getElementById('ai-overlay').classList.add('active');
    document.getElementById('terminal-state').innerText = "AI THINKING";

    setTimeout(executeAIMove, 200);
  }
}

// -------------------------------------------------------------------------
// CYBER AI SEARCH ALGORITHM
// -------------------------------------------------------------------------
function executeAIMove() {
  if (!isAITurn) return;

  // Ensure Stockfish is ready
  initStockfish();

  if (!stockfishWorker) {
    // Fallback to local minimax if Stockfish fails to load
    console.warn("Stockfish worker not available. Using local minimax fallback.");
    executeMinimaxAIMove();
    return;
  }

  const depth = parseInt(document.getElementById('ai-depth-slider').value) || 12;
  aiSearchStartTime = performance.now();

  stockfishWorker.postMessage('stop');
  stockfishWorker.postMessage(`position fen ${game.fen()}`);

  // Trigger search with direct slider depth
  stockfishWorker.postMessage(`go depth ${depth}`);
}

function executeMinimaxAIMove() {
  if (!isAITurn) return;

  const sliderVal = parseInt(document.getElementById('ai-depth-slider').value) || 12;
  const startTime = performance.now();

  let minimaxDepth = 3; // Safe max for synchronous minimax fallback
  if (sliderVal <= 3) {
    minimaxDepth = sliderVal;
  } else {
    minimaxDepth = sliderVal <= 10 ? 2 : 3;
  }

  let aiMove = null;

  if (minimaxDepth === 1) {
    const moves = game.moves({ verbose: true });
    if (Math.random() < 0.4) {
      aiMove = moves[Math.floor(Math.random() * moves.length)];
    } else {
      const [, best] = minimax(game, 1, -Infinity, Infinity, false);
      aiMove = best;
    }
  } else if (minimaxDepth === 2) {
    const [, best] = minimax(game, 2, -Infinity, Infinity, false);
    aiMove = best;
  } else {
    const [, best] = minimax(game, 3, -Infinity, Infinity, false);
    aiMove = best;
  }

  const duration = (performance.now() - startTime).toFixed(1);
  writeLog(`Cyber AI evaluated branch in ${duration}ms.`, true);

  if (aiMove) {
    const finishedMove = game.move({
      from: aiMove.from,
      to: aiMove.to,
      promotion: aiMove.promotion || 'q'
    });

    isAITurn = false;
    document.getElementById('ai-overlay').classList.remove('active');
    document.getElementById('terminal-state').innerText = "PLAYING";

    onMoveExecuted(finishedMove);
  } else {
    const moves = game.moves();
    if (moves.length > 0) {
      game.move(moves[0]);
      isAITurn = false;
      document.getElementById('ai-overlay').classList.remove('active');
      renderBoard();
    }
  }
}

function makeStockfishAIMove(from, to, bestMove) {
  if (!isAITurn) return;

  const duration = (performance.now() - aiSearchStartTime).toFixed(1);
  writeLog(`Cyber AI (Stockfish) evaluated branch in ${duration}ms.`, true);

  // Extract promotion character if present (e.g. e7e8q)
  const promoChar = bestMove.length > 4 ? bestMove.charAt(4).toLowerCase() : undefined;

  // Verify the move is valid in the game instance
  const moves = game.moves({ verbose: true });
  const validMove = moves.find(m => m.from === from && m.to === to);

  if (validMove) {
    const finishedMove = game.move({
      from: from,
      to: to,
      promotion: promoChar || (validMove.flags.includes('p') ? 'q' : undefined)
    });

    isAITurn = false;
    document.getElementById('ai-overlay').classList.remove('active');
    document.getElementById('terminal-state').innerText = "PLAYING";

    onMoveExecuted(finishedMove);
  } else {
    // If somehow Stockfish returned an invalid move, fallback to first legal move
    console.warn("Stockfish proposed an illegal move: " + bestMove);
    isAITurn = false;
    document.getElementById('ai-overlay').classList.remove('active');
    document.getElementById('terminal-state').innerText = "PLAYING";

    const legalMoves = game.moves();
    if (legalMoves.length > 0) {
      const finishedMove = game.move(legalMoves[0]);
      onMoveExecuted(finishedMove);
    }
  }
}

function checkGameStatus() {
  clearInterval(timerInterval);
  document.getElementById('terminal-state').innerText = "GAME OVER";

  if (game.in_checkmate()) {
    const winnerColor = game.turn() === 'w' ? 'b' : 'w';
    const winnerName = winnerColor === 'w' ? 'White' : 'Black';

    // In online mode, we win if our color matches the winner's color
    let isVictory = winnerColor === 'w'; // Default assumption for VS AI (we are White)
    if (window._onlineMode) {
      isVictory = winnerColor === onlineMyColor;
    }

    if (isVictory) {
      soundCtrl.play('win');
      handleGameOver("CHECKMATE // VICTORY", `Logical victory achieved. ${winnerName} won the match!`);
      notationSetResult(winnerColor === 'w' ? '1 — 0' : '0 — 1');
    } else {
      soundCtrl.play('lose');
      handleGameOver("CHECKMATE // DEFEAT", `Opponent executed perfect checkmate. ${winnerName} won!`);
      notationSetResult(winnerColor === 'w' ? '1 — 0' : '0 — 1');
    }
  } else if (game.in_draw()) {
    soundCtrl.play('lose');
    let type = "Draw";
    if (game.in_stalemate()) type = "Stalemate";
    else if (game.in_threefold_repetition()) type = "Threefold Repetition";
    else if (game.insufficient_material()) type = "Insufficient Material";

    handleGameOver(`DRAW // ${type.toUpperCase()}`, "The match terminated in a balanced drawn state.");
    notationSetResult('½ — ½');
  }

  // If this was an online match, clean up the sender's state (the opponent gets cleaned up via game-over-notify)
  if (window._onlineMode) {
    onlineGameId = null;
    onlineMyColor = null;
    window._onlineMode = false;
    
    const activeView = document.getElementById('online-active-view');
    const lobbyView = document.getElementById('online-lobby-view');
    const rightControls = document.getElementById('right-online-match-controls');
    const offerMsg = document.getElementById('draw-offer-message');
    if (activeView) activeView.style.display = 'none';
    if (lobbyView) lobbyView.style.display = 'block';
    if (rightControls) rightControls.style.display = 'none';
    if (offerMsg) offerMsg.style.display = 'none';
  }
}

function handleGameOver(title, desc) {
  const gTitle = document.getElementById('gameover-title');
  const gDesc = document.getElementById('gameover-desc');
  if (gTitle) gTitle.innerText = title;
  if (gDesc) gDesc.innerText = desc;

  const icon = document.getElementById('gameover-icon');
  if (icon) {
    if (title.includes("VICTORY")) {
      icon.innerHTML = '<i class="fa-solid fa-trophy"></i>';
      icon.style.color = 'var(--color-white-piece)';
      icon.style.filter = 'drop-shadow(0 0 10px var(--color-white-glow))';
    } else if (title.includes("DEFEAT")) {
      icon.innerHTML = '<i class="fa-solid fa-skull"></i>';
      icon.style.color = 'var(--color-black-piece)';
      icon.style.filter = 'drop-shadow(0 0 10px var(--color-black-glow))';
    } else {
      icon.innerHTML = '<i class="fa-solid fa-scale-balanced"></i>';
      icon.style.color = 'var(--color-text-secondary)';
      icon.style.filter = 'none';
    }
  }

  const overlay = document.getElementById('gameover-overlay');
  if (overlay) overlay.classList.add('active');
  writeLog(`Match Finished: ${title}.`);
}

function closeGameOverModal() {
  const overlay = document.getElementById('gameover-overlay');
  if (overlay) overlay.classList.remove('active');
}

// =========================================================================
// SLEEK CANVASES PARTICLE ENGINE
// =========================================================================
function initParticles() {
  resizeCanvas();
}

function spawnParticles(square) {
  const tile = document.querySelector(`[data-square="${square}"]`);
  if (!tile || !canvas) return;

  const rectBoard = canvas.getBoundingClientRect();
  const rectTile = tile.getBoundingClientRect();

  const centerX = rectTile.left - rectBoard.left + rectTile.width / 2;
  const centerY = rectTile.top - rectBoard.top + rectTile.height / 2;

  const count = 25;
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim();
  const secondaryColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent-alt').trim();

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 1.5 + Math.random() * 2.5,
      alpha: 1,
      decay: 0.02 + Math.random() * 0.03,
      color: Math.random() > 0.5 ? primaryColor : secondaryColor
    });
  }
}

function animateParticles() {
  requestAnimationFrame(animateParticles);
  if (!canvas || !ctxCanvas) return;

  ctxCanvas.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.alpha -= p.decay;

    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctxCanvas.save();
    ctxCanvas.globalAlpha = p.alpha;
    ctxCanvas.shadowBlur = 6;
    ctxCanvas.shadowColor = p.color;
    ctxCanvas.fillStyle = p.color;
    ctxCanvas.beginPath();
    ctxCanvas.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctxCanvas.fill();
    ctxCanvas.restore();
  }
}

// =========================================================================
// INTERACTIVE VECTOR DRAWING OVERLAY (ARROWS & HIGHLIGHTS)
// =========================================================================
let boardArrows = []; // { from, to, colorClass, markerId }
let boardHighlights = []; // { square, class }
let isRightDragging = false;
let drawingStartSquare = null;
let currentTempDragPath = null;

function getThemeColorFromEvent(e) {
  if (e.shiftKey) return { class: 'var(--draw-secondary)', marker: 'arrowhead-secondary' };
  if (e.altKey) return { class: 'var(--draw-tertiary)', marker: 'arrowhead-tertiary' };
  if (e.ctrlKey || e.metaKey) return { class: 'var(--draw-alternate)', marker: 'arrowhead-alternate' };
  return { class: 'var(--draw-primary)', marker: 'arrowhead-primary' };
}

function getSquareCenterCoords(square) {
  const tile = document.querySelector(`[data-square="${square}"]`);
  const svg = document.getElementById('drawing-overlay');
  if (!tile || !svg) return null;
  const tileRect = tile.getBoundingClientRect();
  const svgRect = svg.getBoundingClientRect();
  return {
    x: tileRect.left - svgRect.left + tileRect.width / 2,
    y: tileRect.top - svgRect.top + tileRect.height / 2
  };
}

function clearDrawingOverlay() {
  boardArrows = [];
  boardHighlights = [];
  renderDrawingOverlay();
}

function renderDrawingOverlay() {
  const svg = document.getElementById('drawing-overlay');
  if (!svg) return;

  // Preserve <defs> element
  const defs = svg.querySelector('defs');
  svg.innerHTML = '';
  if (defs) svg.appendChild(defs);

  // Render highlights
  boardHighlights.forEach(hl => {
    const coords = getSquareCenterCoords(hl.square);
    if (!coords) return;

    const tile = document.querySelector(`[data-square="${hl.square}"]`);
    const radius = tile ? (tile.getBoundingClientRect().width * 0.45) : 30;

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', coords.x);
    circle.setAttribute('cy', coords.y);
    circle.setAttribute('r', radius);
    circle.setAttribute('class', 'drawing-highlight');
    circle.style.color = hl.class;
    svg.appendChild(circle);
  });

  // Render arrows
  boardArrows.forEach(arrow => {
    const startCoords = getSquareCenterCoords(arrow.from);
    const endCoords = getSquareCenterCoords(arrow.to);
    if (!startCoords || !endCoords) return;

    const dx = endCoords.x - startCoords.x;
    const dy = endCoords.y - startCoords.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Shorten end coordinate so arrowhead sits properly (tip is ~40.6px past line end, we want tip exactly at center)
    const ratio = distance > 40 ? (distance - 40) / distance : 1;
    const adjustedEndX = startCoords.x + dx * ratio;
    const adjustedEndY = startCoords.y + dy * ratio;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', startCoords.x);
    line.setAttribute('y1', startCoords.y);
    line.setAttribute('x2', adjustedEndX);
    line.setAttribute('y2', adjustedEndY);
    line.setAttribute('class', 'drawing-arrow');
    line.style.stroke = arrow.colorClass;
    line.setAttribute('marker-end', `url(#${arrow.markerId})`);
    svg.appendChild(line);
  });

  if (currentTempDragPath) {
    svg.appendChild(currentTempDragPath);
  }
}

// Global drawing event bindings
window.addEventListener('DOMContentLoaded', () => {
  const boardEl = document.getElementById('board');
  const svg = document.getElementById('drawing-overlay');

  if (boardEl && boardEl.parentElement) {
    // Intercept context menu anywhere on board container
    boardEl.parentElement.addEventListener('contextmenu', e => e.preventDefault());

    boardEl.parentElement.addEventListener('mousedown', e => {
      if (e.button === 0) {
        clearDrawingOverlay();
        return;
      }

      if (e.button === 2) {
        e.preventDefault();
        const tile = e.target.closest('.tile') || document.elementFromPoint(e.clientX, e.clientY)?.closest('.tile');
        if (tile && tile.dataset.square) {
          isRightDragging = true;
          drawingStartSquare = tile.dataset.square;

          const startCoords = getSquareCenterCoords(drawingStartSquare);
          const theme = getThemeColorFromEvent(e);

          currentTempDragPath = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          currentTempDragPath.setAttribute('x1', startCoords.x);
          currentTempDragPath.setAttribute('y1', startCoords.y);
          currentTempDragPath.setAttribute('x2', startCoords.x);
          currentTempDragPath.setAttribute('y2', startCoords.y);
          currentTempDragPath.setAttribute('class', 'drawing-arrow');
          currentTempDragPath.style.stroke = theme.class;
          currentTempDragPath.setAttribute('marker-end', `url(#${theme.marker})`);

          if (svg) svg.appendChild(currentTempDragPath);
        }
      }
    });

    window.addEventListener('mousemove', e => {
      if (isRightDragging && currentTempDragPath && svg) {
        const tile = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tile');
        if (tile && tile.dataset.square) {
          const endSquare = tile.dataset.square;
          const coords = getSquareCenterCoords(endSquare);
          if (coords) {
            const startCoords = getSquareCenterCoords(drawingStartSquare);
            if (startCoords) {
              const dx = coords.x - startCoords.x;
              const dy = coords.y - startCoords.y;
              const distance = Math.sqrt(dx * dx + dy * dy);

              if (endSquare === drawingStartSquare) {
                currentTempDragPath.setAttribute('x2', startCoords.x);
                currentTempDragPath.setAttribute('y2', startCoords.y);
              } else {
                const ratio = distance > 40 ? (distance - 40) / distance : 1;
                currentTempDragPath.setAttribute('x2', startCoords.x + dx * ratio);
                currentTempDragPath.setAttribute('y2', startCoords.y + dy * ratio);
              }
            }
          }
        } else {
          const svgRect = svg.getBoundingClientRect();
          currentTempDragPath.setAttribute('x2', e.clientX - svgRect.left);
          currentTempDragPath.setAttribute('y2', e.clientY - svgRect.top);
        }
      }
    });

    window.addEventListener('mouseup', e => {
      if (isRightDragging && e.button === 2) {
        isRightDragging = false;

        if (currentTempDragPath) {
          if (currentTempDragPath.parentNode) currentTempDragPath.parentNode.removeChild(currentTempDragPath);
          currentTempDragPath = null;
        }

        const tile = document.elementFromPoint(e.clientX, e.clientY)?.closest('.tile');
        if (tile && tile.dataset.square) {
          const endSquare = tile.dataset.square;
          const theme = getThemeColorFromEvent(e);

          if (endSquare === drawingStartSquare) {
            const existingIdx = boardHighlights.findIndex(h => h.square === drawingStartSquare && h.class === theme.class);
            if (existingIdx >= 0) {
              boardHighlights.splice(existingIdx, 1);
            } else {
              boardHighlights.push({ square: drawingStartSquare, class: theme.class });
            }
          } else {
            const existingIdx = boardArrows.findIndex(a => a.from === drawingStartSquare && a.to === endSquare && a.colorClass === theme.class);
            if (existingIdx >= 0) {
              boardArrows.splice(existingIdx, 1);
            } else {
              boardArrows.push({ from: drawingStartSquare, to: endSquare, colorClass: theme.class, markerId: theme.marker });
            }
          }
        }
        renderDrawingOverlay();
      }
    });
  }

  window.addEventListener('resize', () => {
    if (boardArrows.length > 0 || boardHighlights.length > 0) {
      renderDrawingOverlay();
    }
  });
});

// =========================================================================
// STOCKFISH CLIENT-SIDE WASM/JS ENGINE INTEGRATION
// =========================================================================
let isAnalysisActive = false;
let stockfishWorker = null;

function initStockfish() {
  if (stockfishWorker) return;
  
  try {
    writeLog("Loading Stockfish Neural Core...");
    
    // Bypassing cross-origin restrictions using a local Blob importScripts wrapper
    const workerCode = `importScripts("https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/stockfish.js");`;
    const blob = new Blob([workerCode], { type: "application/javascript" });
    stockfishWorker = new Worker(URL.createObjectURL(blob));
    
    stockfishWorker.onmessage = function(e) {
      const line = e.data;
      parseStockfishOutput(line);
    };
    
    stockfishWorker.postMessage('uci');
    stockfishWorker.postMessage('isready');
    
    writeLog("<span style='color: #39ff14; font-weight: bold;'>Stockfish engine ready. Neural network loaded.</span>", true);
  } catch (err) {
    console.error("Failed to initialize Stockfish.js engine:", err);
    writeLog("Engine Error: Failed to deploy local Stockfish instance.", true);
  }
}

function analyzePosition() {
  if (!isAnalysisActive || !stockfishWorker) return;
  
  // Pause any running analysis searches
  stockfishWorker.postMessage('stop');
  
  // Clear any existing Stockfish suggest arrows
  clearStockfishArrows();
  
  // Pass active FEN layout to engine
  const fen = game.fen();
  stockfishWorker.postMessage(`position fen ${fen}`);
  
  // Trigger depth 12 search branch (perfect performance / quality balance)
  stockfishWorker.postMessage('go depth 12');
}

function parseStockfishOutput(line) {
  if (!isAnalysisActive && !isAITurn) return;
  
  // Extract centipawn evaluations (only if analysis is active)
  if (isAnalysisActive && line.includes('depth') && line.includes('pv')) {
    const depthMatch = line.match(/depth (\d+)/);
    const scoreCpMatch = line.match(/score cp (-?\d+)/);
    const scoreMateMatch = line.match(/score mate (-?\d+)/);
    
    let scoreStr = '';
    let scoreVal = 0;
    
    if (scoreCpMatch) {
      scoreVal = parseInt(scoreCpMatch[1]);
      // Invert score if black turn, since score cp is side-to-move relative
      const absoluteScore = game.turn() === 'w' ? scoreVal : -scoreVal;
      scoreStr = (absoluteScore / 100).toFixed(1);
      scoreStr = (absoluteScore > 0 ? '+' : '') + scoreStr;
      updateEvalBar('cp', absoluteScore);
    } else if (scoreMateMatch) {
      scoreVal = parseInt(scoreMateMatch[1]);
      const absoluteMoves = game.turn() === 'w' ? scoreVal : -scoreVal;
      scoreStr = `M${Math.abs(absoluteMoves)}`;
      scoreStr = (absoluteMoves > 0 ? '+' : '-') + scoreStr;
      updateEvalBar('mate', absoluteMoves);
    }
    
    // Output evaluation & principal variation to terminal state
    if (depthMatch && parseInt(depthMatch[1]) >= 8) {
      const pvMatch = line.match(/pv (.+)/);
      if (pvMatch) {
        const pvMoves = pvMatch[1].split(' ').slice(0, 4).join(' ');
        const terminalState = document.getElementById('terminal-state');
        if (terminalState) {
          terminalState.innerHTML = `ANALYSIS Board <span style="color:#00f0ff; margin-left: 10px;">Eval: ${scoreStr} | PV: ${pvMoves}</span>`;
        }
      }
    }
  }

  // Parse candidate best moves
  if (line.startsWith('bestmove')) {
    const parts = line.split(' ');
    const bestMove = parts[1];
    if (bestMove && bestMove !== '(none)') {
      const from = bestMove.substring(0, 2);
      const to = bestMove.substring(2, 4);
      
      if (isAITurn) {
        makeStockfishAIMove(from, to, bestMove);
      } else if (isAnalysisActive) {
        drawBestMoveArrow(from, to);
      }
    }
  }
}

function drawBestMoveArrow(from, to) {
  // Purge any existing Stockfish suggestion arrows (identified by colorClass '#00f0ff')
  boardArrows = boardArrows.filter(a => a.colorClass !== '#00f0ff');
  
  boardArrows.push({
    from: from,
    to: to,
    colorClass: '#00f0ff',
    markerId: 'arrowhead-bestmove'
  });
  
  renderDrawingOverlay();
}

function clearStockfishArrows() {
  boardArrows = boardArrows.filter(a => a.colorClass !== '#00f0ff');
  renderDrawingOverlay();
}

function updateEvalBar(scoreType, scoreVal) {
  const evalBarWrapper = document.getElementById('eval-bar-wrapper');
  if (!evalBarWrapper) return;
  
  evalBarWrapper.style.display = 'flex';
  
  const fill = document.getElementById('eval-bar-fill');
  const label = document.getElementById('eval-bar-label');
  
  let percent = 50;
  let displayStr = '0.0';
  
  if (scoreType === 'mate') {
    const moves = scoreVal;
    if (moves > 0) {
      percent = 100;
      displayStr = `+M${moves}`;
    } else {
      percent = 0;
      displayStr = `-M${Math.abs(moves)}`;
    }
  } else {
    const cp = scoreVal / 100;
    displayStr = (cp > 0 ? '+' : '') + cp.toFixed(1);
    
    // Clamp to -8..+8 visually
    let clamped = Math.max(-8, Math.min(8, cp));
    percent = 50 + (clamped / 16) * 100;
  }
  
  if (fill) {
    fill.style.height = `${percent}%`;
  }
  
  if (label) {
    label.innerText = displayStr;
  }
}

function updateAIDepthVal(val) {
  const display = document.getElementById('ai-depth-val');
  if (display) {
    display.innerText = val;
  }
}

// SIDEBAR COLLAPSIBLE DRAWER & TAB MANAGEMENT
let activeSidebarTab = 'ai';
let isDrawerCollapsed = false;
let isTabSwitchingInProgress = false;

function switchSidebarTab(tabName) {
  // If drawer is collapsed, expand it!
  const drawer = document.getElementById('sidebar-drawer');
  const collapseIcon = document.getElementById('collapse-icon');
  const appContainer = document.querySelector('.app-container');
  
  if (isDrawerCollapsed) {
    drawer.classList.remove('collapsed');
    isDrawerCollapsed = false;
    if (appContainer) appContainer.classList.add('drawer-open');
    if (collapseIcon) {
      collapseIcon.className = "fa-solid fa-chevron-left";
    }
  } else if (activeSidebarTab === tabName) {
    // If clicking the active tab again, collapse the drawer!
    toggleDrawer();
    return;
  }

  activeSidebarTab = tabName;

  // Deactivate all nav tabs
  const tabs = document.querySelectorAll('.nav-tab-cyber');
  tabs.forEach(t => t.classList.remove('active'));

  // Activate selected nav tab
  const activeTabEl = document.getElementById(`tab-${tabName}`);
  if (activeTabEl) activeTabEl.classList.add('active');

  // Update Drawer Title
  const titleText = document.getElementById('drawer-title-text');
  if (titleText) {
    let iconClass = 'fa-robot';
    let label = 'CYBER AI';
    if (tabName === 'pvp') {
      iconClass = 'fa-users';
      label = 'LOCAL MULTIPLAYER';
    } else if (tabName === 'puzzle') {
      iconClass = 'fa-brain';
      label = 'PUZZLES CENTER';
    } else if (tabName === 'online') {
      iconClass = 'fa-globe';
      label = 'PLAY ONLINE';
    } else if (tabName === 'analysis') {
      iconClass = 'fa-magnifying-glass-chart';
      label = 'ANALYSIS ENGINE';
    } else if (tabName === 'actions') {
      iconClass = 'fa-gamepad';
      label = 'QUICK ACTIONS';
    }
    titleText.innerHTML = `<i class="fa-solid ${iconClass}"></i> ${label}`;
  }

  // Hide all panels
  const panels = document.querySelectorAll('.drawer-panel-cyber');
  panels.forEach(p => {
    p.style.display = 'none';
    p.classList.remove('active');
  });

  // Show active panel
  const targetId = tabName === 'puzzle' ? 'puzzles-center-group' : `panel-${tabName}`;
  const activePanelEl = document.getElementById(targetId);
  if (activePanelEl) {
    activePanelEl.style.display = 'block';
    setTimeout(() => activePanelEl.classList.add('active'), 50);
  }

  // Dynamically attach shared controls (Timer, Theme) for AI and PVP modes
  const timerGroup = document.getElementById('timer-group');
  const themeGroup = document.getElementById('theme-group');
  if (timerGroup && themeGroup) {
    if (tabName === 'ai' || tabName === 'pvp') {
      timerGroup.style.display = 'block';
      themeGroup.style.display = 'block';
      const activePanel = document.getElementById(`panel-${tabName}`);
      if (activePanel) {
        activePanel.appendChild(timerGroup);
        activePanel.appendChild(themeGroup);
      }
    } else {
      timerGroup.style.display = 'none';
      themeGroup.style.display = 'none';
    }
  }
}

function selectGameModeTab(modeName) {
  isTabSwitchingInProgress = true;
  if (modeName !== 'actions') {
    const hiddenSelect = document.getElementById('game-mode');
    if (hiddenSelect) {
      hiddenSelect.value = modeName;
    }
    if (typeof onGameModeChange === 'function') {
      onGameModeChange();
    }
  }
  isTabSwitchingInProgress = false;

  switchSidebarTab(modeName);
}

function toggleDrawer() {
  const drawer = document.getElementById('sidebar-drawer');
  const collapseIcon = document.getElementById('collapse-icon');
  const appContainer = document.querySelector('.app-container');
  if (!drawer) return;

  isDrawerCollapsed = !isDrawerCollapsed;

  if (isDrawerCollapsed) {
    drawer.classList.add('collapsed');
    if (appContainer) appContainer.classList.remove('drawer-open');
    // Deactivate all nav tabs visually when collapsed
    const tabs = document.querySelectorAll('.nav-tab-cyber');
    tabs.forEach(t => t.classList.remove('active'));
    if (collapseIcon) {
      collapseIcon.className = "fa-solid fa-chevron-right";
    }
    // Hide all panels to avoid blank placeholder
    const panels = document.querySelectorAll('.drawer-panel-cyber');
    panels.forEach(p => {
      p.style.display = 'none';
      p.classList.remove('active');
    });
  } else {
    drawer.classList.remove('collapsed');
    if (appContainer) appContainer.classList.add('drawer-open');
    // Restore active tab highlight (if none, default to AI)
    if (!activeSidebarTab || !document.getElementById(`tab-${activeSidebarTab}`)) {
      activeSidebarTab = 'ai';
    }
    const activeTabEl = document.getElementById(`tab-${activeSidebarTab}`);
    if (activeTabEl) activeTabEl.classList.add('active');
    if (collapseIcon) {
      collapseIcon.className = "fa-solid fa-chevron-left";
    }
    // Ensure the correct panel is displayed
    switchSidebarTab(activeSidebarTab);
  }
}

// Initialize default game mode setup tab on startup
setTimeout(() => {
  switchSidebarTab('ai');
}, 100);

// =========================================================================
// ONLINE MULTIPLAYER MODULE (Native WebSocket — Cloudflare Workers)
// =========================================================================

// *** SET THIS TO YOUR DEPLOYED WORKER URL AFTER DEPLOYING ***
// e.g. 'https://neonskull-chess.YOUR-SUBDOMAIN.workers.dev'
const CF_WORKER_URL = 'https://neonskull-chess.chessgrandest.workers.dev';

const API_BASE = CF_WORKER_URL;
const WS_URL   = CF_WORKER_URL.replace(/^https/, 'wss').replace(/^http/, 'ws') + '/ws';

let socket = null;          // native WebSocket
let onlineUser = null;      // { id, username, rating, stats, friends }
let onlineGameId = null;
let onlineMyColor = null;   // 'w' or 'b'
let pendingChallenge = null; // { challengeId, challengerId }
let pendingChallengeTimeout = null;

// Shim so all existing socket.emit() calls work unchanged
function _wsSend(type, payload) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }));
  }
}

// Dispatch table: type -> handler(payload)
const _wsHandlers = {};

function _wsOn(type, handler) {
  _wsHandlers[type] = handler;
}

// --- Socket connection (lazy: connect only when user logs in) ---
function onlineConnect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

  socket = new WebSocket(WS_URL);
  socket.emit = _wsSend; // compat shim

  socket.onopen = () => {
    writeLog('>> Cybernet socket connected.');
    if (onlineUser) {
      socket.emit('register-active-user', onlineUser);
    }
  };

  socket.onclose = () => {
    writeLog('>> Cybernet socket disconnected.');
  };

  socket.onerror = () => {
    writeLog('>> Cybernet socket error. Is the server deployed?');
  };

  socket.onmessage = (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }
    const handler = _wsHandlers[msg.type];
    if (handler) handler(msg.payload);
  };

  _wsOn('online-users-list', (users) => {
    renderOnlinePlayers(users);
  });

  _wsOn('notification', ({ type, message }) => {
    writeLog(`>> [${type.toUpperCase()}] ${message}`);
    showOnlineAuthError(message);
  });

  _wsOn('incoming-challenge', ({ challengeId, challenger, timerDuration }) => {
    pendingChallenge = { challengeId, challengerId: challenger.id };
    const mins = Math.round(timerDuration / 60);
    document.getElementById('challenge-banner-text').textContent =
      `${challenger.username} (${challenger.rating}) challenges you to a ${mins}-min game!`;
    document.getElementById('online-challenge-banner').style.display = 'block';
    writeLog(`>> Incoming challenge from ${challenger.username}!`);
  });

  _wsOn('challenge-sent', () => {
    document.getElementById('online-waiting-view').style.display = 'block';
  });

  _wsOn('challenge-declined', ({ declinerName }) => {
    document.getElementById('online-waiting-view').style.display = 'none';
    writeLog(`>> ${declinerName} declined your challenge.`);
  });

  _wsOn('game-started', ({ gameId, yourColor, opponentName, opponentRating, timerDuration }) => {
    onlineGameId = gameId;
    onlineMyColor = yourColor;

    document.getElementById('online-waiting-view').style.display = 'none';
    document.getElementById('online-challenge-banner').style.display = 'none';
    document.getElementById('online-lobby-view').style.display = 'none';
    document.getElementById('online-active-view').style.display = 'block';
    document.getElementById('active-match-opponent').textContent = opponentName + ' (' + opponentRating + ')';
    document.getElementById('right-online-match-controls').style.display = 'flex';

    const hiddenTimer = document.getElementById('match-timer');
    if (hiddenTimer) hiddenTimer.value = timerDuration / 60;

    const hiddenSelect = document.getElementById('game-mode');
    if (hiddenSelect) { hiddenSelect.value = 'pvp'; }
    if (typeof onGameModeChange === 'function') onGameModeChange();

    const myName = onlineUser.username;
    if (yourColor === 'w') {
      if (document.getElementById('name-white')) document.getElementById('name-white').textContent = myName;
      if (document.getElementById('name-black')) document.getElementById('name-black').textContent = opponentName;
    } else {
      if (document.getElementById('name-black')) document.getElementById('name-black').textContent = myName;
      if (document.getElementById('name-white')) document.getElementById('name-white').textContent = opponentName;
      if (typeof flipBoard === 'function') flipBoard();
    }

    window._onlineMode = true;
    window._onlineColor = yourColor;
    writeLog(`>> Game started vs ${opponentName} (${opponentRating})! You are ${yourColor === 'w' ? 'WHITE' : 'BLACK'}.`);
  });

  _wsOn('receive-move', ({ move, fen }) => {
    if (typeof applyOnlineMove === 'function') applyOnlineMove(move, fen);
  });

  _wsOn('game-over-notify', ({ result, winnerId }) => {
    const won = winnerId === onlineUser.id;
    const draw = !winnerId;
    const title = draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT';
    let msg = draw ? "The match ended in a draw." : won ? "You won the match!" : "Your opponent won the match.";
    if (result === 'resignation') msg = won ? "Your opponent resigned." : "You resigned from the match.";
    else if (result === 'draw_agreed') msg = "Players agreed to a draw.";

    writeLog(`>> Online game over: ${result} — ${title}`);
    if (typeof handleGameOver === 'function') handleGameOver(`MATCH OVER // ${title}`, msg);

    onlineGameId = null;
    onlineMyColor = null;
    window._onlineMode = false;
    document.getElementById('online-active-view').style.display = 'none';
    document.getElementById('online-lobby-view').style.display = 'block';
    document.getElementById('right-online-match-controls').style.display = 'none';
    const offerMsg = document.getElementById('draw-offer-message');
    if (offerMsg) offerMsg.style.display = 'none';
  });

  _wsOn('draw-offered', () => {
    const offerMsg = document.getElementById('draw-offer-message');
    if (offerMsg) offerMsg.style.display = 'block';
    writeLog(">> Opponent offered a draw.");
  });

  _wsOn('stats-updated', ({ rating, stats }) => {
    if (onlineUser) {
      onlineUser.rating = rating;
      onlineUser.stats = stats;
    }
    const ratingEl = document.getElementById('lobby-rating-display');
    if (ratingEl) ratingEl.textContent = rating;
    const wonEl = document.getElementById('stat-online-won');
    const lostEl = document.getElementById('stat-online-lost');
    const drawnEl = document.getElementById('stat-online-drawn');
    if (wonEl) wonEl.textContent = stats.won;
    if (lostEl) lostEl.textContent = stats.lost;
    if (drawnEl) drawnEl.textContent = stats.drawn;
  });
}

// --- Auth tab toggle ---
function onlineShowAuthTab(tab) {
  const isLogin = tab === 'login';
  document.getElementById('online-auth-label').textContent = isLogin ? 'LOGIN' : 'CREATE ACCOUNT';
  document.getElementById('auth-tab-login').classList.toggle('active', isLogin);
  document.getElementById('auth-tab-register').classList.toggle('active', !isLogin);
  hideOnlineAuthError();
  // Store current mode on the button for onlineAuth() to read
  document.getElementById('online-auth-btn').dataset.mode = tab;
}

function showOnlineAuthError(msg) {
  const el = document.getElementById('online-auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
function hideOnlineAuthError() {
  const el = document.getElementById('online-auth-error');
  if (el) el.style.display = 'none';
}

// --- Login / Register ---
async function onlineAuth() {
  hideOnlineAuthError();
  const username = document.getElementById('online-username').value.trim();
  const password = document.getElementById('online-password').value;
  const mode = document.getElementById('online-auth-btn').dataset.mode || 'login';

  if (!username || !password) {
    showOnlineAuthError('Please enter a username and password.');
    return;
  }

  const endpoint = mode === 'register' ? API_BASE + '/api/auth/register' : API_BASE + '/api/auth/login';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      showOnlineAuthError(data.error || 'Something went wrong.');
      return;
    }

    if (mode === 'register') {
      // Auto-login after registration
      showOnlineAuthError('');
      document.getElementById('online-auth-label').textContent = 'LOGIN';
      document.getElementById('online-auth-btn').dataset.mode = 'login';
      writeLog(`>> Account created for ${username}. Logging in...`);
      // Re-call as login
      document.getElementById('online-auth-btn').dataset.mode = 'login';
      await onlineAuth();
      return;
    }

    // Logged in!
    onlineUser = data.user;
    onlineConnect();
    socket.emit('register-active-user', onlineUser);
    renderLobby();
    writeLog(`>> Logged in as ${onlineUser.username} (ELO ${onlineUser.rating})`);

  } catch (err) {
    showOnlineAuthError('Connection error. Is the server running?');
  }
}

// --- Lobby rendering ---
function renderLobby() {
  document.getElementById('online-auth-view').style.display = 'none';
  document.getElementById('online-lobby-view').style.display = 'block';
  document.getElementById('lobby-username-display').textContent = onlineUser.username;
  document.getElementById('lobby-rating-display').textContent = onlineUser.rating;
  document.getElementById('stat-online-won').textContent = onlineUser.stats?.won ?? 0;
  document.getElementById('stat-online-lost').textContent = onlineUser.stats?.lost ?? 0;
  document.getElementById('stat-online-drawn').textContent = onlineUser.stats?.drawn ?? 0;
  socket.emit('get-online-users');
}

function renderOnlinePlayers(users) {
  const list = document.getElementById('online-players-list');
  const countEl = document.getElementById('lobby-online-count');
  if (!list) return;

  // Filter out self
  const others = users.filter(u => u.id !== onlineUser?.id);
  if (countEl) countEl.textContent = users.length;

  if (others.length === 0) {
    list.innerHTML = '<div style="font-size:0.75rem;color:var(--color-text-secondary);padding:12px;text-align:center;">No other players online right now.</div>';
    return;
  }

  list.innerHTML = others.map(u => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06);">
      <div>
        <div style="font-size:0.8rem;font-weight:600;">${u.username}</div>
        <div style="font-size:0.68rem;color:var(--color-accent-alt);">ELO ${u.rating}</div>
      </div>
      <button class="btn-cyber active" onclick="onlineSendChallenge('${u.id}','${u.username}')"
        style="padding:5px 10px;font-size:0.65rem;">
        ⚔ CHALLENGE
      </button>
    </div>
  `).join('');
}

// --- Challenge flow ---
function onlineSendChallenge(targetId, targetName) {
  if (!socket || !onlineUser) return;
  const timerSecs = parseInt(document.getElementById('challenge-timer')?.value || '600');
  socket.emit('send-challenge', { targetUserId: targetId, timerDuration: timerSecs });
  writeLog(`>> Challenge sent to ${targetName}...`);
  document.getElementById('online-waiting-view').style.display = 'block';

  // Auto-cancel after 30s
  clearTimeout(pendingChallengeTimeout);
  pendingChallengeTimeout = setTimeout(() => {
    onlineCancelChallenge();
    writeLog('>> Challenge timed out.');
  }, 30000);
}

function onlineCancelChallenge() {
  document.getElementById('online-waiting-view').style.display = 'none';
  clearTimeout(pendingChallengeTimeout);
}

function onlineResign() {
  if (!window._onlineMode || !onlineGameId) return;
  if (confirm("Are you sure you want to resign?")) {
    socket.emit('resign', { gameId: onlineGameId });
  }
}

function onlineOfferDraw() {
  if (!window._onlineMode || !onlineGameId) return;
  if (confirm("Are you sure you want to offer a draw to your opponent?")) {
    socket.emit('offer-draw', { gameId: onlineGameId });
    writeLog(">> Draw offer sent to opponent.");
  }
}

function onlineAcceptDraw() {
  if (!window._onlineMode || !onlineGameId) return;
  socket.emit('accept-draw', { gameId: onlineGameId });
  document.getElementById('draw-offer-message').style.display = 'none';
}

function onlineDeclineDraw() {
  document.getElementById('draw-offer-message').style.display = 'none';
  writeLog(">> You declined the draw offer.");
  // Optional: Could emit a 'decline-draw' to inform opponent, but ignoring it is also standard.
}

function onlineAcceptChallenge() {
  if (!socket || !pendingChallenge) return;
  const timerSecs = parseInt(document.getElementById('challenge-timer')?.value || '600');
  socket.emit('accept-challenge', {
    challengeId: pendingChallenge.challengeId,
    challengerId: pendingChallenge.challengerId,
    timerDuration: timerSecs
  });
  document.getElementById('online-challenge-banner').style.display = 'none';
  pendingChallenge = null;
}

function onlineDeclineChallenge() {
  if (!socket || !pendingChallenge) return;
  socket.emit('decline-challenge', { challengerId: pendingChallenge.challengerId });
  document.getElementById('online-challenge-banner').style.display = 'none';
  pendingChallenge = null;
}

// --- Logout ---
function onlineLogout() {
  if (socket) socket.close();
  socket = null;
  onlineUser = null;
  onlineGameId = null;
  onlineMyColor = null;
  window._onlineMode = false;
  document.getElementById('online-lobby-view').style.display = 'none';
  document.getElementById('online-auth-view').style.display = 'block';
  document.getElementById('online-username').value = '';
  document.getElementById('online-password').value = '';
  writeLog('>> Logged out of Cybernet.');
}

// --- Hook into the existing move dispatch so online moves get sent ---
// Called by the main chess engine whenever a move is made locally.
// Place this hook by patching into the board's dispatchMove / executeMove path.
function onlineEmitMove(move, fen) {
  if (!socket || !onlineGameId) return;
  socket.emit('make-move', { gameId: onlineGameId, move, fen });
}

// applyOnlineMove: called when opponent's move arrives via socket
function applyOnlineMove(move, fen) {
  const result = game.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion || undefined
  });
  if (result) {
    window._isReceivingOnlineMove = true;
    onMoveExecuted(result);
    window._isReceivingOnlineMove = false;
    writeLog(`>> Opponent played: <span class="move">${result.san}</span>`);
  }
}

// Initialize the auth button dataset so the first click is 'login'
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('online-auth-btn');
  if (btn) btn.dataset.mode = 'login';
});

/* =========================================================================
   NOTATION SIDEBAR — Move log, branching, click-to-review, arrow keys
   =========================================================================
   _notationTree  : the main line as an array of node objects
   _notationBranches : map of branchPointIdx -> array of branch node arrays
   _notationCursor   : index into current sequence (-1 = live end, -2 = before move 0)
   _notationInBranch : index of active branch at _notationBranchPoint, or -1
   _notationBranchPoint : main-line index where branch diverged
   ========================================================================= */

let _notationTree = [];       // main line: [{ san, fen, color }]
let _notationBranches = {};   // branchPointIdx -> [ [{san,fen,color},...], ... ]
let _notationCursor = -1;     // position in active sequence; -1 = live end; -2 = before all
let _notationInBranch = -1;   // which branch we're in (-1 = main line)
let _notationBranchPoint = -1;// main-line index where we branched off
let _notationBranchCursor = -1;// position within current branch
let _liveGame = null;         // FEN backup of the real live game

// Ensure banner is hidden on load
document.addEventListener('DOMContentLoaded', () => {
  _notationHideBanner();
});

/* --- public API --- */

function notationOnMove(move) {
  if (!move) return;
  const node = { san: move.san, fen: game.fen(), color: move.color };

  if (_notationCursor === -1 && _notationInBranch === -1) {
    // Normal live play — append to main line
    _notationTree.push(node);

  } else {
    // Playing from a review position — create/extend a branch
    _notationHideBanner();

    if (_notationInBranch === -1) {
      // First branch move off the main line
      const bp = _notationCursor === -2 ? -1 : _notationCursor;
      _notationBranchPoint = bp;
      if (!_notationBranches[bp]) _notationBranches[bp] = [];
      _notationBranches[bp].push([node]);
      _notationInBranch = _notationBranches[bp].length - 1;
      _notationBranchCursor = 0;
    } else {
      // Continuing an existing branch
      _notationBranches[_notationBranchPoint][_notationInBranch].push(node);
      _notationBranchCursor = _notationBranches[_notationBranchPoint][_notationInBranch].length - 1;
    }

    // cursor stays pointing at branch end — remove the blocking guards
    _notationCursor = _notationBranchPoint; // keep context of where branch forked
  }

  notationRender();
  notationScrollToActive();
}

function notationReset() {
  _notationTree = [];
  _notationBranches = {};
  _notationCursor = -1;
  _notationInBranch = -1;
  _notationBranchPoint = -1;
  _notationBranchCursor = -1;
  _liveGame = null;
  notationRender();
  _notationHideBanner();
  const footer = document.getElementById('notation-result-display');
  if (footer) footer.textContent = '';
}

function notationSetResult(text) {
  const footer = document.getElementById('notation-result-display');
  if (footer) footer.textContent = text;
}

function notationGoTo(idx) {
  // Jump to main-line position idx (0-based half-move)
  if (_notationTree.length === 0) return;
  if (idx < 0) idx = 0;
  if (idx >= _notationTree.length) idx = _notationTree.length - 1;

  if (_notationCursor === -1 && _notationInBranch === -1) {
    _liveGame = game.fen(); // save live position first time
  }

  _notationCursor = idx;
  _notationInBranch = -1;
  _notationBranchPoint = -1;
  _notationBranchCursor = -1;

  game = new Chess(_notationTree[idx].fen);
  selectedSquare = null;
  possibleMoves = [];
  renderBoard();
  notationRender();
  notationScrollToActive();
  _notationShowBanner();
}

function notationGoToEnd() {
  // Return to the live game position
  if (_notationCursor === -1 && _notationInBranch === -1) return; // already live

  _notationCursor = -1;
  _notationInBranch = -1;
  _notationBranchPoint = -1;
  _notationBranchCursor = -1;

  if (_liveGame) {
    game = new Chess(_liveGame);
    _liveGame = null;
  }
  selectedSquare = null;
  possibleMoves = [];
  renderBoard();
  notationRender();
  notationScrollToActive();
  _notationHideBanner();
}

function notationStepBack() {
  if (_notationTree.length === 0) return;

  // If in a branch, step back within it
  if (_notationInBranch !== -1) {
    const branch = _notationBranches[_notationBranchPoint][_notationInBranch];
    if (_notationBranchCursor > 0) {
      _notationBranchCursor--;
      game = new Chess(branch[_notationBranchCursor].fen);
      selectedSquare = null; possibleMoves = [];
      renderBoard(); notationRender(); notationScrollToActive();
      _notationShowBanner();
    } else {
      // Back to the branch point on main line
      _notationInBranch = -1;
      _notationBranchCursor = -1;
      if (_notationBranchPoint === -1) {
        _notationGoToStart();
      } else {
        game = new Chess(_notationTree[_notationBranchPoint].fen);
        selectedSquare = null; possibleMoves = [];
        renderBoard(); notationRender(); notationScrollToActive();
        _notationShowBanner();
      }
    }
    return;
  }

  if (_notationCursor === -1) {
    // At live end — step back to second-to-last main move
    const target = _notationTree.length - 2;
    if (target < 0) {
      _notationGoToStart();
    } else {
      notationGoTo(target);
    }
  } else if (_notationCursor === 0) {
    _notationGoToStart();
  } else {
    notationGoTo(_notationCursor - 1);
  }
}

function notationStepForward() {
  if (_notationTree.length === 0) return;

  // In a branch — step forward within it
  if (_notationInBranch !== -1) {
    const branch = _notationBranches[_notationBranchPoint][_notationInBranch];
    if (_notationBranchCursor < branch.length - 1) {
      _notationBranchCursor++;
      game = new Chess(branch[_notationBranchCursor].fen);
      selectedSquare = null; possibleMoves = [];
      renderBoard(); notationRender(); notationScrollToActive();
    }
    return;
  }

  if (_notationCursor === -1) return; // already at live end

  const next = _notationCursor + 1;
  if (next >= _notationTree.length) {
    notationGoToEnd();
  } else {
    notationGoTo(next);
  }
}

function _notationGoToStart() {
  if (_notationCursor === -1 && _notationInBranch === -1) _liveGame = game.fen();
  _notationCursor = -2;
  _notationInBranch = -1;
  _notationBranchPoint = -1;
  _notationBranchCursor = -1;
  game = new Chess();
  selectedSquare = null;
  possibleMoves = [];
  renderBoard();
  notationRender();
  _notationShowBanner();
}

function _notationShowBanner() {
  const b = document.getElementById('notation-reviewing-banner');
  if (b) b.classList.add('active');
}
function _notationHideBanner() {
  const b = document.getElementById('notation-reviewing-banner');
  if (b) b.classList.remove('active');
}

function _isReviewing() {
  return _notationCursor !== -1 || _notationInBranch !== -1;
}

function notationRender() {
  const list = document.getElementById('notation-move-list');
  if (!list) return;

  if (_notationTree.length === 0) {
    list.innerHTML = '<div class="notation-empty-state">No moves yet</div>';
    return;
  }

  let html = '';

  for (let i = 0; i < _notationTree.length; i += 2) {
    const wNode = _notationTree[i];
    const bNode = _notationTree[i + 1] || null;
    const moveNum = Math.floor(i / 2) + 1;
    const wIdx = i;
    const bIdx = i + 1;

    // Highlight logic for main line
    const atLiveEnd = (_notationCursor === -1 && _notationInBranch === -1);
    const wActive = (_notationCursor === wIdx && _notationInBranch === -1)
      || (atLiveEnd && wIdx === _notationTree.length - 1 && _notationTree.length % 2 === 1);
    const bActive = (_notationCursor === bIdx && _notationInBranch === -1)
      || (atLiveEnd && bNode && bIdx === _notationTree.length - 1);

    const wClass = wActive ? 'active-move' : '';
    const bClass = bActive ? 'active-move' : '';

    const bCell = bNode
      ? `<span class="notation-cell ${bClass}" onclick="notationGoTo(${bIdx})">${_notationEscape(bNode.san)}</span>`
      : `<span class="notation-cell" style="opacity:0.2;">—</span>`;

    html += `<div class="notation-row">
      <span class="notation-move-num">${moveNum}.</span>
      <span class="notation-cell ${wClass}" onclick="notationGoTo(${wIdx})">${_notationEscape(wNode.san)}</span>
      ${bCell}
    </div>`;

    // Render any branches that fork off after move i (white) or i+1 (black)
    [wIdx, bIdx].forEach(forkIdx => {
      if (_notationBranches[forkIdx]) {
        _notationBranches[forkIdx].forEach((branch, branchIdx) => {
          if (branch.length === 0) return;
          const isActiveBranch = _notationInBranch === branchIdx && _notationBranchPoint === forkIdx;

          // Branch label: "3. g3 g6  4. f4..."
          let branchHtml = '';
          let bMoveNum = Math.floor(forkIdx / 2) + 1;
          let firstMove = true;

          for (let b = 0; b < branch.length; b++) {
            const bn = branch[b];
            const isWhiteBranchMove = (forkIdx % 2 === 0) ? (b % 2 === 0) : (b % 2 === 1);
            const needsNum = firstMove || isWhiteBranchMove;

            if (needsNum) {
              if (!firstMove) bMoveNum++;
              const ellipsis = firstMove && !isWhiteBranchMove ? `${bMoveNum}. ...` : '';
              if (firstMove && !isWhiteBranchMove) {
                branchHtml += `<span class="notation-branch-num">${bMoveNum}.</span><span class="notation-branch-ellipsis">...</span>`;
              } else if (isWhiteBranchMove) {
                branchHtml += `<span class="notation-branch-num">${bMoveNum}.</span>`;
              }
              firstMove = false;
            }

            const bActive2 = isActiveBranch && _notationBranchCursor === b;
            const bClass2 = bActive2 ? 'active-move' : '';
            branchHtml += `<span class="notation-cell notation-branch-cell ${bClass2}" onclick="notationJumpBranch(${forkIdx},${branchIdx},${b})">${_notationEscape(bn.san)}</span>`;
          }

          html += `<div class="notation-branch-row">${branchHtml}</div>`;
        });
      }
    });
  }

  list.innerHTML = html;
}

// Jump into a specific branch at a specific position
function notationJumpBranch(branchPoint, branchIdx, branchCursor) {
  if (_notationCursor === -1 && _notationInBranch === -1) {
    _liveGame = game.fen();
  }

  _notationBranchPoint = branchPoint;
  _notationInBranch = branchIdx;
  _notationBranchCursor = branchCursor;
  _notationCursor = branchPoint; // keep main-line context

  const branch = _notationBranches[branchPoint][branchIdx];
  game = new Chess(branch[branchCursor].fen);
  selectedSquare = null;
  possibleMoves = [];
  renderBoard();
  notationRender();
  notationScrollToActive();
  _notationShowBanner();
}

function _notationEscape(san) {
  return san.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function notationScrollToActive() {
  const list = document.getElementById('notation-move-list');
  if (!list) return;
  const active = list.querySelector('.active-move');
  if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Arrow key navigation
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement ? document.activeElement.tagName : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

  if (e.key === 'ArrowLeft') {
    e.preventDefault();
    notationStepBack();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    notationStepForward();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (_notationCursor !== -2) _notationGoToStart();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    notationGoToEnd();
  }
});