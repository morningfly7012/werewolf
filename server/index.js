import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import path from 'path';
import { createRoom, getRoom } from './game/rooms.js';
import { ROLES, PRESETS, validateConfig, isWolf } from './game/roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(ROOT, 'public')));
// 讓瀏覽器（法官模式）也能載入共用的規則引擎模組
app.use('/shared', express.static(path.join(ROOT, 'server', 'game')));

app.get('/api/roles', (req, res) => res.json({ roles: ROLES, presets: PRESETS }));

// ── 工具：廣播公開狀態給房內所有人 ────────────────
function broadcastState(room) {
  io.to(room.code).emit('state', room.game.publicState());
}

// 取得某 socket 對應的玩家座位
function seatOf(room, socketId) {
  return room.seatBySocket.get(socketId) ?? null;
}

// 進入某個夜晚步驟：對房內各角色發送提示
function enterStep(room) {
  const game = room.game;
  const steps = room.nightSteps;
  const idx = room.nightStepIndex;
  if (idx >= steps.length) {
    return; // 由 host 觸發結算
  }
  const step = steps[idx];
  room.wolfVotes = new Map();

  // 對 host 廣播目前步驟（含語音文字）
  const voice = STEP_VOICE[step.key] || '';
  io.to(room.code).emit('night:step', {
    index: idx,
    total: steps.length,
    key: step.key,
    voice,
    label: STEP_LABEL[step.key]
  });

  // 通知各玩家：你是否要在此步驟行動
  for (const [socketId, seat] of room.seatBySocket) {
    const p = game.getPlayer(seat);
    const acting = p && p.alive && step.roles.includes(p.roleId);
    if (acting) {
      const payload = { key: step.key, seat };
      if (step.key === 'witch') {
        // 女巫需知道今晚誰被刀
        payload.killed = game.night.wolfTarget;
        payload.killedName = game.night.wolfTarget != null ? game.getPlayer(game.night.wolfTarget)?.name : null;
        payload.antidote = game.witch.antidote;
        payload.poison = game.witch.poison;
      }
      if (step.key === 'wolf') {
        // 狼人互相可見
        payload.teammates = game.players
          .filter((x) => isWolf(x.roleId))
          .map((x) => ({ seat: x.seat, name: x.name, alive: x.alive }));
      }
      payload.targets = game.alivePlayers().map((x) => ({ seat: x.seat, name: x.name }));
      io.to(socketId).emit('night:yourTurn', payload);
    } else {
      io.to(socketId).emit('night:wait', { key: step.key });
    }
  }
}

// 結束目前步驟（離開前結算），例如狼人投票轉成擊殺目標
function finalizeStep(room) {
  const game = room.game;
  const step = room.nightSteps[room.nightStepIndex];
  if (!step) return;
  if (step.key === 'wolf') {
    // 統計狼人投票多數決
    const tally = new Map();
    for (const t of room.wolfVotes.values()) {
      if (t == null) continue;
      tally.set(t, (tally.get(t) || 0) + 1);
    }
    let target = null,
      best = -1;
    for (const [t, c] of tally) {
      if (c > best) {
        best = c;
        target = t;
      }
    }
    game.actWolf(target);
  }
}

const STEP_VOICE = {
  guard: '守衛請睜眼，請選擇你要守護的玩家。守衛請閉眼。',
  wolf: '狼人請睜眼，請狼人們商議，選擇今晚要擊殺的玩家。狼人請閉眼。',
  witch: '女巫請睜眼。今晚的情況如下，請決定是否使用解藥或毒藥。女巫請閉眼。',
  seer: '預言家請睜眼，請選擇你要查驗的玩家。預言家請閉眼。'
};
const STEP_LABEL = {
  guard: '🛡️ 守衛行動',
  wolf: '🐺 狼人行動',
  witch: '🧪 女巫行動',
  seer: '🔮 預言家行動'
};

io.on('connection', (socket) => {
  // ── 建立房間（遊玩模式 host）────────────────
  socket.on('host:create', ({ config, options }, cb) => {
    const total = Object.values(config).reduce((a, b) => a + b, 0);
    const errors = validateConfig(config, total);
    if (errors.length) return cb && cb({ ok: false, errors });
    const room = createRoom(config, options);
    room.hostSocket = socket.id;
    socket.join(room.code);
    socket.data.code = room.code;
    socket.data.role = 'host';
    cb && cb({ ok: true, code: room.code, total: room.game.totalSeats });
    broadcastState(room);
  });

  socket.on('host:rejoin', ({ code }, cb) => {
    const room = getRoom(code);
    if (!room) return cb && cb({ ok: false, error: '房間不存在或已過期。' });
    room.hostSocket = socket.id;
    socket.join(code);
    socket.data.code = code;
    socket.data.role = 'host';
    cb && cb({ ok: true, code, total: room.game.totalSeats });
    broadcastState(room);
  });

  // ── 玩家加入 ───────────────────────────────
  socket.on('player:join', ({ code, name }, cb) => {
    const room = getRoom(code);
    if (!room) return cb && cb({ ok: false, error: '房間不存在，請確認房號。' });
    if (room.game.phase !== 'lobby') {
      return cb && cb({ ok: false, error: '遊戲已開始，無法加入。' });
    }
    if (room.participants.size >= room.game.totalSeats) {
      return cb && cb({ ok: false, error: '房間人數已滿。' });
    }
    room.participants.set(socket.id, { name: name || '玩家' });
    socket.join(code);
    socket.data.code = code;
    socket.data.role = 'player';
    cb && cb({ ok: true, total: room.game.totalSeats });
    // 通知 host 目前人數
    io.to(room.code).emit('lobby', {
      joined: room.participants.size,
      total: room.game.totalSeats,
      names: [...room.participants.values()].map((x) => x.name)
    });
  });

  // ── host 開始抽號碼 ────────────────────────
  socket.on('host:startDraw', (_, cb) => {
    const room = getRoom(socket.data.code);
    if (!room) return cb && cb({ ok: false, error: '房間不存在。' });
    if (room.participants.size < room.game.totalSeats) {
      return cb && cb({ ok: false, error: `人數不足，需 ${room.game.totalSeats} 人，目前 ${room.participants.size} 人。` });
    }
    // 為每個參與者建立玩家（座位尚未指定）
    room.availableSeats = [];
    for (let i = 1; i <= room.game.totalSeats; i++) room.availableSeats.push(i);
    // 先以參與順序建立 player 物件
    for (const [sid, info] of room.participants) {
      const p = room.game.addPlayer(info.name);
      p.tempSid = sid;
    }
    room.game.phase = 'drawing';
    io.to(room.code).emit('phase:draw');
    cb && cb({ ok: true });
    broadcastState(room);
  });

  // 玩家抽號碼
  socket.on('player:drawNumber', (_, cb) => {
    const room = getRoom(socket.data.code);
    if (!room || room.game.phase !== 'drawing') return cb && cb({ ok: false, error: '尚未開始抽號碼。' });
    if (room.seatBySocket.has(socket.id)) {
      return cb && cb({ ok: true, seat: room.seatBySocket.get(socket.id) });
    }
    if (!room.availableSeats || room.availableSeats.length === 0) {
      return cb && cb({ ok: false, error: '沒有可抽的號碼。' });
    }
    const i = Math.floor(Math.random() * room.availableSeats.length);
    const seat = room.availableSeats.splice(i, 1)[0];
    // 找到對應的 player 物件並設定其 seat
    const info = room.participants.get(socket.id);
    const player = room.game.players.find((p) => p.tempSid === socket.id);
    if (player) player.seat = seat;
    room.seatBySocket.set(socket.id, seat);
    room.socketBySeat.set(seat, socket.id);
    cb && cb({ ok: true, seat });
    io.to(room.code).emit('draw:progress', {
      drawn: room.seatBySocket.size,
      total: room.game.totalSeats
    });
  });

  // host 發角色
  socket.on('host:deal', (_, cb) => {
    const room = getRoom(socket.data.code);
    if (!room) return cb && cb({ ok: false, error: '房間不存在。' });
    if (room.seatBySocket.size < room.game.totalSeats) {
      return cb && cb({ ok: false, error: '還有玩家未抽號碼。' });
    }
    // 依 seat 排序 players，確保 getPlayer 正常
    room.game.players.sort((a, b) => a.seat - b.seat);
    room.game.dealRoles();
    io.to(room.code).emit('phase:deal');
    cb && cb({ ok: true });
    broadcastState(room);
  });

  // 玩家翻牌看角色
  socket.on('player:reveal', (_, cb) => {
    const room = getRoom(socket.data.code);
    if (!room) return cb && cb({ ok: false, error: '房間不存在。' });
    const seat = seatOf(room, socket.id);
    const p = room.game.getPlayer(seat);
    if (!p || !p.roleId) return cb && cb({ ok: false, error: '尚未發牌。' });
    const role = ROLES[p.roleId];
    const out = { seat: p.seat, roleId: p.roleId, name: role.name, emoji: role.emoji, desc: role.desc, camp: role.camp };
    if (isWolf(p.roleId)) {
      out.teammates = room.game.players
        .filter((x) => isWolf(x.roleId))
        .map((x) => ({ seat: x.seat, name: x.name }));
    }
    cb && cb({ ok: true, ...out });
  });

  // ── 夜晚流程 ───────────────────────────────
  socket.on('host:startNight', (_, cb) => {
    const room = getRoom(socket.data.code);
    if (!room) return cb && cb({ ok: false, error: '房間不存在。' });
    room.game.startNight();
    room.nightSteps = room.game.nightSteps();
    room.nightStepIndex = 0;
    cb && cb({ ok: true, day: room.game.day });
    broadcastState(room);
    enterStep(room);
  });

  socket.on('host:nextStep', (_, cb) => {
    const room = getRoom(socket.data.code);
    if (!room) return cb && cb({ ok: false });
    finalizeStep(room);
    room.nightStepIndex += 1;
    if (room.nightStepIndex >= room.nightSteps.length) {
      io.to(room.code).emit('night:allDone');
      cb && cb({ ok: true, done: true });
    } else {
      enterStep(room);
      cb && cb({ ok: true, done: false });
    }
  });

  socket.on('action:guard', ({ target }, cb) => {
    const room = getRoom(socket.data.code);
    const r = room.game.actGuard(target);
    if (room.hostSocket) io.to(room.hostSocket).emit('host:actionLog', { who: '守衛', text: r.ok ? (target ? `守護 ${target} 號` : '空守') : r.error });
    cb && cb(r);
  });

  socket.on('action:wolf', ({ target }, cb) => {
    const room = getRoom(socket.data.code);
    const seat = seatOf(room, socket.id);
    room.wolfVotes.set(seat, target);
    // 即時讓狼隊友看到彼此選擇
    const votes = [...room.wolfVotes.entries()].map(([s, t]) => ({ seat: s, target: t }));
    for (const [sid, st] of room.seatBySocket) {
      const p = room.game.getPlayer(st);
      if (p && isWolf(p.roleId)) io.to(sid).emit('wolf:votes', { votes });
    }
    if (room.hostSocket) io.to(room.hostSocket).emit('host:actionLog', { who: '狼人', text: `${seat} 號 → ${target ? target + ' 號' : '空刀'}` });
    cb && cb({ ok: true });
  });

  socket.on('action:witch', ({ save, poison }, cb) => {
    const room = getRoom(socket.data.code);
    const results = { ok: true, messages: [] };
    if (save === true) {
      const r = room.game.actWitchSave();
      if (!r.ok) { results.ok = false; results.error = r.error; return cb && cb(results); }
      results.messages.push('已使用解藥。');
    } else {
      room.game.cancelWitchSave();
    }
    if (poison !== undefined) {
      const r = room.game.actWitchPoison(poison);
      if (!r.ok) { results.ok = false; results.error = r.error; return cb && cb(results); }
      if (poison != null) results.messages.push(`已對 ${poison} 號使用毒藥。`);
    }
    if (room.hostSocket) io.to(room.hostSocket).emit('host:actionLog', { who: '女巫', text: results.messages.join(' ') || '不用藥' });
    cb && cb(results);
  });

  socket.on('action:seer', ({ target }, cb) => {
    const room = getRoom(socket.data.code);
    const r = room.game.actSeer(target);
    if (r.ok && room.hostSocket) io.to(room.hostSocket).emit('host:actionLog', { who: '預言家', text: `查驗 ${target} 號` });
    cb && cb(r);
  });

  // ── 結算與白天 ─────────────────────────────
  socket.on('host:resolveNight', (_, cb) => {
    const room = getRoom(socket.data.code);
    const result = room.game.resolveNight();
    const deaths = result.deaths.map((d) => {
      const p = room.game.getPlayer(d.seat);
      return { seat: d.seat, name: p?.name, reason: d.reason };
    });
    io.to(room.code).emit('day:announce', { day: room.game.day, deaths, pendingGun: room.game.pendingGun });
    broadcastState(room);
    const win = room.game.checkWin();
    if (win.over) io.to(room.code).emit('game:over', { winner: win.winner });
    cb && cb({ ok: true, deaths });
  });

  socket.on('host:shoot', ({ shooter, target }, cb) => {
    const room = getRoom(socket.data.code);
    const r = room.game.shoot(shooter, target);
    if (r.ok) {
      io.to(room.code).emit('day:shoot', { shooter, target, pendingGun: room.game.pendingGun });
      broadcastState(room);
      const win = room.game.checkWin();
      if (win.over) io.to(room.code).emit('game:over', { winner: win.winner });
    }
    cb && cb(r);
  });

  socket.on('host:startVote', (_, cb) => {
    const room = getRoom(socket.data.code);
    room.game.startVote();
    io.to(room.code).emit('phase:vote');
    broadcastState(room);
    cb && cb({ ok: true });
  });

  socket.on('host:execute', ({ seat }, cb) => {
    const room = getRoom(socket.data.code);
    const r = room.game.execute(seat);
    if (r.ok) {
      io.to(room.code).emit('day:execute', { seat, idiot: r.idiot, pendingGun: room.game.pendingGun });
      broadcastState(room);
      const win = room.game.checkWin();
      if (win.over) io.to(room.code).emit('game:over', { winner: win.winner });
    }
    cb && cb(r);
  });

  socket.on('disconnect', () => {
    const room = getRoom(socket.data.code);
    if (!room) return;
    if (room.game.phase === 'lobby') {
      room.participants.delete(socket.id);
      io.to(room.code).emit('lobby', {
        joined: room.participants.size,
        total: room.game.totalSeats,
        names: [...room.participants.values()].map((x) => x.name)
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🐺 狼人殺輔助器執行中： http://localhost:${PORT}`);
});
