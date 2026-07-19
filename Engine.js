/**
 * Engine.gs
 * 포진 결산(진영/병종/인연/진형/병법), 턴 시작/종료 지휘 효과, 전투 시뮬레이션 메인 루프 전담
 */

function simulateBattle() {
  var allies = [
    initChar(aNames[0], aCamps[0], aTroops[0], aPositions[0], aForce[0], aIntel[0], aCommand[0], aFirst[0], aSkills[0], aStrategies[0], 'A', 0),
    initChar(aNames[1], aCamps[1], aTroops[1], aPositions[1], aForce[1], aIntel[1], aCommand[1], aFirst[1], aSkills[1], aStrategies[1], 'A', 1),
    initChar(aNames[2], aCamps[2], aTroops[2], aPositions[2], aForce[2], aIntel[2], aCommand[2], aFirst[2], aSkills[2], aStrategies[2], 'A', 2)
  ].filter(Boolean);

  var enemies = [
    initChar(bNames[0], bCamps[0], bTroops[0], bPositions[0], bForce[0], bIntel[0], bCommand[0], bFirst[0], bSkills[0], bStrategies[0], 'B', 0),
    initChar(bNames[1], bCamps[1], bTroops[1], bPositions[1], bForce[1], bIntel[1], bCommand[1], bFirst[1], bSkills[1], bStrategies[1], 'B', 1),
    initChar(bNames[2], bCamps[2], bTroops[2], bPositions[2], bForce[2], bIntel[2], bCommand[2], bFirst[2], bSkills[2], bStrategies[2], 'B', 2)
  ].filter(Boolean);

  // ==========================================
  // [포진 단계 (Setup Phase)]
  // ==========================================
  logAction("=====================================================================");
  logAction("⚙️ [포진 단계] 전투 준비 및 진형/인연 결산 시작");
  logAction("=====================================================================");
  
  settleCampBonus(allies);
  settleCampBonus(enemies);
  settleTroopBonus(allies);
  settleTroopBonus(enemies);
  // [인연 패치] A/B 식별자 추가
  settleBondBonus(allies, bonds, 'A'); 
  settleBondBonus(enemies, bonds, 'B');
  settleFormationBonus(allies, aFormation);
  settleFormationBonus(enemies, bFormation);
  settleStrategyBonus(allies);
  settleStrategyBonus(enemies);
  triggerBattleStart(allies, enemies);
  triggerBattleStart(enemies, allies);

  // ==========================================
  // [전투 단계 (Battle Phase)]
  // ==========================================
  logAction("=====================================================================");
  logAction("⚔️ [전투 단계] 실시간 턴제 결산 돌입 (최대 8턴 제한)");
  logAction("=====================================================================");
  
  var turn = 0;
  for (turn = 1; turn <= 8; turn++) {
    var alliesAlive = allies.some(function(c) { return c.hp > 0; });
    var enemiesAlive = enemies.some(function(c) { return c.hp > 0; });
    if (!alliesAlive || !enemiesAlive) break;

    logAction("---------------------------------------------------------------------");
    logAction("▶️ [턴 " + turn + " 시작]");
    logAction("---------------------------------------------------------------------");

    allies.forEach(function(c) { c.damageDealtThisTurn = 0; c.damageTakenThisTurn = 0; c.용담Count = 0; c.척살Count = 0; c.용의포효Count = 0; c.제갈량Count = 0; c.신의가호Count = 0; c.세금과징수Count = 0; c.독설가Count = 0; c.패잔병척결Count = 0; });
    enemies.forEach(function(c) { c.damageDealtThisTurn = 0; c.damageTakenThisTurn = 0; c.용담Count = 0; c.척살Count = 0; c.용의포효Count = 0; c.제갈량Count = 0; c.신의가호Count = 0; c.세금과징수Count = 0; c.독설가Count = 0; c.패잔병척결Count = 0; });
    
    triggerTurnStart(allies, enemies, turn);
    triggerTurnStart(enemies, allies, turn);

    var queue = allies.concat(enemies).filter(function(c) { return c.hp > 0; });
    queue.sort(function(x, y) {
      var xSpeed = x.speed - (x.stormState > 0 ? 30 : 0);
      var ySpeed = y.speed - (y.stormState > 0 ? 30 : 0);
      return ySpeed - xSpeed;
    });

    logAction("📢 행동 순서 판정: " + queue.map(function(c) { return c.name + "(" + c.speed + ")"; }).join(" ➔ "));

    for (var q = 0; q < queue.length; q++) {
      var actor = queue[q];
      if (actor.hp <= 0) continue;

      logAction("👉 [" + actor.name + " (" + actor.deck + "덱)] 행동 시작 (현재 병력: " + actor.hp + ")");

      // 1. [공포 면역 및 준비 중단 패치]
      if (actor.fear > 0 && actor.regenState <= 0) {
        logAction("💤 [공포] " + actor.name + "은(는) 공포 상태로 행동 불능입니다.");

        // --- 🔥 [추가] 공포로 인한 준비 중단 ---
        if (actor.preparedSkill) {
          logAction("💥 [시전 중단] 공포 상태로 인해 준비 중이던 '" + actor.preparedSkill + "' 시전이 완전히 취소되었습니다!");
          actor.preparedSkill = null;
        }
        continue;
      } else if (actor.fear > 0 && actor.regenState > 0) {
        logAction("✨ [정신 회복] " + actor.name + "이(가) 정신 회복으로 공포 상태를 일시 무효화합니다.");
      }

      var curAllies = (actor.deck === 'A') ? allies : enemies;
      var curEnemies = (actor.deck === 'A') ? enemies : allies;

      if (actor.도원결의Active && turn === 3) {
        logAction("🔗 [도원결의] 3턴째 행동 개시 전, " + actor.name + "의 모든 제어 효과를 정화합니다!");
        actor.silence = 0; actor.disarm = 0; actor.fear = 0; actor.weakness = 0;
      }

      
      if (actor.silence <= 0 || actor.regenState > 0) {
        if (actor.silence > 0) logAction("✨ [정신 회복] " + actor.name + "이(가) 정신 회복으로 침묵을 무효화하고 액티브를 시전합니다.");

        for (var s = 0; s < 3; s++) {
          var sName = actor.skills[s];
          if (!sName) continue;
          
          if (!skillTypes[sName] || skillTypes[sName].toString().indexOf("액티브") === -1) {
            continue;
          }
          
          var isPrepSkill = ["방화범", "응전", "기문둔갑", "결정적인 수", "칠군수몰"].indexOf(sName) !== -1;
          if (isPrepSkill) {
            if (actor.preparedSkill === sName) {
              castActiveSkill(sName, actor, curAllies, curEnemies);
              actor.preparedSkill = null;
            } else {
              // 다른 스킬을 준비 중이라면 새 스킬 준비 불가
              if (!actor.preparedSkill) {
                actor.preparedSkill = sName;
                logAction("⏳ [준비] " + actor.name + "이(가) '" + sName + "' 시전을 위한 준비 상태에 들어갑니다.");
              }
            }
            continue;
          }

          var prob = getSkillProb(sName, actor.name) + actor.activeRateBonus;
          // --- 장비 고유 병법 '신정후도명' 확률 100% 보정 ---
          if (sName === "만인지적" && actor.strategies && actor.strategies.indexOf("신정후도명") !== -1) {
            prob = 1.0; 
          }
          if (Math.random() < prob) {
            castActiveSkill(sName, actor, curAllies, curEnemies);
            if (actor.name === "곽가" && Math.random() < 0.7) {
              logAction("🌀 [주도면밀] 곽가의 고유 전법 연쇄! 액티브 전법을 연속 1회 더 즉시 시전합니다.");
              castActiveSkill(sName, actor, curAllies, curEnemies);
            }
          } else {
            logAction("  └ 🚫 [발동 실패] '" + sName + "' 전법 발동에 실패했습니다. (확률: " + (prob * 100).toFixed(1) + "%)");
          }
        }
      } else {
        logAction("🤐 [침묵] " + actor.name + "은(는) 침묵 상태로 액티브 전법을 사용할 수 없습니다.");

        // --- 🔥 [추가] 침묵으로 인한 준비 중단 ---
        if (actor.preparedSkill) {
          logAction("💥 [시전 중단] 침묵 상태로 인해 준비 중이던 '" + actor.preparedSkill + "' 시전이 완전히 취소되었습니다!");
          actor.preparedSkill = null;
        }
      }

      // [무장 해제 면역 패치]
      if (actor.disarm <= 0 || actor.regenState > 0) {
        if (actor.disarm > 0) logAction("✨ [정신 회복] " + actor.name + "이(가) 정신 회복으로 무장 해제를 무효화하고 무기를 듭니다.");
        var target = getAttackTarget(actor, curEnemies);
        if (target) {
          performNormalAttack(actor, target, curAllies, curEnemies);
          var doubleAttackProb = actor.doubleAttackProb;
          if (actor.skills.indexOf("늠름한 자태") !== -1) doubleAttackProb += 0.636;
          if (Math.random() < doubleAttackProb) {
            logAction("⚡ [연타] " + actor.name + "의 연타 공격 발동!");
            performNormalAttack(actor, target, curAllies, curEnemies);
          }
        }
      } else {
        logAction("🛡️ [무장 해제] " + actor.name + "은(는) 무장 해제 상태로 일반 공격을 할 수 없습니다.");
      }

      if (actor.skills.indexOf("지혜의 바람") !== -1) heal(actor, actor, 1.442, "지혜의 바람");
      if (actor.skills.indexOf("전쟁 조달") !== -1) heal(actor, actor, 1.10, "전쟁 조달");
    }

    triggerTurnEnd(allies, enemies, turn);
    triggerTurnEnd(enemies, allies, turn);
    decayStatusEffects(allies.concat(enemies));
  }

  // [전투 루프 종료 후 승패 판정 로직]
  var aHp = allies.reduce(function(x, y) { return x + Math.max(0, y.hp); }, 0);
  var bHp = enemies.reduce(function(x, y) { return x + Math.max(0, y.hp); }, 0);
  
  var winner = "무승부";
  
  // 8턴 종료 시점에서 한쪽이 완전히 전멸(0)했을 때만 승리, 둘 다 살아있으면 무승부
  if (aHp > 0 && bHp === 0) {
    winner = "A 덱";
  } else if (bHp > 0 && aHp === 0) {
    winner = "B 덱";
  } else {
    winner = "무승부";
  }

  logAction("=====================================================================");
  if (winner === "무승부") {
    logAction("🤝 전투 종료! 8턴 내에 어느 한쪽도 전멸하지 않아 무승부(Draw) 처리됩니다. (진행 턴수: " + Math.min(turn, 8) + ")");
  } else {
    logAction("🏆 전투 종료! 승리: " + winner + " (진행 턴수: " + Math.min(turn, 8) + ")");
  }
  logAction("A덱 최종 합계 병력: " + aHp + " | B덱 최종 합계 병력: " + bHp);
  logAction("=====================================================================");
  
  return {
    winner: winner, turns: Math.min(turn, 8),
    allies: allies, enemies: enemies
  };
}

function settleCampBonus(team) {
  var campCounts = {};
  team.forEach(function(c) {
    if (c.camp) campCounts[c.camp] = (campCounts[c.camp] || 0) + 1;
  });
  team.forEach(function(c) {
    var count = campCounts[c.camp] || 0;
    var mult = 1.0;
    if (count === 2) mult = 1.05;
    else if (count === 3) mult = 1.10;

    if (c.소열제Active && c.camp === "촉") {
      mult = (mult - 1.0) * 1.5 + 1.0;
    }

    if (mult > 1.0) {
      logAction("🏳️ [진영 결산] " + c.name + ": 동수 진영(" + c.camp + " " + count + "인) 보너스 적용 (모든 속성 +" + ((mult - 1.0) * 100).toFixed(0) + "%)");
    }

    c.force = Math.round(c.force * mult);
    c.intel = Math.round(c.intel * mult);
    c.command = Math.round(c.command * mult);
    c.speed = Math.round(c.speed * mult);
  });
}

function settleTroopBonus(team) {
  var troopCounts = {};
  team.forEach(function(c) {
    if (c.troop) troopCounts[c.troop] = (troopCounts[c.troop] || 0) + 1;
  });
  team.forEach(function(c) {
    var count = troopCounts[c.troop] || 0;
    var beforeD = c.damageDealtMod;
    var beforeT = c.damageTakenMod;

    if (c.troop === "방패병") {
      if (count === 2) c.damageTakenMod *= 0.965;
      else if (count === 3) c.damageTakenMod *= 0.95;
    } else if (c.troop === "궁병") {
      if (count === 2) c.damageDealtMod *= 1.035;
      else if (count === 3) c.damageDealtMod *= 1.05;
    } else if (c.troop === "창병") {
      if (count === 2) { c.damageDealtMod *= 1.021; c.damageTakenMod *= 0.986; }
      else if (count === 3) { c.damageDealtMod *= 1.03; c.damageTakenMod *= 0.98; }
    } else if (c.troop === "기병") {
      if (count === 2) { c.damageDealtMod *= 1.014; c.damageTakenMod *= 0.979; }
      else if (count === 3) { c.damageDealtMod *= 1.02; c.damageTakenMod *= 0.97; }
    }

    if (c.damageDealtMod !== beforeD || c.damageTakenMod !== beforeT) {
      logAction("🛡️ [병종 결산] " + c.name + ": 동수 병종(" + c.troop + " " + count + "인) 효과 적용");
    }
  });
}

function settleBondBonus(team, bonds, teamId) {
  bonds.forEach(function(bond) {
    
    // [인연 패치] 엔진에서 복잡하게 계산하지 않고, 오직 DB의 TRUE/FALSE 값만 참조!
    var isActive = (teamId === 'A') ? bond.activeA : bond.activeB;
    
    if (isActive) {
      // 인연 효과를 부여할 대상 찾기 (시트에 등록된 장수에게만 효과 적용)
      var matches = team.filter(function(c) { return bond.generals.indexOf(c.name) !== -1; });
      
      if (matches.length > 0) {
        logAction("🔗 [" + teamId + "덱 인연] DB 연동! '" + bond.name + "' 활성화 (적용 대상: " + matches.map(function(m){return m.name;}).join(", ") + ")");
        
        matches.forEach(function(c) {
          if (!c.tacticMods) c.tacticMods = {}; 

          // --- 28종 인연 버프 완벽 적용 ---
          if (bond.name === "강표의 호신") { c.command += 10; c.damageTakenMod *= 0.97; }
          else if (bond.name === "천하삼분") { c.damageTakenMod *= 0.94; }
          else if (bond.name === "도원결의") { c.도원결의Active = true; }
          else if (bond.name === "완벽한 조합") { c.tacticMods.spellDmgTaken = (c.tacticMods.spellDmgTaken || 0) + 0.06; }
          else if (bond.name === "황실의 인연") { c.tacticMods.weaponDmgTaken = (c.tacticMods.weaponDmgTaken || 0) + 0.06; }
          else if (bond.name === "소열제") { c.소열제Active = true; } // 1인 인연도 이제 정상 발동
          else if (bond.name === "오호상장") { c.critProb += 0.10; }
          else if (bond.name === "서량의 철기") { c.tacticMods.pursuitDmg = (c.tacticMods.pursuitDmg || 0) + 0.08; } 
          else if (bond.name === "서량의 영웅") { c.tacticMods.weaponDmg = (c.tacticMods.weaponDmg || 0) + 0.05; }
          else if (bond.name === "오국의 미녀") { c.intel += 20; }
          else if (bond.name === "노익장") { c.damageTakenMod *= 0.95; }
          else if (bond.name === "동오 대도독") { c.psyLifestealProb += 0.08; }
          else if (bond.name === "괄목상대") { c.tacticMods.activeDmgTaken = (c.tacticMods.activeDmgTaken || 0) + 0.12; }
          else if (bond.name === "좌우군 와해") { c.force += 20; }
          else if (bond.name === "만궁일격") { c.tacticMods.normalDmg = (c.tacticMods.normalDmg || 0) + 0.08; }
          else if (bond.name === "경건한 의식") { c.command += 20; }
          else if (bond.name === "강동의 대업") { c.tacticMods.dmgDealt = (c.tacticMods.dmgDealt || 0) + 0.07; }
          else if (bond.name === "신정 격전") { c.force += 20; }
          else if (bond.name === "오자양장") { c.pierce += 0.06; }
          else if (bond.name === "우아한 자태") { c.우아한자태Active = true; } 
          else if (bond.name === "깊은 의리") { c.pierce += 0.06; }
          else if (bond.name === "난세의 미인") { c.shieldStacks = (c.shieldStacks || 0) + 2; }
          else if (bond.name === "5대 군사") { c.insight += 0.05; c.damageTakenMod *= 0.96; }
          else if (bond.name === "한말의 혼란") { c.command += 20; }
          else if (bond.name === "서촉의 지혜") { c.tacticMods.spellDmgTaken = (c.tacticMods.spellDmgTaken || 0) + 0.08; }
          else if (bond.name === "황건봉기") { c.tacticMods.activeProb = (c.tacticMods.activeProb || 0) + 0.08; }
          else if (bond.name === "하북 정장") { c.force += 20; }
          else if (bond.name === "궁술 대결") { c.pierce += 0.05; }
        });
      }
    }
  });
}

function settleFormationBonus(team, formation) {
  if (!formation) return;
  
  team.forEach(function(c) {
    // 1. 덱 빌더 배치 순서(장수1=idx0, 장수2=idx1, 장수3=idx2)에 따른 위치 및 피격률 강제 매칭
    if (formation.indexOf("일자진") !== -1) {
      c.position = "전열";
      c.hitWeight = (c.idx === 1) ? 34 : 33;
    } else if (formation.indexOf("기형진") !== -1 || formation.indexOf("어린진") !== -1) {
      c.position = (c.idx === 0) ? "전열" : "후열";
      c.hitWeight = (c.idx === 0) ? 60 : 20;
    } else if (formation.indexOf("안형진") !== -1) {
      c.position = (c.idx === 0) ? "후열" : "전열";
      c.hitWeight = (c.idx === 0) ? 20 : 40;
    } else if (formation.indexOf("방원진") !== -1) {
      c.position = (c.idx === 2) ? "후열" : "전열";
      c.hitWeight = (c.idx === 2) ? 20 : 40;
    } else if (formation.indexOf("추형진") !== -1) {
      c.position = (c.idx === 1) ? "전열" : "후열";
      c.hitWeight = (c.idx === 1) ? 60 : 20;
    } else {
      c.hitWeight = 33;
    }

    var isFront = (c.position === "전열");
    var isBack = (c.position === "후열");

    // 2. 진형 스탯 버프 결산
    if (formation.indexOf("일자진") !== -1) {
      if (isFront) { c.damageTakenMod *= 0.92; logAction("📐 [진형 결산] " + c.name + ": 일자진 " + c.position + " 배치 (받는 피해 8% 감소, 피격률 " + c.hitWeight + "%)"); }
    } else if (formation.indexOf("기형진") !== -1) {
      if (isFront) { c.damageTakenMod *= 0.94; logAction("📐 [진형 결산] " + c.name + ": 기형진 전열 배치 (받는 피해 6% 감소, 피격률 " + c.hitWeight + "%)"); }
      if (isBack) { c.damageDealtMod *= 1.12; logAction("📐 [진형 결산] " + c.name + ": 기형진 후열 배치 (주는 피해 12% 증가, 피격률 " + c.hitWeight + "%)"); }
    } else if (formation.indexOf("안형진") !== -1) {
      if (isFront) { c.command += 20; logAction("📐 [진형 결산] " + c.name + ": 안형진 전열 배치 (통솔 +20, 피격률 " + c.hitWeight + "%)"); }
      if (isBack) { c.damageDealtMod *= 1.15; logAction("📐 [진형 결산] " + c.name + ": 안형진 후열 배치 (주는 피해 15% 증가, 피격률 " + c.hitWeight + "%)"); }
    } else if (formation.indexOf("방원진") !== -1) {
      if (isFront) { c.damageTakenMod *= 0.95; logAction("📐 [진형 결산] " + c.name + ": 방원진 전열 배치 (받는 피해 5% 감소, 피격률 " + c.hitWeight + "%)"); }
      if (isBack) { c.doubleAttackProb += 0.40; logAction("📐 [진형 결산] " + c.name + ": 방원진 후열 배치 (연타 확률 +40%, 피격률 " + c.hitWeight + "%)"); }
    } else if (formation.indexOf("추형진") !== -1) {
      if (isFront) { c.damageDealtMod *= 1.16; logAction("📐 [진형 결산] " + c.name + ": 추형진 전열 배치 (주는 피해 16% 증가, 피격률 " + c.hitWeight + "%)"); }
      if (isBack) { c.damageTakenMod *= 0.95; logAction("📐 [진형 결산] " + c.name + ": 추형진 후열 배치 (받는 피해 5% 감소, 피격률 " + c.hitWeight + "%)"); }
    } else if (formation.indexOf("어린진") !== -1) {
      if (isFront) { c.dodgeProb += 0.12; logAction("📐 [진형 결산] " + c.name + ": 어린진 전열 배치 (회피 확률 +12%, 피격률 " + c.hitWeight + "%)"); }
      if (isBack) { c.critProb += 0.08; c.spellCritProb += 0.08; logAction("📐 [진형 결산] " + c.name + ": 어린진 후열 배치 (회심/묘책 확률 +8%, 피격률 " + c.hitWeight + "%)"); }
    }
  });
}

function settleStrategyBonus(team) {
  team.forEach(function(c) {
// =========================================================
    // 📖 [신규 패치] 78종 공용 병법 100% 파싱 시스템 (공백 제거 포함)
    // =========================================================
    c.tacticMods = {
        // [주는 피해 증감]
        dmgDealt: 0, dmgDealtDebuffed: 0, dmgDealtToHighestHp: 0, dmgDealtToOppositeSex: 0,
        dmgDealtIfBack: 0, dmgDealtIfFront: 0, dmgDealtToFront: 0, dmgDealtToLowerCommand: 0,
        weaponDmg: 0, weaponDmgTurn4: 0, weaponDmgOdd: 0, 
        spellDmg: 0, spellDmgFromTurn4: 0, spellDmgEven: 0, activeDmg: 0,
        
        // [받는 피해 증감]
        dmgTaken: 0, dmgTakenTurn4: 0, dmgTakenIfBack: 0, dmgTakenIfFront: 0,
        weaponDmgTaken: 0, weaponDmgTakenTurn4: 0, spellDmgTaken: 0, spellDmgTakenEven: 0,
        
        // [확률 및 스탯 보정]
        critProbOdd: 0, critProbTurn3: 0, spellCritProbEven: 0, 
        pierceOdd: 0, lifestealOdd: 0, psyLifestealEven: 0,
        dodgeTurn4: 0, dodgeIfFront: 0, activeProb: 0, activeProbTurn3: 0, counterProb: 0,
        
        // [치유량 증감]
        healTaken: 0, healTakenIfFront: 0, healDone: 0, healDoneToFront: 0,
        
        // [전투 중첩형 (Stack) 카운터]
        stackWeaponDmg: 0, stackSpellDmg: 0, stackPierce: 0, stackForceUp: 0, 
        stackDmgTakenDown: 0, stackDmgDealtUp: 0, stackDmgTakenUpByAlly: 0, stackSpellCrit: 0,
        
        // [특수 트리거]
        ignoreDodgeFirstHit: false, dmgTakenDownAfterActive: false
    };

    var appliedCommonStrats = [];

    // 병법.csv 78종 전체 목록
    var knownCommons = [
        "왕도", "시리", "작전", "승전", "구전", "병도", "요적", "기지", "탈계", "심리", "현기", "군쟁", "기동", "귀모", "여심", "임시", "호익", "불양", "강전", "적무", "선전", "속오", "피험", "병정", "수세", "수토", "기예", "금고", "승민", "합전", "겸자", "모전", "연지", "연사", "문무", "치병", "군용", "무열", "기임", "근선", "병교", "적용", "적모", "합모", "선용", "위수", "임봉", "대파", "절봉", "병령", "호세", "저력", "연기", "고무", "선위", "원도", "선지", "비전", "정시", "피용", "겁지", "적복", "분적", "적음", "공적", "파적", "득세", "차세", "원관", "고군", "분합", "분치", "삼청", "모복", "후기", "약지", "모령", "위지"
    ];

    c.strategies.forEach(function(strat) {
        if (!strat) return;
        var s = strat.trim(); 
        
        // --- 1. 고유 병법 ---
        if (s.indexOf("출사표") !== -1) { c.intel += 15; logAction("📖 [고유병법] " + c.name + ": '출사표' 효과 (지력 +15)"); }
        else if (s.indexOf("철기령") !== -1) { c.critProb += 0.06; c.critDamageMod = 0.10; logAction("📖 [고유병법] " + c.name + ": '철기령' 적용"); }
        else if (knownCommons.indexOf(s) !== -1) { appliedCommonStrats.push(s); }

        // --- 2. 78종 공용 병법 파싱 분기 ---
        
        // (1) 주는 피해 증감
        if (s === "왕도") c.tacticMods.dmgDealt += 0.05;
        else if (s === "시리") c.tacticMods.dmgDealtDebuffed += 0.08;
        else if (s === "작전") c.tacticMods.weaponDmg += 0.065;
        else if (s === "승전") c.tacticMods.weaponDmgTurn4 += 0.08;
        else if (s === "병도") c.tacticMods.weaponDmgOdd += 0.099;
        else if (s === "요적") c.tacticMods.spellDmg += 0.06;
        else if (s === "기지") c.tacticMods.spellDmgFromTurn4 += 0.10;
        else if (s === "심리") c.tacticMods.spellDmgEven += 0.09;
        else if (s === "현기") c.tacticMods.dmgDealtIfBack += 0.06;
        else if (s === "군쟁") c.tacticMods.dmgDealtToFront += 0.08;
        else if (s === "적무") c.tacticMods.dmgDealtIfFront += 0.055;
        else if (s === "속오") c.tacticMods.dmgDealtToLowerCommand += 0.055;
        else if (s === "불양") c.tacticMods.dmgDealtToOppositeSex += 0.07;
        else if (s === "강전") c.tacticMods.dmgDealtToHighestHp += 0.07;
        
        // (2) 전법 및 특수 발동
        else if (s === "기동") c.tacticMods.activeProb += 0.03;
        else if (s === "여심") c.tacticMods.activeProbTurn3 += 0.05;
        else if (s === "귀모") c.tacticMods.activeDmg += 0.08;
        else if (s === "임시") c.tacticMods.dmgTakenDownAfterActive = true; 
        else if (s === "호익") c.tacticMods.ignoreDodgeFirstHit = true; 

        // (3) 받는 피해 증감
        else if (s === "피험") c.tacticMods.dmgTaken += 0.045;
        else if (s === "병정") c.tacticMods.dmgTakenTurn4 += 0.06;
        else if (s === "수세") c.tacticMods.dmgTakenIfBack += 0.05;
        else if (s === "수토") c.tacticMods.dmgTakenIfFront += 0.05;
        else if (s === "합전") c.tacticMods.weaponDmgTaken += 0.055;
        else if (s === "선전") c.tacticMods.weaponDmgTakenTurn4 += 0.09;
        else if (s === "모전") c.tacticMods.spellDmgTaken += 0.055;
        else if (s === "연지") c.tacticMods.spellDmgTakenEven += 0.09;

        // (4) 스탯 즉시 반영 병법
        else if (s === "겸자") c.force += c.intel * 0.12;
        else if (s === "문무") c.intel += c.force * 0.12;
        else if (s === "연사") c.command += 15;
        else if (s === "기예") c.dodgeProb += 0.045;
        else if (s === "승민") c.tacticMods.dodgeIfFront += 0.05;
        else if (s === "금고") c.tacticMods.dodgeTurn4 += 0.06;
        else if (s === "적복") c.critProb += 0.03;
        else if (s === "삼청") c.spellCritProb += 0.03;
        else if (s === "파적") c.pierce += 0.06;
        else if (s === "약지") c.insight += 0.06;
        else if (s === "원관") c.lifestealProb += 0.05;
        else if (s === "모령") c.psyLifestealProb += 0.05;
        else if (s === "분합") c.tacticMods.counterProb += 0.08;

        // (5) 확률 조건부 보정
        else if (s === "분적") c.tacticMods.critProbOdd += 0.055;
        else if (s === "적음") c.tacticMods.critProbTurn3 += 0.05;
        else if (s === "모복") c.tacticMods.spellCritProbEven += 0.055;
        else if (s === "차세") c.tacticMods.pierceOdd += 0.09;
        else if (s === "고군") c.tacticMods.lifestealOdd += 0.08;
        else if (s === "위지") c.tacticMods.psyLifestealEven += 0.09;
        
        // (6) 치유 증감
        else if (s === "치병") c.tacticMods.healTaken += 0.06;
        else if (s === "군용") c.tacticMods.healTakenIfFront += 0.08;
        else if (s === "고무") c.tacticMods.healDone += 0.06;
        else if (s === "연기") c.tacticMods.healDoneToFront += 0.08;
        
        // (7) 아군 시너지 및 연계 버프 (비전, 선지, 선위, 피용, 겁지 등은 초기화 시 팀 버퍼에 별도 반영 요망)
        // (현재 객체에 속성만 부여하고 Combat.js나 Engine.js 아군 버프 페이즈에서 처리)
    });

    if (appliedCommonStrats.length > 0) {
        logAction("📖 [공용병법 스캔] " + c.name + " (" + appliedCommonStrats.length + "종 적용): " + appliedCommonStrats.join(", "));
    }
  });
}

function triggerBattleStart(team, opponent) {
  team.forEach(function(c) {
    if (c.skills.indexOf("초선차전") !== -1) {
      // 기획 DB의 심리 공격 흡혈률에 맞춰 수치를 조절하세요 (예: 50% 흡혈이면 0.5)
      c.psyLifestealProb += 0.24; 
      logAction("🧠 [패시브] 제갈량의 '초선차전' 적용! 24% 심리 공격(책략 피해 흡혈) 버프를 획득합니다.");
    }
    if (c.name === "유비") {
      team.forEach(function(ally) { ally.command += 18; });
      logAction("👑 [지휘] 유비의 '백성과 함께' 발동! 아군 전체 통솔을 18 증가시킵니다.");
    }
    if (c.name === "곽가") {
      c.activeRateBonus = Math.min(0.3, c.activeRateBonus + 0.06);
      var highIntel = team.sort(function(x, y) { return y.intel - x.intel; })[0];
      if (highIntel) {
        highIntel.activeRateBonus = Math.min(0.3, highIntel.activeRateBonus + 0.06);
        logAction("🧠 [지휘] 곽가의 고유 버프! 곽가와 " + highIntel.name + "의 액티브 전법 발동률이 6% 증가합니다.");
      }
    }
    if (c.skills.indexOf("신의 가호") !== -1) {
      c.activeRateBonus = Math.min(0.3, c.activeRateBonus + 0.08);
      logAction("✨ [패시브] '신의 가호' 발동! " + c.name + "의 액티브 전법 발동률이 8% 증가합니다.");
    }
    if (c.skills.indexOf("결사의 다짐") !== -1) { 
      var frontRow = team.find(function(ally) { return ally.position === "전열"; }) || team[0];
      if (frontRow) {
        frontRow.damageTakenMod = Math.max(0.6, frontRow.damageTakenMod - 0.2);
        logAction("🛡️ [지휘] 결사의 다짐 발동! 전열 무장의 받는 피해가 20% 감소합니다.");
      }
    }
    if (c.skills.indexOf("전쟁 종식") !== -1) {
      logAction("🛡️ [지휘] 전쟁 종식 발동! 전투 시작 시 아군 전체가 첫 3턴간 방어막 획득을 준비합니다.");
    }
    if (c.skills.indexOf("허점 공략") !== -1) { 
      c.허점공략State = 4;
      var targetAllies = team.filter(function(a) { return a.name !== c.name; }); // 자신 제외 우군 필터링
      if (targetAllies.length > 0) {
        var rAlly = targetAllies[Math.floor(Math.random() * targetAllies.length)];
        rAlly.허점공략State = 4;
      }
      logAction("🛡️ [지휘] 허점 공략 발동! 4턴간 자신과 우군의 받는 피해가 27.56% 감소합니다.");
    }
    if (c.skills.indexOf("정의의 희생") !== -1) { 
      team.forEach(function(ally) { ally.doubleAttackProb = Math.min(0.8, ally.doubleAttackProb + 0.3); });
      c.fear = 2;
      var highestForceAlly = team.sort(function(x, y) { return y.force - x.force; })[0];
      if (highestForceAlly) {
        highestForceAlly.regenState = 2;
      }
      logAction("💤 [지휘] 정의의 희생 발동! 아군 전체 연타 확률 증가 및 최고 무력 아군 정신 회복 부여. 시전자는 2턴 공포.");
    }
    if (c.skills.indexOf("예리한 통찰") !== -1) { 
      c.pierce = Math.min(0.5, c.pierce + 0.16);
      c.damageDealtMod = Math.min(2.0, c.damageDealtMod + 0.35);
      logAction("⚔️ [패시브] 예리한 통찰 적용! 주는 피해 및 관통력 증가.");
    }
    if (c.skills.indexOf("기병 돌격") !== -1) {
      c.critProb += 0.15;
      logAction("🏇 [패시브] 마초의 '기병 돌격' 적용! 회심 확률이 15% 증가합니다.");
    }
    if (c.skills.indexOf("용맹한 삼군") !== -1) {
      c.lifestealProb = Math.min(0.5, c.lifestealProb + 0.30);
      logAction("🩸 [패시브] '용맹한 삼군' 적용! 회유(피흡)가 30% 증가합니다.");
    }
    if (c.skills.indexOf("늠름한 자태") !== -1) { 
      c.doubleAttackProb += 0.636; c.damageDealtMod *= 1.103; 
      logAction("✨ [패시브] '늠름한 자태' 적용 (연타 +63.6%, 주는 피해 +10.3%)"); 
    }
    if (c.skills.indexOf("신속전개") !== -1) { 
      c.speed += 30; c.dodgeProb += 0.16; 
      logAction("✨ [패시브] '신속전개' 적용 (선공 +30, 회피 +16%)"); 
    }
    if (c.skills.indexOf("충신의 기재") !== -1) { 
      c.spellCritProb += 0.24; 
      logAction("✨ [패시브] '충신의 기재' 적용 (묘책 확률 +24%)"); 
    }
    if (c.skills.indexOf("침착한 지휘") !== -1) {
      c.command += 30; // 시작 통솔 고정 증가 (영구 누적 방지)
      logAction("🛡️ [지휘] 우금의 '침착한 지휘' 발동! 통솔이 30 증가합니다.");
    }
    if (c.skills.indexOf("기병 돌격") !== -1) {
      c.critProb += 0.45; // 15% -> 45% 로 수정
      logAction("🏇 [패시브] 마초의 회심 확률이 45% 증가합니다.");
    }
  });
}

function triggerTurnStart(team, opponent, turn) {
  team.forEach(function(c) {
    c.인의론TurnTriggered = false; // 매 턴 유비 고유 병법 횟수 제한 초기화
    
    // 제갈량 고유 병법 '출사표' ---
    if (c.strategies && c.strategies.indexOf("출사표") !== -1) {
      if (turn % 2 === 1) { // 홀수 턴 (적군 2명 약화)
        var aliveOpp = getWeightedRandomTargets(opponent.filter(function(e) { return e.hp > 0; }), 2);
        for(var t=0; t<aliveOpp.length; t++) {
          aliveOpp[t].damageTakenMod += 0.12;
          aliveOpp[t].출사표Debuff = 1; // 1턴 유지
          logAction("📖 [고유병법] '출사표' 발동! " + aliveOpp[t].name + "의 받는 피해가 1턴간 12% 증가합니다.");
        }
      } else { // 짝수 턴 (아군 2명 강화)
        var aliveTeam = team.filter(function(a) { return a.hp > 0; }).sort(function() { return Math.random() - 0.5; });
        for(var t=0; t<Math.min(2, aliveTeam.length); t++) {
          aliveTeam[t].damageTakenMod -= 0.12;
          aliveTeam[t].출사표Buff = 1; // 1턴 유지
          logAction("📖 [고유병법] '출사표' 발동! " + aliveTeam[t].name + "의 받는 피해가 1턴간 12% 감소합니다.");
        }
      }
    }
    if (c.name === "대교") {
      // 1. 고유 병법 '상사문부' 장착 여부 확인
      var hasSangSa = (c.strategies && c.strategies.indexOf("상사문부") !== -1);
      
      // 2. 아군 2명 회복 (상사문부 적용 시 치유율 1.8 -> 0.9로 50% 감소)
      var healCoef = hasSangSa ? 0.9 : 1.8; 
      var aliveTeam = team.filter(function(ally) { return ally.hp > 0; });
      aliveTeam.sort(function() { return Math.random() - 0.5; });
      
      if (hasSangSa) logAction("📖 [고유병법] '상사문부' 적용! 대교의 국색 치유량이 50% 감소합니다.");
      
      for (var t = 0; t < Math.min(2, aliveTeam.length); t++) {
        heal(c, aliveTeam[t], healCoef, "국색");
      }

      // 3. 적군 디버프 부여 (상사문부 적용 시 적군 전체, 미적용 시 2명)
      var aliveOpponents = opponent.filter(function(e) { return e.hp > 0; });
      var targetCount = hasSangSa ? aliveOpponents.length : 2;
      
      if (hasSangSa) logAction("📖 [고유병법] '상사문부' 적용! 국색 디버프가 적군 전체로 확대됩니다.");
      
      var aliveOpp = getWeightedRandomTargets(aliveOpponents, targetCount);
      for (var t = 0; t < aliveOpp.length; t++) {
        aliveOpp[t].국색State = 1; // 기획서 기준: 1턴 지속
        logAction("🌸 [국색] " + aliveOpp[t].name + "에게 디버프 부여 (1턴간 받는 피해 20% 증가)");
        
        // 4. 여기서 onDebuffInflicted가 호출되며, 수정된 세금 과징수 로직이 대상마다 1번씩 발동
        onDebuffInflicted(c, aliveOpp[t], team, opponent);
      }
    }
    if (c.skills.indexOf("전쟁 종식") !== -1 && turn <= 3) {
      team.forEach(function(ally) {
        if (ally.hp > 0 && Math.random() < 0.65) {
          ally.shieldStacks++;
          logAction("🧱 [전쟁 종식] " + ally.name + "이(가) 방어막 1스택을 획득했습니다.");
        }
      });
    }
    if (c.skills.indexOf("비상한 전략") !== -1) { 
      var aliveOpp = opponent.filter(function(e) { return e.hp > 0; });
      if (aliveOpp.length > 0) {
        var rEnemy = aliveOpp[Math.floor(Math.random() * aliveOpp.length)];
        dealDamage(c, rEnemy, 1.272 * (1 + (turn - 1) * 0.1), '책략', '비상한 전략', team, opponent);
      }
    }
    if (c.skills.indexOf("광풍의 분노") !== -1) { 
      if (turn === 2 || turn === 4) {
        team.concat(opponent).forEach(function(char) { char.stormState = 2; });
        logAction("🌪️ [광풍의 분노] 전장에 모래폭풍이 몰아칩니다! 모든 무장 폭풍 상태 돌입.");
      }
      var aliveOpp = opponent.filter(function(e) { return e.hp > 0; });
      if (turn % 2 === 1) {
        aliveOpp.forEach(function(enemy) { dealDamage(c, enemy, 1.0, '책략', '광풍의 분노', team, opponent); });
      } else {
        if (aliveOpp.length > 0) {
          dealDamage(c, aliveOpp[Math.floor(Math.random() * aliveOpp.length)], 2.8, '책략', '광풍의 분노', team, opponent);
        }
      }
    }
    if (c.skills.indexOf("보급 차단") !== -1) {
      var aliveOpp = opponent.filter(function(e) { return e.hp > 0; });
      if (aliveOpp.length > 0) {
        var rEnemy = aliveOpp[Math.floor(Math.random() * aliveOpp.length)];
        rEnemy.grainExhaustState = 2;
        logAction("🌾 [보급 차단] " + rEnemy.name + "에게 군량 고갈 상태를 2턴 동안 부여합니다.");
        onDebuffInflicted(c, rEnemy, team, opponent);
      }
    }
    if (c.skills.indexOf("문과 무") !== -1 && Math.random() < 0.6) {
      var aliveOpp = opponent.filter(function(e) { return e.hp > 0; });
      for (var t = 0; t < Math.min(2, aliveOpp.length); t++) {
        var target = aliveOpp[Math.floor(Math.random() * aliveOpp.length)];
        var dmgType = Math.random() < 0.5 ? '병기' : '책략';
        dealDamage(c, target, 1.5, dmgType, '문과 무', team, opponent);
      }
    }
    if (c.skills.indexOf("백리의성") !== -1 && turn === 4) {
      c.command += 40;
      logAction("🛡️ [백리의성] 4턴째 발동! 서성의 통솔이 40 증가합니다.");
      opponent.forEach(function(e) {
        if (e.hp > 0) {
          e.floodState = 2;
          logAction("🌊 [백리의성] 적 " + e.name + "에게 홍수를 2턴 부여합니다.");
          onDebuffInflicted(c, e, team, opponent);
        }
      });
    }
  });
}

function triggerTurnEnd(team, opponent, turn) {
  team.forEach(function(c) {
    if (c.hp <= 0) return;
    if (c.name === "화타") {
      var lowestHpAlly = team.filter(function(ally) { return ally.hp > 0; }).sort(function(x, y) { return x.hp - y.hp; })[0];
      if (lowestHpAlly) {
        lowestHpAlly.damageTakenMod = Math.max(0.5, lowestHpAlly.damageTakenMod - 0.16);
        lowestHpAlly.regenState = 2;
        logAction("🩺 [마비산] 화타가 가장 병력이 낮은 " + lowestHpAlly.name + "에게 방어 버프를 부여합니다.");
        heal(c, lowestHpAlly, 2.4, "마비산");
      }
    }
    if (c.name === "유비") {
      team.forEach(function(ally) {
        heal(c, ally, 1.0, "백성과 함께", team);
      });
      var lowestHpAlly = team.filter(function(ally) { return ally.hp > 0; }).sort(function(x, y) { return x.hp - y.hp; })[0];
      if (lowestHpAlly) {
        // 현재 걸려있는 제어 디버프 스캔
        var debuffs = [];
        if (lowestHpAlly.silence > 0) debuffs.push('silence');
        if (lowestHpAlly.disarm > 0) debuffs.push('disarm');
        if (lowestHpAlly.fear > 0) debuffs.push('fear');
        if (lowestHpAlly.weakness > 0) debuffs.push('weakness');
        if (lowestHpAlly.confusion > 0) debuffs.push('confusion');
        
        if (debuffs.length > 0) {
          // 디버프 1개 랜덤 제거
          var toRemove = debuffs[Math.floor(Math.random() * debuffs.length)];
          lowestHpAlly[toRemove] = 0;
          logAction("✨ [백성과 함께] 유비가 " + lowestHpAlly.name + "의 제어 효과 1개를 정화합니다!");
        }
        heal(c, lowestHpAlly, 0.9, "백성과 함께", team);
      }
    }
    if (c.skills.indexOf("평화의 기운") !== -1) { 
      var frontRow = team.find(function(ally) { return ally.position === "전열" && ally.hp > 0; });
      if (frontRow) heal(c, frontRow, 0.954, "평화의 기운");
    }
    if (c.skills.indexOf("보급 차단") !== -1) {
      opponent.forEach(function(enemy) {
        if (enemy.hp > 0 && enemy.grainExhaustState > 0) {
          dealDamage(c, enemy, 1.1, '책략', '보급 차단 (종료 피해)', team, opponent);
        }
      });
    }
  });
}