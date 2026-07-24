/**
 * Engine.gs
 * 포진 결산(진영/병종/인연/진형/병법/건물), 턴 시작/종료 지휘 효과, 전투 시뮬레이션 메인 루프 전담
 */

var turn = 0;

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
  settleBuildingBonus(allies);
  settleBuildingBonus(enemies);
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
  
  for (turn = 1; turn <= 8; turn++) {
    var alliesAlive = allies.some(function(c) { return c.hp > 0; });
    var enemiesAlive = enemies.some(function(c) { return c.hp > 0; });
    if (!alliesAlive || !enemiesAlive) break;

    logAction("---------------------------------------------------------------------");
    logAction("▶️ [턴 " + turn + " 시작]");
    logAction("---------------------------------------------------------------------");

    allies.forEach(function(c) { c.damageDealtThisTurn = 0; c.damageTakenThisTurn = 0; c.용담Count = 0; c.척살Count = 0; c.용의포효Count = 0; c.제갈량Count = 0; c.신의가호Count = 0; c.세금과징수Count = 0; c.독설가Count = 0; c.패잔병척결Count = 0; c.counterCount = 0; c.기지의승리Count = 0; });
    enemies.forEach(function(c) { c.damageDealtThisTurn = 0; c.damageTakenThisTurn = 0; c.용담Count = 0; c.척살Count = 0; c.용의포효Count = 0; c.제갈량Count = 0; c.신의가호Count = 0; c.세금과징수Count = 0; c.독설가Count = 0; c.패잔병척결Count = 0; c.counterCount = 0; c.기지의승리Count = 0;});
    
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

      // [결사] 행동 전 병력 회복 처리
      if (actor.결사 && actor.hp > 0) {
        // 수정 1: insight(통찰) -> intel(지력)으로 변경
        var healAmount = Math.floor((actor.intel + actor.command) * 0.8 * 1.5); 
        // 🔴 [수식 수정] 최대 체력이 아닌 잔여 부상병(woundedHp) 한도 내에서만 회복 허용
        var availableWounded = Math.max(0, Math.round(actor.woundedHp || 0));
        var actualHeal = Math.min(healAmount, availableWounded);
            
        if (actualHeal > 0) {
          actor.hp += actualHeal;
          // 수정 2: 부상병(woundedHp) 차감 로직 추가 (엔진 표준 동기화)
          actor.woundedHp = Math.max(0, (actor.woundedHp || 0) - actualHeal);
          logAction("💚 [결사] " + actor.name + "이(가) 행동 전 결사의 의지로 병력을 회복합니다! (+" + actualHeal + ")");
        }
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
          
          // 1. 공통 확률 계산 (DB에서 시전 확률 가져오기 + 액티브 발동률 버프 합산)
          var prob = getSkillProb(sName, actor.name) + actor.activeRateBonus;
          
          // 🔥 [패치] '기동'(상시), '여심'(3턴간) 액티브 확률 증가 적용
          if (actor.tacticMods) {
              prob += (actor.tacticMods.activeProb || 0); 
              if (turn <= 3) prob += (actor.tacticMods.activeProbTurn3 || 0); 
          }

          // --- 장비 고유 병법 '신정후도명' 확률 100% 보정 ---
          if (sName === "만인지적" && actor.strategies && actor.strategies.indexOf("신정후도명") !== -1) {
            prob = 1.0; 
          }

          // 2. 준비형 전법 처리 로직
          if (isPrepSkill) {
            if (actor.preparedSkill === sName) {
              // 이미 1턴을 대기하여 준비가 완료된 상태라면 확정 시전 (여기선 확률 체크 안 함)
              castActiveSkill(sName, actor, curAllies, curEnemies);
              actor.preparedSkill = null;
            } else {
              // 다른 스킬을 준비 중이 아닐 때 "준비 상태 돌입" 확률 체크
              if (!actor.preparedSkill) {
                if (Math.random() < prob) {
                  actor.preparedSkill = sName;
                  logAction("⏳ [준비] " + actor.name + "이(가) '" + sName + "' 시전을 위한 준비 상태에 들어갑니다.");
                } else {
                  logAction("  └ 🚫 [준비 실패] '" + sName + "' 준비에 실패했습니다. (확률: " + (prob * 100).toFixed(1) + "%)");
                }
              }
            }
            continue; // 준비 전법 처리가 끝났으므로 다음 전법 체크로 넘어감
          }

          // 3. 일반 즉발형 액티브 전법 처리 로직
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

          // 🔥 [버그 픽스] triggerBattleStart에서 이미 확률이 부여되므로 중복 코드 삭제
          var doubleAttackProb = actor.doubleAttackProb; 
          
          if (Math.random() < doubleAttackProb) {
            logAction("⚡ [연타] " + actor.name + "의 연타 공격 발동!");
            
            // 🔥 [타겟팅 패치] 첫 공격으로 적이 사망했다면 새로운 타겟 탐색
            if (target.hp <= 0) {
              target = getAttackTarget(actor, curEnemies);
            }
            
            // 새 타겟이 존재할 경우에만 연타 실행
            if (target) {
              performNormalAttack(actor, target, curAllies, curEnemies);
            }
          }
        }
      } else {
        logAction("🛡️ [무장 해제] " + actor.name + "은(는) 무장 해제 상태로 일반 공격을 할 수 없습니다.");
      }

      if (actor.skills.indexOf("지혜의 바람") !== -1) heal(actor, actor, 1.442, "지혜의 바람");
      // [신속기습] 하후연 - 매 턴 행동 개시 시 발동
      if (actor.skills.indexOf("신속기습") !== -1 && actor.hp > 0) {
        var forceBonus = Math.round(actor.speed * 0.4);
        actor.force += forceBonus;
        actor.신속기습ForceBuff = forceBonus; 
        
        var stackCount = 0;
        var aliveOpp = curEnemies.filter(function(e) { return e.hp > 0; });
        aliveOpp.forEach(function(enemy) {
            if (actor.speed > enemy.speed) {
                stackCount++;
                dealDamage(actor, enemy, 0.3, '병기', '신속기습', curAllies, curEnemies, false);
            }
        });
        
        if (stackCount > 0) {
            // 🛡️ [역산 패치] 선공 비례 증감 (기본 5% + 선공 1당 0.02% 추가)
            var bonusAmt = (0.05 + (actor.speed * 0.0002)) * stackCount;
            actor.damageDealtMod += bonusAmt;
            actor.critProb += bonusAmt;
            actor.신속기습DmgBuff = bonusAmt; 
            logAction("🏇 [신속기습] 1턴간 무력 " + forceBonus + " 증가 및 " + stackCount + "스택 획득 (피해/회심 " + (bonusAmt*100).toFixed(1) + "% 증가)");
        } else {
            logAction("🏇 [신속기습] 1턴간 무력 " + forceBonus + " 증가 (선공 우위 적군 없음)");
        }
      }
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
          else if (bond.name === "부창부수") { c.tacticMods.activeProb = (c.tacticMods.activeProb || 0) + 0.04; }
          else if (bond.name === "나라의 동량") { c.tacticMods.spellDmg = (c.tacticMods.spellDmg || 0) + 0.08; }
          else if (bond.name === "조정의 기둥") { c.tacticMods.dmgDealtDebuffed = (c.tacticMods.dmgDealtDebuffed || 0) + 0.08; }
          else if (bond.name === "고육지계") { c.고육지계BondActive = true; } // Combat.gs 연계용 플래그
          else if (bond.name === "조위의 종장") { 
            var maxStat = Math.max(c.force, c.intel, c.command, c.speed);
            if (maxStat === c.force) c.force += 15;
            else if (maxStat === c.intel) c.intel += 15;
            else if (maxStat === c.command) c.command += 15;
            else c.speed += 15;
          }
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
        else if (s.indexOf("무열") !== -1 && c.name === "손견") { 
            var reduceAmt = 0.08 + (c.command * 0.0003); 
            c.tacticMods.weaponDmgTaken = (c.tacticMods.weaponDmgTaken || 0) + reduceAmt;
            logAction("📖 [고유병법] " + c.name + ": '무열' 효과 (받는 병기 피해 " + (reduceAmt*100).toFixed(1) + "% 감소)"); 
        }
        else if (s.indexOf("신속") !== -1 && c.name === "하후연") { 
            var critDmgAmt = 0.12 + (c.speed * 0.0004); 
            c.critDamageMod = (c.critDamageMod || 0) + critDmgAmt; 
            logAction("📖 [고유병법] " + c.name + ": '신속' 효과 (회심 피해 " + (critDmgAmt*100).toFixed(1) + "% 증가)"); 
        }
        // 🔴 [누락된 고유 병법 11종 일괄 파싱] 스탯/확률 즉시 보정
        else if (s.indexOf("무상") !== -1 && c.name === "안량") { c.pierce += 0.06; logAction("📖 [고유병법] '무상' 효과 (관통 +6%)"); }
        else if (s.indexOf("권학") !== -1 && c.name === "여몽") { c.tacticMods.spellDmgTaken = (c.tacticMods.spellDmgTaken || 0) + 0.06; logAction("📖 [고유병법] '권학' 효과 (받는 책략 피해 6% 감소)"); }
        else if (s.indexOf("산림탈기") !== -1 && c.name === "감녕") { c.tacticMods.weaponDmgTaken = (c.tacticMods.weaponDmgTaken || 0) + 0.05; c.lifestealProb += 0.05; logAction("📖 [고유병법] '산림탈기' 효과 (받는 병기피해 -5%, 회유 +5%)"); }
        else if (s.indexOf("십승론") !== -1 && c.name === "곽가") { c.tacticMods.activeDmgTaken = (c.tacticMods.activeDmgTaken || 0) + 0.12; c.tacticMods.pursuitDmgTaken = (c.tacticMods.pursuitDmgTaken || 0) + 0.12; logAction("📖 [고유병법] '십승론' 효과 (받는 액티브/추격 피해 12% 감소)"); }
        else if (s.indexOf("임기응변") !== -1 && c.name === "장합") { c.force += 15; c.activeRateBonus += 0.03; logAction("📖 [고유병법] '임기응변' 효과 (무력 +15, 액티브 발동률 +3%)"); }
        else if (s.indexOf("지군") !== -1 && c.name === "우금") { c.damageTakenMod -= 0.08; logAction("📖 [고유병법] '지군' 효과 (받는 피해 8% 감소)"); }
        else if (s.indexOf("파군") !== -1 && c.name === "서황") { c.tacticMods.activeDmg = (c.tacticMods.activeDmg || 0) + 0.06; c.pierce += 0.06; logAction("📖 [고유병법] '파군' 효과 (액티브 피해 +6%, 관통 +6%)"); }
        else if (s.indexOf("수도") !== -1 && c.name === "조인") { c.수도Active = true; }
        else if (s.indexOf("신용") !== -1 && c.name === "조운") { c.dodgeProb += 0.05; c.lifestealProb += 0.05; logAction("📖 [고유병법] '신용' 효과 (피신/회유 +5%)"); }
        else if (s.indexOf("장검행") !== -1 && c.name === "서서") { var bonusForce = c.intel * 0.25; c.force += bonusForce; logAction("📖 [고유병법] '장검행' 효과 (무력 " + bonusForce.toFixed(0) + " 증가)"); }
        else if (s.indexOf("공근신") !== -1 && c.name === "소교") { c.activeRateBonus += 0.15; logAction("📖 [고유병법] '공근신' 효과 (천향 발동률 +15%)"); }
        else if (s.indexOf("호가십팔박") !== -1 && c.name === "채문희") { c.activeRateBonus += 0.10; logAction("📖 [고유병법] '호가십팔박' 효과 (비분시 발동률 +10%)"); }
        else if (s.indexOf("태평도법(괴술)") !== -1 && c.name === "장량") { c.lifestealProb += 0.08; c.dodgeProb += 0.08; logAction("📖 [고유병법] '태평도법(괴술)' 효과 (회유/피신 8% 증가)"); }
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
        else if (s === "선용") c.tacticMods.seonyong = true; // 🔴 [신규 추가] 선용 플래그 온
        else if (s === "대파") c.tacticMods.daepa = true; // 🔴 [신규 추가] 대파 플래그 온
        else if (s === "비전") c.tacticMods.bijeon = true;

        // 🔴 [신규 패치] 시너지 병법 8종 플래그 온
        else if (s === "선위") c.tacticMods.seonwi = true;
        else if (s === "선지") c.tacticMods.seonji = true;
        else if (s === "정시") c.tacticMods.jeongsi = true;
        else if (s === "피용") c.tacticMods.piyong = true;
        else if (s === "겁지") c.tacticMods.geopji = true;
        else if (s === "합모") c.tacticMods.hapmo = true;
        else if (s === "위수") c.tacticMods.wisu = true;
        else if (s === "임봉") c.tacticMods.imbong = true;

        // 🔴 [신규 패치] 조건부 스택/트리거형 병법 8종 플래그 온
        else if (s === "근선") c.tacticMods.geunseon = true;
        else if (s === "적용") c.tacticMods.jeokyong = true;
        else if (s === "적모") c.tacticMods.jeokmo = true;
        else if (s === "절봉") c.tacticMods.jeolbong = true;
        else if (s === "원도") c.tacticMods.wondo = true;
        else if (s === "공적") c.tacticMods.gongjeok = true;
        else if (s === "분치") c.tacticMods.bunchi = true;
        else if (s === "후기") c.tacticMods.hugi = true;

        // (7) 아군 시너지 및 연계 버프 (비전, 선지, 선위, 피용, 겁지 등은 초기화 시 팀 버퍼에 별도 반영 요망)
        // (현재 객체에 속성만 부여하고 Combat.js나 Engine.js 아군 버프 페이즈에서 처리)
    });

    if (appliedCommonStrats.length > 0) {
        logAction("📖 [공용병법 스캔] " + c.name + " (" + appliedCommonStrats.length + "종 적용): " + appliedCommonStrats.join(", "));
    }
  });

  // =========================================================
  // 🔴 [병법 패치] 팀 시너지(선용 등) 타겟팅 및 스탯 후처리
  // =========================================================
  team.forEach(function(c) {
      // 1. 선용 (최고 무력 타겟)
      if (c.tacticMods.seonyong) {
          // 배열 원본 훼손(진형 순서 뒤섞임)을 막기 위해 slice()로 복사 후 무력 내림차순 정렬
          var maxForceAlly = team.slice().sort(function(a, b) { return b.force - a.force; })[0];
          
          if (maxForceAlly) {
              // 찾은 최고 무력 아군에게 '주는 피해 5% 증가(dmgDealt)' 부여
              maxForceAlly.tacticMods.dmgDealt += 0.05;
              logAction("📖 [병법 시너지] " + c.name + "의 '선용' 적용! 아군 최고 무력(" + maxForceAlly.name + ")의 주는 피해가 5% 증가합니다.");
          }
      }

      // 2. 대파 (후열 랜덤 타겟)
      if (c.tacticMods.daepa) {
          // 진형 결산 시 부여된 position 속성을 확인하여 후열 아군만 스캔
          var backlineAllies = team.filter(function(a) { return a.position === "후열"; });
          
          if (backlineAllies.length > 0) {
              var rAlly = backlineAllies[Math.floor(Math.random() * backlineAllies.length)];
              rAlly.tacticMods.dmgDealt += 0.055;
              logAction("📖 [병법 시너지] " + c.name + "의 '대파' 적용! 후열 아군(" + rAlly.name + ")의 주는 피해가 5.5% 증가합니다.");
          } else {
              logAction("📖 [병법 시너지] " + c.name + "의 '대파' 발동 실패! (후열에 배치된 아군이 없습니다)");
          }
      }

      // 3. 🔴 [신규 패치] 비전 (자신 제외 우군 2명의 병기 피해 3.5% 증가)
      if (c.tacticMods.bijeon) {
          // 시전자 본인을 제외한 우군 필터링
          var targetAllies = team.filter(function(a) { return a.name !== c.name; });
          
          if (targetAllies.length > 0) {
              // 무작위 2명 선정을 위해 배열 섞기 (Shuffle)
              targetAllies.sort(function() { return Math.random() - 0.5; });
              var buffCount = Math.min(2, targetAllies.length); // 살아있는 우군이 1명이면 1명만 적용
              
              var buffedNames = [];
              for (var t = 0; t < buffCount; t++) {
                  targetAllies[t].tacticMods.weaponDmg += 0.035;
                  buffedNames.push(targetAllies[t].name);
              }
              logAction("📖 [병법 시너지] " + c.name + "의 '비전' 적용! 우군(" + buffedNames.join(", ") + ")의 주는 병기 피해가 3.5% 증가합니다.");
          }
      }

      // =========================================================
      // 🔴 [신규 패치] 우군 2명 타겟팅 (선위, 선지, 정시, 피용, 겁지)
      // =========================================================
      if (c.tacticMods.seonwi || c.tacticMods.seonji || c.tacticMods.jeongsi || c.tacticMods.piyong || c.tacticMods.geopji) {
          var targetAllies = team.filter(function(a) { return a.name !== c.name; });
          
          if (targetAllies.length > 0) {
              targetAllies.sort(function() { return Math.random() - 0.5; }); // 무작위 셔플
              var buffCount = Math.min(2, targetAllies.length);
              var buffedNames = [];
              var effects = [];
              
              if (c.tacticMods.seonwi) effects.push("회유 +3.5%");
              if (c.tacticMods.seonji) effects.push("심리공격 +3.5%");
              if (c.tacticMods.jeongsi) effects.push("책략피해 +3.5%");
              if (c.tacticMods.piyong) effects.push("받는 병기피해 -3.5%");
              if (c.tacticMods.geopji) effects.push("받는 책략피해 -3.5%");

              for (var t = 0; t < buffCount; t++) {
                  var ally = targetAllies[t];
                  // 상한선 50% 적용하여 안전하게 합산
                  if (c.tacticMods.seonwi) ally.lifestealProb = Math.min(0.5, ally.lifestealProb + 0.035);
                  if (c.tacticMods.seonji) ally.psyLifestealProb = Math.min(0.5, ally.psyLifestealProb + 0.035);
                  if (c.tacticMods.jeongsi) ally.tacticMods.spellDmg += 0.035;
                  if (c.tacticMods.piyong) ally.tacticMods.weaponDmgTaken += 0.035; // Combat.js에서 빼주므로 +로 저장
                  if (c.tacticMods.geopji) ally.tacticMods.spellDmgTaken += 0.035;  // Combat.js에서 빼주므로 +로 저장
                  buffedNames.push(ally.name);
              }
              logAction("📖 [병법 시너지] " + c.name + "의 우군 지원! (" + buffedNames.join(", ") + ")에게 [" + effects.join(", ") + "] 적용 완료.");
          }
      }

      // =========================================================
      // 🔴 [신규 패치] 아군 조건부 단일 타겟팅 (합모, 위수, 임봉)
      // =========================================================
      // 4. 합모 (지력 1위 아군 주는 피해 5% 증가)
      if (c.tacticMods.hapmo) {
          var maxIntelAlly = team.slice().sort(function(a, b) { return b.intel - a.intel; })[0];
          if (maxIntelAlly) {
              maxIntelAlly.tacticMods.dmgDealt += 0.05;
              logAction("📖 [병법 시너지] " + c.name + "의 '합모' 적용! 지력 1위(" + maxIntelAlly.name + ")의 주는 피해가 5% 증가합니다.");
          }
      }

      // 5. 위수 (통솔 1위 아군 받는 피해 4.5% 감소)
      if (c.tacticMods.wisu) {
          var maxCmdAlly = team.slice().sort(function(a, b) { return b.command - a.command; })[0];
          if (maxCmdAlly) {
              maxCmdAlly.tacticMods.dmgTaken += 0.045; 
              logAction("📖 [병법 시너지] " + c.name + "의 '위수' 적용! 통솔 1위(" + maxCmdAlly.name + ")의 받는 피해가 4.5% 감소합니다.");
          }
      }

      // 6. 임봉 (전열 랜덤 아군 1명 받는 피해 5% 감소)
      if (c.tacticMods.imbong) {
          var frontAllies = team.filter(function(a) { return a.position === "전열"; });
          if (frontAllies.length > 0) {
              var rAlly = frontAllies[Math.floor(Math.random() * frontAllies.length)];
              rAlly.tacticMods.dmgTaken += 0.05; 
              logAction("📖 [병법 시너지] " + c.name + "의 '임봉' 적용! 전열 아군(" + rAlly.name + ")의 받는 피해가 5% 감소합니다.");
          }
      }
  });

  // 🔴 ['수도' 및 '무상' 시너지 결산]
  var hasSudo = team.some(function(c) { return c.수도Active; });
  if (hasSudo) {
      team.forEach(function(ally) { ally.tacticMods.activeDmgTaken = (ally.tacticMods.activeDmgTaken || 0) + 0.12; });
      logAction("🛡️ [고유병법 시너지] '수도' 발동! 아군 전체의 받는 액티브 피해가 12% 감소합니다.");
  }
  team.forEach(function(c) {
      if (c.strategies && c.strategies.indexOf("무상") !== -1) {
          var targetAllies = team.filter(function(a) { return a.name !== c.name; });
          var maxForceAlly = targetAllies.sort(function(a, b) { return b.force - a.force; })[0];
          if (maxForceAlly) {
              maxForceAlly.tacticMods.pursuitDmg = (maxForceAlly.tacticMods.pursuitDmg || 0) + 0.10;
              maxForceAlly.pierce += 0.06;
              logAction("📖 [고유병법 시너지] '무상' 발동! 무력 1위 우군 " + maxForceAlly.name + "의 추격피해 10%, 관통 6% 증가.");
          }
          c.tacticMods.pursuitDmg = (c.tacticMods.pursuitDmg || 0) + 0.10; // 본인도 증가
      }
  })

  // =========================================================
  // 🔴 [병교 동기화] 진형 조건부 시너지 검사 및 발동
  // =========================================================
  var hasByeonggyo = team.some(function(c) { return c.tacticMods && c.tacticMods.byeonggyo; });
  
  if (hasByeonggyo && team.length === 3) {
      var troops = team.map(function(c) { return c.troop; });
      var uniqueTroops = troops.filter(function(item, pos) { return troops.indexOf(item) === pos; });

      if (uniqueTroops.length === 3) { // 3명의 병종이 모두 다르다면
          team.forEach(function(c) {
              c.tacticMods.dmgTaken = (c.tacticMods.dmgTaken || 0) + 0.05; 
          });
          logAction("🛡️ [진형 시너지] '병교' 조건 달성! 출전 장수의 병종이 모두 달라 전군의 받는 피해가 5% 감소합니다. (" + uniqueTroops.join(", ") + ")");
      }
  }
}

function triggerBattleStart(team, opponent) {
  team.forEach(function(c) {
    if (c.skills.indexOf("초선차전") !== -1) {
      // 기획 DB의 심리 공격 흡혈률에 맞춰 수치를 조절하세요 (예: 50% 흡혈이면 0.5)
      c.psyLifestealProb += 0.24; 
      logAction("🧠 [패시브] 제갈량의 '초선차전' 적용! 24% 심리 공격(책략 피해 흡혈) 버프를 획득합니다.");
    }
    if (c.name === "유비") {
      // 👑 [역산 패치] 지력의 10%만큼 통솔 증가
      var commandBonus = c.intel * 0.10; 
      team.forEach(function(ally) { ally.command += commandBonus; });
      logAction("👑 [지휘] 유비의 '백성과 함께' 발동! 아군 전체 통솔을 " + commandBonus.toFixed(2) + " 증가시킵니다.");
    }
    if (c.name === "곽가") {
      c.activeRateBonus = Math.min(0.3, c.activeRateBonus + 0.06);
      // 🔥 [배열 복사 패치] slice()를 추가하여 원본 진형 순서 보존
      var highIntel = team.slice().sort(function(x, y) { return y.intel - x.intel; })[0];
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
      // 1. [결사] 부여: 전열 우선 랜덤 단일 목표
      var frontAllies = team.filter(function(ally) { return ally.position === "전열" && ally.hp > 0; });
      var targetPool = frontAllies.length > 0 ? frontAllies : team.filter(function(ally) { return ally.hp > 0; });
      targetPool.sort(function() { return Math.random() - 0.5; }); // 랜덤 셔플
      var gyulsaTarget = targetPool[0];

      if (gyulsaTarget) {
        gyulsaTarget.결사 = true;
        // 병기 피해만 20% 감소하도록 tacticMods 활용
        if (!gyulsaTarget.tacticMods) gyulsaTarget.tacticMods = {};
        gyulsaTarget.tacticMods.weaponDmgTaken = (gyulsaTarget.tacticMods.weaponDmgTaken || 0) + 0.2;
        logAction("🛡️ [지휘] 결사의 다짐 발동! " + gyulsaTarget.name + "이(가) '결사' 상태가 됩니다. (행동 전 회복, 받는 병기 피해 20% 감소)");
      }

      // 2. [다짐] 부여: 무력이 가장 높은 아군 단일 목표
      var aliveTeam = team.filter(function(ally) { return ally.hp > 0; });
      var maxForceAlly = aliveTeam.sort(function(a, b) { return b.force - a.force; })[0];
      
      if (maxForceAlly) {
        maxForceAlly.다짐 = true;
        logAction("⚔️ [지휘] 결사의 다짐 발동! " + maxForceAlly.name + "이(가) '다짐' 상태가 됩니다. (일반 공격 후 추격)");
      }
    }
    if (c.skills.indexOf("허점 공략") !== -1) { 
      c.허점공략State = 4;
      // 🛡️ [역산 패치] 지력 비례 피해 감소
      var reduceAmt = 0.14 + (c.intel * 0.00035);
      c.허점공략ReduceAmt = reduceAmt; 
      
      var targetAllies = team.filter(function(a) { return a.name !== c.name; }); 
      if (targetAllies.length > 0) {
        var rAlly = targetAllies[Math.floor(Math.random() * targetAllies.length)];
        rAlly.허점공략State = 4;
        rAlly.허점공략ReduceAmt = reduceAmt; // 저장하여 Combat.js에서 차감
      }
      logAction("🛡️ [지휘] 허점 공략 발동! 4턴간 자신과 우군의 받는 피해가 약 " + (reduceAmt*100).toFixed(2) + "% 감소합니다.")
    }
    if (c.skills.indexOf("정의의 희생") !== -1) { 
      team.forEach(function(ally) { ally.doubleAttackProb = Math.min(0.8, ally.doubleAttackProb + 0.3); });
      c.fear = 2;
      // 🔥 [배열 복사 패치] slice()를 추가하여 원본 진형 순서 보존
      var highestForceAlly = team.slice().sort(function(x, y) { return y.force - x.force; })[0];
      if (highestForceAlly) {
        highestForceAlly.regenState = 2;
      }
      logAction("💤 [지휘] 정의의 희생 발동! 아군 전체 연타 확률 증가 및 최고 무력 아군 정신 회복 부여. 시전자는 2턴 공포.");
    }
    if (c.skills.indexOf("예리한 통찰") !== -1) { 
      // 💥 [버그 픽스] 관통 및 피해 증가 상한선(Math.min) 제거로 수치 온전 적용
      c.pierce += 0.16;
      c.damageDealtMod += 0.35;
      logAction("⚔️ [패시브] '예리한 통찰' 적용! 관통이 16%, 주는 피해가 35% 증가합니다.");
    }
    if (c.skills.indexOf("용맹한 삼군") !== -1) {
      c.lifestealProb += 0.30; // 💥 [상한선 제거] 타 버프와 온전하게 중첩되도록 수정
      logAction("🩸 [패시브] '용맹한 삼군' 적용! 회유(피흡)가 30% 증가합니다.");
    }
    if (c.skills.indexOf("늠름한 자태") !== -1) { 
      c.doubleAttackProb += 0.636; 
      c.damageDealtMod += 0.103; // 💥 [곱연산 오류 수정] 엔진 표준인 합연산으로 변경
      logAction("✨ [패시브] '늠름한 자태' 적용 (연타 +63.6%, 주는 피해 +10.3%)"); 
    }
    if (c.skills.indexOf("신속전개") !== -1) { 
      c.speed += 30; c.dodgeProb += 0.16; 
      logAction("✨ [패시브] '신속전개' 적용 (선공 +30, 회피 +16%)"); 
    }
    if (c.skills.indexOf("충신의 기재") !== -1) { 
      // 🧠 [역산 패치] 기본 24% + (지력 * 0.0221%)
      var critBonus = 0.24 + (c.intel * 0.000221);
      c.spellCritProb += critBonus; 
      logAction("✨ [패시브] '충신의 기재' 적용 (묘책 확률 " + (critBonus*100).toFixed(2) + "% 증가)");
    }
    if (c.skills.indexOf("침착한 지휘") !== -1) {
      c.command += 30; // 시작 통솔 고정 증가 (영구 누적 방지)
      logAction("🛡️ [지휘] 우금의 '침착한 지휘' 발동! 통솔이 30 증가합니다.");
    }
    // 🔴 [전쟁 조달 패치] 무력 20 증가 누락 픽스
    if (c.skills.indexOf("전쟁 조달") !== -1) {
      c.force += 20;
      logAction("⚔️ [패시브] '전쟁 조달' 적용! 무력이 20 증가합니다.");
    }
    if (c.skills.indexOf("기병 돌격") !== -1) {
      c.critProb += 0.45; // 15% -> 45% 로 수정
      logAction("🏇 [패시브] 마초의 회심 확률이 45% 증가합니다.");
    }
  });
}

function triggerTurnStart(team, opponent, turn) {
  // --- [전쟁 종식] 3턴간 턴 시작 시 아군 전체 65% 확률 방어막 1스택 ---
  // 아군 중 '전쟁 종식'을 가진 무장이 한 명이라도 있는지 확인 (팀 전체 버프)
  var hasWarEnd = team.some(function(c) { return c.skills.indexOf("전쟁 종식") !== -1 && c.hp > 0; });  
  if (hasWarEnd && turn <= 3) {
    team.forEach(function(ally) {
      if (ally.hp > 0 && Math.random() < 0.65) {
        ally.shieldStacks++;
        logAction("🛡️ [전쟁 종식] 턴 시작! " + ally.name + "이(가) 방어막 1스택을 획득합니다.");
      }
    });
  }

  team.forEach(function(c) {
    c.인의론TurnTriggered = false; // 매 턴 유비 고유 병법 횟수 제한 초기화
    
    // =========================================================
    // 🔴 [신규 패치] 특수 턴 기믹 병법 (기임, 병령, 호세, 저력)
    // =========================================================
    if (c.strategies) {
        // 1. 기임: 1턴째 적군 전체 조롱(도발) 1턴
        if (turn === 1 && c.strategies.indexOf("기임") !== -1) {
            opponent.filter(function(e) { return e.hp > 0; }).forEach(function(e) {
                e.tauntedBy = c;
                e.tauntState = 1; 
                logAction("🎯 [기임] " + e.name + "이(가) " + c.name + "을 도발 타겟으로 삼았습니다. (1턴)");
                if (typeof onDebuffInflicted === "function") onDebuffInflicted(c, e, team, opponent);
            });
        }
        // 2. 병령: 1턴째 우군 2명 방어막 1스택
        if (turn === 1 && c.strategies.indexOf("병령") !== -1) {
            var targetAllies = team.filter(function(a) { return a.hp > 0 && a.name !== c.name; });
            targetAllies.sort(function() { return Math.random() - 0.5; });
            for (var t = 0; t < Math.min(2, targetAllies.length); t++) {
                targetAllies[t].shieldStacks++;
                logAction("🛡️ [병령] " + targetAllies[t].name + "이(가) 방어막 1스택을 획득합니다.");
            }
        }
        // 3. 호세: 1턴째 자신 및 랜덤 적군 1명 무장 해제 1턴
        if (turn === 1 && c.strategies.indexOf("호세") !== -1) {
            c.disarm = 1;
            logAction("🛡️ [호세] " + c.name + "이(가) 자신에게 무장 해제를 부여합니다. (1턴)");
            var aliveOpp = opponent.filter(function(e) { return e.hp > 0; });
            if (aliveOpp.length > 0) {
                var rEnemy = aliveOpp[Math.floor(Math.random() * aliveOpp.length)];
                rEnemy.disarm = 1;
                logAction("🛡️ [호세] " + rEnemy.name + "에게 무장 해제를 부여합니다. (1턴)");
                if (typeof onDebuffInflicted === "function") onDebuffInflicted(c, rEnemy, team, opponent);
            }
        }
        // 4. 저력: 2턴째 자신 및 랜덤 적군 1명 주는 피해 15% 감소 1턴
        if (turn === 2 && c.strategies.indexOf("저력") !== -1) {
            c.damageDealtMod -= 0.15;
            c.jeoryeokDebuffTurns = 1; // 1턴 후 복구를 위한 변수
            logAction("📉 [저력] " + c.name + "의 주는 피해가 15% 감소합니다. (1턴)");
            
            var aliveOpp = opponent.filter(function(e) { return e.hp > 0; });
            if (aliveOpp.length > 0) {
                var rEnemy = aliveOpp[Math.floor(Math.random() * aliveOpp.length)];
                rEnemy.damageDealtMod -= 0.15;
                rEnemy.jeoryeokDebuffTurns = 1;
                logAction("📉 [저력] " + rEnemy.name + "의 주는 피해가 15% 감소합니다. (1턴)");
                if (typeof onDebuffInflicted === "function") onDebuffInflicted(c, rEnemy, team, opponent);
            }
        }
        // 🔴 [턴 1 고유 기믹 - 용음, 의성]
        if (turn === 1 && c.strategies && c.strategies.indexOf("용음") !== -1) {
            opponent.filter(function(e) { return e.hp > 0; }).forEach(function(enemy) {
              enemy.threatState = 2;
              logAction("🐉 [고유병법] '용음' 발동! " + enemy.name + "에게 위협 2턴 부여.");
              if (typeof onDebuffInflicted === "function") onDebuffInflicted(c, enemy, team, opponent);
            });
        }
        if (turn === 1 && c.strategies && c.strategies.indexOf("의성") !== -1) {
          var aliveOpp = opponent.filter(function(e) { return e.hp > 0; });
            getWeightedRandomTargets(aliveOpp, 2).forEach(function(enemy) {
              enemy.floodState = 2;
              logAction("🌊 [고유병법] '의성' 발동! " + enemy.name + "에게 홍수 2턴 부여.");
              if (typeof onDebuffInflicted === "function") onDebuffInflicted(c, enemy, team, opponent);
            });
        }
    }

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
    if (c.skills.indexOf("양번 사수") !== -1 && turn % 2 === 0) {
        var aliveOpp = opponent.filter(function(e) { return e.hp > 0; });
        var targetOpp = getWeightedRandomTargets(aliveOpp, 2);
        targetOpp.forEach(function(enemy) {
            if (Math.random() < 0.75) {
                enemy.silence = 1;
                logAction("🤐 [양번 사수] 짝수 턴 방어! " + enemy.name + "에게 침묵을 1턴 부여합니다.");
                if (typeof onDebuffInflicted === "function") onDebuffInflicted(c, enemy, team, opponent);
            }
        });
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

    // 🟢 [스택/트리거형 8종 동기화] 턴 종료 시 '후기' 스택 및 '원도' 만료
    if (c.tacticMods && c.tacticMods.hugi) {
        if (c.hugiStacks < 5) c.hugiStacks++;
    }
    if (c.wondoBuffTurns > 0) c.wondoBuffTurns--;

    if (c.탈주병State > 0) {
      var deserterDmg = Math.round(c.force * 0.8); // DB 기획(무력 비례 특수 피해) 기준 80% 가설정
      c.hp -= deserterDmg;
      c.woundedHp = (c.woundedHp || 0) + Math.round(deserterDmg * 0.85);
      logAction("🩸 [탈주병] " + c.name + "의 부대에 탈주병이 발생하여 " + deserterDmg + "의 특수 피해(방어무시)를 입었습니다.");
    }
   
    if (c.name === "화타") {
      var lowestHpAlly = team.filter(function(ally) { return ally.hp > 0; }).sort(function(x, y) { return x.hp - y.hp; })[0];
      if (lowestHpAlly) {
        // 🩺 [역산 패치] 지력 비례 피해 감소 (기본 16% + 지력 1당 0.03% 추가 감소)
        var reduceAmt = 0.16 + (c.intel * 0.0003); 
        lowestHpAlly.damageTakenMod = Math.max(0.5, lowestHpAlly.damageTakenMod - reduceAmt);
        lowestHpAlly.regenState = 2;
        logAction("🩺 [마비산] 화타가 가장 병력이 낮은 " + lowestHpAlly.name + "에게 방어 버프(" + (reduceAmt*100).toFixed(1) + "% 감소)를 부여합니다.");
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

    if (c.skills.indexOf("폐월") !== -1) {
      // 1. 무력 1위 우군 탐색
      var targetAllies = team.filter(function(a) { return a.hp > 0 && a.name !== c.name; });
      var maxForceAlly = targetAllies.sort(function(a, b) { return b.force - a.force; })[0];
      
      if (maxForceAlly) {
          // 폐월 버프: 병기 피해 15% 증가 (영구/누적 여부 명시가 없으므로 1턴 지속 처리)
          maxForceAlly.tacticMods.weaponDmg += 0.15;
          maxForceAlly.폐월Buff = 1;
          logAction("🌸 [폐월] 초선이 무력 1위 우군 " + maxForceAlly.name + "의 병기 피해를 15% 증가시킵니다. (1턴)");

          // 상련(고유 병법) 버프: 관통 9% 증가
          if (c.strategies && c.strategies.indexOf("상련") !== -1) {
              maxForceAlly.pierce += 0.09;
              maxForceAlly.상련Buff = 1;
              logAction("📖 [고유병법] '상련' 효과! " + maxForceAlly.name + "의 관통이 9% 증가합니다. (1턴)");
          }
      }

      // 2. 이번 턴에 초선을 때린 적군에게 통솔 무시 특수 피해 반격
      if (c.폐월Targets && c.폐월Targets.length > 0) {
          logAction("🌸 [폐월 반격] 초선이 이번 턴에 자신을 공격한 적들에게 반격합니다!");
          
          // 방어/통솔을 무시하기 위해 관통을 일시적으로 1.0(100%)으로 설정
          var originalPierce = c.pierce;
          c.pierce = 1.0; 
          
          c.폐월Targets.forEach(function(enemy) {
              if (enemy.hp > 0) {
                  dealDamage(c, enemy, 0.6, '병기', '폐월 (반격)', team, opponent);
              }
          });
          
          c.pierce = originalPierce; // 원래 관통 수치로 복구
      }
      
      c.폐월Targets = []; // 턴 종료 시 타겟 목록 초기화
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

    // 🔴 [턴 종료 기믹 - 권학, 궁술]
    if (turn === 3 && c.strategies && c.strategies.indexOf("권학") !== -1) {
        c.intel += 30;
        logAction("📖 [고유병법] '권학' 3턴 종료! 여몽의 지력이 30 증가합니다.");
    }

    if (c.strategies && c.strategies.indexOf("궁술") !== -1) {
        if ((c.normalAttackCount || 0) < 2) {
            c.궁술Buff = 1; 
            logAction("🏹 [고유병법] '궁술' 발동! 평타 2회 미만으로 다음 턴 추격 피해/확률이 25% 증가합니다.");
        }
        c.normalAttackCount = 0; // 매턴 카운트 초기화
    }
  });
}

function settleBuildingBonus(team) {
  team.forEach(function(c) {
    // 인게임 건물 기술 만렙 기준 모든 속성 +20 적용
    c.force += 20;
    c.intel += 20;
    c.command += 20;
    c.speed += 20;
    
    // (선택) 스크린샷에 나온 '각 진영별 무장에게 주는 피해/받는 피해 0.5% 증감' 도 합산하여 반영
    c.damageDealtMod += 0.005; // 0.5% 증가
    c.damageTakenMod -= 0.005; // 0.5% 감소

    logAction("🏢 [건물 기술] " + c.name + ": 모든 속성 +20 및 피해 증감(0.5%) 효과 적용");
  });
}