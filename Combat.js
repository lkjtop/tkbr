/**
 * Combat.gs
 * 데미지 연산, 회복, 일반 공격 및 타겟팅 전담
 */

// 진형의 피격률(hitWeight)을 기반으로 중복 없이 N명의 타겟을 추출/정렬하는 유틸리티
function getWeightedRandomTargets(targets, count) {
  if (!targets || targets.length === 0) return [];
  var result = [];
  var pool = [].concat(targets);

  for (var i = 0; i < count; i++) {
    if (pool.length === 0) break;
    
    var totalWeight = 0;
    pool.forEach(function(c) { totalWeight += (c.hitWeight || 33); });
    
    var randomPoint = Math.random() * totalWeight;
    var currentWeight = 0;
    var selectedIdx = pool.length - 1; // Fallback
    
    for (var j = 0; j < pool.length; j++) {
      currentWeight += (pool[j].hitWeight || 33);
      if (randomPoint <= currentWeight) {
        selectedIdx = j;
        break;
      }
    }
    
    result.push(pool[selectedIdx]);
    pool.splice(selectedIdx, 1); // 뽑힌 타겟은 풀에서 제거 (중복 방지)
  }
  return result;
}

function getAttackTarget(actor, enemies) {
  // 1. 혼란 및 제어 상태 판정
  if (actor.confusion > 0 && actor.regenState <= 0) {
    var aliveEnemies = enemies.filter(function(c) { return c.hp > 0; });
    if (aliveEnemies.length > 0) {
      var target = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      logAction("🌀 [혼란] " + actor.name + "이(가) 혼란 상태로 대상을 무작위로 공격합니다!");
      return target;
    }
  } else if (actor.confusion > 0 && actor.regenState > 0) {
    logAction("✨ [정신 회복] " + actor.name + "이(가) 정신 회복 효과로 혼란을 극복하고 정상 타겟팅합니다.");
  }
  
  var alive = enemies.filter(function(c) { return c.hp > 0; });
  if (alive.length === 0) return null;
  
  // 2. 도발 상태 판정
  if (actor.tauntedBy && actor.tauntedBy.hp > 0 && actor.regenState <= 0) return actor.tauntedBy;
  
  // 3. 진형별 피격률(hitWeight)을 반영한 가중치 무작위 타겟팅 (Weighted Random)
  var totalWeight = 0;
  alive.forEach(function(c) { totalWeight += (c.hitWeight || 33); });
  
  var randomPoint = Math.random() * totalWeight;
  var currentWeight = 0;
  
  for (var i = 0; i < alive.length; i++) {
    currentWeight += (alive[i].hitWeight || 33);
    if (randomPoint <= currentWeight) {
      return alive[i];
    }
  }
  
  return alive[alive.length - 1]; // Fallback
}

function isActiveSkill(skillName) {
  if (!skillName) return false;
  return skillTypes[skillName] === "액티브";
}

function dealDamage(source, target, coef, type, skillName, allies, enemies) {
if (source.hp <= 0 || target.hp <= 0) return 0;
  
  var hasSeoseong = allies.find(function(c) { return c.skills.indexOf("백리의성") !== -1 && c.hp > 0; });
  if (hasSeoseong && typeof turn !== 'undefined' && turn <= 4 && Math.random() < 0.25) {
    target.shieldStacks++;
    logAction("🧱 [백리의성] 서성의 지휘! " + target.name + "이(가) 피격 직전 방어막 1스택을 획득했습니다.");
  }

  var dodgeChance = target.dodgeProb;
  if (target.name === "조운") dodgeChance = Math.max(dodgeChance, 0.35);
  
  var ignoreDodge = (source.백발백중 > 0);
  if (!ignoreDodge && Math.random() < dodgeChance) {
    logAction("🛡️ [회피] " + target.name + "이(가) " + source.name + "의 '" + skillName + "' 공격을 회피했습니다!");
    
    if (target.name === "조운" && target.용담Count < 7) {
        target.용담Count++;
        logAction("⚡ [용담 반격] 조운의 칠진칠출 반격 개시! (횟수: " + target.용담Count + "/7)");
        var aliveTargets = allies.filter(function(c) { return c.hp > 0; }); 
        for(var t=0; t < Math.min(2, aliveTargets.length); t++) {
            var rTarget = aliveTargets[Math.floor(Math.random() * aliveTargets.length)];
            dealDamage(target, rTarget, 0.9, '병기', '용담', enemies, allies); 
        }
    }
    return 0;
  }

  // [패치] 방어막 무효화 -> 70%~90% 랜덤 피해 감소 스택 소모로 변경
  var shieldMult = 1.0;
  if (target.shieldStacks > 0) {
    target.shieldStacks--;
    var blockRate = 0.7 + Math.random() * 0.2; // 0.7 ~ 0.9 랜덤
    shieldMult = 1.0 - blockRate;
    logAction("🧱 [방어막] " + target.name + "의 방어막 작동! 피해가 " + (blockRate*100).toFixed(1) + "% 감소합니다. (남은 방어막: " + target.shieldStacks + "개)");
  }

  var relationMult = 1.0;
  if (source.troop === "방패병" && target.troop === "궁병") relationMult = 1.15;
  else if (source.troop === "궁병" && target.troop === "창병") relationMult = 1.15;
  else if (source.troop === "창병" && target.troop === "기병") relationMult = 1.15;
  else if (source.troop === "기병" && target.troop === "방패병") relationMult = 1.15;
  if (relationMult > 1.0) {
    logAction("💥 [병종 상성 우세] " + source.name + "(" + source.troop + ") ➔ " + target.name + "(" + target.troop + ") (+15% 피해)");
  }

  // [패치] 홍수(-20) 및 화공(-15) 디버프 스탯 감소 적용
  var defCommand = target.command - (target.floodState > 0 ? 20 : 0);
  if (source.pierce > 0) defCommand *= (1 - source.pierce);
  
  var defIntel = target.intel - (target.fireState > 0 ? 15 : 0);
  if (source.insight > 0) defIntel *= (1 - source.insight);

  var baseDmg = 0;
  var critMult = (source.magicState > 0) ? 1.35 : 1.5;
  if (source.critDamageMod) critMult += source.critDamageMod; // 철기령 보정 (+0.1)
  var isCrit = false;
  var isSpellCrit = false;

  if (type === '병기') {
    baseDmg = (source.force * 1.5 - defCommand) * coef * relationMult;
    if (baseDmg < 50 * coef) baseDmg = 50 * coef;

    var critChance = source.critProb;
    if (skillName !== '척살' && Math.random() < critChance) {
      baseDmg *= critMult;
      isCrit = true; 
      logAction(source.magicState > 0 ? "💥 [회심] 요술에 걸려 회심 피해가 감소(135%)되어 들어갑니다!" : "💥 [회심] " + source.name + "의 회심(물리 크리티컬) 발동!");
    }
  } else {
    baseDmg = (source.intel * 1.5 - defIntel) * coef * relationMult;
    if (baseDmg < 50 * coef) baseDmg = 50 * coef;
    if (Math.random() < source.spellCritProb) {
      baseDmg *= critMult;
      isSpellCrit = true; 
      logAction(source.magicState > 0 ? "🔮 [묘책] 요술에 걸려 묘책 피해가 감소(135%)되어 들어갑니다!" : "🔮 [묘책] " + source.name + "의 묘책(책략 크리티컬) 발동!");
    }
  }

  // [패치] 위협(피해 10% 증가) 및 허약(주는 피해 70% 감소) 적용
  if (target.threatState > 0) baseDmg *= 1.1;
  if (source.weakness > 0 && source.regenState <= 0) {
    baseDmg *= 0.3;
    logAction("❌ [허약] " + source.name + "이(가) 허약 상태로 가하는 피해가 70% 감소합니다.");
  }
  
  baseDmg *= shieldMult; // 방어막 뎀감 적용

  if (target.허점공략State > 0) baseDmg *= (1 - 0.2756);
  if (target.흥왕의위업State > 0) {
    baseDmg *= (1 - 0.14);
  }

  if (target.skills.indexOf("위기의 결전") !== -1 && skillName === '일반 공격') {
      baseDmg *= (1 - 0.212);
  }
  
  if (target.국색State > 0) {
        baseDmg *= 1.2; 
  }

  if (skillName === '척살') {
      var hasDebuff = target.silence > 0 || target.disarm > 0 || target.fear > 0 || target.weakness > 0 || target.confusion > 0 || target.magicState > 0 || target.stormState > 0 || target.floodState > 0 || target.fireState > 0 || target.grainExhaustState > 0 || target.threatState > 0;
      if (hasDebuff) {
        baseDmg *= 1.2;
        logAction("⚡ [기병 돌격] 대상이 디버프 상태이므로 척살 피해가 20% 증가합니다!");
      } 
  }

  baseDmg *= source.damageDealtMod;
  baseDmg *= target.damageTakenMod;
  
  if (isActiveSkill(skillName) && source.skills.indexOf("신의 가호") !== -1) {
    baseDmg *= 1.15;
  }

  var finalDmg = Math.round(baseDmg + (Math.random() * 80 - 40));
  if (finalDmg < 10) finalDmg = 10;
  finalDmg = Math.min(finalDmg, target.hp);

  target.hp -= finalDmg;
  source.totalDamageDealt += finalDmg;
  target.totalDamageTaken += finalDmg;
  source.damageDealtThisTurn += finalDmg;
  target.damageTakenThisTurn += finalDmg;

  var critTag = "";
  if (isCrit) critTag = " 💥[회심 적중!]";
  if (isSpellCrit) critTag = " 🔮[묘책 적중!]";

  logAction("⚔️ [" + skillName + "] " + source.name + "이(가) " + target.name + "에게 " + finalDmg + "의 " + type + " 피해를 입혔습니다." + critTag + " (남은 병력: " + target.hp + ")");
  
  if (isCrit && source.skills.indexOf("기병 돌격") !== -1 && source.척살Count < 5) {
    source.척살Count++;
    logAction("⚡ [기병 돌격] 메인 타격 회심 적중! (턴 내 발동: " + source.척살Count + "/5)");
    
    var prevPierce = source.pierce;
    source.pierce = 1.0; // 일시적으로 통솔 무시 100% 적용
    dealDamage(source, target, 0.6, '병기', '척살', allies, enemies);
    source.pierce = prevPierce; // 공격 후 원상 복구
  }

  if (type === '책략' && source.skills.indexOf("충신의 기재") !== -1 && source.충신의기재Count < 4 && Math.random() < 0.5) {
      source.intel += 10;
      source.충신의기재Count++;
      logAction("🧠 [충신의 기재] 책략 피해 적중! 지력이 10 상승합니다. (중첩: " + source.충신의기재Count + "/4)");
  }

  if (type === '책략' && source.skills.indexOf("패잔병 척결") !== -1 && source.패잔병척결Count < 1) {
      if (Math.random() < 0.6) {
          source.패잔병척결Count++;
          logAction("⚔️ [패잔병 척결] 책략 피해 적중! " + source.name + "이(가) 60% 확률로 일반 공격을 추가 시전합니다.");
          var aliveEnemies = enemies.filter(function(e) { return e.hp > 0; });
          if (aliveEnemies.length > 0) {
              var rEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
              performNormalAttack(source, rEnemy, allies, enemies);
          }
      } else {
          logAction("  └ 🚫 [패잔병 척결] 발동 실패 (확률: 60%)");
      }
  }

  if (type === '병기' && source.lifestealProb > 0) {
    heal(source, source, (finalDmg * source.lifestealProb) / source.intel, '회유');
  }
  if (type === '책략' && source.psyLifestealProb > 0) {
    heal(source, source, (finalDmg * source.psyLifestealProb) / source.intel, '심리 공격');
  }

  var infoGen = allies.find(function(c) { return c.skills.indexOf("흥왕의 위업") !== -1 && c.hp > 0; });
  if (infoGen) {
    if (type === '병기' && Math.random() < 0.6) {
      var aliveAllies = allies.filter(function(c) { return c.hp > 0; });
      if (aliveAllies.length > 0) {
        var rAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
        logAction("🛡️ [흥왕의 위업] 정보 치유 발동!");
        heal(infoGen, rAlly, 0.4, '흥왕의 위업');
      }
    } else if (type === '책략' && Math.random() < 0.6) {
      var rAlly = allies[Math.floor(Math.random() * allies.length)];
      rAlly.흥왕의위업State = 2;
      logAction("🛡️ [흥왕의 위업] " + rAlly.name + "의 받는 피해가 2턴간 14% 감소합니다.");
    }
  }

  if (source.name === "관평" && type === '병기' && source.용의포효Count < 4 && Math.random() < 0.76) {
    source.용의포효Count++;
    if (target.threatState > 0) {
      logAction("🐉 [용의 포효] 위협 상태의 대상에게 연쇄 피해!");
      dealDamage(source, target, 1.0, '병기', '용의 포효', allies, enemies);
    } else {
      target.threatState = 2;
      logAction("🐉 [용의 포효] " + target.name + "에게 위협 상태를 2턴 동안 부여합니다.");
      onDebuffInflicted(source, target, allies, enemies);
    }
  }

  // --- 초선차전 피격 및 타격 시 반격 발동 ---
  if (source.skills.indexOf("초선차전") !== -1 && skillName !== "초선차전" && source.제갈량Count < 5 && Math.random() < 0.5) {
    source.제갈량Count++;
    var aliveEnemies = enemies.filter(function(c) { return c.hp > 0; });
    if (aliveEnemies.length > 0) {
      var rEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      logAction("⚡ [초선차전] 피해를 주어 지휘 효과 발동! (횟수: " + source.제갈량Count + "/5)");
      dealDamage(source, rEnemy, 0.8, '책략', '초선차전', allies, enemies);
    }
  }

  if (target.skills.indexOf("초선차전") !== -1 && skillName !== "초선차전" && target.제갈량Count < 5 && Math.random() < 0.5) {
    target.제갈량Count++;
    var aliveEnemies = allies.filter(function(c) { return c.hp > 0; }); // 타겟의 적군은 곧 소스의 아군
    if (aliveEnemies.length > 0) {
      var rEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      logAction("⚡ [초선차전] 피해를 받아 지휘 반격 발동! (횟수: " + target.제갈량Count + "/5)");
      dealDamage(target, rEnemy, 0.8, '책략', '초선차전', enemies, allies); 
    }
  }

  if (target.skills.indexOf("위기의 결전") !== -1 && type === '병기' && Math.random() < 0.424) {
      logAction("⚔️ [반격] " + target.name + "의 '위기의 결전' 반격 발동!");
      dealDamage(target, source, 1.0, '병기', '위기의 결전 (반격)', enemies, allies); 
  }

  if (target.skills.indexOf("침착한 지휘") !== -1 && target.damageTakenThisTurn === 0) {
      var aliveEnemies = enemies.filter(function(e) { return e.hp > 0; });
      var targetEnemies = getWeightedRandomTargets(aliveEnemies, 2); // 가중치 적용
      for(var t=0; t < targetEnemies.length; t++) {
          targetEnemies[t].damageTakenMod = Math.min(2.0, targetEnemies[t].damageTakenMod + 0.1); 
          if (Math.random() < 0.6) {
              aliveEnemies[t].disarm = 2; // 60% 확률, 2턴간 부여
              logAction("🛡️ [침착한 지휘] " + aliveEnemies[t].name + "에게 무장해제를 2턴간 부여합니다.");
          }
      }
  }

  return finalDmg;
}

function heal(source, target, coef, skillName, teamArray) {
  if (!source || !target || source.hp <= 0 || target.hp <= 0) return 0;
  
  var healAmt = Math.round(source.intel * coef);
  if (skillName === "강동 제패") healAmt = Math.round(source.force * coef);

  if (source.strategies && source.strategies.indexOf("인의론") !== -1) {
    healAmt = Math.round(healAmt * 1.12); 
  }

  if (target.grainExhaustState > 0) {
    healAmt = Math.round(healAmt * 0.3);
    logAction("🌾 [군량 고갈] " + target.name + "이(가) 군량 고갈로 치유량이 감소했습니다!");
  }

  healAmt = Math.min(healAmt, target.maxHp - target.hp);
  target.hp += healAmt;
  source.totalHealingDone += healAmt;
  logAction("💚 [" + skillName + "] " + source.name + "이(가) " + target.name + "의 병력을 " + healAmt + " 회복시켰습니다.");
  
  if (source.strategies && source.strategies.indexOf("인의론") !== -1) {
    if (source !== target) { 
      source.인의론Count = (source.인의론Count || 0) + 1;
      if (source.인의론Count >= 4 && !source.인의론TurnTriggered) {
        source.인의론TurnTriggered = true; 
        source.인의론Count = 0; 
        
        // typeof 방어 로직: 인자 없이 heal이 호출되어도 에러 발생 차단
        if (typeof teamArray !== "undefined" && teamArray) { 
          var aliveAllies = teamArray.filter(function(a) { return a.hp > 0 && a !== source; });
          if (aliveAllies.length > 0) {
            var rAlly = aliveAllies[Math.floor(Math.random() * aliveAllies.length)];
            rAlly.regenState = 1;
            logAction("📖 [고유병법] '인의론' 발동! 4회 치유 누적 달성. " + rAlly.name + "에게 정신 회복(1턴)을 부여합니다.");
          }
        }
      }
    }
  }
  return healAmt;
}

function performNormalAttack(source, target, allies, enemies) {
  if (source.hp <= 0 || target.hp <= 0) return;
  
  var dmgCoef = 1.0;
  var currentForce = source.force; // 버프 연산용 임시 변수
  if (source.skills.indexOf("수전의 제왕") !== -1) {
      dmgCoef = 2.5;
      if (source.감녕무력Buff.length < 4) {
          source.감녕무력Buff.push(2); // 2턴 지속 버프 스택 추가
      }
      currentForce += (source.감녕무력Buff.length * 12);
      logAction("⚓ [수전의 제왕] 감녕 무력 증가(현재중첩:" + source.감녕무력Buff.length + ") 및 피해 150% 증폭!");
  }

  dealDamage(source, target, dmgCoef, '병기', '일반 공격', allies, enemies);
  var targetDeck = enemies;
  var sourceDeck = allies;

  source.skills.forEach(function(skill) {
    if (!skill) return;
    
    if (!skillTypes[skill] || skillTypes[skill].toString().indexOf("추격") === -1) {
      return; 
    }

    var rate = getSkillProb(skill, source.name);
    if (rate > 0) {
      if (Math.random() < rate) {
        logAction("⚡ [추격 전법] " + source.name + "의 추격 전법 '" + skill + "' 발동!");

        if (skill === "남다른 완력") {
          var extra = (target.force < source.force) ? 0.7 : 0;
          dealDamage(source, target, 1.5 + extra, '병기', '남다른 완력', allies, enemies);
        } else if (skill === "치열한 교전") {
          var lowestHpEnemy = targetDeck.filter(function(c) { return c.hp > 0; }).sort(function(x, y) { return x.hp - y.hp; })[0];
          if (lowestHpEnemy) {
            source.백발백중 = 2;
            dealDamage(source, lowestHpEnemy, 2.8, '병기', '치열한 교전', allies, enemies);
          }
        } else if (skill === "무방비 공격") { 
          dealDamage(source, target, 2.8, '병기', '무방비 공격', allies, enemies);
          if (target.silence > 0) {
            if (Math.random() < 0.5) {
              target.fear = 1;
              logAction("💤 [무방비 공격] 대상이 이미 침묵 상태이므로 50% 확률로 공포를 1턴 부여합니다.");
              onDebuffInflicted(source, target, allies, enemies);
            }
          } else {
            target.silence = 1; 
            logAction("🤐 [무방비 공격] 대상에게 침묵을 1턴 부여합니다.");
            onDebuffInflicted(source, target, allies, enemies);
          }
        } else if (skill === "전장 평정") {
          target.speed = Math.max(0, target.speed - 24);
          target.force = Math.max(0, target.force - 24);
          dealDamage(source, target, 1.8, '병기', '전장 평정', allies, enemies);
          onDebuffInflicted(source, target, allies, enemies);
        } else if (skill === "천리기습") {
          var lowestSpeedEnemy = targetDeck.filter(function(c) { return c.hp > 0; }).sort(function(x, y) { return x.speed - y.speed; })[0];
          if (lowestSpeedEnemy) {
            var bonus = (lowestSpeedEnemy.idx > 0) ? 3.8 : 2.8;
            dealDamage(source, lowestSpeedEnemy, bonus, '병기', '천리기습', allies, enemies);
          }
        } else if (skill === "원문사극") {
          dealDamage(source, target, 2.2, '병기', '원문사극', allies, enemies);
          if (source.position === "후열" && Math.random() < 0.75) source.activeRateBonus = Math.min(0.3, source.activeRateBonus + 0.1);
        } else if (skill === "허점 공격") {
          var rEnemy = getWeightedRandomTargets(targetDeck.filter(function(c){return c.hp>0;}), 1)[0];
          if (rEnemy) {
            var bonus = (rEnemy.weakness > 0) ? 1.3 : 1.0;
            dealDamage(source, rEnemy, 2.8 * bonus, '병기', '허점 공격', allies, enemies);
            if (rEnemy.weakness <= 0 && Math.random() < 0.65) {
              rEnemy.weakness = 1;
              logAction("❌ [허약 부여] " + rEnemy.name + "에게 허약 상태를 1턴 동안 부여합니다.");
              onDebuffInflicted(source, rEnemy, allies, enemies);
            }
          }
        } else if (skill === "창고 기습") {
          var bonus = (target.grainExhaustState > 0) ? 1.0 : 0;
          dealDamage(source, target, 3.0 + bonus, '책략', '창고 기습', allies, enemies);
          target.grainExhaustState = 2;
          onDebuffInflicted(source, target, allies, enemies);
        } else if (skill === "넘치는 계책") {
          var backRow = targetDeck.filter(function(c) { return c.position === "후열" && c.hp > 0; });
          var finalTarget = backRow.length > 0 ? backRow[Math.floor(Math.random() * backRow.length)] : target;
          dealDamage(source, finalTarget, 2.5, '책략', '넘치는 계책', allies, enemies);
        } else if (skill === "신속전개") {
          source.speed += 30;
          var targets = getWeightedRandomTargets(targetDeck.filter(function(c){return c.hp>0;}), 2);
          for (var t = 0; t < Math.min(2, targets.length); t++) {
            dealDamage(source, targets[t], 1.8, '병기', '신속전개', allies, enemies);
          }
        } else if (skill === "경무장") {
          var aliveAllies = sourceDeck.filter(function(c) { return c.hp > 0; });
          for (var t = 0; t < Math.min(2, aliveAllies.length); t++) {
            aliveAllies[t].shieldStacks++;
            aliveAllies[t].damageTakenMod = Math.max(0.5, aliveAllies[t].damageTakenMod - 0.2);
          }
        }
      } else {
        logAction("  └ 🚫 [추격 실패] '" + skill + "' 전법 발동에 실패했습니다. (확률: " + (rate * 100).toFixed(1) + "%)");
      }
    }
  });

  if (source.skills.indexOf("용맹한 삼군") !== -1) {
    source.damageDealtMod = Math.min(1.36, source.damageDealtMod + 0.06); // 6%씩 최대 36%
    source.용맹한삼군Count++;
    if (source.용맹한삼군Count % 3 === 0) {
      var rEnemy = getWeightedRandomTargets(targetDeck.filter(function(c){return c.hp>0;}), 1)[0];
      if (rEnemy) {
        logAction("💰 [용맹한 삼군] 3회 공격 누적! 추가 병기 피해 발동!");
        dealDamage(source, rEnemy, 2.0, '병기', '용맹한 삼군', allies, enemies);
      }
    }
  }

  if (source.skills.indexOf("강습") !== -1) {
    var rEnemy = getWeightedRandomTargets(targetDeck.filter(function(c){return c.hp>0;}), 1)[0];
    if (rEnemy) {
      logAction("⚔️ [강습] 추가 협공 피해!");
      dealDamage(source, rEnemy, 0.848, '병기', '강습', allies, enemies);
    }
  }
}