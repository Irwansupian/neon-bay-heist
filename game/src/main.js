// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is there.
// The game moves between four screens: title, play, paused and game over. Progress (cash,
// mission, position) saves to localStorage on mission complete, on Q, and on game over.
//
// ?seed=N fixes the city layout. ?shot=title|drive|chase|mission (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.
import { BEST_KEY, PLAYER, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_HIT, EVENT_MISSION, EVENT_OVER, EVENT_PICKUP, EVENT_PUNCH, EVENT_STEAL } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_SAVE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createMissions } from './missions.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const missions = createMissions();
const world = createWorld(seed, createRandom(seed), missions);
const renderer = createRenderer(canvas);
const audio = createAudio();

/** Live state for headless play tests (window.__neon). */
const neon = {
  screen: SCREEN_TITLE,
  wanted: 0,
  health: PLAYER.health,
  x: 0,
  y: 0,
  inCar: false,
  cash: 0,
  missionIndex: 0,
  cops: 0,
  overReason: '',
  time: 0,
  saved: false,
};
window.__neon = neon;

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const save = { ...world.toSave(), ...missions.toSave() };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    neon.saved = true;
    return true;
  } catch {
    return false;
  }
}

function runShot(name) {
  const scene = stageShot(name, world, missions);
  neon.screen = scene.screen;
  neon.wanted = world.state.wanted;
  neon.health = world.state.player.health;
  neon.x = Math.round(world.state.player.x);
  neon.y = Math.round(world.state.player.y);
  neon.inCar = Boolean(world.state.player.inCar);
  neon.cash = missions.cash;
  neon.missionIndex = missions.index;
  neon.cops = world.state.cops.length;
  neon.time = world.state.time;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, {
      cash: missions.cash,
      mission: missions.current(),
      banner: missions.banner,
      best: 0,
      hasSave: false,
      overReason: world.state.overReason,
      missionsDone: missions.index,
      saveFlash: false,
      muted: false,
    });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  let saveFlash = 0;

  function syncNeon() {
    neon.screen = screen;
    neon.wanted = world.state.wanted;
    neon.health = Math.round(world.state.player.health);
    neon.x = Math.round(world.state.player.x);
    neon.y = Math.round(world.state.player.y);
    neon.inCar = Boolean(world.state.player.inCar);
    neon.cash = missions.cash;
    neon.missionIndex = missions.index;
    neon.cops = world.state.cops.length;
    neon.overReason = world.state.overReason;
    neon.time = Math.round(world.state.time * 10) / 10;
    neon.angle = Math.round(world.state.player.angle * 100) / 100;
    neon.punch = Math.round(world.state.player.punchCooldown * 100) / 100;
    // Play-test navigation aids: nearest fresh (never stolen) parked car and the active mission target.
    let parked = null;
    let bestD = Infinity;
    for (const car of world.state.cars) {
      if (car.kind !== 'parked' || car.stolen) continue;
      const d = Math.hypot(car.x - world.state.player.x, car.y - world.state.player.y);
      if (d < bestD) {
        bestD = d;
        parked = { x: Math.round(car.x), y: Math.round(car.y), d: Math.round(d) };
      }
    }
    neon.nearestParked = parked;
    const mission = missions.current();
    neon.target = mission ? { x: mission.target.x, y: mission.target.y } : null;
  }

  // Screen readers (and anyone watching the page's text) hear the screen changes and events.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(fromSave) {
    world.reset();
    if (fromSave && save) {
      missions.applySave(save);
      world.applySave(save);
      missions.start(missions.index);
      announce(`Continuing. Mission ${missions.index + 1}. Cash $${missions.cash}.`);
    } else {
      missions.reset();
      missions.start(0);
      announce('Playing Neon Bay Heist. Three missions. One big score.');
    }
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.resume();
    audio.startEngine();
    syncNeon();
  }

  function endGame() {
    screen = SCREEN_OVER;
    audio.stopSiren();
    audio.setEngine(0);
    if (world.state.overReason === 'busted') audio.busted();
    if (missions.cash > best) {
      best = missions.cash;
      saveBest(best);
    }
    writeSave();
    announce(`${world.state.overReason === 'busted' ? 'Busted' : 'Wasted'}. Cash $${missions.cash}.`);
    syncNeon();
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      audio.resume();
      startGame(screen === SCREEN_TITLE && save !== null);
    } else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
    if (screen === SCREEN_PLAY && actions & ACTION_SAVE) {
      if (writeSave()) {
        saveFlash = 2;
        announce('Progress saved.');
      }
    }
  }

  function step(actions) {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { move: { x: 0, y: 0 }, enter: false, punch: false }, true);
      return;
    }
    const move = input.move();
    const events = world.step(
      STEP,
      {
        move,
        enter: Boolean(actions & ACTION_ENTER),
        punch: Boolean(actions & (ACTION_PUNCH | ACTION_CONFIRM)),
      },
      false,
    );
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_HIT) audio.hit();
    if (events & EVENT_STEAL) {
      audio.steal();
      announce('Car stolen! The police are on to you.');
    }
    if (events & EVENT_PICKUP) {
      audio.pickup();
      announce(`Picked up $50. Cash $${missions.cash}.`);
    }
    if (events & EVENT_MISSION) {
      audio.mission();
      writeSave();
      announce(`Mission complete! Cash $${missions.cash}.`);
    }
    if (world.state.wanted > 0) audio.startSiren();
    else audio.stopSiren();
    audio.setEngine(world.state.player.inCar ? Math.abs(world.state.player.inCar.speed) / 430 : 0);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_HIT) announce(`Hit! Health ${Math.round(world.state.player.health)}.`);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      // One-shot presses count once: only the first fixed step of the frame sees them.
      let firstStep = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(firstStep ? actions : 0);
        firstStep = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    if (saveFlash > 0) saveFlash -= 0.016;
    renderer.draw(world.state, screen, {
      cash: missions.cash,
      mission: screen === SCREEN_PLAY ? missions.current() : null,
      banner: missions.banner,
      best,
      hasSave: save !== null,
      overReason: world.state.overReason,
      missionsDone: missions.index,
      saveFlash: saveFlash > 0,
      muted: audio.muted,
    });
    syncNeon();
  }

  // Leaving the tab pauses a running game rather than letting the city move unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // N starts a fresh game from the title screen (handled in handleActions via key code).
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && screen === SCREEN_TITLE && !event.repeat) {
      audio.resume();
      save = null;
      startGame(false);
    }
  });

  announce('Neon Bay Heist. Press Enter or click to start.');
  syncNeon();
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
