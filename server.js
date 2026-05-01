const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

const sessions = new Map();

const PUZZLES = [
  {
    id: "badge",
    title: "Security Badge Console",
    prompt:
      "Type the department codename hidden in plain sight: Macrodata Refinement",
    answer: "macrodata",
    hints: [
      "Think about the full department name in the clue.",
      "Use only the first word of that department.",
      "Answer: macrodata"
    ]
  },
  {
    id: "wellness",
    title: "Wellness Statement Locker",
    prompt: "Complete the phrase: You are ___ in this place.",
    answer: "safe",
    hints: [
      "It's a single short adjective.",
      "The phrase is reassuring.",
      "Answer: safe"
    ]
  },
  {
    id: "breakroom",
    title: "Break Room Apology Terminal",
    prompt: "Enter the 4-digit code from this clue: 2 desks, 3 elevators, 1 exit, 4 hallways",
    answer: "2314",
    hints: [
      "Do not add; keep the numbers in order.",
      "Read the clue like a sequence, not a math problem.",
      "Answer: 2314"
    ]
  },
  {
    id: "elevator",
    title: "Elevator Override",
    prompt: "Final keyphrase to leave the floor: Defiant Jazz",
    answer: "defiant jazz",
    hints: [
      "Two words from the clue itself.",
      "Second word is a music genre.",
      "Answer: defiant jazz"
    ]
  }
];

const EXPLORATION_SPOTS = {
  badge: [
    { id: "badge-desk", label: "Search Reception Desk", clue: "A sticky note reads: MDR = Macrodata Refinement." },
    { id: "badge-monitor", label: "Inspect Security Monitor", clue: "Login prompt highlights: 'Use department codename only.'" }
  ],
  wellness: [
    { id: "wellness-frame", label: "Inspect Wellness Frame", clue: "A faded quote ends with: 'You are ___ in this place.'" },
    { id: "wellness-tape", label: "Play Cassette Recording", clue: "Voice repeats: 'You are safe in this place.'" }
  ],
  breakroom: [
    { id: "breakroom-calendar", label: "Check Wall Calendar", clue: "Numbers are circled in this order: 2, 3, 1, 4." },
    { id: "breakroom-speaker", label: "Listen to Break Room Speaker", clue: "A mechanical voice whispers: 'Keep the sequence, do not sum.'" }
  ],
  elevator: [
    { id: "elevator-plaque", label: "Read Elevator Plaque", clue: "Inscription: 'Defiance is rhythm. Rhythm is jazz.'" },
    { id: "elevator-panel", label: "Open Override Panel", clue: "Typed in chalk: 'Defiant Jazz'." }
  ]
};

function normalize(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function generateSessionId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let id = "";
  for (let i = 0; i < 6; i += 1) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function getPublicState(session) {
  const solvedCount = session.solved.size;
  const allSolved = solvedCount === PUZZLES.length;
  const activePuzzle = session.startedAt ? PUZZLES[solvedCount] : null;
  const hintLevel = session.hintLevels.get(activePuzzle?.id) || 0;
  const hintText =
    activePuzzle && hintLevel > 0 ? activePuzzle.hints[Math.min(hintLevel - 1, activePuzzle.hints.length - 1)] : "";
  const puzzleElapsedMs = session.puzzleStartedAt ? Date.now() - session.puzzleStartedAt : 0;
  let puzzleWarning = "";
  if (session.startedAt && !allSolved) {
    if (puzzleElapsedMs >= 4 * 60 * 1000) {
      puzzleWarning = "This puzzle has been open for 4+ minutes. Consider requesting another hint.";
    } else if (puzzleElapsedMs >= 2 * 60 * 1000) {
      puzzleWarning = "2-minute warning: if stuck, use hints early to keep pace.";
    }
  }
  const timeRemainingMs = Math.max(session.endsAt - Date.now(), 0);
  const activeSpots = activePuzzle ? EXPLORATION_SPOTS[activePuzzle.id] || [] : [];
  const discoveredSpots = activePuzzle ? session.discoveredSpots.get(activePuzzle.id) || new Set() : new Set();
  const clueProgress = activeSpots.length ? `${discoveredSpots.size}/${activeSpots.length}` : "0/0";

  return {
    id: session.id,
    hostSocketId: session.hostSocketId,
    startedAt: session.startedAt,
    autoStartAt: session.autoStartAt,
    players: [...session.players.values()],
    solved: [...session.solved],
    solvedCount,
    allSolved,
    endsAt: session.endsAt,
    timeRemainingMs,
    puzzleElapsedMs,
    puzzleWarning,
    hintLevel,
    hintText,
    activeExploration: activePuzzle
      ? {
          required: activeSpots.length,
          discovered: discoveredSpots.size,
          clueProgress,
          canAnswer: activeSpots.length === 0 || discoveredSpots.size >= activeSpots.length,
          spots: activeSpots.map((spot) => ({
            id: spot.id,
            label: spot.label,
            discovered: discoveredSpots.has(spot.id),
            clue: discoveredSpots.has(spot.id) ? spot.clue : ""
          }))
        }
      : null,
    discoveredClues: session.discoveredClues.slice(-8),
    puzzles: PUZZLES.map((puzzle, index) => ({
      id: puzzle.id,
      title: puzzle.title,
      prompt: puzzle.prompt,
      unlocked: index <= solvedCount,
      solved: session.solved.has(puzzle.id)
    })),
    log: session.log.slice(-12)
  };
}

function addLog(session, message) {
  session.log.push(`${new Date().toLocaleTimeString()}: ${message}`);
}

function createSession(hostName) {
  let id = generateSessionId();
  while (sessions.has(id)) {
    id = generateSessionId();
  }

  const session = {
    id,
    hostSocketId: null,
    players: new Map(),
    solved: new Set(),
    hintLevels: new Map(),
    discoveredSpots: new Map(),
    discoveredClues: [],
    startedAt: null,
    autoStartAt: null,
    puzzleStartedAt: null,
    endsAt: Date.now() + Number(process.env.SESSION_MINUTES || 30) * 60 * 1000,
    log: []
  };

  addLog(session, `${hostName} opened a new severed floor simulation.`);
  sessions.set(id, session);
  return session;
}

function emitState(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  io.to(sessionId).emit("state:update", getPublicState(session));
}

io.on("connection", (socket) => {
  socket.on("session:create", ({ playerName }, callback) => {
    const cleanName = String(playerName || "").trim() || "Manager";
    const session = createSession(cleanName);
    session.hostSocketId = socket.id;
    session.players.set(socket.id, cleanName);
    socket.join(session.id);
    addLog(session, `${cleanName} joined the office.`);
    callback({ ok: true, sessionId: session.id, state: getPublicState(session) });
  });

  socket.on("session:join", ({ sessionId, playerName }, callback) => {
    const id = String(sessionId || "")
      .trim()
      .toUpperCase();
    const session = sessions.get(id);
    if (!session) {
      callback({ ok: false, error: "Session not found. Check the game ID." });
      return;
    }

    const cleanName = String(playerName || "").trim() || "Refiner";
    session.players.set(socket.id, cleanName);
    socket.join(id);
    addLog(session, `${cleanName} entered the severed floor.`);
    if (!session.startedAt && !session.autoStartAt && session.players.size >= 2) {
      session.autoStartAt = Date.now() + 15000;
      addLog(session, "Auto-start armed for 15 seconds.");
    }
    callback({ ok: true, sessionId: id, state: getPublicState(session) });
    emitState(id);
  });

  socket.on("puzzle:answer", ({ sessionId, puzzleId, answer }, callback) => {
    const session = sessions.get(sessionId);
    if (!session) {
      callback({ ok: false, error: "Session expired." });
      return;
    }
    if (!session.startedAt) {
      callback({ ok: false, error: "Game has not started yet." });
      return;
    }

    const solvedCount = session.solved.size;
    const currentPuzzle = PUZZLES[solvedCount];
    if (!currentPuzzle || currentPuzzle.id !== puzzleId) {
      callback({ ok: false, error: "That station is still locked." });
      return;
    }
    const requiredSpots = EXPLORATION_SPOTS[currentPuzzle.id] || [];
    const discovered = session.discoveredSpots.get(currentPuzzle.id) || new Set();
    if (requiredSpots.length > 0 && discovered.size < requiredSpots.length) {
      callback({ ok: false, error: "Search the room first. You are missing clue fragments." });
      return;
    }

    if (normalize(answer) !== normalize(currentPuzzle.answer)) {
      callback({ ok: false, error: "Access denied. Try another phrase." });
      return;
    }

    session.solved.add(puzzleId);
    session.hintLevels.delete(puzzleId);
    session.puzzleStartedAt = Date.now();
    const playerName = session.players.get(socket.id) || "A player";
    addLog(session, `${playerName} solved ${currentPuzzle.title}.`);
    callback({ ok: true });
    emitState(sessionId);
  });

  socket.on("puzzle:hint", ({ sessionId }, callback) => {
    const session = sessions.get(sessionId);
    if (!session) {
      callback({ ok: false, error: "Session expired." });
      return;
    }
    if (!session.startedAt) {
      callback({ ok: false, error: "Game has not started yet." });
      return;
    }
    const solvedCount = session.solved.size;
    const currentPuzzle = PUZZLES[solvedCount];
    if (!currentPuzzle) {
      callback({ ok: false, error: "No active puzzle." });
      return;
    }

    const nextLevel = Math.min((session.hintLevels.get(currentPuzzle.id) || 0) + 1, currentPuzzle.hints.length);
    session.hintLevels.set(currentPuzzle.id, nextLevel);
    const playerName = session.players.get(socket.id) || "A player";
    addLog(session, `${playerName} requested hint ${nextLevel} for ${currentPuzzle.title}.`);
    callback({ ok: true });
    emitState(sessionId);
  });

  socket.on("explore:search", ({ sessionId, spotId }, callback) => {
    const session = sessions.get(sessionId);
    if (!session) {
      callback({ ok: false, error: "Session expired." });
      return;
    }
    if (!session.startedAt) {
      callback({ ok: false, error: "Game has not started yet." });
      return;
    }
    const solvedCount = session.solved.size;
    const currentPuzzle = PUZZLES[solvedCount];
    if (!currentPuzzle) {
      callback({ ok: false, error: "No active puzzle." });
      return;
    }
    const spots = EXPLORATION_SPOTS[currentPuzzle.id] || [];
    const spot = spots.find((item) => item.id === spotId);
    if (!spot) {
      callback({ ok: false, error: "Nothing useful found there." });
      return;
    }

    const found = session.discoveredSpots.get(currentPuzzle.id) || new Set();
    if (found.has(spotId)) {
      callback({ ok: false, error: "That clue was already discovered." });
      return;
    }
    found.add(spotId);
    session.discoveredSpots.set(currentPuzzle.id, found);
    session.discoveredClues.push({
      puzzleId: currentPuzzle.id,
      spotId: spot.id,
      label: spot.label,
      clue: spot.clue
    });
    const playerName = session.players.get(socket.id) || "A player";
    addLog(session, `${playerName} found a clue at ${spot.label}.`);
    callback({ ok: true });
    emitState(sessionId);
  });

  socket.on("host:skip", ({ sessionId }, callback) => {
    const session = sessions.get(sessionId);
    if (!session) {
      callback({ ok: false, error: "Session expired." });
      return;
    }
    if (socket.id !== session.hostSocketId) {
      callback({ ok: false, error: "Only the host can use that control." });
      return;
    }
    if (!session.startedAt) {
      callback({ ok: false, error: "Game has not started yet." });
      return;
    }

    const solvedCount = session.solved.size;
    const currentPuzzle = PUZZLES[solvedCount];
    if (!currentPuzzle) {
      callback({ ok: false, error: "No puzzle left to skip." });
      return;
    }

    session.solved.add(currentPuzzle.id);
    session.hintLevels.delete(currentPuzzle.id);
    session.puzzleStartedAt = Date.now();
    addLog(session, `Host skipped ${currentPuzzle.title}.`);
    callback({ ok: true });
    emitState(sessionId);
  });

  socket.on("host:start", ({ sessionId }, callback) => {
    const session = sessions.get(sessionId);
    if (!session) {
      callback({ ok: false, error: "Session expired." });
      return;
    }
    if (socket.id !== session.hostSocketId) {
      callback({ ok: false, error: "Only the host can use that control." });
      return;
    }
    if (session.startedAt) {
      callback({ ok: false, error: "Game already started." });
      return;
    }
    session.startedAt = Date.now();
    session.autoStartAt = null;
    session.puzzleStartedAt = Date.now();
    addLog(session, "Host started the game.");
    callback({ ok: true });
    emitState(sessionId);
  });

  socket.on("host:autostart", ({ sessionId }, callback) => {
    const session = sessions.get(sessionId);
    if (!session) {
      callback({ ok: false, error: "Session expired." });
      return;
    }
    if (socket.id !== session.hostSocketId) {
      callback({ ok: false, error: "Only the host can use that control." });
      return;
    }
    if (session.startedAt) {
      callback({ ok: false, error: "Game already started." });
      return;
    }
    session.autoStartAt = Date.now() + 15000;
    addLog(session, "Host armed auto-start (15 seconds).");
    callback({ ok: true });
    emitState(sessionId);
  });

  socket.on("host:reset", ({ sessionId }, callback) => {
    const session = sessions.get(sessionId);
    if (!session) {
      callback({ ok: false, error: "Session expired." });
      return;
    }
    if (socket.id !== session.hostSocketId) {
      callback({ ok: false, error: "Only the host can use that control." });
      return;
    }
    session.solved.clear();
    session.hintLevels.clear();
    session.discoveredSpots.clear();
    session.startedAt = null;
    session.autoStartAt = null;
    session.puzzleStartedAt = null;
    session.endsAt = Date.now() + Number(process.env.SESSION_MINUTES || 30) * 60 * 1000;
    addLog(session, "Host reset the session and timer.");
    callback({ ok: true });
    emitState(sessionId);
  });

  socket.on("disconnect", () => {
    for (const session of sessions.values()) {
      if (session.players.has(socket.id)) {
        const name = session.players.get(socket.id);
        session.players.delete(socket.id);
        if (session.hostSocketId === socket.id) {
          const nextHostSocketId = session.players.keys().next().value || null;
          session.hostSocketId = nextHostSocketId;
          if (nextHostSocketId) {
            const nextHostName = session.players.get(nextHostSocketId);
            addLog(session, `${nextHostName} is now host.`);
          }
        }
        addLog(session, `${name} left the floor.`);
        emitState(session.id);
      }
    }
  });
});

setInterval(() => {
  for (const session of sessions.values()) {
    if (!session.startedAt && session.autoStartAt && Date.now() >= session.autoStartAt) {
      session.startedAt = Date.now();
      session.autoStartAt = null;
      session.puzzleStartedAt = Date.now();
      addLog(session, "Auto-start triggered. Game is live.");
    }
    emitState(session.id);
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`VScape server running on http://localhost:${PORT}`);
});
