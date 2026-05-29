// 角色定義 ─────────────────────────────────────────────
// camp: 'wolf' 狼人陣營 | 'god' 神職(好人) | 'villager' 平民(好人)
// 好人陣營 = god + villager
// nightOrder: 夜晚行動順序 (數字越小越先；null = 夜晚無主動行動)
// nightKill: 是否參與狼人夜晚刀人（隱狼為 false）
// hiddenFromSeer: 預言家查驗時是否顯示為好人
// gunOnDeath: 死亡時是否可開槍（被毒除外）
// dayAbility: 白天主動技能 'duel' 騎士決鬥 | 'boom' 白狼王自爆
// toughSkin: 是否能扛過第一次狼刀（長老）

export const ROLES = {
  werewolf: {
    id: 'werewolf',
    name: '狼人',
    camp: 'wolf',
    nightOrder: 20,
    nightKill: true,
    emoji: '🐺',
    desc: '每晚與同伴一起選擇一名玩家擊殺。',
    tip: '夜晚睜眼，與其他狼人商議刀人。'
  },
  wolfking: {
    id: 'wolfking',
    name: '狼王',
    camp: 'wolf',
    nightOrder: 20,
    nightKill: true,
    gunOnDeath: true,
    emoji: '👑',
    desc: '狼人陣營。出局（被投票或被獵殺）時可開槍帶走一名玩家；被女巫毒死則不能開槍。',
    tip: '與狼人一起行動，死亡時可開槍。'
  },
  whitewolfking: {
    id: 'whitewolfking',
    name: '白狼王',
    camp: 'wolf',
    nightOrder: 20,
    nightKill: true,
    dayAbility: 'boom',
    emoji: '🐉',
    desc: '狼人陣營。可在白天發言階段「自爆」並帶走一名玩家，自爆後直接進入黑夜；被投票或被殺死時不能開槍。',
    tip: '白天可自爆帶走一人。'
  },
  hiddenwolf: {
    id: 'hiddenwolf',
    name: '隱狼',
    camp: 'wolf',
    nightOrder: null,
    nightKill: false,
    hiddenFromSeer: true,
    emoji: '🌑',
    desc: '狼人陣營，但夜晚不與狼人一起睜眼刀人。預言家查驗時顯示為「好人」。靠隱藏身份協助狼隊獲勝。',
    tip: '不參與刀人，預言家驗為好人。'
  },
  villager: {
    id: 'villager',
    name: '平民',
    camp: 'villager',
    nightOrder: null,
    emoji: '👨‍🌾',
    desc: '沒有特殊技能，靠發言與投票找出狼人。',
    tip: '夜晚閉眼，白天靠推理投票。'
  },
  seer: {
    id: 'seer',
    name: '預言家',
    camp: 'god',
    nightOrder: 30,
    emoji: '🔮',
    desc: '每晚可查驗一名玩家，得知其為「好人」或「狼人」。',
    tip: '每晚查驗一人身份。'
  },
  witch: {
    id: 'witch',
    name: '女巫',
    camp: 'god',
    nightOrder: 25,
    emoji: '🧪',
    desc: '擁有一瓶解藥與一瓶毒藥。解藥可救當晚被刀的玩家，毒藥可毒死一名玩家。解藥與毒藥同一晚通常不能一起使用，且女巫第一晚不能自救。',
    tip: '可救人或毒人，藥各一瓶。'
  },
  hunter: {
    id: 'hunter',
    name: '獵人',
    camp: 'god',
    nightOrder: null,
    gunOnDeath: true,
    emoji: '🔫',
    desc: '出局（被投票或被狼刀）時可開槍帶走一名玩家；但被女巫毒死則無法開槍。',
    tip: '死亡時可開槍帶走一人（被毒除外）。'
  },
  knight: {
    id: 'knight',
    name: '騎士',
    camp: 'god',
    nightOrder: null,
    dayAbility: 'duel',
    emoji: '⚔️',
    desc: '白天發言階段可翻牌與一名玩家決鬥：若對方是狼人，對方立即死亡並直接進入黑夜（跳過投票）；若對方是好人，騎士自己死亡，遊戲繼續。',
    tip: '白天可與一人決鬥驗證身份。'
  },
  elder: {
    id: 'elder',
    name: '長老',
    camp: 'god',
    nightOrder: null,
    toughSkin: true,
    emoji: '🧓',
    desc: '擁有強韌體魄，第一次被狼人擊殺時不會死亡（可擋一刀）；第二次被狼刀、被毒或被投票則正常死亡。',
    tip: '可扛過第一次狼刀。'
  },
  guard: {
    id: 'guard',
    name: '守衛',
    camp: 'god',
    nightOrder: 10,
    emoji: '🛡️',
    desc: '每晚守護一名玩家，使其免疫當晚狼刀。不能連續兩晚守護同一人，可以守自己，也可以空守。',
    tip: '每晚守護一人免疫狼刀；不可連守同一人。'
  },
  idiot: {
    id: 'idiot',
    name: '白痴',
    camp: 'god',
    nightOrder: null,
    emoji: '🤪',
    desc: '被投票出局時翻牌亮明身份，不會死亡但失去投票權；若被狼刀或被毒則正常死亡。',
    tip: '被票出時翻牌不死，但失去投票權。'
  }
};

// 各人數推薦板子（屠邊局為主，神職數量與狼數平衡）
// 鍵為人數，值為角色 id 與數量
export const PRESETS = {
  8:  { werewolf: 2, seer: 1, witch: 1, hunter: 1, villager: 3 },
  9:  { werewolf: 3, seer: 1, witch: 1, hunter: 1, villager: 3 },
  10: { werewolf: 3, seer: 1, witch: 1, hunter: 1, villager: 4 },
  11: { werewolf: 3, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 4 },
  12: { werewolf: 4, seer: 1, witch: 1, hunter: 1, idiot: 1, villager: 4 },
  13: { werewolf: 4, seer: 1, witch: 1, hunter: 1, guard: 1, villager: 5 },
  14: { werewolf: 4, seer: 1, witch: 1, hunter: 1, guard: 1, idiot: 1, villager: 5 },
  15: { werewolf: 4, seer: 1, witch: 1, hunter: 1, guard: 1, idiot: 1, villager: 6 },
  16: { werewolf: 4, wolfking: 1, seer: 1, witch: 1, hunter: 1, guard: 1, idiot: 1, villager: 6 }
};

export function isWolf(roleId) {
  return ROLES[roleId] && ROLES[roleId].camp === 'wolf';
}
export function isGod(roleId) {
  return ROLES[roleId] && ROLES[roleId].camp === 'god';
}
export function isGood(roleId) {
  return ROLES[roleId] && ROLES[roleId].camp !== 'wolf';
}
// 參與夜晚刀人的狼角色（不含隱狼）
export function isNightKiller(roleId) {
  return !!(ROLES[roleId] && ROLES[roleId].nightKill);
}
// 預言家查驗結果是否為「狼」
export function checksAsWolf(roleId) {
  return isWolf(roleId) && !ROLES[roleId].hiddenFromSeer;
}

// 計算一份角色配置的總人數
export function countRoles(config) {
  return Object.values(config).reduce((a, b) => a + b, 0);
}

// 驗證角色配置是否合法
export function validateConfig(config, expectedCount) {
  const total = countRoles(config);
  const errors = [];
  if (total !== expectedCount) {
    errors.push(`角色總數 ${total} 與遊玩人數 ${expectedCount} 不符。`);
  }
  const wolves = Object.entries(config)
    .filter(([id]) => isWolf(id))
    .reduce((a, [, n]) => a + n, 0);
  if (wolves < 1) errors.push('至少需要 1 名狼人。');
  const goods = total - wolves;
  if (goods < wolves) errors.push('好人數量必須多於狼人。');
  if (total < 8) errors.push('遊玩人數至少 8 人。');
  if (total > 16) errors.push('遊玩人數最多 16 人。');
  return errors;
}
