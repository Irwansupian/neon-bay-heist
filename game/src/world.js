// The rules and state of Neon Bay, with no drawing and no browser in it: the grid city, the
// player on foot and in a car, traffic, pedestrians, the police and the wanted level, combat,
// missions and particles. step() advances one fixed step and returns what happened as bit
// flags, so the caller can react without the world knowing about screens or sound. The city
// layout is rebuilt from the seed on every reset, so a screenshot scene always looks the same.

import { CAR, CITY, COP, MISSIONS, PALETTE, PED, PLAYER, WANTED, WORLD } from './config.js';
import { pick, range } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_MISSION = 4;
export const EVENT_PUNCH = 8;
export const EVENT_STEAL = 16;
export const EVENT_PICKUP = 32;
export const EVENT_CRASH = 64;
export const EVENT_BUSTED = 128;

const TAU = Math.PI * 2;

function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

/** Nearest grid-line multiple of 320 to `v` (a road centre). */
function roadCentre(v) {
  return Math.round(v / CITY.block) * CITY.block;
}

export function createWorld(seed, random, missions) {
  const state = {
    player: null,
    cars: [],
    peds: [],
    cops: [],
    pickups: [],
    particles: [],
    buildings: [],
    wanted: 0,
    time: 0,
    over: false,
    overReason: '',
    hint: '',
    hintTimer: 0,
    crimeTimer: 99,
    decayTimer: 0,
    regenTimer: 0,
    shake: 0,
  };

  function buildCity() {
    state.buildings = [];
    const cols = WORLD.width / CITY.block;
    const rows = WORLD.height / CITY.block;
    const colors = [PALETTE.buildingA, PALETTE.buildingB, PALETTE.buildingC, PALETTE.buildingD];
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row < rows; row += 1) {
        const inset = CITY.road / 2 + CITY.sidewalk;
        state.buildings.push({
          x: col * CITY.block + inset,
          y: row * CITY.block + inset,
          w: CITY.block - inset * 2,
          h: CITY.block - inset * 2,
          color: pick(random, colors),
          neon: pick(random, [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonYellow, PALETTE.neonGreen, PALETTE.neonOrange]),
          neonSide: Math.floor(random() * 4),
        });
      }
    }
  }

  function insideBuilding(x, y, pad) {
    for (const b of state.buildings) {
      if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return true;
    }
    return false;
  }

  /** Push a circle out of every building rect it overlaps, axis by axis (so it slides along walls). */
  function collide(obj, r) {
    obj.x = Math.max(r, Math.min(WORLD.width - r, obj.x));
    obj.y = Math.max(r, Math.min(WORLD.height - r, obj.y));
    for (const b of state.buildings) {
      const cx = Math.max(b.x, Math.min(obj.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(obj.y, b.y + b.h));
      const dx = obj.x - cx;
      const dy = obj.y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      if (d2 === 0) {
        obj.y = b.y - r;
        continue;
      }
      const d = Math.sqrt(d2);
      obj.x += (dx / d) * (r - d);
      obj.y += (dy / d) * (r - d);
    }
  }

  /** Push a circle out of building rects along one axis only — call after moving on that
   * axis, so the circle slides along walls instead of wedging into corners. */
  function collideAxis(obj, r, axis) {
    if (axis === 'x') obj.x = Math.max(r, Math.min(WORLD.width - r, obj.x));
    else obj.y = Math.max(r, Math.min(WORLD.height - r, obj.y));
    for (const b of state.buildings) {
      const cx = Math.max(b.x, Math.min(obj.x, b.x + b.w));
      const cy = Math.max(b.y, Math.min(obj.y, b.y + b.h));
      const dx = obj.x - cx;
      const dy = obj.y - cy;
      if (dx * dx + dy * dy >= r * r) continue;
      if (axis === 'x') obj.x = obj.x < b.x + b.w / 2 ? b.x - r : b.x + b.w + r;
      else obj.y = obj.y < b.y + b.h / 2 ? b.y - r : b.y + b.h + r;
    }
  }

  function randomStreetPoint() {
    for (let tries = 0; tries < 20; tries += 1) {
      const horizontal = random() < 0.5;
      const line = Math.floor(random() * (WORLD.width / CITY.block) + 0.5) * CITY.block;
      const along = range(random, 120, WORLD.width - 120);
      const x = horizontal ? along : line;
      const y = horizontal ? line : along;
      if (!insideBuilding(x, y, 4)) return { x, y };
    }
    return { x: 1280, y: 960 };
  }

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const p = state.particles.find((q) => q.life <= 0);
      if (!p) return;
      const a = random() * TAU;
      const s = range(random, speed * 0.3, speed);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(a) * s;
      p.vy = Math.sin(a) * s;
      p.life = range(random, 0.3, 0.7);
      p.maxLife = p.life;
      p.color = color;
      p.size = range(random, 2, 5);
    }
  }

  function makeCar(kind, x, y, angle) {
    return {
      kind, x, y, angle,
      speed: 0,
      color: pick(random, PALETTE.carBody),
      // Traffic routing: the next intersection the car drives toward.
      target: null,
      from: null,
      slow: 0,
      stuck: 0,
      reverse: 0,
      stolen: false,
      hitCooldown: 0,
    };
  }

  function nextIntersection(car) {
    const cx = Math.round(car.target.x / CITY.block);
    const cy = Math.round(car.target.y / CITY.block);
    const options = [];
    if (cx > 0) options.push({ x: cx - 1, y: cy });
    if (cx < WORLD.width / CITY.block) options.push({ x: cx + 1, y: cy });
    if (cy > 0) options.push({ x: cx, y: cy - 1 });
    if (cy < WORLD.height / CITY.block) options.push({ x: cx, y: cy + 1 });
    const filtered = options.filter((o) => !(car.from && o.x === car.from.x && o.y === car.from.y));
    const next = pick(random, filtered.length ? filtered : options);
    car.from = { x: cx, y: cy };
    car.target = { x: next.x * CITY.block, y: next.y * CITY.block };
  }

  function spawnTrafficCar() {
    const p = randomStreetPoint();
    const car = makeCar('traffic', p.x, p.y, 0);
    car.target = { x: roadCentre(p.x), y: roadCentre(p.y) };
    nextIntersection(car);
    car.angle = Math.atan2(car.target.y - car.y, car.target.x - car.x);
    car.speed = CAR.trafficSpeed;
    return car;
  }

  function spawnParkedCar() {
    // Parked along a road edge: on a road centre line (a multiple of 320), offset to the
    // side of the road, so the car sits on asphalt and the player can walk up to it.
    const horizontal = random() < 0.5;
    const line = (horizontal ? Math.floor(random() * 7) : Math.floor(random() * 9)) * CITY.block;
    const along = range(random, 160, (horizontal ? WORLD.width : WORLD.height) - 160);
    const off = (random() < 0.5 ? -1 : 1) * (CITY.road / 2 - 16);
    const x = horizontal ? along : line + off;
    const y = horizontal ? line + off : along;
    const car = makeCar('parked',
      Math.max(60, Math.min(WORLD.width - 60, x)),
      Math.max(60, Math.min(WORLD.height - 60, y)),
      horizontal ? (off > 0 ? 0 : Math.PI) : (off > 0 ? Math.PI / 2 : -Math.PI / 2));
    return car;
  }

  function spawnPed() {
    const p = randomStreetPoint();
    return {
      x: p.x, y: p.y, angle: random() * TAU,
      speed: range(random, PED.speed * 0.7, PED.speed * 1.3),
      color: pick(random, PALETTE.pedShirt),
      target: randomStreetPoint(),
      down: 0,
      wobble: random() * TAU,
    };
  }

  function spawnPickup() {
    const p = randomStreetPoint();
    return { x: p.x, y: p.y, active: true, value: 50 };
  }

  function reset() {
    random = createSeededRandom(seed);
    buildCity();
    const player = {
      x: 1280, y: 960, angle: -Math.PI / 2,
      health: PLAYER.health,
      inCar: null,
      punchCooldown: 0,
      invulnerable: 0,
      speed: 0,
    };
    state.player = player;
    state.cars = [];
    for (let i = 0; i < CAR.trafficCount; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < CAR.parkedCount; i += 1) state.cars.push(spawnParkedCar());
    state.peds = [];
    for (let i = 0; i < PED.count; i += 1) state.peds.push(spawnPed());
    state.cops = [];
    state.pickups = [];
    for (let i = 0; i < 8; i += 1) state.pickups.push(spawnPickup());
    state.particles = [];
    for (let i = 0; i < 128; i += 1) {
      state.particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', size: 3 });
    }
    state.wanted = 0;
    state.time = 0;
    state.over = false;
    state.overReason = '';
    state.hint = '';
    state.hintTimer = 0;
    state.crimeTimer = 99;
    state.decayTimer = 0;
    state.regenTimer = 0;
    state.shake = 0;
  }

  function createSeededRandom(s) {
    let a = s >>> 0;
    return function random2() {
      a = (a + 0x9e3779b9) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
      return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
    };
  }

  function addWanted(amount) {
    if (amount <= 0) return;
    state.wanted = Math.min(WANTED.max, state.wanted + amount);
    state.crimeTimer = 0;
  }

  function nearestCar(maxDist, kinds) {
    const p = state.player;
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car) {
    const p = state.player;
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.kind === 'traffic') car.kind = 'player';
    else if (car.kind === 'parked') car.kind = 'player';
    if (!car.stolen) {
      car.stolen = true;
      addWanted(WANTED.stealCar);
      return EVENT_STEAL;
    }
    return 0;
  }

  function exitCar() {
    const p = state.player;
    const car = p.inCar;
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    p.inCar = null;
    p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    p.angle = car.angle;
    collide(p, PLAYER.radius);
  }

  /** Put the player straight into the nearest parked car (used by screenshot scenes). */
  function forceEnterCar() {
    const car = nearestCar(400, ['parked']);
    if (car) {
      car.stolen = true;
      enterCar(car);
      return true;
    }
    return false;
  }

  function punch() {
    const p = state.player;
    if (p.inCar || p.punchCooldown > 0) return 0;
    p.punchCooldown = PLAYER.punchCooldown;
    let events = EVENT_PUNCH;
    const fx = p.x + Math.cos(p.angle) * (PLAYER.punchRange * 0.6);
    const fy = p.y + Math.sin(p.angle) * (PLAYER.punchRange * 0.6);
    for (const ped of state.peds) {
      if (ped.down > 0) continue;
      if (dist(p.x, p.y, ped.x, ped.y) > PLAYER.punchRange + PED.radius) continue;
      const ang = Math.atan2(ped.y - p.y, ped.x - p.x);
      if (Math.abs(wrapAngle(ang - p.angle)) > PLAYER.punchArc) continue;
      ped.down = 3;
      spawnParticles(ped.x, ped.y, '#ffd23e', 8, 120);
      addWanted(WANTED.punchPed);
      events |= EVENT_HIT;
    }
    for (const cop of state.cops) {
      if (cop.kind !== 'foot' || cop.down > 0) continue;
      if (dist(p.x, p.y, cop.x, cop.y) > PLAYER.punchRange + COP.radius) continue;
      const ang = Math.atan2(cop.y - p.y, cop.x - p.x);
      if (Math.abs(wrapAngle(ang - p.angle)) > PLAYER.punchArc) continue;
      cop.down = 4;
      spawnParticles(cop.x, cop.y, '#ffd23e', 10, 140);
      addWanted(WANTED.punchCop);
      events |= EVENT_HIT;
    }
    return events;
  }

  function spawnCopCar() {
    const p = state.player;
    const a = random() * TAU;
    const x = Math.max(80, Math.min(WORLD.width - 80, p.x + Math.cos(a) * 720));
    const y = Math.max(80, Math.min(WORLD.height - 80, p.y + Math.sin(a) * 720));
    const car = makeCar('cop', x, y, 0);
    car.speed = COP.carSpeed * 0.7;
    car.color = '#20242e';
    return car;
  }

  function spawnFootCop() {
    const p = state.player;
    const a = random() * TAU;
    return {
      kind: 'foot', x: p.x + Math.cos(a) * 420, y: p.y + Math.sin(a) * 420,
      angle: 0, speed: COP.footSpeed, down: 0, hitCooldown: 0, stuck: 0,
    };
  }

  function updatePolice(dt) {
    const wantCars = Math.min(5, state.wanted * WANTED.copCarsPerStar);
    const wantFoot = Math.min(5, state.wanted * WANTED.footCopsPerStar);
    const cars = state.cops.filter((c) => c.kind === 'cop');
    const foot = state.cops.filter((c) => c.kind === 'foot');
    if (cars.length < wantCars) state.cops.push(spawnCopCar());
    if (foot.length < wantFoot && !state.player.inCar) state.cops.push(spawnFootCop());
    if (state.wanted === 0) state.cops = [];
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic') continue;
      const dx = car.target.x - car.x;
      const dy = car.target.y - car.y;
      const d = Math.hypot(dx, dy);
      if (d < 12) {
        nextIntersection(car);
        car.angle = Math.atan2(car.target.y - car.y, car.target.x - car.x);
        continue;
      }
      const want = Math.atan2(dy, dx);
      car.angle = want;
      let speed = CAR.trafficSpeed;
      // Slow down for a car ahead in the same direction.
      for (const other of state.cars) {
        if (other === car || other.kind === 'parked') continue;
        const ox = other.x - car.x;
        const oy = other.y - car.y;
        const ahead = ox * Math.cos(car.angle) + oy * Math.sin(car.angle);
        const side = Math.abs(-ox * Math.sin(car.angle) + oy * Math.cos(car.angle));
        if (ahead > 0 && ahead < 85 && side < 30) {
          speed = CAR.trafficSpeed * 0.25;
          break;
        }
      }
      car.speed = speed;
      car.x += Math.cos(car.angle) * speed * dt;
      car.y += Math.sin(car.angle) * speed * dt;
    }
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        continue;
      }
      const dx = ped.target.x - ped.x;
      const dy = ped.target.y - ped.y;
      const d = Math.hypot(dx, dy);
      if (d < 14) {
        ped.target = randomStreetPoint();
        continue;
      }
      ped.wobble += dt * 2;
      const wob = Math.sin(ped.wobble) * 0.35;
      const ang = Math.atan2(dy, dx) + wob;
      ped.angle = ang;
      ped.x += Math.cos(ang) * ped.speed * dt;
      collideAxis(ped, PED.radius, 'x');
      ped.y += Math.sin(ang) * ped.speed * dt;
      collideAxis(ped, PED.radius, 'y');
    }
  }

  function stepCops(dt) {
    const p = state.player;
    for (const cop of state.cops) {
      if (cop.kind === 'cop') {
        const targetAngle = Math.atan2(p.y - cop.y, p.x - cop.x);
        const diff = wrapAngle(targetAngle - cop.angle);
        cop.angle += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff));
        const moving = Math.abs(cop.speed) > 30;
        if (moving) cop.stuck += dt;
        else cop.stuck = 0;
        if (cop.stuck > 1.6) {
          cop.reverse = 0.7;
          cop.stuck = 0;
        }
        if (cop.reverse > 0) {
          cop.reverse -= dt;
          cop.speed = -140;
        } else {
          cop.speed = Math.min(COP.carSpeed, cop.speed + 300 * dt);
        }
        cop.x += Math.cos(cop.angle) * cop.speed * dt;
        collideAxis(cop, 22, 'x');
        cop.y += Math.sin(cop.angle) * cop.speed * dt;
        collideAxis(cop, 22, 'y');
        // Ram the player's car, or run down a player on foot.
        const d = dist(cop.x, cop.y, p.x, p.y);
        if (d < 46 && cop.hitCooldown <= 0) {
          cop.hitCooldown = 1;
          if (p.inCar) {
            p.inCar.speed *= 0.4;
            state.shake = 0.35;
          }
          damagePlayer(COP.damage, false);
        }
      } else {
        if (cop.down > 0) {
          cop.down -= dt;
          continue;
        }
        const d = dist(cop.x, cop.y, p.x, p.y);
        const ang = Math.atan2(p.y - cop.y, p.x - cop.x);
        cop.angle = ang;
        cop.x += Math.cos(ang) * cop.speed * dt;
        collideAxis(cop, COP.radius, 'x');
        cop.y += Math.sin(ang) * cop.speed * dt;
        collideAxis(cop, COP.radius, 'y');
        if (d < 26 && cop.hitCooldown <= 0) {
          cop.hitCooldown = COP.hitCooldown;
          damagePlayer(COP.damage, true);
        }
      }
      if (cop.hitCooldown > 0) cop.hitCooldown -= dt;
    }
    // A cop car that gets close to a player on foot drops a foot cop.
    if (p.inCar === null) {
      for (const cop of state.cops) {
        if (cop.kind === 'cop' && dist(cop.x, cop.y, p.x, p.y) < 120) {
          cop.kind = 'foot';
          cop.speed = COP.footSpeed;
          cop.down = 0;
          cop.hitCooldown = 0.5;
        }
      }
    }
  }

  function damagePlayer(amount, byCop) {
    const p = state.player;
    if (p.invulnerable > 0) return;
    p.health -= amount;
    p.invulnerable = 0.7;
    state.regenTimer = 0;
    state.shake = 0.3;
    if (p.health <= 0) {
      p.health = 0;
      state.over = true;
      state.overReason = byCop || state.wanted > 0 ? 'busted' : 'wasted';
    }
  }

  function stepPlayer(dt, input, harmless) {
    const p = state.player;
    if (p.punchCooldown > 0) p.punchCooldown -= dt;
    if (p.invulnerable > 0) p.invulnerable -= dt;

    if (p.inCar) {
      const car = p.inCar;
      const forward = -input.move.y; // W / up = accelerate
      const steer = input.move.x;
      if (forward > 0) car.speed += CAR.accel * forward * dt;
      else if (forward < 0) car.speed -= (car.speed > 0 ? CAR.brake : CAR.accel * 0.6) * dt;
      else car.speed -= car.speed * CAR.drag * dt;
      car.speed = Math.max(-CAR.reverseMax, Math.min(CAR.maxSpeed, car.speed));
      if (Math.abs(car.speed) > 20) {
        car.angle += steer * CAR.steer * (car.speed / CAR.maxSpeed) * dt * (car.speed > 0 ? 1 : -1);
      }
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const beforeX = car.x;
      const beforeY = car.y;
      car.x = nx;
      collideAxis(car, 20, 'x');
      car.y = ny;
      collideAxis(car, 20, 'y');
      const hitWall = Math.hypot(car.x - beforeX, car.y - beforeY) < Math.hypot(nx - beforeX, ny - beforeY) - 0.5;
      if (hitWall && Math.abs(car.speed) > 120) {
        car.speed *= 0.35;
        state.shake = 0.25;
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = Math.abs(car.speed);
      // Running over a pedestrian.
      if (!harmless) {
        for (const ped of state.peds) {
          if (ped.down > 0) continue;
          if (dist(car.x, car.y, ped.x, ped.y) < 34 && Math.abs(car.speed) > 60) {
            ped.down = 4;
            spawnParticles(ped.x, ped.y, '#e5534b', 10, 160);
            addWanted(WANTED.hitPed);
          }
        }
        // Crashing into traffic.
        for (const other of state.cars) {
          if (other === car || other.kind === 'parked' || other.kind === 'player') continue;
          if (dist(car.x, car.y, other.x, other.y) < 46 && Math.abs(car.speed) > 80) {
            other.x += Math.cos(car.angle) * 26;
            other.y += Math.sin(car.angle) * 26;
            car.speed *= 0.45;
            state.shake = 0.3;
          }
        }
      }
    } else {
      const mx = input.move.x;
      const my = input.move.y;
      const len = Math.hypot(mx, my);
      const speed = PLAYER.walkSpeed;
      if (len > 0) {
        const nx = (mx / len) * speed * dt;
        const ny = (my / len) * speed * dt;
        p.x += nx;
        collideAxis(p, PLAYER.radius, 'x');
        p.y += ny;
        collideAxis(p, PLAYER.radius, 'y');
        p.angle = Math.atan2(my, mx);
        p.speed = speed;
      } else {
        p.speed = 0;
      }
      // Walking into a moving car hurts.
      if (!harmless) {
        for (const car of state.cars) {
          if (car.kind !== 'traffic' && car.kind !== 'cop') continue;
          if (dist(p.x, p.y, car.x, car.y) < 34 && Math.abs(car.speed) > 60) {
            damagePlayer(12, car.kind === 'cop');
            p.x += Math.cos(Math.atan2(p.y - car.y, p.x - car.x)) * 26;
            p.y += Math.sin(Math.atan2(p.y - car.y, p.x - car.x)) * 26;
            collide(p, PLAYER.radius);
          }
        }
      }
    }
  }

  function stepParticles(dt) {
    for (const pt of state.particles) {
      if (pt.life <= 0) continue;
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt);
  }

  /**
   * One fixed step. `input` is {move:{x,y}, enter, punch}. With `harmless` set (the title
   * screen's backdrop) the city lives but nothing can hurt or be hurt and nothing scores.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.time += dt;
    state.crimeTimer += dt;

    if (!harmless && !state.over) {
      if (input.enter && !state.player.inCar) {
        const car = nearestCar(78, ['parked', 'traffic']);
        if (car) events |= enterCar(car);
      } else if (input.enter && state.player.inCar) {
        exitCar();
      }
      if (input.punch) events |= punch();
    }

    stepPlayer(dt, input, harmless);
    stepTraffic(dt);
    stepPeds(dt);
    if (!harmless) {
      updatePolice(dt);
      stepCops(dt);
    }
    stepParticles(dt);

    if (!harmless && !state.over) {
      // Mission target.
      const mission = missions.current();
      if (mission) {
        const d = dist(state.player.x, state.player.y, mission.target.x, mission.target.y);
        if (d < 85) {
          if (mission.needsCar && !state.player.inCar) {
            state.hint = 'This job needs wheels — steal a car first!';
            state.hintTimer = 2.5;
          } else {
            const done = missions.complete();
            if (done) {
              state.wanted = 0;
              state.cops = [];
              events |= EVENT_MISSION;
            }
          }
        }
      }
      // Cash pickups.
      for (const pk of state.pickups) {
        if (!pk.active) continue;
        if (dist(state.player.x, state.player.y, pk.x, pk.y) < 34) {
          pk.active = false;
          addPickupCash(pk.value);
          events |= EVENT_PICKUP;
        }
      }
      // Wanted decay: quiet for a while, no cop close by, and the heat cools off.
      if (state.wanted > 0 && state.crimeTimer > WANTED.decayDelay) {
        let copNear = false;
        for (const cop of state.cops) {
          if (dist(cop.x, cop.y, state.player.x, state.player.y) < 320) {
            copNear = true;
            break;
          }
        }
        if (!copNear) {
          state.decayTimer += dt;
          if (state.decayTimer >= WANTED.decayInterval) {
            state.wanted -= 1;
            state.decayTimer = 0;
            state.crimeTimer = 0;
          }
        } else {
          state.decayTimer = 0;
        }
      }
      // Slow health regen when the heat is off.
      if (state.wanted === 0 && state.player.health > 0 && state.player.health < PLAYER.health) {
        state.regenTimer += dt;
        if (state.regenTimer > 6) state.player.health = Math.min(PLAYER.health, state.player.health + 4 * dt);
      }
    }

    if (state.hintTimer > 0) {
      state.hintTimer -= dt;
      if (state.hintTimer <= 0) state.hint = '';
    }
    missions.tick(dt);

    if (state.over) events |= EVENT_OVER;
    return events;
  }

  /** Cash from a street pickup (kept on the missions object so saves carry it). */
  function addPickupCash(value) {
    missions.addCash(value);
  }

  reset();
  return {
    state,
    reset,
    step,
    punch,
    enterCar,
    exitCar,
    forceEnterCar,
    setWanted(n) {
      state.wanted = Math.max(0, Math.min(WANTED.max, n));
      state.crimeTimer = 0;
    },
    addPickupCash,
    applySave(save) {
      state.player.x = save.x ?? 1280;
      state.player.y = save.y ?? 960;
      state.player.health = save.health ?? PLAYER.health;
      state.wanted = save.wanted ?? 0;
      state.player.inCar = null;
      collide(state.player, PLAYER.radius);
    },
    toSave() {
      return {
        x: Math.round(state.player.x),
        y: Math.round(state.player.y),
        health: Math.round(state.player.health),
        wanted: state.wanted,
      };
    },
  };
}
