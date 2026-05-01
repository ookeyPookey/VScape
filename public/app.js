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
  statusTextEl.textContent = state.allSolved
    ? "Elevator unlocked. You escaped."
    : `Stations solved: ${state.solvedCount}/${state.puzzles.length}`;
  timerTextEl.textContent = `Time Remaining: ${formatMs(state.timeRemainingMs || 0)}`;

  playersListEl.innerHTML = state.players.map((name) => `<li>${name}</li>`).join("");
  progressListEl.innerHTML = state.puzzles
    .map(
      (puzzle) =>
        `<li>${puzzle.solved ? "✅" : "⬜"} ${puzzle.title}</li>`
    )
    .join("");

  logListEl.innerHTML = state.log.map((item) => `<li>${item}</li>`).join("");

  if (state.allSolved) {
    puzzleAreaEl.innerHTML =
      '<div class="puzzle-box"><h3>Outie Status: Restored</h3><p>You have escaped the severed floor. Great work, team.</p></div>';
    return;
  }

  const currentPuzzle = state.puzzles.find((p) => p.unlocked && !p.solved);
  if (!currentPuzzle) return;

  puzzleAreaEl.innerHTML = `
    <div class="puzzle-box">
      <h3>${currentPuzzle.title}</h3>
      <p>${currentPuzzle.prompt}</p>
      ${state.hintText ? `<p><strong>Hint:</strong> ${state.hintText}</p>` : ""}
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

  const isHost = socket.id && socket.id === state.hostSocketId;
  if (isHost) {
    hostControlsEl.classList.remove("hidden");
    hostControlsEl.innerHTML = `
      <div class="puzzle-box">
        <h3>Host Controls</h3>
        <button id="skipBtn">Skip Current Puzzle</button>
      </div>
    `;
    const skipBtn = document.getElementById("skipBtn");
    skipBtn.addEventListener("click", () => {
      clearErrors();
      socket.emit("host:skip", { sessionId: currentSessionId }, (res) => {
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
