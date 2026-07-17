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
  settleBondBonus(allies, bonds);
  settleBondBonus(enemies, bonds);
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
    queue.sort(function(x, y) { return y.speed - x.speed; });

    logAction("📢 행동 순서 판정: " + queue.map(function(c) { return c.name + "(" + c.speed + ")"; }).join(" ➔ "));

    for (var q = 0; q < queue.length; q++) {
      var actor = queue[q];
      if (actor.hp <= 0) continue;

      logAction("👉 [" + actor.name + " (" + actor.deck + "덱)] 행동 시작 (현재 병력: " + actor.hp + ")");
      if (actor.fear > 0) {
        logAction("💤 [공포] " + actor.name + "은(는) 공포 상태로 행동 불능입니다.");
        continue;
      }

      var curAllies = (actor.deck === 'A') ? allies : enemies;
      var curEnemies = (actor.deck === 'A') ? enemies : allies;

      if (actor.도원결의Active && turn === 3) {
        logAction("🔗 [도원결의] 3턴째 행동 개시 전, " + actor.name + "의 모든 제어 효과를 정화합니다!");
        actor.silence = 0; actor.disarm = 0; actor.fear = 0; actor.weakness = 0;
      }

      if (actor.silence <= 0) {
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
              actor.preparedSkill = sName;
              logAction("⏳ [준비] " + actor.name + "이(가) '" + sName + "' 시전을 위한 준비 상태에 들어갑니다.");
            }
            continue;
          }

          var prob = getSkillProb(sName, actor.name) + actor.activeRateBonus;
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
      }

      if (actor.disarm <= 0) {
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

  var aHp = allies.reduce(function(x, y) { return x + Math.max(0, y.hp); }, 0);
  var bHp = enemies.reduce(function(x, y) { return x + Math.max(0, y.hp); }, 0);
  var winner = "무승부";
  if (aHp > bHp) winner = "A 덱";
  else if (bHp > aHp) winner = "B 덱";

  logAction("=====================================================================");
  logAction("🏆 전투 종료! 승리: " + winner + " (진행 턴수: " + Math.min(turn, 8) + ")");
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

function settleBondBonus(team, bonds) {
  bonds.forEach(function(bond) {
    var matches = team.filter(function(c) { return bond.generals.indexOf(c.name) !== -1; });
    if (matches.length >= 2) {
      logAction("🔗 [인연 결산] '" + bond.name + "' 활성화! (대상 무장: " + matches.map(function(m){return m.name;}).join(", ") + ")");
      matches.forEach(function(c) {
        if (bond.name === "강표의 호신") { c.command += 10; c.damageTakenMod *= 0.97; }
        else if (bond.name === "천하삼분") { c.damageTakenMod *= 0.94; }
        else if (bond.name === "도원결의") { c.도원결의Active = true; }
        else if (bond.name === "완벽한 조합") { c.damageTakenMod *= 0.94; }
        else if (bond.name === "황실의 인연") { c.damageTakenMod *= 0.94; }
        else if (bond.name === "소열제") { c.소열제Active = true; }
        else if (bond.name === "오호상장") { c.critProb += 0.10; }
        else if (bond.name === "서량의 철기") { c.damageDealtMod *= 1.08; }
        else if (bond.name === "서량의 영웅") { c.damageDealtMod *= 1.05; }
        else if (bond.name === "오국의 미녀") { c.intel += 20; }
        else if (bond.name === "노익장") { c.damageTakenMod *= 0.95; }
        else if (bond.name === "동오 대도독") { c.damageDealtMod *= 1.08; }
        else if (bond.name === "괄목상대") { c.damageTakenMod *= 0.88; }
      });
    }
  });
}

function settleFormationBonus(team, formation) {
  if (!formation) return;
  team.forEach(function(c) {
    var isFront = (c.position === "전열");
    var isBack = (c.position === "후열");

    if (formation.indexOf("일자진") !== -1) {
      if (isFront) { c.damageTakenMod *= 0.92; logAction("📐 [진형 결산] " + c.name + ": 일자진 전열 배치 (받는 피해 8% 감소)"); }
    } else if (formation.indexOf("기형진") !== -1) {
      if (isFront) { c.damageTakenMod *= 0.94; logAction("📐 [진형 결산] " + c.name + ": 기형진 전열 배치 (받는 피해 6% 감소)"); }
      if (isBack) { c.damageDealtMod *= 1.12; logAction("📐 [진형 결산] " + c.name + ": 기형진 후열 배치 (주는 피해 12% 증가)"); }
    } else if (formation.indexOf("안형진") !== -1) {
      if (isFront) { c.command += 20; logAction("📐 [진형 결산] " + c.name + ": 안형진 전열 배치 (통솔 +20)"); }
      if (isBack) { c.damageDealtMod *= 1.15; logAction("📐 [진형 결산] " + c.name + ": 안형진 후열 배치 (주는 피해 15% 증가)"); }
    } else if (formation.indexOf("방원진") !== -1) {
      if (isFront) { c.damageTakenMod *= 0.95; logAction("📐 [진형 결산] " + c.name + ": 방원진 전열 배치 (받는 피해 5% 감소)"); }
      if (isBack) { c.doubleAttackProb += 0.40; logAction("📐 [진형 결산] " + c.name + ": 방원진 후열 배치 (연타 확률 +40%)"); }
    } else if (formation.indexOf("추형진") !== -1) {
      if (isFront) { c.damageDealtMod *= 1.16; logAction("📐 [진형 결산] " + c.name + ": 추형진 전열 배치 (주는 피해 16% 증가)"); }
      if (isBack) { c.damageTakenMod *= 0.95; logAction("📐 [진형 결산] " + c.name + ": 추형진 후열 배치 (받는 피해 5% 감소)"); }
    } else if (formation.indexOf("어린진") !== -1) {
      if (isFront) { c.dodgeProb += 0.12; logAction("📐 [진형 결산] " + c.name + ": 어린진 전열 배치 (회피 확률 +12%)"); }
      if (isBack) { c.critProb += 0.08; c.spellCritProb += 0.08; logAction("📐 [진형 결산] " + c.name + ": 어린진 후열 배치 (회심/묘책 확률 +8%)"); }
    }
  });
}

function settleStrategyBonus(team) {
  team.forEach(function(c) {
    c.strategies.forEach(function(strat) {
      if (!strat) return;
      // [병법.csv 전담] 향후 DB에 등록된 고유/공용 병법만 이곳에 추가됩니다.
      if (strat.indexOf("출사표") !== -1) { c.intel += 15; logAction("📖 [고유병법] " + c.name + ": '출사표' 효과 (지력 +15)"); }
      else if (strat.indexOf("철기령") !== -1) { c.critProb += 0.06; logAction("📖 [고유병법] " + c.name + ": '철기령' 효과 (회심 +6%)"); }
      else if (strat.indexOf("인의론") !== -1) { c.damageTakenMod *= 0.95; logAction("📖 [고유병법] " + c.name + ": '인의론' 효과 (받는피해 5% 감소)"); }
    });
  });
}

function triggerBattleStart(team, opponent) {
  team.forEach(function(c) {
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
      var frontRow = team.find(function(ally) { return ally.idx === 0; }) || team[0];
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
    if (c.name === "대교") {
      // 1. 아군 2명 회복
      var aliveTeam = team.filter(function(ally) { return ally.hp > 0; });
      aliveTeam.sort(function() { return Math.random() - 0.5; });
      for (var t = 0; t < Math.min(2, aliveTeam.length); t++) {
        heal(c, aliveTeam[t], 1.8, "국색");
      }
      // 2. 적군 2명 디버프 (이곳으로 이동통합)
      var aliveOpp = opponent.filter(function(e) { return e.hp > 0; });
      aliveOpp.sort(function() { return Math.random() - 0.5; }); 
      for (var t = 0; t < Math.min(2, aliveOpp.length); t++) {
        aliveOpp[t].국색State = 2;
        logAction("🌸 [국색] " + aliveOpp[t].name + "에게 디버프 부여 (2턴간 받는 피해 20% 증가)");
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
      team.forEach(function(ally) { heal(c, ally, 1.0, "백성과 함께"); });
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
        heal(c, lowestHpAlly, 0.9, "백성과 함께");
      }
    }
    if (c.skills.indexOf("평화의 기운") !== -1) { 
      var frontRow = team.find(function(ally) { return ally.idx === 0 && ally.hp > 0; });
      if (frontRow) heal(c, frontRow, 0.954, "평화의 기운");
    }
    if (c.skills.indexOf("보급 차단") !== -1) {
      opponent.forEach(function(enemy) {
        if (enemy.hp > 0 && enemy.grainExhaustState > 0) {
          dealDamage(c, enemy, 1.1, '책략', '보급 차단 (종료 피해)', team, opponent);
        }
      });
    }
    if (c.regenState > 0) {
      heal(c, c, 1.0, "정신 회복");
    }
  });
}