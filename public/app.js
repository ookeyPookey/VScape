const socket = io();

let currentSessionId = null;
let currentState = null;

const lobbyEl = document.getElementById("lobby");
const gameEl = document.getElementById("game");
const playerNameEl = document.getElementById("playerName");
const sessionIdInputEl = document.getElementById("sessionIdInput");
const createBtnEl = document.getElementById("createBtn");
const joinBtnEl = document.getElementById("joinBtn");
const lobbyErrorEl = document.getElementById("lobbyError");

const sessionCodeEl = document.getElementById("sessionCode");
const statusTextEl = document.getElementById("statusText");
const playersListEl = document.getElementById("playersList");
const progressListEl = document.getElementById("progressList");
const puzzleAreaEl = document.getElementById("puzzleArea");
const answerErrorEl = document.getElementById("answerError");
const logListEl = document.getElementById("logList");
const timerTextEl = document.getElementById("timerText");
const hostControlsEl = document.getElementById("hostControls");
const sceneEl = document.getElementById("scene");
const elevatorVisualEl = document.getElementById("elevatorVisual");

function renderPuzzleTheme(puzzleId) {
  if (puzzleId === "badge") {
    return "<p><strong>Station Feed:</strong> Green badge scanner flickers near the security desk.</p>";
  }
  if (puzzleId === "wellness") {
    return "<p><strong>Station Feed:</strong> Fluorescent lights hum in the wellness wing.</p>";
  }
  if (puzzleId === "breakroom") {
    return "<p><strong>Station Feed:</strong> The break room speaker loops the same chime.</p>";
  }
  return "<p><strong>Station Feed:</strong> Elevator lock relay is waiting for the final passphrase.</p>";
}

function syncSceneState(state) {
  const stations = [
    { id: "badge", className: "station-badge" },
    { id: "wellness", className: "station-wellness" },
    { id: "breakroom", className: "station-breakroom" }
  ];

  stations.forEach((station) => {
    const node = document.querySelector(`.${station.className}`);
    if (!node) return;
    node.classList.remove("active", "done");
    if (state.solved.includes(station.id)) {
      node.classList.add("done");
      return;
    }
    const activePuzzle = state.puzzles.find((p) => p.unlocked && !p.solved);
    if (activePuzzle && activePuzzle.id === station.id && state.startedAt) {
      node.classList.add("active");
    }
  });

  sceneEl.classList.toggle("escaped", Boolean(state.allSolved));
  elevatorVisualEl.classList.toggle("active", Boolean(state.startedAt && !state.allSolved));
}

function formatMs(ms) {
  const clamped = Math.max(ms, 0);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function clearErrors() {
  lobbyErrorEl.textContent = "";
  answerErrorEl.textContent = "";
}

function getPlayerName() {
  return playerNameEl.value.trim();
}

function showGame(state) {
  currentState = state;
  lobbyEl.classList.add("hidden");
  gameEl.classList.remove("hidden");

  sessionCodeEl.textContent = state.id;
  if (!state.startedAt) {
    const autoStartCountdownMs = state.autoStartAt ? Math.max(state.autoStartAt - Date.now(), 0) : 0;
    statusTextEl.textContent = state.autoStartAt
      ? `Auto-start in ${formatMs(autoStartCountdownMs)}`
      : "Waiting for host to start.";
  } else {
    statusTextEl.textContent = state.allSolved
      ? "Elevator unlocked. You escaped."
      : `Stations solved: ${state.solvedCount}/${state.puzzles.length}`;
  }
  timerTextEl.textContent = `Time Remaining: ${formatMs(state.timeRemainingMs || 0)}`;

  playersListEl.innerHTML = state.players.map((name) => `<li>${name}</li>`).join("");
  progressListEl.innerHTML = state.puzzles
    .map(
      (puzzle) =>
        `<li>${puzzle.solved ? "✅" : "⬜"} ${puzzle.title}</li>`
    )
    .join("");

  logListEl.innerHTML = state.log.map((item) => `<li>${item}</li>`).join("");
  syncSceneState(state);

  if (state.allSolved) {
    puzzleAreaEl.innerHTML =
      '<div class="puzzle-box"><h3>Outie Status: Restored</h3><p>You have escaped the severed floor. Great work, team.</p></div>';
    return;
  }

  if (!state.startedAt) {
    puzzleAreaEl.innerHTML =
      '<div class="puzzle-box"><h3>Pre-Game Briefing</h3><p>Host can start now or arm auto-start from Host Controls.</p></div>';
    answerErrorEl.textContent = "";
  } else {
  const currentPuzzle = state.puzzles.find((p) => p.unlocked && !p.solved);
  if (!currentPuzzle) return;

  puzzleAreaEl.innerHTML = `
    <div class="puzzle-box">
      <h3>${currentPuzzle.title}</h3>
      ${renderPuzzleTheme(currentPuzzle.id)}
      <p>${currentPuzzle.prompt}</p>
      ${state.hintText ? `<p><strong>Hint:</strong> ${state.hintText}</p>` : ""}
      ${state.puzzleWarning ? `<p class="warning"><strong>Timer Alert:</strong> ${state.puzzleWarning}</p>` : ""}
      <input id="answerInput" placeholder="Enter answer..." />
      <button id="submitAnswerBtn">Submit</button>
      <button id="hintBtn">Request Hint</button>
    </div>
  `;

  const submitBtn = document.getElementById("submitAnswerBtn");
  const answerInput = document.getElementById("answerInput");
  submitBtn.addEventListener("click", () => {
    clearErrors();
    socket.emit(
      "puzzle:answer",
      {
        sessionId: currentSessionId,
        puzzleId: currentPuzzle.id,
        answer: answerInput.value
      },
      (res) => {
        if (!res.ok) {
          answerErrorEl.textContent = res.error || "Incorrect answer.";
        }
      }
    );
  });

  const hintBtn = document.getElementById("hintBtn");
  hintBtn.addEventListener("click", () => {
    clearErrors();
    socket.emit("puzzle:hint", { sessionId: currentSessionId }, (res) => {
      if (!res.ok) {
        answerErrorEl.textContent = res.error || "Hint unavailable.";
      }
    });
  });
  }

  const isHost = socket.id && socket.id === state.hostSocketId;
  if (isHost) {
    hostControlsEl.classList.remove("hidden");
    hostControlsEl.innerHTML = `
      <div class="puzzle-box">
        <h3>Host Controls</h3>
        <button id="startBtn">Start Now</button>
        <button id="autostartBtn">Auto-Start (15s)</button>
        <button id="skipBtn">Skip Current Puzzle</button>
        <button id="resetBtn">Reset Session</button>
      </div>
    `;
    const startBtn = document.getElementById("startBtn");
    startBtn.addEventListener("click", () => {
      clearErrors();
      socket.emit("host:start", { sessionId: currentSessionId }, (res) => {
        if (!res.ok) {
          answerErrorEl.textContent = res.error || "Host control failed.";
        }
      });
    });
    const autostartBtn = document.getElementById("autostartBtn");
    autostartBtn.addEventListener("click", () => {
      clearErrors();
      socket.emit("host:autostart", { sessionId: currentSessionId }, (res) => {
        if (!res.ok) {
          answerErrorEl.textContent = res.error || "Host control failed.";
        }
      });
    });
    const skipBtn = document.getElementById("skipBtn");
    skipBtn.addEventListener("click", () => {
      clearErrors();
      socket.emit("host:skip", { sessionId: currentSessionId }, (res) => {
        if (!res.ok) {
          answerErrorEl.textContent = res.error || "Host control failed.";
        }
      });
    });
    const resetBtn = document.getElementById("resetBtn");
    resetBtn.addEventListener("click", () => {
      clearErrors();
      socket.emit("host:reset", { sessionId: currentSessionId }, (res) => {
        if (!res.ok) {
          answerErrorEl.textContent = res.error || "Host control failed.";
        }
      });
    });
  } else {
    hostControlsEl.classList.add("hidden");
    hostControlsEl.innerHTML = "";
  }
}

socket.on("state:update", (state) => {
  showGame(state);
});

createBtnEl.addEventListener("click", () => {
  clearErrors();
  socket.emit("session:create", { playerName: getPlayerName() }, (res) => {
    if (!res.ok) {
      lobbyErrorEl.textContent = res.error || "Could not create session.";
      return;
    }
    currentSessionId = res.sessionId;
    showGame(res.state);
  });
});

joinBtnEl.addEventListener("click", () => {
  clearErrors();
  socket.emit(
    "session:join",
    {
      sessionId: sessionIdInputEl.value,
      playerName: getPlayerName()
    },
    (res) => {
      if (!res.ok) {
        lobbyErrorEl.textContent = res.error || "Could not join session.";
        return;
      }
      currentSessionId = res.sessionId;
      showGame(res.state);
    }
  );
});
