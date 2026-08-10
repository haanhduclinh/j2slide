import { renderSlide, renderStandby } from "./render.js";
import { THEMES } from "./theme.js";

const deckId = document.body.dataset.deckId;
const stage = document.getElementById("stage");
const jump = document.getElementById("jump");

const state = {
  slides: [],
  index: -1,
  /** True while the viewer is pinned to the newest slide. */
  following: true,
  live: false,
  theme: THEMES[localStorage.getItem("j2slide-theme") === "light" ? "light" : "dark"],
};

function draw() {
  if (state.slides.length === 0) {
    stage.innerHTML = `<div class="slide">${renderStandby(deckId, state.theme)}</div>`;
    jump.hidden = true;
    return;
  }

  const slide = state.slides[state.index];
  stage.innerHTML = `<div class="slide">${renderSlide(slide, state.theme, {
    index: state.index,
    total: state.slides.length,
    live: state.live,
  })}</div>`;

  const behind = state.slides.length - 1 - state.index;
  jump.hidden = behind <= 0;
  jump.textContent = behind === 1 ? "▼ 1 new slide" : `▼ ${behind} new slides`;
}

function goTo(index) {
  state.index = Math.max(0, Math.min(state.slides.length - 1, index));
  state.following = state.index === state.slides.length - 1;
  draw();
}

function connect(attempt = 0) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const socket = new WebSocket(`${protocol}//${location.host}/d/${deckId}/ws`);

  socket.addEventListener("open", () => {
    state.live = true;
    attempt = 0;
    // Keeps the connection warm without waking the Durable Object.
    socket.pingTimer = setInterval(() => socket.send("ping"), 30_000);
  });

  socket.addEventListener("message", (event) => {
    // DO auto-responds "ping"→"pong"; ignore non-JSON keepalive traffic.
    if (event.data === "pong" || event.data === "ping") return;
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    if (message.type === "init") {
      state.slides = message.slides;
      state.index = message.liveIndex;
      state.following = true;
    } else if (message.type === "slide") {
      state.slides.push(message.slide);
      // Only follow if the viewer had not navigated away.
      if (state.following) state.index = state.slides.length - 1;
    } else if (message.type === "clear") {
      state.slides = [];
      state.index = -1;
      state.following = true;
    }
    draw();
  });

  const reconnect = () => {
    clearInterval(socket.pingTimer);
    state.live = false;
    draw();
    const delay = Math.min(15_000, 1000 * 2 ** attempt);
    setTimeout(() => connect(attempt + 1), delay);
  };

  socket.addEventListener("close", reconnect);
  socket.addEventListener("error", () => socket.close());
}

jump.addEventListener("click", () => goTo(state.slides.length - 1));

document.addEventListener("keydown", (event) => {
  switch (event.key) {
    case "ArrowLeft":
      goTo(state.index - 1);
      break;
    case "ArrowRight":
    case " ":
      event.preventDefault();
      goTo(state.index + 1);
      break;
    case "End":
      goTo(state.slides.length - 1);
      break;
    case "f":
    case "F":
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen();
      break;
    case "t":
    case "T": {
      const next = state.theme.name === "dark" ? "light" : "dark";
      state.theme = THEMES[next];
      localStorage.setItem("j2slide-theme", next);
      draw();
      break;
    }
  }
});

draw();
connect();
