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
  const activePuzzle = PUZZLES[solvedCount];
  const hintLevel = session.hintLevels.get(activePuzzle?.id) || 0;
  const hintText =
    activePuzzle && hintLevel > 0 ? activePuzzle.hints[Math.min(hintLevel - 1, activePuzzle.hints.length - 1)] : "";
  const timeRemainingMs = Math.max(session.endsAt - Date.now(), 0);

  return {
    id: session.id,
    hostSocketId: session.hostSocketId,
    players: [...session.players.values()],
    solved: [...session.solved],
    solvedCount,
    allSolved,
    endsAt: session.endsAt,
    timeRemainingMs,
    hintLevel,
    hintText,
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
    callback({ ok: true, sessionId: id, state: getPublicState(session) });
    emitState(id);
  });

  socket.on("puzzle:answer", ({ sessionId, puzzleId, answer }, callback) => {
    const session = sessions.get(sessionId);
    if (!session) {
      callback({ ok: false, error: "Session expired." });
      return;
    }

    const solvedCount = session.solved.size;
    const currentPuzzle = PUZZLES[solvedCount];
    if (!currentPuzzle || currentPuzzle.id !== puzzleId) {
      callback({ ok: false, error: "That station is still locked." });
      return;
    }

    if (normalize(answer) !== normalize(currentPuzzle.answer)) {
      callback({ ok: false, error: "Access denied. Try another phrase." });
      return;
    }

    session.solved.add(puzzleId);
    session.hintLevels.delete(puzzleId);
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

    const solvedCount = session.solved.size;
    const currentPuzzle = PUZZLES[solvedCount];
    if (!currentPuzzle) {
      callback({ ok: false, error: "No puzzle left to skip." });
      return;
    }

    session.solved.add(currentPuzzle.id);
    session.hintLevels.delete(currentPuzzle.id);
    addLog(session, `Host skipped ${currentPuzzle.title}.`);
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
    emitState(session.id);
  }
}, 1000);

server.listen(PORT, () => {
  console.log(`VScape server running on http://localhost:${PORT}`);
});
