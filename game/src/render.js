// Everything drawn on the canvas: the top-down city, cars, pedestrians, the player, HUD,
// minimap and the title / pause / game-over screens. It only reads state, never changes it.

import { CAR, CITY, FONT, PALETTE, PED, PLAYER, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MINIMAP = { w: 232, h: 172 };

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawCar(car, time) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -CAR.length / 2 + 3, -CAR.width / 2 + 3, CAR.length, CAR.width, 8);
    ctx.fill();
    ctx.fillStyle = car.color;
    roundRect(ctx, -CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    ctx.fill();
    // Cabin and windshield.
    ctx.fillStyle = '#101623';
    roundRect(ctx, -10, -CAR.width / 2 + 5, 20, CAR.width - 10, 5);
    ctx.fill();
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(8, -CAR.width / 2 + 5, 4, CAR.width - 10);
    // Headlights.
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(CAR.length / 2 - 3, -CAR.width / 2 + 3, 3, 5);
    ctx.fillRect(CAR.length / 2 - 3, CAR.width / 2 - 8, 3, 5);
    if (car.kind === 'cop') {
      const flash = Math.floor(time * 4) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
      ctx.fillRect(-6, -CAR.width / 2 - 2, 12, 5);
      ctx.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
      ctx.fillRect(-6, CAR.width / 2 - 3, 12, 5);
      ctx.fillStyle = '#eef1f5';
      ctx.font = `bold 11px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 4);
    }
    ctx.restore();
  }

  function drawPed(ped) {
    if (ped.down > 0) {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(0.6);
      ctx.fillStyle = ped.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(ped.x + 2, ped.y + 3, PED.radius, PED.radius * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.arc(ped.x, ped.y, PED.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWorld(state, screen) {
    const p = state.player;
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 22 : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 22 : 0;
    const camX = Math.max(0, Math.min(WORLD.width - VIEW.width, p.x - VIEW.width / 2)) + shakeX;
    const camY = Math.max(0, Math.min(WORLD.height - VIEW.height, p.y - VIEW.height / 2)) + shakeY;

    ctx.save();
    ctx.translate(-camX, -camY);

    // Ground.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(camX - 10, camY - 10, VIEW.width + 20, VIEW.height + 20);

    // Roads: one band per grid line, both directions.
    ctx.fillStyle = PALETTE.road;
    for (let x = 0; x <= WORLD.width; x += CITY.block) {
      ctx.fillRect(x - CITY.road / 2, camY - 10, CITY.road, VIEW.height + 20);
    }
    for (let y = 0; y <= WORLD.height; y += CITY.block) {
      ctx.fillRect(camX - 10, y - CITY.road / 2, VIEW.width + 20, CITY.road);
    }
    // Lane dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (let x = 0; x <= WORLD.width; x += CITY.block) {
      for (let y = 0; y < WORLD.height; y += 64) {
        ctx.fillRect(x - 2, y, 4, 26);
      }
    }
    for (let y = 0; y <= WORLD.height; y += CITY.block) {
      for (let x = 0; x < WORLD.width; x += 64) {
        ctx.fillRect(x, y - 2, 26, 4);
      }
    }

    // Buildings with a neon sign strip on one side.
    for (const b of state.buildings) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(b.x, b.y, b.w, 10);
      ctx.fillStyle = b.neon;
      if (b.neonSide === 0) ctx.fillRect(b.x, b.y - 3, b.w, 5);
      else if (b.neonSide === 1) ctx.fillRect(b.x + b.w - 2, b.y, 5, b.h);
      else if (b.neonSide === 2) ctx.fillRect(b.x, b.y + b.h - 2, b.w, 5);
      else ctx.fillRect(b.x - 3, b.y, 5, b.h);
    }

    // Cash pickups.
    for (const pk of state.pickups) {
      if (!pk.active) continue;
      const bob = Math.sin(state.time * 3 + pk.x) * 3;
      ctx.fillStyle = PALETTE.neonGreen;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-8, -8, 16, 16);
      ctx.restore();
      ctx.fillStyle = '#062b12';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', pk.x, pk.y + bob);
    }

    // Mission marker: a pulsing beacon.
    if (state.missionTarget) {
      const t = state.missionTarget;
      const pulse = 1 + Math.sin(state.time * 4) * 0.18;
      ctx.strokeStyle = PALETTE.marker;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(t.x, t.y, 34 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.marker;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(Math.PI / 4 + state.time);
      ctx.fillRect(-9, -9, 18, 18);
      ctx.restore();
      ctx.fillStyle = '#201500';
      ctx.font = `bold 13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', t.x, t.y + 1);
    }

    for (const ped of state.peds) drawPed(ped);
    for (const car of state.cars) drawCar(car, state.time);
    for (const cop of state.cops) {
      if (cop.kind === 'cop') drawCar(cop, state.time);
      else drawPed({ ...cop, color: '#2e6bff' });
    }

    // Player.
    if (!p.inCar) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(p.x + 2, p.y + 4, PLAYER.radius, PLAYER.radius * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.invulnerable > 0 && Math.floor(state.time * 12) % 2 === 0 ? '#ffffff' : PALETTE.player;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#201500';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(p.angle) * 6, p.y + Math.sin(p.angle) * 6, 5, 0, Math.PI * 2);
      ctx.fill();
      // Punch swing.
      if (p.punchCooldown > PLAYER.punchCooldown - 0.15) {
        ctx.strokeStyle = 'rgba(255,210,62,0.9)';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, PLAYER.punchRange, p.angle - 0.7, p.angle + 0.7);
        ctx.stroke();
      }
    } else {
      // A marker ring under the player's car.
      ctx.strokeStyle = 'rgba(255,210,62,0.85)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 40, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Particles.
    for (const pt of state.particles) {
      if (pt.life <= 0) continue;
      ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // Off-screen mission arrow at the viewport edge.
    if (state.missionTarget && screen === SCREEN_PLAY) {
      const t = state.missionTarget;
      const sx = t.x - camX;
      const sy = t.y - camY;
      if (sx < 30 || sx > VIEW.width - 30 || sy < 30 || sy > VIEW.height - 30) {
        const cx = Math.max(40, Math.min(VIEW.width - 40, sx));
        const cy = Math.max(40, Math.min(VIEW.height - 40, sy));
        const ang = Math.atan2(sy - cy, sx - cx);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(ang);
        ctx.fillStyle = PALETTE.marker;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-10, -12);
        ctx.lineTo(-10, 12);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }

  function drawHud(state, ui) {
    // Top-left panel: cash, wanted stars, health.
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, 12, 12, 250, 92, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.neonGreen;
    ctx.font = `bold 24px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`$${ui.cash}`, 26, 44);
    for (let i = 0; i < 5; i += 1) {
      star(ctx, 36 + i * 26, 66, 10, i < state.wanted ? PALETTE.neonYellow : '#33333f');
    }
    // Health bar.
    ctx.fillStyle = '#33333f';
    roundRect(ctx, 150, 58, 96, 14, 7);
    ctx.fill();
    ctx.fillStyle = state.player.health > 30 ? PALETTE.health : PALETTE.healthLow;
    roundRect(ctx, 150, 58, 96 * (state.player.health / PLAYER.health), 14, 7);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(state.player.inCar ? 'DRIVING' : 'ON FOOT', 26, 94);

    // Mission objective, top centre.
    if (ui.mission) {
      ctx.fillStyle = PALETTE.panel;
      const w = Math.min(560, 40 + ui.mission.brief.length * 6.4);
      roundRect(ctx, VIEW.width / 2 - w / 2, 12, w, 52, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.marker;
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(ui.mission.title, VIEW.width / 2, 34);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `13px ${FONT}`;
      ctx.fillText(ui.mission.brief, VIEW.width / 2, 54);
    }

    drawMinimap(state, ui);

    // Bottom-left controls.
    ctx.fillStyle = 'rgba(10,10,20,0.6)';
    roundRect(ctx, 12, VIEW.height - 40, 560, 28, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('WASD move/drive   E enter/steal car   SPACE punch   P pause   Q save   M mute', 22, VIEW.height - 21);

    // Hint line.
    if (state.hint) {
      ctx.fillStyle = PALETTE.neonOrange;
      ctx.font = `bold 17px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(state.hint, VIEW.width / 2, VIEW.height - 56);
    }

    // Mission banner.
    if (ui.banner) {
      ctx.fillStyle = 'rgba(10,10,20,0.82)';
      roundRect(ctx, VIEW.width / 2 - 330, 150, 660, 96, 12);
      ctx.fill();
      ctx.strokeStyle = PALETTE.marker;
      ctx.lineWidth = 2;
      roundRect(ctx, VIEW.width / 2 - 330, 150, 660, 96, 12);
      ctx.stroke();
      ctx.fillStyle = PALETTE.marker;
      ctx.font = `bold 24px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(ui.banner.title, VIEW.width / 2, 188);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `16px ${FONT}`;
      const words = ui.banner.text.split(' ');
      let line = '';
      let y = 214;
      for (const word of words) {
        if ((line + word).length > 62) {
          ctx.fillText(line, VIEW.width / 2, y);
          line = '';
          y += 20;
        }
        line += `${word} `;
      }
      ctx.fillText(line, VIEW.width / 2, y);
    }

    if (ui.saveFlash) {
      ctx.fillStyle = PALETTE.neonGreen;
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('Saved ✓', VIEW.width - 16, VIEW.height - 56);
    }
    if (ui.muted) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText('MUTED', VIEW.width - 16, VIEW.height - 80);
    }
  }

  function drawMinimap(state, ui) {
    const mx = VIEW.width - MINIMAP.w - 12;
    const my = 12;
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    ctx.fillStyle = PALETTE.panel;
    roundRect(ctx, mx, my, MINIMAP.w, MINIMAP.h, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, mx, my, MINIMAP.w, MINIMAP.h, 8);
    ctx.clip();
    ctx.fillStyle = '#101018';
    ctx.fillRect(mx, my, MINIMAP.w, MINIMAP.h);
    ctx.strokeStyle = '#2c2c3a';
    ctx.lineWidth = 2;
    for (let x = 0; x <= WORLD.width; x += CITY.block) {
      ctx.beginPath();
      ctx.moveTo(mx + x * sx, my);
      ctx.lineTo(mx + x * sx, my + MINIMAP.h);
      ctx.stroke();
    }
    for (let y = 0; y <= WORLD.height; y += CITY.block) {
      ctx.beginPath();
      ctx.moveTo(mx, my + y * sy);
      ctx.lineTo(mx + MINIMAP.w, my + y * sy);
      ctx.stroke();
    }
    if (state.missionTarget) {
      ctx.fillStyle = PALETTE.marker;
      ctx.beginPath();
      ctx.arc(mx + state.missionTarget.x * sx, my + state.missionTarget.y * sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const cop of state.cops) {
      ctx.fillStyle = '#ff2e2e';
      ctx.fillRect(mx + cop.x * sx - 2, my + cop.y * sy - 2, 4, 4);
    }
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.arc(mx + state.player.x * sx, my + state.player.y * sy, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('NEON BAY', mx + 6, my + MINIMAP.h - 6);
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(5,5,12,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = accent;
    ctx.font = `bold 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(title, VIEW.width / 2, VIEW.height / 2 - 60);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `19px ${FONT}`;
    lines.forEach((line, i) => {
      ctx.fillText(line, VIEW.width / 2, VIEW.height / 2 - 8 + i * 28);
    });
  }

  function draw(state, screen, ui) {
    const cw = canvas.clientWidth || VIEW.width;
    const ch = canvas.clientHeight || VIEW.height;
    canvas.width = cw;
    canvas.height = ch;
    const scale = Math.min(cw / VIEW.width, ch / VIEW.height);
    ctx.setTransform(scale, 0, 0, scale, (cw - VIEW.width * scale) / 2, (ch - VIEW.height * scale) / 2);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(-100, -100, VIEW.width + 200, VIEW.height + 200);

    drawWorld(state, screen);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state, ui);

    if (screen === SCREEN_TITLE) {
      overlay('NEON BAY HEIST', [
        'An open-world crime story in the city of Neon Bay.',
        ui.hasSave
          ? 'ENTER — continue your saved game    N — new game'
          : 'ENTER — start a new game',
        'WASD move & drive · E steal / enter a car · SPACE punch · P pause · Q save',
        ui.best > 0 ? `Best cash: $${ui.best}` : 'Three missions. One big score. Lose the heat.',
      ], PALETTE.neonPink);
    } else if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['Press P or ENTER to keep playing.', 'Press Q to save your progress.'], PALETTE.neonCyan);
    } else if (screen === SCREEN_OVER) {
      overlay(ui.overReason === 'busted' ? 'BUSTED!' : 'WASTED!', [
        ui.overReason === 'busted'
          ? 'The Neon Bay PD finally caught up with you.'
          : 'You ran out of health on the streets of Neon Bay.',
        `Cash earned: $${ui.cash}   ·   Missions done: ${ui.missionsDone} of 3`,
        'ENTER — try again from the last mission',
      ], PALETTE.healthLow);
    }
  }

  return { draw };
}
