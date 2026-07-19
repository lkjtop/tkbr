/**
 * Entity.gs
 * 캐릭터(장수) 객체 모델링 및 상태 초기화 전담
 */

function initChar(name, camp, troop, pos, force, intel, command, speed, skills, strategies, deck, idx) {
  if (!name) return null;
  var f = parseInt(force) || 100;
  var i = parseInt(intel) || 100;
  var c = parseInt(command) || 100;
  var s = parseInt(speed) || 100;
  
  return {
    name: name, camp: camp, troop: troop, position: pos, deck: deck, idx: idx,
    hp: 10000, maxHp: 10000,
    force: f, intel: i, command: c, speed: s,
    baseForce: f, baseIntel: i, baseCommand: c, baseSpeed: s,
    skills: skills, strategies: strategies,
    critProb: 0, spellCritProb: 0, dodgeProb: 0, lifestealProb: 0, psyLifestealProb: 0, doubleAttackProb: 0,
    damageDealtMod: 1.0, damageTakenMod: 1.0, activeRateBonus: 0, pierce: 0, insight: 0,
    silence: 0, disarm: 0, fear: 0, weakness: 0, confusion: 0, 
    magicState: 0, stormState: 0, floodState: 0, fireState: 0, grainExhaustState: 0, threatState: 0,
    shieldStacks: 0, regenState: 0, tauntedBy: null, tauntState: 0, preparedSkill: null,
    normalAttackCount: 0, damageDealtThisTurn: 0, damageTakenThisTurn: 0, hitWeight: 33,
    totalDamageDealt: 0, totalDamageTaken: 0, totalHealingDone: 0,
    critDamageMod: 0,
    용담Count: 0, 척살Count: 0, 용의포효Count: 0, 제갈량Count: 0, 신의가호Count: 0, 세금과징수Count: 0, 용맹한삼군Count: 0, 독설가Count: 0,
    도원결의Active: false, 소열제Active: false,
    백발백중: 0, 흥왕의위업State: 0, 
    감녕무력Buff: [], 손견통솔Debuff: 0, 손견통솔DebuffAmt: 0, 관우액티브Buff: 0, 관우액티브BuffAmt: 0, 청야전술Buff: 0, 강철의의지Buff: 0, 강철의의지DoubleAmt: 0, 강철의의지LifestealAmt: 0,
    세금과징수Buff: [], 고육지계Buff: 0, 고육지계ReduceAmt: 0,
    수전의제왕Count: 0,
    충신의기재Count: 0,
    허점공략State: 0,
    국색State: 0,
    패잔병척결Count: 0,
    인의론Count: 0, 인의론TurnTriggered: false,
    견결Buff: 0,
    출사표Buff: 0, 출사표Debuff: 0,
    파죽지세Buff: 0, 
    원문사극Buff: [], 
    충신의기재Buff: [],
    탈주병State: 0,
    순간돌습Debuff: 0,
    철기병돌격Buff: 0,
    고육지계BondActive: false, 
    고육지계BondTriggered: false
  };
}