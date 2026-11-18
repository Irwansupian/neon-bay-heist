// Every tuning number and colour for Neon Bay Heist in one place. The city is a fixed
// 2560x1920 logical world; the renderer scales a 1280x720 viewport onto the window and the
// camera follows the player, so no rule below depends on the screen size.

export const WORLD = { width: 2560, height: 1920 };
export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** City grid: streets every BLOCK units, ROAD wide; buildings fill the blocks between. */
export const CITY = { block: 320, road: 104, sidewalk: 18 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 205,
  runSpeed: 265,
  health: 100,
  punchRange: 46,
  punchArc: 1.15,
  punchDamage: 34,
  punchCooldown: 0.38,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 340,
  brake: 520,
  maxSpeed: 430,
  reverseMax: 150,
  steer: 2.6,
  drag: 0.55,
  trafficSpeed: 150,
  trafficCount: 14,
  parkedCount: 10,
};

export const PED = { count: 26, radius: 11, speed: 62 };

export const WANTED = {
  max: 5,
  stealCar: 1,
  hitPed: 1,
  punchCop: 2,
  punchPed: 1,
  decayDelay: 18,
  decayInterval: 9,
  copCarsPerStar: 1,
  footCopsPerStar: 1,
};

export const COP = { carSpeed: 395, footSpeed: 175, radius: 13, damage: 9, hitCooldown: 0.6 };

export const MISSIONS = [
  {
    id: 'pickup',
    title: 'Mission 1 — The Pickup',
    brief: 'Rex needs the package from the old docks. Get to the marker and grab it.',
    target: { x: 2280, y: 1640 },
    reward: 500,
    wantedOnStart: 0,
    outro: 'Package secured. Rex is impressed — and he has bigger plans.',
  },
  {
    id: 'getaway',
    title: 'Mission 2 — The Getaway',
    brief: 'The harbour crew tipped off the police. Steal a car and reach the hideout.',
    target: { x: 320, y: 320 },
    reward: 800,
    wantedOnStart: 2,
    needsCar: true,
    outro: 'Clean getaway. The hideout is safe — for now.',
  },
  {
    id: 'score',
    title: 'Mission 3 — The Big Score',
    brief: 'One last job: lift the vault case from the Neon Bank and lose the heat at the hideout.',
    target: { x: 1600, y: 320 },
    reward: 2000,
    wantedOnStart: 3,
    needsCar: true,
    outro: 'The vault case is yours. Neon Bay is yours. Story complete — keep cruising!',
  },
];

export const PALETTE = {
  backdrop: '#0a0a14',
  grass: '#101a12',
  sidewalk: '#23232e',
  road: '#15151f',
  roadLine: '#3a3a4d',
  buildingA: '#1d2338',
  buildingB: '#241a2e',
  buildingC: '#16282a',
  buildingD: '#2e1f22',
  neonPink: '#ff2e88',
  neonCyan: '#22e6ff',
  neonYellow: '#ffd23e',
  neonGreen: '#3dff7a',
  neonOrange: '#ff7a1a',
  player: '#ffd23e',
  playerDark: '#b98a00',
  cop: '#2e6bff',
  copLight: '#ff2e2e',
  pedShirt: ['#e5534b', '#4fc3f7', '#f2c94c', '#9b7ede', '#3dff7a', '#ff7a1a'],
  carBody: ['#c0392b', '#2980b9', '#27ae60', '#8e44ad', '#f39c12', '#16a085', '#e67e22', '#7f8c8d'],
  text: '#eef1f5',
  muted: '#8b93a3',
  panel: 'rgba(10, 10, 20, 0.78)',
  marker: '#ffd23e',
  health: '#3dff7a',
  healthLow: '#ff2e2e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, mission, position) is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-bay-heist.save.v1';
export const BEST_KEY = 'neon-bay-heist.best.v1';
