/**
 * Skills.gs
 * 액티브 전법(castActiveSkill), 디버프 감지(onDebuffInflicted), 턴 종료 상태 차감(decayStatusEffects) 전담
 */

function onDebuffInflicted(source, target, sourceTeam, targetTeam) {
  if (!source || !target || source.hp <= 0 || target.hp <= 0) return;
  
  // 🟢 [스택/트리거형 8종 동기화] 디버프 피격 시 '분치' 뎀감 스택
  if (target.tacticMods && target.tacticMods.bunchi) {
      if (target.bunchiStacks < 5) target.bunchiStacks++;
  }

  // 🔴 [고유병법 - 디버프 발생 연계 (요술, 지군, 화계)]
  if (target.magicState > 0 && source.strategies && source.strategies.indexOf("태평도법(요술)") !== -1) {
      if (target.태평도법Debuff !== 2) {
          target.tacticMods.activeDmgTaken = (target.tacticMods.activeDmgTaken || 0) + 0.10;
          target.태평도법Debuff = 2; // 2턴 지속
          logAction("📖 [고유병법] '태평도법(요술)' 연계! " + target.name + "의 받는 액티브 피해가 2턴간 10% 증가합니다.");
      }
  }
  if (target.disarm > 0 && source.strategies && source.strategies.indexOf("지군") !== -1) {
      target.damageDealtMod -= 0.10;
      target.지군Debuff = 1;
      logAction("📖 [고유병법] '지군' 연계! 무장해제된 " + target.name + "의 주는 피해가 1턴간 10% 감소합니다.");
  }
  
  if (target.fireState > 0) {
      sourceTeam.concat(targetTeam).forEach(function(member) {
          if (member.hp > 0 && member.strategies && member.strategies.indexOf("화계") !== -1) {
              if ((member.화계Count || 0) < 2 && Math.random() < 0.35) {
                  member.화계Count = (member.화계Count || 0) + 1;
                  logAction("🔥 [고유병법] '화계' 발동! 주유가 화공을 감지하여 추가 피해를 줍니다. (턴 내 발동: " + member.화계Count + "/2)");
                  var hisEnemies = (sourceTeam.indexOf(member) !== -1) ? targetTeam : sourceTeam;
                  var hisAllies = (sourceTeam.indexOf(member) !== -1) ? sourceTeam : targetTeam;
                  var targetOpp = getWeightedRandomTargets(hisEnemies.filter(function(e){return e.hp>0;}), 2);
                  for(var i=0; i<targetOpp.length; i++) dealDamage(member, targetOpp[i], 0.6, '책략', '화계', hisAllies, hisEnemies, false);
              }
          }
      });
  }

  // 1. 세금 과징수 (자신이 디버프를 부여했을 때 개별 발동)
  if (source.skills.indexOf("세금 과징수") !== -1) {
    if (source.세금과징수Count < 10) {
      source.세금과징수Count++;
      
      // 기획 데이터 반영: 지력 + 통솔 합산의 40% 치유
      var healAmt = Math.round((source.intel + source.command) * 0.4); 
      
      // 🔥 [부상병 패치] 부상병 한도 내에서만 회복하도록 제한 및 차감 로직 추가
      var availableWounded = Math.max(0, Math.round(source.woundedHp || 0));
      var finalHealAmt = Math.min(healAmt, availableWounded);
      
      source.hp += finalHealAmt;
      source.woundedHp = Math.max(0, source.woundedHp - finalHealAmt); // 부상병 정상 차감
      source.totalHealingDone += finalHealAmt;
      
      logAction("💰 [세금 과징수] " + target.name + "에게 디버프 적중! 자가 치유 발동! (턴 내 발동: " + source.세금과징수Count + "/10) (잔여 부상병: " + source.woundedHp + ")");
      
      // 2턴 지속, 최대 4스택 버프 로직
      if (!source.세금과징수Buff) source.세금과징수Buff = [];
      if (source.세금과징수Buff.length < 4) {
        source.세금과징수Buff.push(2); 
        source.damageTakenMod -= 0.1; 
        logAction("  └ " + source.name + "의 받는 피해가 2턴간 10% 감소합니다. (현재 중첩: " + source.세금과징수Buff.length + "/4)");
      } else {
        var refreshed = false;
        for(var i=0; i<source.세금과징수Buff.length; i++) {
          if(source.세금과징수Buff[i] < 2) {
            source.세금과징수Buff[i] = 2;
            refreshed = true;
            break;
          }
        }
      }
    }
  }
  
  // 2. 독설가 (적군이 디버프를 받을 때 아군 제갈량이 감지하고 발동)
  sourceTeam.forEach(function(member) {
    if (member.hp > 0 && member.skills.indexOf("독설가") !== -1) {
      if (member.독설가Count < 2 && Math.random() < 0.6) {
        member.독설가Count++;
        logAction("🗣️ [독설가] " + target.name + "의 디버프 감지! " + member.name + "의 추가 책략 피해 발동! (턴 내 발동: " + member.독설가Count + "/2)");
        dealDamage(member, target, 1.1, '책략', '독설가', sourceTeam, targetTeam);
      }
    }
  });

  // 3. 기지의 승리 (적군/아군 이상 상태 발생 시 주유 감지 및 발동)
  sourceTeam.concat(targetTeam).forEach(function(member) {
    if (member.hp > 0 && member.skills.indexOf("기지의 승리") !== -1) {
      if ((member.기지의승리Count || 0) < 4 && Math.random() < 0.7) {
        member.기지의승리Count = (member.기지의승리Count || 0) + 1;
        logAction("🔥 [기지의 승리] 이상 상태 감지! 주유가 기지를 발동합니다. (턴 내 발동: " + member.기지의승리Count + "/4)");
        
        var hisEnemies = (sourceTeam.indexOf(member) !== -1) ? targetTeam : sourceTeam;
        var hisAllies = (sourceTeam.indexOf(member) !== -1) ? sourceTeam : targetTeam;
        var aliveOpp = hisEnemies.filter(function(e) { return e.hp > 0; });
        var targetOpp = getWeightedRandomTargets(aliveOpp, 2);
        
        for (var t = 0; t < targetOpp.length; t++) {
           dealDamage(member, targetOpp[t], 0.6, '책략', '기지의 승리', hisAllies, hisEnemies, false);
        }

        // 4회 누적 시 전체 회복
        if (member.기지의승리Count === 4) {
           logAction("💚 [기지의 승리] 4회 누적 발동 달성! 아군 전체의 병력을 회복합니다.");
           hisAllies.forEach(function(ally) {
               if (ally.hp > 0) heal(member, ally, 0.4, "기지의 승리");
           });
        }
      }
    }
  });
}

function castActiveSkill(skill, source, allies, enemies) {
  var targetDeck = enemies;
  var sourceDeck = allies;
  var aliveEnemies = targetDeck.filter(function(c) { return c.hp > 0; });
  var aliveAllies = sourceDeck.filter(function(c) { return c.hp > 0; });

  if (aliveEnemies.length === 0) return;

  aliveEnemies = getWeightedRandomTargets(aliveEnemies, aliveEnemies.length);
  aliveAllies.sort(function() { return Math.random() - 0.5; });

  var target = aliveEnemies[0]; // 무작위 단일 타겟용 기본값

  logAction("🔥 [액티브] " + source.name + "이(가) '" + skill + "' 전법을 시전합니다!");

  // 🛡️ [패치] '임시' 병법: 액티브 발동 후 2턴간 받는 피해 감소
  if (source.tacticMods && source.tacticMods.dmgTakenDownAfterActive) {
      if (source.imsiBuffTurns <= 0) {
          source.damageTakenMod -= 0.055; 
      }
      source.imsiBuffTurns = 2; // 버프 지속 갱신
      logAction("🛡️ [임시] 액티브 발동! 2턴간 받는 피해가 5.5% 감소합니다.");
  }

  switch(skill) {
    case "청낭 치료":
      // 1. 병력이 가장 낮은 아군 찾기
      var lowestHpAlly = aliveAllies.sort(function(x, y) { return x.hp - y.hp; })[0];
      
      if (lowestHpAlly) {
          // 2. 현재 걸려있는 제어/상태 이상 디버프 스캔
          var debuffs = [];
          var checkList = ['silence', 'disarm', 'fear', 'weakness', 'confusion', 'magicState', 'stormState', 'floodState', 'fireState', 'grainExhaustState', 'threatState', '탈주병State'];
          
          for (var d = 0; d < checkList.length; d++) {
              if (lowestHpAlly[checkList[d]] > 0) debuffs.push(checkList[d]);
          }
          
          // 3. 디버프 최대 3개 제거
          var removedCount = 0;
          while (debuffs.length > 0 && removedCount < 3) {
              var toRemoveIdx = Math.floor(Math.random() * debuffs.length);
              var debuffName = debuffs[toRemoveIdx];
              
              lowestHpAlly[debuffName] = 0; // 상태 해제
              debuffs.splice(toRemoveIdx, 1); // 배열에서 제거
              removedCount++;
          }
          
          if (removedCount > 0) {
              logAction("✨ [청낭 치료] " + lowestHpAlly.name + "의 디버프를 " + removedCount + "개 제거했습니다!");
          }
          
          // 4. 병력 회복 (치유율 260%)
          heal(source, lowestHpAlly, 2.6, "청낭 치료");
      }
      break;
    case "천향":
      var hasGonggeun = (source.strategies && source.strategies.indexOf("공근신") !== -1);
      var healCoef = hasGonggeun ? 1.25 : 2.5; // 치유 효과 50% 감소
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        aliveEnemies[t].weakness = 1;
        logAction("🥀 [천향] " + aliveEnemies[t].name + "에게 허약 1턴 부여.");
        onDebuffInflicted(source, aliveEnemies[t], allies, enemies);
      }
      for (var t = 0; t < Math.min(2, aliveAllies.length); t++) {
        heal(source, aliveAllies[t], healCoef, "천향");
      }
      break;
    case "비분시":
      var hasHoga = (source.strategies && source.strategies.indexOf("호가십팔박") !== -1);
      var healCoef = hasHoga ? 0.96 : 1.2; // 치유 효과 20% 감소
      aliveAllies.forEach(function(ally) {
        heal(source, ally, healCoef, "비분시");
        ally.shieldStacks++;
        if (ally.position === '전열') heal(source, ally, hasHoga ? 0.4 : 0.5, "비분시");
      });
      if (hasHoga) {
          var targetOpp = getWeightedRandomTargets(aliveEnemies, 2);
          targetOpp.forEach(function(enemy) {
              enemy.intel = Math.max(0, enemy.intel - 30);
              enemy.호가십팔박Debuff = 1;
              logAction("🎶 [고유병법] '호가십팔박' 적용! " + enemy.name + "의 지력이 1턴간 30 감소합니다.");
          });
      }
      break;
    case "장군의 무용":
      source.silence = 2;
      logAction("🤐 [장군의 무용] 자가 침묵 상태 돌입 (2턴)");
      dealDamage(source, target, 2.5, '병기', '장군의 무용', allies, enemies);
      performNormalAttack(source, target, allies, enemies);
      break;
    case "도술의 귀재":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        var enemy = aliveEnemies[t];
        var bonus = (enemy.magicState > 0) ? 1.35 : 1.0;
        dealDamage(source, enemy, 2.8 * bonus, '책략', '도술의 귀재', allies, enemies);
        enemy.magicState = 2; enemy.stormState = 2;
        onDebuffInflicted(source, enemy, allies, enemies);
      }
      break;
    case "괴술":
      source.lifestealProb = Math.min(0.5, source.lifestealProb + 0.25);
      source.dodgeProb = Math.min(0.5, source.dodgeProb + 0.25);
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        dealDamage(source, aliveEnemies[t], 2.2, '병기', '괴술', allies, enemies);
        aliveEnemies[t].magicState = 2;
        onDebuffInflicted(source, aliveEnemies[t], allies, enemies);
      }
      break;
    case "무열황제":
      // 💥 [역산 패치] 무력/통솔 중 더 높은 스탯의 10%만큼 통솔 추가 감소
      var maxStat = Math.max(source.force, source.command);
      var baseReduction = 40 + (maxStat * 0.1); 
      var commandDiff = target.command > source.command;
      var reduction = commandDiff ? baseReduction * 1.5 : baseReduction;
      
      target.손견통솔Debuff = 2;
      target.손견통솔DebuffAmt = reduction;
      target.command = Math.max(0, target.command - reduction); 
      
      // 데미지 역시 통솔 비례로 증가 (기본 2.5배 + 통솔 1당 0.1% 추가)
      var dmgMod = 2.5 + (source.command * 0.001);
      dealDamage(source, target, dmgMod, '병기', '무열황제', allies, enemies);
      target.fear = 1;
      logAction("💤 [무열황제] " + target.name + "의 통솔을 " + reduction.toFixed(1) + " 감소시키고 공포를 1턴 부여합니다.");
      onDebuffInflicted(source, target, allies, enemies);
      break;
    case "백의도강":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        var enemy = aliveEnemies[t];
        var bonus = (enemy.grainExhaustState > 0) ? 0.8 : 0;
        dealDamage(source, enemy, 1.8 + bonus, '책략', '백의도강', allies, enemies);
        enemy.grainExhaustState = 2;
        onDebuffInflicted(source, enemy, allies, enemies);
      }
      break;
    case "강동 제패":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        dealDamage(source, aliveEnemies[t], 2.5, '병기', '강동 제패', allies, enemies);
      }
      heal(source, source, 0.65, "강동 제패");
      var rAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
      if (rAlly) heal(source, rAlly, 0.65, "강동 제패");
      
      if (source.strategies && source.strategies.indexOf("패왕전") !== -1 && Math.random() < 0.65) {
          var debuffs = ['silence', 'disarm', 'fear', 'weakness', 'confusion', 'magicState', 'stormState', 'floodState', 'fireState', 'grainExhaustState', 'threatState'];
          var activeDebuffs = debuffs.filter(function(d) { return source[d] > 0; });
          if (activeDebuffs.length > 0) {
              var toRemove = activeDebuffs[Math.floor(Math.random() * activeDebuffs.length)];
              source[toRemove] = 0;
              logAction("📖 [고유병법] '패왕전' 발동! 손책의 제어 효과 1개를 정화합니다.");
          }
      }
      break;
    case "고육지계":
      // 1. 통솔 비례 피해 감소량 연산 (기본 30% + 통솔 1당 0.03% 추가 감소 예시)
      // *주의: 0.0003 부분은 기획하신 통솔 계수에 맞춰 수정하시면 됩니다.
      var reduceAmt = 0.3 + (source.command * 0.0003); 

      if (source.고육지계Buff <= 0) {
        source.damageTakenMod = Math.max(0.2, source.damageTakenMod - reduceAmt);
        source.고육지계Buff = 2; // 2턴 지속
        source.고육지계ReduceAmt = reduceAmt; // 차감을 위해 정확한 수치 저장
        logAction("🛡️ [고육지계] 황개가 2턴간 받는 피해를 " + (reduceAmt*100).toFixed(1) + "% 감소시킵니다. (통솔 비례)");
      } else {
        source.고육지계Buff = 2; // 이미 버프가 있다면 턴수만 갱신
        logAction("🛡️ [고육지계] 버프 지속시간이 2턴으로 갱신되었습니다.");
      }

      // 2. 지력이 가장 높은 '우군' (자신 제외) 찾기
      var targetAllies = aliveAllies.filter(function(a) { return a.name !== source.name; });
      targetAllies.sort(function(x, y) { return y.intel - x.intel; });
      var highIntel = targetAllies[0];
      
      if (highIntel) {
        logAction("🩸 [고육지계 연계] 지력이 가장 높은 우군 " + highIntel.name + "이(가) 황개에게 피해를 입힙니다!");
        dealDamage(highIntel, source, 0.6, '병기', '고육지계 (우군 타격)', allies, enemies);

        // --- [패치] 황개 고유 병법 '견결' ---
        if (source.strategies && source.strategies.indexOf("견결") !== -1) {
          source.견결Buff = 2; // 2턴 지속
          source.damageTakenMod -= 0.12;
          logAction("📖 [고유병법] '견결' 발동! 우군의 피해를 받아 2턴간 황개의 받는 피해가 12% 감소합니다.");
        }
      }

      // 3. 랜덤 적군 2명 타격 및 화공 부여
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        dealDamage(source, aliveEnemies[t], 2.2, '책략', '고육지계', allies, enemies);
        aliveEnemies[t].fireState = 2;
        
        logAction("🔥 [화공 부여] " + aliveEnemies[t].name + "에게 화공 상태를 2턴 동안 부여합니다. (지력 15 감소)");
        
        onDebuffInflicted(source, aliveEnemies[t], allies, enemies);
      }

      break;
    case "적진 돌파":
      source.pierce = Math.min(0.2, source.pierce + 0.05);
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        var enemy = aliveEnemies[t];
        var bonus = (enemy.disarm > 0) ? 1.3 : 1.0;
        dealDamage(source, enemy, 2.2 * bonus, '병기', '적진 돌파', allies, enemies);
        if (Math.random() < 0.65) {
          enemy.disarm = 1;
          logAction("🛡️ [무장 해제 부여] " + enemy.name + "에게 무장 해제를 1턴 동안 부여합니다.");
          onDebuffInflicted(source, enemy, allies, enemies);
        }
      }
      break;
    case "승승장구":
      var isLowestHp = (target === aliveEnemies.sort(function(a,b){return a.hp - b.hp})[0]);
      var bonus = (target.silence > 0 || isLowestHp) ? 1.3 : 1.0;
      dealDamage(source, target, 3.5 * bonus, '병기', '승승장구', allies, enemies);
      target.silence = 1;
      logAction("🤐 [침묵 부여] " + target.name + "에게 침묵을 1턴 동안 부여합니다.");
      onDebuffInflicted(source, target, allies, enemies);
      break;
    case "만인지적":
      var hasSinjeong = (source.strategies && source.strategies.indexOf("신정후도명") !== -1);
      var fearProb = hasSinjeong ? 0.12 : 0.3;     // 공포 확률 12%로 너프
      var dmgCoef = hasSinjeong ? 1.05 : 1.4;      // 피해 계수 140% -> 105% (35% 감소)

      if (hasSinjeong) logAction("📖 [고유병법] '신정후도명' 적용! (만인지적 피해 105%, 공포 12%로 변경)");
      
      aliveEnemies.forEach(function(enemy) {
        if (enemy.hp > 0) { 
          dealDamage(source, enemy, dmgCoef, '병기', '만인지적', allies, enemies);
          if (enemy.threatState > 0 && Math.random() < fearProb) {
            enemy.fear = 1;
            logAction("💤 [공포 연계] " + enemy.name + "에게 공포를 부여합니다.");
          }
        }
        enemy.threatState = 2;
        onDebuffInflicted(source, enemy, allies, enemies);
      });
      break;
    case "화하 진압":
      var threatCount = aliveEnemies.filter(function(e) { return e.threatState > 0; }).length;
      // 🐛 [버그 픽스] 기존 버프가 있다면 먼저 제거하여 무한 중첩 방지
      if (source.관우액티브Buff > 0) {
          source.activeRateBonus -= source.관우액티브BuffAmt;
      }
      source.관우액티브Buff = 2;
      source.관우액티브BuffAmt = 0.08 + threatCount * 0.03;
      source.activeRateBonus += source.관우액티브BuffAmt; // 2턴 지속으로 변경됨
      aliveEnemies.forEach(function(enemy) {
        dealDamage(source, enemy, 1.8, '병기', '화하 진압', allies, enemies);
        if (enemy.silence > 0 || enemy.disarm > 0 || enemy.fear > 0 || enemy.weakness > 0 || enemy.confusion > 0) {
          enemy.탈주병State = 2;
          logAction("🩸 [화하 진압] " + enemy.name + "에게 탈주병 상태(특수피해 대기)를 2턴 동안 부여합니다.");
          onDebuffInflicted(source, enemy, allies, enemies);
        }
      }); 
      break;
    case "겸손한 자세":
      var dmgType = (target.force > target.intel) ? '병기' : '책략';
      dealDamage(source, target, 2.2, dmgType, '겸손한 자세', allies, enemies);
      if (target.force > target.intel) {
        target.disarm = 1;
        logAction("🛡️ [무장 해제 부여] " + target.name + "에게 무장 해제를 부여합니다.");
      } else {
        target.silence = 1;
        logAction("🤐 [침묵 부여] " + target.name + "에게 침묵을 부여합니다.");
      }
      onDebuffInflicted(source, target, allies, enemies);
      break;
    case "방화범":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        var enemy = aliveEnemies[t];
        dealDamage(source, enemy, 2.2, '병기', '방화범', allies, enemies);
        dealDamage(source, enemy, 2.2, '책략', '방화범', allies, enemies);
        if (enemy.fireState > 0) {
          enemy.confusion = 2; 
          logAction("🌀 [혼란 부여] " + enemy.name + "에게 혼란 상태를 2턴 동안 부여합니다.");
          onDebuffInflicted(source, enemy, allies, enemies);
        }
      }
      break;
    case "천하평론":
      if (aliveAllies.length > 0 && aliveEnemies.length > 0) {
        // 1. 무력이 가장 높은 아군 탐색
        var maxForceAlly = aliveAllies[0];
        for (var i = 1; i < aliveAllies.length; i++) {
          if (aliveAllies[i].force > maxForceAlly.force) {
            maxForceAlly = aliveAllies[i];
          }
        }
        
        // 2. 지력이 가장 높은 아군 탐색
        var maxIntelAlly = aliveAllies[0];
        for (var i = 1; i < aliveAllies.length; i++) {
          if (aliveAllies[i].intel > maxIntelAlly.intel) {
            maxIntelAlly = aliveAllies[i];
          }
        }

        logAction("📢 [천하평론] " + source.name + "의 호령! 무력 1위(" + maxForceAlly.name + ")와 지력 1위(" + maxIntelAlly.name + ")가 적군 전체를 공격합니다!");

        // 3. 무력 1위 아군이 적군 전체에게 80% 병기 피해
        aliveEnemies.forEach(function(enemy) {
          dealDamage(maxForceAlly, enemy, 0.8, '병기', "천하평론(병기)", allies, enemies);
        });

        // 4. 지력 1위 아군이 적군 전체에게 80% 책략 피해
        aliveEnemies.forEach(function(enemy) {
          dealDamage(maxIntelAlly, enemy, 0.8, '책략', "천하평론(책략)", allies, enemies);
        });
      }
      break;
    case "청야 전술":
      aliveEnemies.forEach(function(e) {
        e.tauntedBy = source;
        e.tauntState = 2;
        logAction("🎯 [도발] " + e.name + "이(가) " + source.name + "을 도발 타겟으로 삼았습니다.");
        onDebuffInflicted(source, e, allies, enemies);
      });
      source.command += 36;
      source.청야전술Buff = 2;
      break;
    case "적군 굴복":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        var enemy = aliveEnemies[t];
        if (enemy.disarm > 0) {
          enemy.damageDealtMod = Math.max(0.5, enemy.damageDealtMod - 0.15);
        } else {
          enemy.disarm = 1;
          onDebuffInflicted(source, enemy, allies, enemies);
        }
      }
      break;
    case "측면 공격":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
          dealDamage(source, aliveEnemies[t], 1.545, '병기', '측면 공격', allies, enemies);
          aliveEnemies[t].threatState = 2;
          onDebuffInflicted(source, aliveEnemies[t], allies, enemies);
      }
      break;
    case "파죽지세":
      if (source.파죽지세Buff <= 0) {
          source.critProb += 0.2;
      }
      source.파죽지세Buff = 2; // 2턴 지속 부여
      logAction("📈 [파죽지세] 2턴간 회심 확률이 20% 증가합니다.");
      aliveEnemies.forEach(function(e) { dealDamage(source, e, 1.4, '병기', '파죽지세', allies, enemies); });
      break;
    case "구름과 바람":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        var enemy = aliveEnemies[t];
        var bonus = (enemy.stormState > 0) ? 1.25 : 1.0;
        dealDamage(source, enemy, 1.8 * bonus, '병기', '구름과 바람', allies, enemies);
      }
      if (source.stormState > 0) source.dodgeProb = Math.min(0.5, source.dodgeProb + 0.1);
      break;
    case "찬란한 위명":
      // 1. 회유 30% 증가 (2턴 지속 처리)
      if (source.찬란한위명Buff > 0) {
        source.찬란한위명Buff = 2; // 이미 버프가 있다면 턴수만 갱신
        logAction("✨ [찬란한 위명] 회유 증가 버프 지속시간이 2턴으로 갱신되었습니다.");
      } else {
        var prevLife = source.lifestealProb;
        source.lifestealProb = Math.min(0.5, source.lifestealProb + 0.3); // 상한선 50%
        source.찬란한위명LifestealAmt = source.lifestealProb - prevLife;  // 실제 증가한 수치 기록
        source.찬란한위명Buff = 2; // 2턴 지속
        logAction("✨ [찬란한 위명] 2턴 동안 회유가 " + Math.round(source.찬란한위명LifestealAmt * 100) + "% 증가합니다.");
      }

      // 2. 랜덤 적군 2명에게 220% 병기 피해
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        dealDamage(source, aliveEnemies[t], 2.2, '병기', '찬란한 위명', allies, enemies);
      }
      break;
    case "화검":
      aliveEnemies.forEach(function(e) {
        dealDamage(source, e, 1.59, '병기', '화검', allies, enemies);
        e.fireState = 2;
        onDebuffInflicted(source, e, allies, enemies);
      });
      break;
    case "응전":
      source.pierce = Math.min(0.5, source.pierce + 0.206);
      var frontRow = aliveEnemies.filter(function(c) { return c.position === "전열"; });
      var finalTarget = frontRow.length > 0 ? frontRow[0] : target;
      dealDamage(source, finalTarget, 4.532, '병기', '응전', allies, enemies);
      break;
    case "민중 봉기":
      var aliveEnemies = enemies.filter(function(e) { return e.hp > 0; });
        
      // 1. 타겟팅: 엔진 공식 가중치 랜덤 함수를 사용하여 2명 추출
      var targets = getWeightedRandomTargets(aliveEnemies, 2);

      for (var i = 0; i < targets.length; i++) {
        var t = targets[i];
            
        // 2. 154.5% 병기 피해
        dealDamage(source, t, 1.545, '병기', '민중 봉기', allies, enemies);
            
        // 3. 엔진 공식 군량 고갈(grainExhaustState) 부여 (1턴)
        if (t.hp > 0) { // 타격 후 살아있을 경우에만 디버프 부여
          t.grainExhaustState = 1;
          logAction("🌾 [민중 봉기] " + t.name + "에게 '군량 고갈' 상태를 1턴 부여합니다.");
                
          // 4. 엔진 표준 디버프 발생 훅(Hook) 호출 (독설가, 세금 과징수 등과 연계)
          if (typeof onDebuffInflicted === "function") {
            onDebuffInflicted(source, t, allies, enemies);
          }
        }
      }
      break;
    case "강철의 의지":
      // 1. 우군(자신 제외 아군) 필터링
      var targetAllies = aliveAllies.filter(function(a) { return a.name !== source.name; });
      if (targetAllies.length === 0) targetAllies = aliveAllies; // 만약 남은 우군이 없으면 자신 포함
            
      for (var t = 0; t < Math.min(2, targetAllies.length); t++) {
        var ally = targetAllies[t];
        
        if (ally.강철의의지Buff > 0) {
          ally.강철의의지Buff = 2; // 턴수만 갱신
          logAction("🛡️ [강철의 의지] " + ally.name + "의 버프 지속시간이 2턴으로 갱신되었습니다.");
        } else {
          // 💥 [상한선 제거] 더 이상 최고 확률에 제한을 받지 않고 정직하게 증가함
          ally.doubleAttackProb += 0.45;
          ally.lifestealProb += 0.20;
          
          ally.강철의의지DoubleAmt = 0.45; 
          ally.강철의의지LifestealAmt = 0.20;
          ally.강철의의지Buff = 2;
          
          logAction("🛡️ [강철의 의지] " + ally.name + "에게 2턴간 연타 및 회유 증가 버프를 부여합니다.");
        }
      }
      break;
    case "기문둔갑":
      aliveEnemies.forEach(function(enemy) {
        var numStatus = [enemy.silence, enemy.disarm, enemy.fear, enemy.weakness, enemy.magicState].filter(function(s) { return s > 0; }).length;
        var bonus = 1.0 + Math.min(5, numStatus) * 0.25;
        dealDamage(source, enemy, 2.5 * bonus, '책략', '기문둔갑', allies, enemies);
        if (Math.random() < (0.25 + numStatus * 0.08)) {
          enemy.fear = 1;
          logAction("💤 [공포 부여] " + enemy.name + "에게 공포 상태를 부여합니다.");
          onDebuffInflicted(source, enemy, allies, enemies);
        }
      });
      break;
    case "양책 수립":
      source.intel += 20;
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        dealDamage(source, aliveEnemies[t], 1.6, '책략', '양책 수립', allies, enemies);
      }
      break;
    case "수중전":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        var enemy = aliveEnemies[t];
        if (enemy.floodState > 0) {
          dealDamage(source, enemy, 1.648, '책략', '수중전', allies, enemies);
        } else {
          dealDamage(source, enemy, 1.03, '책략', '수중전', allies, enemies);
          enemy.floodState = 2;
          onDebuffInflicted(source, enemy, allies, enemies);
        }
      }
      break;
    case "속수무책":
      dealDamage(source, target, 2.06, '책략', '속수무책', allies, enemies);
      target.silence = 1;
      onDebuffInflicted(source, target, allies, enemies);
      break;
    case "결정적인 수":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        var enemy = aliveEnemies[t];
        var bonus = (enemy.weakness > 0) ? 1.5 : 1.0;
        dealDamage(source, enemy, 2.2 * bonus, '책략', '결정적인 수', allies, enemies);
        enemy.weakness = 2;
        onDebuffInflicted(source, enemy, allies, enemies);
      }
      break;
    case "예측의 신":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        var enemy = aliveEnemies[t];
        dealDamage(source, enemy, 1.8, '책략', '예측의 신', allies, enemies);
        if (Math.random() < 0.5) {
          enemy.silence = 1;
          onDebuffInflicted(source, enemy, allies, enemies);
        }
      }
      break;
    case "화공전술":
      aliveEnemies.forEach(function(e) {
        dealDamage(source, e, 0.8, '책략', '화공전술', allies, enemies);
        e.fireState = 2;
        onDebuffInflicted(source, e, allies, enemies);
      });
      for (var i = 0; i < Math.min(3, aliveEnemies.length); i++) {
        var rEnemy = aliveEnemies[i];
        if (rEnemy && rEnemy.hp > 0) {
          var bonus = (rEnemy.stormState > 0) ? 1.3 : 1.0;
          dealDamage(source, rEnemy, 0.8 * bonus, '책략', '소각', allies, enemies);
        }
      }
      break;
    case "전장의 노래":
      for (var t = 0; t < Math.min(2, aliveAllies.length); t++) {
        var ally = aliveAllies[t];
        heal(source, ally, 1.378, '전장의 노래');
        ally.command += 17;
      }
      break;
    case "예리한 판단":
      var rAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
      if (rAlly) {
        heal(source, rAlly, 2.6, '예리한 판단');
        rAlly.regenState = 2;
      }
      break;
    case "팔방전":
      aliveEnemies.forEach(function(enemy) {
        dealDamage(source, enemy, 1.3, '병기', '팔방전', allies, enemies);
        enemy.threatState = 2;
        onDebuffInflicted(source, enemy, allies, enemies);
      });
      break;
    case "재해 이용":
      var allTargets = aliveAllies.concat(aliveEnemies).filter(function(c) { return c !== source; });
      allTargets.forEach(function(target) {
        dealDamage(source, target, 1.4, '책략', '재해 이용', allies, enemies);
      });
      aliveEnemies.forEach(function(enemy) {
        if (enemy.fireState > 0 && Math.random() < 0.4) {
          enemy.confusion = 1;
          logAction("🌀 [재해 이용] " + enemy.name + "에게 혼란 상태 부여.");
          onDebuffInflicted(source, enemy, allies, enemies);
        }
        if (enemy.floodState > 0 && Math.random() < 0.4) {
          enemy.disarm = 1;
          logAction("🛡️ [재해 이용] " + enemy.name + "에게 무장 해제 상태 부여.");
          onDebuffInflicted(source, enemy, allies, enemies);
        }
        if (enemy.stormState > 0 && Math.random() < 0.4) {
          enemy.silence = 1;
          logAction("🤐 [재해 이용] " + enemy.name + "에게 침묵 상태 부여.");
          onDebuffInflicted(source, enemy, allies, enemies);
        }
      });
      break;
    case "칠군수몰":
      // aliveEnemies 배열(생존한 적군 전체)을 순회하며 타격 및 디버프 부여
      aliveEnemies.forEach(function(enemy) {
        
        // 1. 260% 병기 피해 (통솔을 깎는 홍수가 들어가기 전에 먼저 피해를 입힘)
        dealDamage(source, enemy, 2.6, '병기', '칠군수몰', allies, enemies);
        
        // 2. 2턴 홍수 상태 확정 부여
        enemy.floodState = 2;
        logAction("🌊 [홍수 부여] " + enemy.name + "에게 홍수 상태를 2턴 동안 부여합니다.");
        // 디버프 부여 성공 시 세금 과징수/독설가 등 패시브 연계 감지
        onDebuffInflicted(source, enemy, allies, enemies);

        // 3. 65% 확률 1턴 침묵 (개별 판정)
        if (Math.random() < 0.65) {
          enemy.silence = 1;
          logAction("🤐 [칠군수몰] " + enemy.name + "에게 침묵을 1턴 동안 부여합니다.");
          onDebuffInflicted(source, enemy, allies, enemies);
        }

        // 4. 65% 확률 1턴 무장 해제 (개별 판정)
        if (Math.random() < 0.65) {
          enemy.disarm = 1;
          logAction("🛡️ [칠군수몰] " + enemy.name + "에게 무장 해제를 1턴 동안 부여합니다.");
          onDebuffInflicted(source, enemy, allies, enemies);
        }
      });
      break;
    case "기풍당당":
      // 1. 타겟팅 수정: 엔진 공식 속성인 e.position 사용
      var backline = enemies.filter(function(e) { return e.position === '후열' && e.hp > 0; });
      var targetPool = backline.length > 0 ? backline : enemies.filter(function(e) { return e.hp > 0; });
      
      if (targetPool.length > 0) {
        // 엔진 표준 랜덤 타겟팅 함수 적용
        var target = getWeightedRandomTargets(targetPool, 1)[0];
        
        // 2. 병기 피해 240%
        dealDamage(source, target, 2.4, '병기', '기풍당당', allies, enemies);
        
        // 3. 조건부 선공 감소 체크 (타격 후 대상이 살아있을 때만)
        if (target.hp > 0) {
          if (target.stormState > 0) {
            target.speed -= 25;
            target.기풍당당SpeedDebuff = 2; // 2턴 지속 기록
            logAction("📉 [기풍당당] 목표가 이미 '폭풍' 상태이므로 선공을 25 감소시킵니다.");
          }
          
          target.stormState = 2; // 폭풍 부여
          logAction("🌪️ [기풍당당] " + target.name + "에게 '폭풍' 상태(2턴)를 부여합니다.");
          
          // 4. 엔진 표준 디버프 발생 훅(Hook) 추가 호출
          if (typeof onDebuffInflicted === "function") {
            onDebuffInflicted(source, target, allies, enemies);
          }
        }
      }
      break;
    case "퇴로 매복":
      logAction("🏹 [퇴로 매복] 매복을 시작합니다! 4회 공격을 시도합니다.");
      
      // 1. 발동 기간 동안 25% 회심 확률 적용 (엔진 표준 시스템 활용)
      var prevCrit = source.critProb;
      source.critProb += 0.25; 
      
      // 2. 4회 발동 루프
      for (var i = 0; i < 4; i++) {
        var aliveEnemies = enemies.filter(function(e) { return e.hp > 0; });
        if (aliveEnemies.length === 0) break; // 적이 전멸하면 즉시 중단
        
        // 3. 엔진 공식 타겟팅: 진형 피격률(hitWeight)이 반영된 가중치 랜덤 타겟팅
        var target = getWeightedRandomTargets(aliveEnemies, 1)[0];
        
        if (target) {
          // 4. 110% 병기 피해
          dealDamage(source, target, 1.1, '병기', '퇴로 매복', allies, enemies);
        }
      }
      
      // 5. 타격 종료 후 회심 확률을 원래대로 복구
      source.critProb = prevCrit;
      break;      
  }
}

function decayStatusEffects(characters) {
  characters.forEach(function(c) {
    if (c.tauntState > 0) {
      c.tauntState--;
      if (c.tauntState === 0) {
        c.tauntedBy = null;
        logAction("🔻 [상태 해제] " + c.name + "의 도발 상태가 해제되었습니다.");
      }
    }
    if (c.silence > 0) c.silence--;
    if (c.disarm > 0) c.disarm--;
    if (c.fear > 0) c.fear--;
    if (c.weakness > 0) c.weakness--;
    if (c.confusion > 0) c.confusion--; 
    if (c.magicState > 0) c.magicState--;
    if (c.stormState > 0) c.stormState--;
    if (c.floodState > 0) c.floodState--;
    if (c.fireState > 0) c.fireState--;
    if (c.grainExhaustState > 0) c.grainExhaustState--;
    if (c.threatState > 0) c.threatState--;
    if (c.regenState > 0) c.regenState--;
    if (c.허점공략State > 0) c.허점공략State--;
    if (c.국색State > 0) c.국색State--;
      if (c.백발백중 > 0) c.백발백중--;
    if (c.흥왕의위업State > 0) c.흥왕의위업State--;
    if (c.감녕무력Buff && c.감녕무력Buff.length > 0) {
      for (var i = c.감녕무력Buff.length - 1; i >= 0; i--) {
        c.감녕무력Buff[i]--;
        if (c.감녕무력Buff[i] <= 0) c.감녕무력Buff.splice(i, 1);
      }
    } 
    if (c.손견통솔Debuff > 0) {
      c.손견통솔Debuff--;
      if (c.손견통솔Debuff === 0) c.command += c.손견통솔DebuffAmt;
    }
    if (c.관우액티브Buff > 0) {
      c.관우액티브Buff--;
      if (c.관우액티브Buff === 0) c.activeRateBonus -= c.관우액티브BuffAmt;
    }
    if (c.청야전술Buff > 0) {
      c.청야전술Buff--;
      if (c.청야전술Buff === 0) {
        c.command = Math.max(0, c.command - 36);
        logAction("🔻 [버프 종료] " + c.name + "의 '청야 전술' 지속시간이 만료되어 통솔(36)이 원상 복구되었습니다.");
      }
    }
    if (c.강철의의지Buff > 0) {
      c.강철의의지Buff--;
      if (c.강철의의지Buff === 0) {
        c.doubleAttackProb -= c.강철의의지DoubleAmt;
        c.lifestealProb -= c.강철의의지LifestealAmt;
        c.강철의의지DoubleAmt = 0; // 기록 초기화
        c.강철의의지LifestealAmt = 0;
        logAction("🔻 [버프 종료] " + c.name + "의 '강철의 의지' 지속시간이 만료되어 연타 및 회유가 원상 복구되었습니다.");
      }
    }
    if (c.세금과징수Buff && c.세금과징수Buff.length > 0) {
      for (var i = c.세금과징수Buff.length - 1; i >= 0; i--) {
        c.세금과징수Buff[i]--;
        if (c.세금과징수Buff[i] <= 0) {
          c.세금과징수Buff.splice(i, 1);
          c.damageTakenMod += 0.1;
          logAction("🔻 [버프 종료] " + c.name + "의 '세금 과징수' 1스택이 만료되어 받는 피해가 10% 증가(원상 복구)했습니다.");
        }
      }
    }
    if (c.고육지계Buff > 0) {
      c.고육지계Buff--;
      if (c.고육지계Buff === 0) {
        c.damageTakenMod += c.고육지계ReduceAmt;
        c.고육지계ReduceAmt = 0;
        logAction("🔻 [버프 종료] " + c.name + "의 '고육지계'가 만료되어 받는 피해 감소 효과가 원상 복구되었습니다.");
      }
    }
    if (c.견결Buff > 0) {
      c.견결Buff--;
      if (c.견결Buff === 0) {
        c.damageTakenMod += 0.12;
        logAction("🔻 [버프 종료] " + c.name + "의 '견결'이 만료되어 받는 피해가 원상 복구되었습니다.");
      }
    }
    if (c.출사표Buff > 0) {
      c.출사표Buff--;
      if (c.출사표Buff === 0) c.damageTakenMod += 0.12;
    }
    if (c.출사표Debuff > 0) {
      c.출사표Debuff--;
      if (c.출사표Debuff === 0) c.damageTakenMod -= 0.12;
    }
    // 1. 파죽지세 만료
    if (c.파죽지세Buff > 0) {
        c.파죽지세Buff--;
        if (c.파죽지세Buff === 0) {
            c.critProb -= 0.2;
            logAction("🔻 [버프 종료] " + c.name + "의 '파죽지세' 지속시간이 만료되어 회심 확률이 감소했습니다.");
        }
    }
    // 찬란한 위명 버프 차감 및 만료 처리
    if (c.찬란한위명Buff > 0) {
      c.찬란한위명Buff--;
      if (c.찬란한위명Buff === 0) {
        c.lifestealProb -= (c.찬란한위명LifestealAmt || 0);
        c.찬란한위명LifestealAmt = 0; // 기록 초기화
        logAction("🔻 [버프 종료] " + c.name + "의 '찬란한 위명' 지속시간이 만료되어 회유(흡혈)가 원상 복구되었습니다.");
      }
    }
    // 경무장 2턴 버프 차감 및 만료 처리
    if (c.경무장Buff > 0) {
      c.경무장Buff--;
      if (c.경무장Buff === 0) {
        c.damageTakenMod += 0.2;
        logAction("🔻 [버프 종료] " + c.name + "의 '경무장' 지속시간이 만료되어 받는 피해가 원상 복구되었습니다.");
      }
    }
    // 2. 원문사극 다중 스택 차감
    if (c.원문사극Buff && c.원문사극Buff.length > 0) {
        for (var i = c.원문사극Buff.length - 1; i >= 0; i--) {
            c.원문사극Buff[i]--;
            if (c.원문사극Buff[i] <= 0) {
                c.원문사극Buff.splice(i, 1);
                c.activeRateBonus -= 0.1;
                logAction("🔻 [버프 종료] " + c.name + "의 '원문사극' 1스택이 만료되어 액티브 발동률이 감소했습니다.");
            }
        }
    }
    if (c.탈주병State > 0) c.탈주병State--;
     if (c.순간돌습Debuff > 0) {
      c.순간돌습Debuff--;
      if (c.순간돌습Debuff === 0) c.command += 30.9;
    }
     if (c.철기병돌격Buff > 0) {
      c.철기병돌격Buff--;
      if (c.철기병돌격Buff === 0) {
        c.critProb -= 0.206;
        logAction("🔻 [버프 종료] " + c.name + "의 '철기병 돌격'이 만료되어 회심 확률이 원상 복구되었습니다.");
      }
    }
    // 🛡️ [패치] '임시' 병법 만료 처리
    if (c.imsiBuffTurns > 0) {
        c.imsiBuffTurns--;
        if (c.imsiBuffTurns === 0) {
            c.damageTakenMod += 0.055; // 원상 복구
            logAction("🔻 [버프 종료] " + c.name + "의 '임시' 지속시간이 만료되어 받는 피해가 원상 복구되었습니다.");
        }
    }
    // 📉 [신규 패치] '저력' 병법 만료 처리
    if (c.jeoryeokDebuffTurns > 0) {
        c.jeoryeokDebuffTurns--;
        if (c.jeoryeokDebuffTurns === 0) {
            c.damageDealtMod += 0.15; // 깎였던 데미지 15% 원상 복구
            logAction("📈 [디버프 종료] " + c.name + "의 '저력' 딜 감소 효과가 만료되어 주는 피해가 원상 복구되었습니다.");
        }
    }
    // 기풍당당 선공 감소 효과 차감 및 만료 처리
    if (c.기풍당당SpeedDebuff > 0) {
      c.기풍당당SpeedDebuff--;
      if (c.기풍당당SpeedDebuff === 0) {
        c.speed += 25;
        logAction("📈 [버프 종료] '기풍당당'의 선공 감소 효과가 만료되어 " + c.name + "의 선공이 원상 복구되었습니다.");
      }
    }

    // 🔴 [고유병법 신규 버프 만료 청소]
    if (c.호가십팔박Debuff > 0) { c.호가십팔박Debuff--; if (c.호가십팔박Debuff === 0) c.intel += 30; }
    if (c.태평도법Debuff > 0) { c.태평도법Debuff--; if (c.태평도법Debuff === 0) c.tacticMods.activeDmgTaken -= 0.10; }
    if (c.지군Debuff > 0) { c.지군Debuff--; if (c.지군Debuff === 0) c.damageDealtMod += 0.10; }
    if (c.궁술Buff > 0) c.궁술Buff--;
    if (c.신무Immunity > 0) c.신무Immunity--;
    if (c.장검행Buff > 0) c.장검행Buff--;
    
    ['무하Buff', '청낭경Buff', '왕예Buff'].forEach(function(buffName) {
        if (c[buffName] && c[buffName].length > 0) {
            for (var i = c[buffName].length - 1; i >= 0; i--) {
                c[buffName][i]--;
                if (c[buffName][i] <= 0) {
                    c[buffName].splice(i, 1);
                    if (buffName === '무하Buff') c.damageTakenMod += 0.07;
                    if (buffName === '청낭경Buff') c.damageDealtMod -= 0.06;
                    if (buffName === '왕예Buff') c.activeRateBonus -= 0.04;
                }
            }
        }
    });

    if (c.신속기습ForceBuff > 0) {
        c.force -= c.신속기습ForceBuff;
        c.신속기습ForceBuff = 0;
    }
    if (c.신속기습DmgBuff > 0) {
        c.damageDealtMod -= c.신속기습DmgBuff;
        c.critProb -= c.신속기습DmgBuff;
        c.신속기습DmgBuff = 0;
        logAction("🔻 [버프 종료] " + c.name + "의 '신속기습' 효과가 만료되었습니다.");
    }

    if (c.폐월Buff > 0) { c.폐월Buff--; if (c.폐월Buff === 0) c.tacticMods.weaponDmg -= 0.15; }
    if (c.상련Buff > 0) { c.상련Buff--; if (c.상련Buff === 0) c.pierce -= 0.09; }
  });
}