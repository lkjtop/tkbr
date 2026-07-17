/**
 * Skills.gs
 * 액티브 전법(castActiveSkill), 디버프 감지(onDebuffInflicted), 턴 종료 상태 차감(decayStatusEffects) 전담
 */

function onDebuffInflicted(source, target, sourceTeam, targetTeam) {
  if (!source || !target || source.hp <= 0 || target.hp <= 0) return;
  
  if (source.skills.indexOf("세금 과징수") !== -1) {
    if (source.세금과징수Count < 10) {
      source.세금과징수Count++;
      
      // 1. 치유량 계산 정상화 (지력 40%)
      var healAmt = Math.round(source.intel * 0.4); 
      healAmt = Math.min(healAmt, source.maxHp - source.hp);
      source.hp += healAmt;
      source.totalHealingDone += healAmt;
      logAction("💰 [세금 과징수] 디버프 부여 후 자가 치유 발동! " + source.name + "의 병력을 " + healAmt + " 회복시켰습니다. (턴 내 발동: " + source.세금과징수Count + "/10)");
      
      // 2. 2턴 지속, 최대 4스택 버프 로직
      if (!source.세금과징수Buff) source.세금과징수Buff = [];
      if (source.세금과징수Buff.length < 4) {
        source.세금과징수Buff.push(2); // 2턴 지속시간 추가
        source.damageTakenMod -= 0.1; // 피해 감소 10%
        logAction("  └ " + source.name + "의 받는 피해가 2턴간 10% 감소합니다. (현재 중첩: " + source.세금과징수Buff.length + "/4)");
      } else {
        // 이미 4스택이면 지속시간이 짧은 스택을 갱신
        var refreshed = false;
        for(var i=0; i<source.세금과징수Buff.length; i++) {
          if(source.세금과징수Buff[i] < 2) {
            source.세금과징수Buff[i] = 2;
            refreshed = true;
            break;
          }
        }
        if (refreshed) logAction("  └ " + source.name + "의 '세금 과징수' 방어 버프 지속시간이 갱신되었습니다.");
      }
    }
  }
  
  var team = sourceTeam;
  var oppTeam = targetTeam;
  
  if (team) {
    team.forEach(function(member) {
      if (member.hp > 0 && member.skills.indexOf("독설가") !== -1) {
        if (member.독설가Count < 2 && Math.random() < 0.6) {
          member.독설가Count++;
          var aliveEnemies = oppTeam.filter(function(e) { return e.hp > 0; });
          if (aliveEnemies.length > 0) {
            var rEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
            logAction("🗣️ [독설가] 적군 디버프 감지! 추가 책략 피해 발동! (턴 내 발동: " + member.독설가Count + "/2)");
            dealDamage(member, rEnemy, 1.1, '책략', '독설가', team, oppTeam);
          }
        }
      }
    });
  }
}

function castActiveSkill(skill, source, allies, enemies) {
  var targetDeck = enemies;
  var sourceDeck = allies;
  var aliveEnemies = targetDeck.filter(function(c) { return c.hp > 0; });
  var aliveAllies = sourceDeck.filter(function(c) { return c.hp > 0; });

  if (aliveEnemies.length === 0) return;
  var target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];

  logAction("🔥 [액티브] " + source.name + "이(가) '" + skill + "' 전법을 시전합니다!");

  switch(skill) {
    case "비분시":
      aliveAllies.forEach(function(ally) {
        heal(source, ally, 1.2, "비분시");
        ally.shieldStacks++;
        if (ally.idx === 0) heal(source, ally, 0.5, "비분시");
      });
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
      var commandDiff = target.command > source.command;
      var reduction = commandDiff ? 60 : 40;
      target.손견통솔Debuff = 2;
      target.손견통솔DebuffAmt = reduction;
      target.command = Math.max(0, target.command - reduction); // 2턴 지속으로 변경됨
      dealDamage(source, target, 2.5, '병기', '무열황제', allies, enemies);
      target.fear = 1;
      logAction("💤 [무열황제] " + target.name + "의 통솔을 " + reduction + " 감소시키고 공포를 1턴 부여합니다.");
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
      }

      // 3. 랜덤 적군 2명 타격 및 화공 부여
      var targetEnemies = [].concat(aliveEnemies).sort(function() { return Math.random() - 0.5; }); // 랜덤 셔플
      for (var t = 0; t < Math.min(2, targetEnemies.length); t++) {
        dealDamage(source, targetEnemies[t], 2.2, '책략', '고육지계', allies, enemies);
        targetEnemies[t].fireState = 2;
        onDebuffInflicted(source, targetEnemies[t], allies, enemies);
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
      aliveEnemies.forEach(function(enemy) {
        dealDamage(source, enemy, 1.4, '병기', '만인지적', allies, enemies);
        if (enemy.threatState > 0 && Math.random() < 0.3) {
          enemy.fear = 1;
          logAction("💤 [공포 연계] " + enemy.name + "에게 공포를 부여합니다.");
        }
        enemy.threatState = 2;
        onDebuffInflicted(source, enemy, allies, enemies);
      });
      break;
    case "화하 진압":
      var threatCount = aliveEnemies.filter(function(e) { return e.threatState > 0; }).length;
      source.관우액티브Buff = 2;
      source.관우액티브BuffAmt = 0.08 + threatCount * 0.03;
      source.activeRateBonus += source.관우액티브BuffAmt; // 2턴 지속으로 변경됨
      aliveEnemies.forEach(function(enemy) {
        dealDamage(source, enemy, 1.8, '병기', '화하 진압', allies, enemies);
        if (enemy.silence > 0 || enemy.disarm > 0 || enemy.fear > 0 || enemy.weakness > 0 || enemy.confusion > 0) {
          enemy.grainExhaustState = 2; // (탈주병 대체)
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
      source.critProb = Math.min(0.5, source.critProb + 0.2);
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
      source.lifestealProb = Math.min(0.5, source.lifestealProb + 0.3);
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
      var frontRow = aliveEnemies.filter(function(c) { return c.idx === 0; });
      var finalTarget = frontRow.length > 0 ? frontRow[0] : target;
      dealDamage(source, finalTarget, 4.532, '병기', '응전', allies, enemies);
      break;
    case "기풍당당":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
          dealDamage(source, aliveEnemies[t], 1.8, '병기', '기풍당당', allies, enemies);
          aliveEnemies[t].stormState = 2;
          onDebuffInflicted(source, aliveEnemies[t], allies, enemies);
      }
      break;
    case "민중 봉기":
      for (var t = 0; t < Math.min(2, aliveEnemies.length); t++) {
        dealDamage(source, aliveEnemies[t], 1.545, '병기', '민중 봉기', allies, enemies);
        aliveEnemies[t].grainExhaustState = 1;
        onDebuffInflicted(source, aliveEnemies[t], allies, enemies);
      }
      break;
    case "강철의 의지":
      // 1. 우군(자신 제외 아군) 필터링
      var targetAllies = aliveAllies.filter(function(a) { return a.name !== source.name; });
      if (targetAllies.length === 0) targetAllies = aliveAllies; // 만약 남은 우군이 없으면 자신 포함
      
      // 2. 랜덤 대상 선정을 위해 셔플
      targetAllies.sort(function() { return Math.random() - 0.5; });
      
      for (var t = 0; t < Math.min(2, targetAllies.length); t++) {
        var ally = targetAllies[t];
        
        if (ally.강철의의지Buff > 0) {
          ally.강철의의지Buff = 2; // 이미 버프가 있다면 턴수만 갱신 (수치 중복 적용 방지)
          logAction("🛡️ [강철의 의지] " + ally.name + "의 버프 지속시간이 2턴으로 갱신되었습니다.");
        } else {
          var prevDouble = ally.doubleAttackProb;
          var prevLife = ally.lifestealProb;
          
          ally.doubleAttackProb = Math.min(0.8, ally.doubleAttackProb + 0.45);
          ally.lifestealProb = Math.min(0.5, ally.lifestealProb + 0.2);
          
          // 상한선(0.8, 0.5) 때문에 '실제로 올라간 수치'만큼만 기록
          ally.강철의의지DoubleAmt = ally.doubleAttackProb - prevDouble;
          ally.강철의의지LifestealAmt = ally.lifestealProb - prevLife;
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
      for (var i = 0; i < 3; i++) {
        var rEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        if (rEnemy) {
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
  }
}

function decayStatusEffects(characters) {
  characters.forEach(function(c) {
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
  });
}