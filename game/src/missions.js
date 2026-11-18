// The three-mission story of Neon Bay Heist — all original characters and places. The mission
// list lives in config.js; this module tracks which one is active, whether its target is
// reached, and the cash the player has earned.

import { MISSIONS } from './config.js';

export function createMissions() {
  let index = 0;
  let cash = 0;
  let done = false;
  let banner = null;
  let bannerTimer = 0;

  function current() {
    return index < MISSIONS.length ? MISSIONS[index] : null;
  }

  function start(indexValue) {
    index = indexValue;
    done = index >= MISSIONS.length;
    const mission = current();
    if (mission) showBanner(mission.title, mission.brief);
    return mission;
  }

  /** A brand-new game: no cash, no missions done. */
  function reset() {
    index = 0;
    cash = 0;
    done = false;
    banner = null;
    bannerTimer = 0;
  }

  function showBanner(title, text, seconds = 4.5) {
    banner = { title, text };
    bannerTimer = seconds;
  }

  function complete() {
    const mission = current();
    if (!mission) return null;
    cash += mission.reward;
    index += 1;
    done = index >= MISSIONS.length;
    const next = current();
    if (next) showBanner('Mission complete!', `${mission.outro} Next: ${next.title}`, 5);
    else showBanner('Story complete!', `${mission.outro} You earned $${cash} in total.`, 6);
    return { mission, next };
  }

  function tick(dt) {
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) banner = null;
    }
  }

  return {
    get index() {
      return index;
    },
    get cash() {
      return cash;
    },
    get done() {
      return done;
    },
    get banner() {
      return banner;
    },
    current,
    start,
    reset,
    complete,
    addCash(value) {
      cash += value;
    },
    showBanner,
    tick,
    applySave(save) {
      index = Math.min(save.missionIndex || 0, MISSIONS.length);
      cash = save.cash || 0;
      done = index >= MISSIONS.length;
    },
    toSave() {
      return { missionIndex: index, cash };
    },
  };
}
