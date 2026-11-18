// The screenshot scenes behind ?shot=title|drive|chase|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple autopilot
// (walk to the nearest parked car, steal it, then drive toward the mission marker), so the
// frame is what a short game really looks like and the same seed always gives the same frame.

import { STEP } from './config.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TITLE_SECONDS = 5;
const DRIVE_SECONDS = 20;
const CHASE_SECONDS = 8;
const MISSION_SECONDS = 16;

/** A point ahead-left of the car, so the chase autopilot drives in a wide circle. */
function chaseTarget(world) {
  const p = world.state.player;
  const a = p.angle + 1.1;
  return { x: p.x + Math.cos(a) * 500, y: p.y + Math.sin(a) * 500 };
}

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** Steer toward `target`: on foot, walk at it; in a car, drive at it. */
function autopilot(world, target) {
  const p = world.state.player;
  const input = { move: { x: 0, y: 0 }, enter: false, punch: false };
  if (!p.inCar) {
    // Walk to the nearest parked car and steal it.
    let car = null;
    let best = Infinity;
    for (const c of world.state.cars) {
      if (c.kind !== 'parked') continue;
      const d = Math.hypot(c.x - p.x, c.y - p.y);
      if (d < best) {
        best = d;
        car = c;
      }
    }
    if (!car) return input;
    if (best < 70) {
      input.enter = true;
      return input;
    }
    const dx = car.x - p.x;
    const dy = car.y - p.y;
    input.move.x = dx > 12 ? 1 : dx < -12 ? -1 : 0;
    input.move.y = dy > 12 ? 1 : dy < -12 ? -1 : 0;
    return input;
  }
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const want = Math.atan2(dy, dx);
  const diff = wrapAngle(want - p.angle);
  input.move.x = diff > 0.25 ? 1 : diff < -0.25 ? -1 : 0;
  input.move.y = -1;
  return input;
}

/**
 * Set `world` to the named scene (title, drive, chase or mission; any other name is title)
 * and return the screen to draw over it.
 */
export function stageShot(name, world, missions) {
  world.reset();
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    missions.start(0);
    for (let index = 0; index < TITLE_SECONDS / STEP; index += 1) {
      world.step(STEP, { move: { x: 0, y: 0 }, enter: false, punch: false }, true);
    }
    return { screen: SCREEN_TITLE };
  }

  const missionIndex = name === 'chase' ? 1 : name === 'mission' ? 2 : 0;
  missions.start(missionIndex);
  const mission = missions.current();
  if (name === 'chase') world.setWanted(3);
  if (name === 'mission') world.setWanted(3);
  world.forceEnterCar();
  const seconds = name === 'drive' ? DRIVE_SECONDS : name === 'chase' ? CHASE_SECONDS : MISSION_SECONDS;
  for (let index = 0; index < seconds / STEP; index += 1) {
    // The chase scene circles the block with the police in pursuit instead of driving
    // to the hideout, so the frame still shows the chase when the time runs out.
    const target = name === 'chase' ? chaseTarget(world) : mission.target;
    world.step(STEP, autopilot(world, target), false);
    if (world.state.over) break;
  }
  return { screen: world.state.over ? SCREEN_OVER : SCREEN_PLAY };
}
