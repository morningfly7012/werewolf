import { ROLES, isWolf, isGood, isGod, isNightKiller, checksAsWolf } from './roles.js';

// 將角色配置展開為角色陣列，例如 {werewolf:2, villager:1} -> ['werewolf','werewolf','villager']
function expandConfig(config) {
  const list = [];
  for (const [id, n] of Object.entries(config)) {
    for (let i = 0; i < n; i++) list.push(id);
  }
  return list;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  constructor(config, options = {}) {
    this.config = config;
    this.options = Object.assign(
      {
        winCondition: 'edge',      // 'edge' 屠邊 | 'all' 屠城
        witchSelfSave: 'firstNightNo', // 'never' 全程不可自救 | 'firstNightNo' 首夜不可自救 | 'always' 皆可
        witchDouble: false         // 同一晚是否可同時用解藥與毒藥
      },
      options
    );
    this.roleList = expandConfig(config); // 待發角色
    this.players = [];        // { seat, name, roleId, alive, deadReason, deadDay }
    this.phase = 'lobby';     // lobby | dealing | night | dayAnnounce | dayDiscuss | dayVote | gameOver
    this.day = 0;             // 第幾天（夜晚開始時 +1）
    this.night = null;        // 當前夜晚收集的行動
    this.lastGuardTarget = null;
    this.witch = { antidote: true, poison: true };
    this.history = [];        // 事件記錄
    this.pendingGun = null;   // 待處理的開槍 { seat }
    this.winner = null;       // 'wolf' | 'good'
  }

  // ── 玩家管理 ──────────────────────────────
  addPlayer(name) {
    const seat = this.players.length + 1;
    const p = { seat, name: name || `玩家${seat}`, roleId: null, alive: true, deadReason: null, deadDay: null };
    this.players.push(p);
    return p;
  }

  get totalSeats() {
    return this.roleList.length;
  }

  getPlayer(seat) {
    return this.players.find((p) => p.seat === seat);
  }

  alivePlayers() {
    return this.players.filter((p) => p.alive);
  }

  // ── 發牌 ──────────────────────────────────
  // 將打亂後的角色依座位號碼發給玩家
  dealRoles() {
    const shuffled = shuffle(this.roleList);
    // 確保玩家數等於座位數
    this.players.forEach((p, i) => {
      p.roleId = shuffled[i];
    });
    this.phase = 'dealing';
  }

  playersByRole(roleId) {
    return this.players.filter((p) => p.roleId === roleId && p.alive);
  }

  // ── 夜晚流程 ──────────────────────────────
  // 回傳本晚需要行動的步驟（依角色存活情況與行動順序）
  nightSteps() {
    const steps = [];
    const present = new Set(this.players.map((p) => p.roleId));
    // 參與夜晚刀人的狼角色（含狼人/狼王/白狼王，不含隱狼）
    const killerRoles = Object.keys(ROLES).filter((id) => isNightKiller(id));
    const order = [
      { key: 'guard', roles: ['guard'] },
      { key: 'wolf', roles: killerRoles }, // 狼人陣營一起刀
      { key: 'witch', roles: ['witch'] },
      { key: 'seer', roles: ['seer'] }
    ];
    for (const o of order) {
      const anyAlive = o.roles.some((r) => this.playersByRole(r).length > 0);
      const anyPresent = o.roles.some((r) => present.has(r));
      if (anyPresent) {
        steps.push({ key: o.key, roles: o.roles, hasAlive: anyAlive });
      }
    }
    return steps;
  }

  startNight() {
    this.day += 1;
    this.phase = 'night';
    this.night = {
      guardTarget: null,
      wolfTarget: null,
      witchSaveUsed: false,
      witchPoisonTarget: null,
      seerResult: null,
      seerTarget: null
    };
    return this.day;
  }

  // 守衛行動
  actGuard(targetSeat) {
    if (targetSeat != null) {
      if (targetSeat === this.lastGuardTarget) {
        return { ok: false, error: '守衛不能連續兩晚守護同一人。' };
      }
      const t = this.getPlayer(targetSeat);
      if (!t || !t.alive) return { ok: false, error: '守護目標無效。' };
    }
    this.night.guardTarget = targetSeat; // null = 空守
    return { ok: true };
  }

  // 狼人刀人
  actWolf(targetSeat) {
    if (targetSeat != null) {
      const t = this.getPlayer(targetSeat);
      if (!t || !t.alive) return { ok: false, error: '擊殺目標無效。' };
    }
    this.night.wolfTarget = targetSeat; // null = 空刀
    return { ok: true };
  }

  // 女巫用解藥（救當晚被刀者）
  actWitchSave() {
    if (!this.witch.antidote) return { ok: false, error: '解藥已經用過了。' };
    const killed = this.night.wolfTarget;
    if (killed == null) return { ok: false, error: '今晚沒有人被狼人擊殺，無需用藥。' };
    // 防呆：第一晚 / 全程 自救限制
    const witchPlayers = this.playersByRole('witch');
    const isSelf = witchPlayers.some((w) => w.seat === killed);
    if (isSelf) {
      if (this.options.witchSelfSave === 'never') {
        return { ok: false, error: '依規則女巫全程不能自救。' };
      }
      if (this.options.witchSelfSave === 'firstNightNo' && this.day === 1) {
        return { ok: false, error: '第一晚女巫不能自救！' };
      }
    }
    // 同一晚雙藥限制
    if (!this.options.witchDouble && this.night.witchPoisonTarget != null) {
      return { ok: false, error: '同一晚不能同時使用解藥與毒藥。' };
    }
    this.night.witchSaveUsed = true;
    return { ok: true };
  }

  cancelWitchSave() {
    this.night.witchSaveUsed = false;
    return { ok: true };
  }

  // 女巫用毒藥
  actWitchPoison(targetSeat) {
    if (targetSeat == null) {
      this.night.witchPoisonTarget = null;
      return { ok: true };
    }
    if (!this.witch.poison) return { ok: false, error: '毒藥已經用過了。' };
    const t = this.getPlayer(targetSeat);
    if (!t || !t.alive) return { ok: false, error: '下毒目標無效。' };
    const witchPlayers = this.playersByRole('witch');
    if (witchPlayers.some((w) => w.seat === targetSeat)) {
      return { ok: false, error: '女巫不能毒自己。' };
    }
    if (!this.options.witchDouble && this.night.witchSaveUsed) {
      return { ok: false, error: '同一晚不能同時使用解藥與毒藥。' };
    }
    this.night.witchPoisonTarget = targetSeat;
    return { ok: true };
  }

  // 預言家查驗
  actSeer(targetSeat) {
    const t = this.getPlayer(targetSeat);
    if (!t || !t.alive) return { ok: false, error: '查驗目標無效。' };
    // 隱狼查驗為好人
    const result = checksAsWolf(t.roleId) ? 'wolf' : 'good';
    this.night.seerTarget = targetSeat;
    this.night.seerResult = result;
    return { ok: true, result, seat: targetSeat, name: t.name };
  }

  // ── 結算夜晚 ──────────────────────────────
  resolveNight() {
    const n = this.night;
    const deaths = []; // { seat, reason }
    const killed = n.wolfTarget;

    // 解藥 / 守衛 對狼刀的影響
    let wolfKillEffective = killed != null;
    if (wolfKillEffective) {
      const savedByGuard = n.guardTarget != null && n.guardTarget === killed;
      const savedByWitch = n.witchSaveUsed;
      if (savedByGuard && savedByWitch) {
        // 同守同救 → 視為死亡
        wolfKillEffective = true;
      } else if (savedByGuard || savedByWitch) {
        wolfKillEffective = false;
      }
    }
    // 長老：第一次被狼刀可扛過（毒、投票不適用）
    if (wolfKillEffective) {
      const target = this.getPlayer(killed);
      if (target && ROLES[target.roleId] && ROLES[target.roleId].toughSkin && !target.toughUsed) {
        target.toughUsed = true;
        wolfKillEffective = false; // 擋下這一刀
      }
    }
    if (wolfKillEffective) {
      deaths.push({ seat: killed, reason: 'wolf' });
    }

    // 毒藥
    if (n.witchPoisonTarget != null) {
      // 若毒的人也正好是被刀且未被救，避免重複；仍以毒為標記（影響獵人開槍）
      const exist = deaths.find((d) => d.seat === n.witchPoisonTarget);
      if (exist) exist.reason = 'poison';
      else deaths.push({ seat: n.witchPoisonTarget, reason: 'poison' });
    }

    // 套用藥水消耗
    if (n.witchSaveUsed) this.witch.antidote = false;
    if (n.witchPoisonTarget != null) this.witch.poison = false;
    this.lastGuardTarget = n.guardTarget;

    // 標記死亡
    for (const d of deaths) {
      const p = this.getPlayer(d.seat);
      if (p && p.alive) {
        p.alive = false;
        p.deadReason = d.reason;
        p.deadDay = this.day;
      }
    }

    this.history.push({ day: this.day, type: 'night', deaths: deaths.map((d) => ({ ...d })) });
    this.phase = 'dayAnnounce';

    // 檢查死者中是否有獵人/狼王且非被毒 → 可開槍
    this.pendingGun = this._findGunner(deaths.map((d) => d.seat));
    return { deaths };
  }

  // 找出可開槍的死者（具 gunOnDeath 的角色；被毒不可開槍）
  // 白狼王不在此列：只能在白天自爆帶人，死亡不開槍。
  _findGunner(deadSeats) {
    for (const seat of deadSeats) {
      const p = this.getPlayer(seat);
      if (!p) continue;
      const canGun = ROLES[p.roleId] && ROLES[p.roleId].gunOnDeath;
      if (canGun && p.deadReason !== 'poison') {
        return { seat, roleId: p.roleId };
      }
    }
    return null;
  }

  // 開槍帶人
  shoot(shooterSeat, targetSeat) {
    const shooter = this.getPlayer(shooterSeat);
    if (!shooter) return { ok: false, error: '開槍者無效。' };
    if (shooter.deadReason === 'poison') return { ok: false, error: '被毒死無法開槍。' };
    if (targetSeat == null) {
      this.pendingGun = null;
      return { ok: true, skipped: true };
    }
    const t = this.getPlayer(targetSeat);
    if (!t || !t.alive) return { ok: false, error: '開槍目標無效。' };
    t.alive = false;
    t.deadReason = 'gun';
    t.deadDay = this.day;
    this.history.push({ day: this.day, type: 'gun', shooter: shooterSeat, target: targetSeat });
    this.pendingGun = this._findGunner([targetSeat]); // 連鎖開槍
    return { ok: true, target: targetSeat };
  }

  // ── 白天主動技能 ──────────────────────────
  // 騎士決鬥：對方是狼 → 對方死、直接進入黑夜（skipVote）；對方是好人 → 騎士死、繼續投票
  knightDuel(knightSeat, targetSeat) {
    const k = this.getPlayer(knightSeat);
    if (!k || !k.alive || k.roleId !== 'knight') return { ok: false, error: '騎士無效。' };
    const t = this.getPlayer(targetSeat);
    if (!t || !t.alive) return { ok: false, error: '決鬥目標無效。' };
    const targetIsWolf = isWolf(t.roleId);
    if (targetIsWolf) {
      t.alive = false;
      t.deadReason = 'duel';
      t.deadDay = this.day;
      this.history.push({ day: this.day, type: 'duel', knight: knightSeat, target: targetSeat, result: 'wolf' });
      this.pendingGun = this._findGunner([targetSeat]);
      return { ok: true, targetIsWolf: true, skipVote: true, deadSeat: targetSeat };
    } else {
      k.alive = false;
      k.deadReason = 'duel';
      k.deadDay = this.day;
      this.history.push({ day: this.day, type: 'duel', knight: knightSeat, target: targetSeat, result: 'good' });
      this.pendingGun = null; // 騎士無開槍
      return { ok: true, targetIsWolf: false, skipVote: false, deadSeat: knightSeat };
    }
  }

  // 白狼王自爆：自己死亡並可帶走一名玩家，之後直接進入黑夜
  selfDestruct(seat, targetSeat) {
    const p = this.getPlayer(seat);
    if (!p || !p.alive || p.roleId !== 'whitewolfking') return { ok: false, error: '白狼王無效。' };
    p.alive = false;
    p.deadReason = 'boom';
    p.deadDay = this.day;
    let took = null;
    if (targetSeat != null) {
      const t = this.getPlayer(targetSeat);
      if (!t || !t.alive) return { ok: false, error: '帶走目標無效。' };
      t.alive = false;
      t.deadReason = 'boom';
      t.deadDay = this.day;
      took = targetSeat;
    }
    this.history.push({ day: this.day, type: 'boom', seat, target: took });
    // 自爆帶走的人若為獵人/狼王仍可開槍
    this.pendingGun = took != null ? this._findGunner([took]) : null;
    return { ok: true, took, skipVote: true };
  }

  // ── 白天投票 ──────────────────────────────
  startDiscuss() {
    this.phase = 'dayDiscuss';
  }
  startVote() {
    this.phase = 'dayVote';
  }

  // 直接指定被投出者（票數統計可由前端做，這裡接受結果）
  execute(seat) {
    if (seat == null) {
      this.history.push({ day: this.day, type: 'vote', target: null });
      this.pendingGun = null;
      return { ok: true, idiot: false, executed: null };
    }
    const p = this.getPlayer(seat);
    if (!p || !p.alive) return { ok: false, error: '出局目標無效。' };
    // 白痴被投票翻牌不死
    if (p.roleId === 'idiot' && !p.idiotRevealed) {
      p.idiotRevealed = true; // 失去投票權，但仍存活
      p.canVote = false;
      this.history.push({ day: this.day, type: 'vote', target: seat, idiot: true });
      this.pendingGun = null;
      return { ok: true, idiot: true, executed: seat };
    }
    p.alive = false;
    p.deadReason = 'vote';
    p.deadDay = this.day;
    this.history.push({ day: this.day, type: 'vote', target: seat });
    this.pendingGun = this._findGunner([seat]);
    return { ok: true, idiot: false, executed: seat };
  }

  // ── 勝負判定 ──────────────────────────────
  checkWin() {
    const alive = this.alivePlayers();
    const wolves = alive.filter((p) => isWolf(p.roleId)).length;
    const gods = alive.filter((p) => isGod(p.roleId)).length;
    const villagers = alive.filter((p) => p.roleId === 'villager').length;
    const goods = gods + villagers;

    if (wolves === 0) {
      this.winner = 'good';
      this.phase = 'gameOver';
      return { over: true, winner: 'good' };
    }
    if (this.options.winCondition === 'all') {
      // 屠城：好人全滅狼人勝
      if (goods === 0) {
        this.winner = 'wolf';
        this.phase = 'gameOver';
        return { over: true, winner: 'wolf' };
      }
    } else {
      // 屠邊：神全滅 或 民全滅 即狼勝
      if (gods === 0 || villagers === 0) {
        this.winner = 'wolf';
        this.phase = 'gameOver';
        return { over: true, winner: 'wolf' };
      }
    }
    return { over: false };
  }

  // 對外公開的狀態（不含角色機密）
  publicState() {
    return {
      phase: this.phase,
      day: this.day,
      winner: this.winner,
      options: this.options,
      players: this.players.map((p) => ({
        seat: p.seat,
        name: p.name,
        alive: p.alive,
        deadReason: p.alive ? null : p.deadReason,
        deadDay: p.deadDay,
        idiotRevealed: !!p.idiotRevealed
      })),
      witch: this.witch,
      pendingGun: this.pendingGun
    };
  }
}
