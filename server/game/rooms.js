import { Game } from './engine.js';

const rooms = new Map();

function genCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

export function createRoom(config, options) {
  const code = genCode();
  const room = {
    code,
    game: new Game(config, options),
    hostSocket: null,
    // socketId -> seat ；seat 在抽號碼後才確定
    seatBySocket: new Map(),
    socketBySeat: new Map(),
    // 尚未抽號碼前的參與者：socketId -> { name }
    participants: new Map(),
    nightStepIndex: 0,
    nightSteps: [],
    wolfVotes: new Map(), // seat -> targetSeat（狼人各自投票）
    createdAt: Date.now()
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  return rooms.get(code);
}

export function removeRoom(code) {
  rooms.delete(code);
}

// 清除超過 6 小時的房間
export function cleanup() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 6 * 60 * 60 * 1000) rooms.delete(code);
  }
}
setInterval(cleanup, 30 * 60 * 1000);
