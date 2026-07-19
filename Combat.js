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
  
  // 1. 방어막, 회피, 백리의성 처리
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

  var shieldMult = 1.0;
  if (target.shieldStacks > 0) {
    target.shieldStacks--;
    var blockRate = 0.7 + Math.random() * 0.2;
    shieldMult = 1.0 - blockRate;
    logAction("🧱 [방어막] " + target.name + "의 방어막 작동! 피해가 " + (blockRate*100).toFixed(1) + "% 감소합니다.");
  }

  var relationMult = 1.0;
  if (source.troop === "방패병" && target.troop === "궁병") relationMult = 1.15;
  else if (source.troop === "궁병" && target.troop === "창병") relationMult = 1.15;
  else if (source.troop === "창병" && target.troop === "기병") relationMult = 1.15;
  else if (source.troop === "기병" && target.troop === "방패병") relationMult = 1.15;
  if (relationMult > 1.0) {
    logAction("💥 [병종 상성 우세] " + source.name + "(" + source.troop + ") ➔ " + target.name + "(" + target.troop + ") (+15% 피해)");
  }

  // =================================================
  // 🔴 [병법 패치] 턴(Turn) 및 중첩 기반 확률 스탯 보정
  // =================================================
  var isOdd = (typeof turn !== 'undefined' && turn % 2 !== 0);
  var isEven = (typeof turn !== 'undefined' && turn % 2 === 0);
  var isTurn1to4 = (typeof turn !== 'undefined' && turn <= 4);
  var isTurn4Onwards = (typeof turn !== 'undefined' && turn >= 4);

  var curPierce = source.pierce;
  var curCrit = source.critProb;
  var curSpellCrit = source.spellCritProb;
  
  if (source.tacticMods) {
      if (isOdd) {
          curPierce += source.tacticMods.pierceOdd;
          curCrit += source.tacticMods.critProbOdd;
      }
      if (isTurn1to4 && typeof turn !== 'undefined' && turn <= 3) curCrit += source.tacticMods.critProbTurn3;
      if (isEven) curSpellCrit += source.tacticMods.spellCritProbEven;
      curPierce += (source.tacticMods.stackPierce * 0.015); // '득세' 스택 (관통 증가)
  }

  var defCommand = target.command - (target.floodState > 0 ? 20 : 0);
  if (curPierce > 0) defCommand *= (1 - curPierce);
  var defIntel = target.intel - (target.fireState > 0 ? 15 : 0);
  if (source.insight > 0) defIntel *= (1 - source.insight);

  // 2. 기본 대미지 및 크리티컬 연산
  var baseDmg = 0;
  var critMult = (source.magicState > 0) ? 1.35 : 1.5;
  if (source.critDamageMod) critMult += source.critDamageMod;
  var isCrit = false;
  var isSpellCrit = false;

  if (type === '병기') {
    baseDmg = (source.force * 1.5 - defCommand) * coef * relationMult;
    if (baseDmg < 50 * coef) baseDmg = 50 * coef;
    if (skillName !== '척살' && Math.random() < curCrit) {
      baseDmg *= critMult;
      isCrit = true; 
      logAction(source.magicState > 0 ? "💥 [회심] 요술에 걸려 회심 피해가 감소(135%)되어 들어갑니다!" : "💥 [회심] " + source.name + "의 회심 발동!");
    }
  } else {
    baseDmg = (source.intel * 1.5 - defIntel) * coef * relationMult;
    if (baseDmg < 50 * coef) baseDmg = 50 * coef;
    if (Math.random() < curSpellCrit) {
      baseDmg *= critMult;
      isSpellCrit = true; 
      logAction(source.magicState > 0 ? "🔮 [묘책] 요술에 걸려 묘책 피해가 감소(135%)되어 들어갑니다!" : "🔮 [묘책] " + source.name + "의 묘책 발동!");
    }
  }

  var troopMod = Math.sqrt(source.hp) / 50.0;
  baseDmg *= troopMod;

  // =================================================
  // 🔴 [병법 패치] 공용 병법 피해/피격 증감 합연산 적용
  // =================================================

  // 고육지계 인연 트리거 감지 및 버프 활성화
  if (target.고육지계BondActive && !target.고육지계BondTriggered) {
      var isAlly = allies.some(function(a) { return a.name === source.name; });
      if (isAlly && source.name !== target.name) { 
          target.고육지계BondTriggered = true;
          if (!target.tacticMods) target.tacticMods = {};
          target.tacticMods.activeDmgTaken = (target.tacticMods.activeDmgTaken || 0) + 0.12; 
          logAction("🔗 [인연-고육지계] 우군의 타격을 감지하여 " + target.name + "의 받는 액티브 피해가 12% 감소합니다!");
      }
  }

  var totalDmgMod = 1.0;
  totalDmgMod += (source.damageDealtMod - 1.0); 
  totalDmgMod += (target.damageTakenMod - 1.0); 

  if (source.tacticMods) {
      totalDmgMod += source.tacticMods.dmgDealt;
      if (source.pos === '후열') totalDmgMod += source.tacticMods.dmgDealtIfBack;
      if (source.pos === '전열') totalDmgMod += source.tacticMods.dmgDealtIfFront;
      if (target.pos === '전열') totalDmgMod += source.tacticMods.dmgDealtToFront;
      
      var targetHasDebuff = target.silence > 0 || target.disarm > 0 || target.fear > 0 || target.weakness > 0 || target.confusion > 0 || target.magicState > 0 || target.stormState > 0 || target.floodState > 0 || target.fireState > 0 || target.threatState > 0;
      if (targetHasDebuff) totalDmgMod += source.tacticMods.dmgDealtDebuffed; // 시리
      if (target.command < source.command) totalDmgMod += source.tacticMods.dmgDealtToLowerCommand; // 속오

      if (type === '병기') {
          totalDmgMod += source.tacticMods.weaponDmg;
          if (isTurn1to4) totalDmgMod += source.tacticMods.weaponDmgTurn4;
          if (isOdd) totalDmgMod += source.tacticMods.weaponDmgOdd;
          totalDmgMod += (source.tacticMods.stackWeaponDmg * 0.018); // 구전 스택
      } else {
          totalDmgMod += source.tacticMods.spellDmg;
          if (isTurn4Onwards) totalDmgMod += source.tacticMods.spellDmgFromTurn4;
          if (isEven) totalDmgMod += source.tacticMods.spellDmgEven;
          totalDmgMod += (source.tacticMods.stackSpellDmg * 0.01); // 탈계 스택
      }
      if (isActiveSkill(skillName)) totalDmgMod += source.tacticMods.activeDmg; // 귀모
  }

  if (target.tacticMods) {
      totalDmgMod -= target.tacticMods.dmgTaken;
      if (isTurn1to4) totalDmgMod -= target.tacticMods.dmgTakenTurn4;
      if (target.pos === '후열') totalDmgMod -= target.tacticMods.dmgTakenIfBack;
      if (target.pos === '전열') totalDmgMod -= target.tacticMods.dmgTakenIfFront;
      
      if (type === '병기') {
          totalDmgMod -= target.tacticMods.weaponDmgTaken;
          if (isTurn1to4) totalDmgMod -= target.tacticMods.weaponDmgTakenTurn4;
      } else {
          totalDmgMod -= target.tacticMods.spellDmgTaken;
          if (isEven) totalDmgMod -= target.tacticMods.spellDmgTakenEven;
      }
      
      // 고육지계(및 기타 괄목상대 등)로 획득한 액티브 피해 감소 적용
      if (isActiveSkill(skillName) && target.tacticMods.activeDmgTaken) {
        totalDmgMod -= target.tacticMods.activeDmgTaken;
      }
  }

  // 3. 기존 상태 이상 증감 로직 병합
  if (target.threatState > 0) totalDmgMod += 0.1;
  if (source.weakness > 0 && source.regenState <= 0) totalDmgMod -= 0.7;
  if (target.허점공략State > 0) totalDmgMod -= 0.2756;
  if (target.흥왕의위업State > 0) totalDmgMod -= 0.14;
  if (target.skills.indexOf("위기의 결전") !== -1 && skillName === '일반 공격') totalDmgMod -= 0.212;
  if (target.국색State > 0) totalDmgMod += 0.2;
  
  if (skillName === '척살') {
      var hasDebuff = target.silence > 0 || target.disarm > 0 || target.fear > 0 || target.weakness > 0 || target.confusion > 0 || target.magicState > 0 || target.stormState > 0 || target.floodState > 0 || target.fireState > 0 || target.grainExhaustState > 0 || target.threatState > 0;
      if (hasDebuff) totalDmgMod += 0.2; 
  }
  if (isActiveSkill(skillName) && source.skills.indexOf("신의 가호") !== -1) totalDmgMod += 0.15;

  totalDmgMod = Math.max(0.1, totalDmgMod);
  baseDmg *= totalDmgMod;
  baseDmg *= shieldMult;

  // 4. 최종 데미지 적용
  var finalDmg = Math.round(baseDmg + (Math.random() * 80 - 40));
  if (finalDmg < 10) finalDmg = 10;
  finalDmg = Math.min(finalDmg, target.hp);

  target.hp -= finalDmg;
  
  // 🩸 [부상병 패치] 대미지의 15%는 전사(회복 불가), 85%만 부상병으로 누적
  target.woundedHp = (target.woundedHp || 0) + Math.round(finalDmg * 0.85);

  source.totalDamageDealt += finalDmg;
  target.totalDamageTaken += finalDmg;
  source.damageDealtThisTurn += finalDmg;
  target.damageTakenThisTurn += finalDmg;

  var critTag = "";
  if (isCrit) critTag = " 💥[회심 적중!]";
  if (isSpellCrit) critTag = " 🔮[묘책 적중!]";

  logAction("⚔️ [" + skillName + "] " + source.name + "이(가) " + target.name + "에게 " + finalDmg + "의 " + type + " 피해를 입혔습니다." + critTag + " (남은 병력: " + target.hp + ")");
  
  // =================================================
  // 🔴 [병법 패치] 타격 직후 병법 스택 중첩 획득 (가시성 추가)
  // =================================================
  if (source.tacticMods) {
    if (type === '병기' && source.strategies.indexOf("구전") !== -1 && source.tacticMods.stackWeaponDmg < 5) {
      source.tacticMods.stackWeaponDmg++;
      logAction("  └ 📈 [구전 중첩] " + source.name + "의 병기 피해 1.8% 증가! (스택: " + source.tacticMods.stackWeaponDmg + "/5)");
    }
    if (type === '책략' && source.strategies.indexOf("탈계") !== -1 && source.tacticMods.stackSpellDmg < 8) {
      source.tacticMods.stackSpellDmg++;
      logAction("  └ 📈 [탈계 중첩] " + source.name + "의 책략 피해 1% 증가! (스택: " + source.tacticMods.stackSpellDmg + "/8)");
    }
    if (source.strategies.indexOf("득세") !== -1 && source.tacticMods.stackPierce < 5) {
      source.tacticMods.stackPierce++;
      logAction("  └ 📈 [득세 중첩] " + source.name + "의 관통 1.5% 증가! (스택: " + source.tacticMods.stackPierce + "/5)");
    }
  }

  // 5. 후속 스킬 및 패시브 연계
  if (isCrit && source.skills.indexOf("기병 돌격") !== -1 && source.척살Count < 5) {
    source.척살Count++;
    logAction("⚡ [기병 돌격] 메인 타격 회심 적중! (턴 내 발동: " + source.척살Count + "/5)");
    var prevPierce = source.pierce;
    source.pierce = 1.0; 

    // 🔥 [타겟팅 패치] 메인 공격으로 적이 사망했다면 새로운 타겟 탐색
    var chukTarget = target;
    if (chukTarget.hp <= 0) {
      chukTarget = getAttackTarget(source, enemies); // enemies 덱 기반 새 타겟팅
    }
    
    // 새 타겟이 존재할 경우에만 척살 피해 적용
    if (chukTarget) {
      dealDamage(source, chukTarget, 0.6, '병기', '척살', allies, enemies);
    }
    source.pierce = prevPierce;
  }

// 🔴 7. 흡혈 로직 독립 및 부상병 제한
  if (type === '병기' && source.lifestealProb > 0) {
    var lsAmt = Math.round(finalDmg * source.lifestealProb);
    
    // ✅ (수정 후) Math.max(0, ...) 추가
    var availableWounded = Math.max(0, Math.round(source.woundedHp || 0));
    var actualLs = Math.min(lsAmt, availableWounded); 
    
    source.hp += actualLs;
    source.woundedHp = Math.max(0, source.woundedHp - actualLs);
    source.totalHealingDone += actualLs;
    if (actualLs > 0) logAction("💚 [회유] " + source.name + "이(가) 병력을 " + actualLs + " 회복했습니다. (잔여 부상병: " + source.woundedHp + ")");
  }
  if (type === '책략' && source.psyLifestealProb > 0) {
    var lsAmt = Math.round(finalDmg * source.psyLifestealProb);
    
    // ✅ (수정 후) Math.max(0, ...) 추가
    var availableWounded = Math.max(0, Math.round(source.woundedHp || 0));
    var actualLs = Math.min(lsAmt, availableWounded);
    
    source.hp += actualLs;
    source.woundedHp = Math.max(0, source.woundedHp - actualLs);
    source.totalHealingDone += actualLs;
    if (actualLs > 0) logAction("💚 [심리 공격] " + source.name + "이(가) 병력을 " + actualLs + " 회복했습니다. (잔여 부상병: " + source.woundedHp + ")");
  }

  if (type === '책략' && source.skills.indexOf("충신의 기재") !== -1 && source.충신의기재Count < 4 && Math.random() < 0.5) {
      source.intel += 10;
      source.충신의기재Count++;
      logAction("🧠 [충신의 기재] 책략 피해 적중! 지력이 10 상승합니다. (중첩: " + source.충신의기재Count + "/4)");
  }

  if (type === '책략' && source.skills.indexOf("패잔병 척결") !== -1 && source.패잔병척결Count < 1) {
      if (Math.random() < 0.6) {
          source.패잔병척결Count++;
          logAction("⚔️ [패잔병 척결] 책략 피해 적중! 60% 확률로 일반 공격을 추가 시전합니다.");
          var aliveEnemies = enemies.filter(function(e) { return e.hp > 0; });
          if (aliveEnemies.length > 0) {
              var rEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
              performNormalAttack(source, rEnemy, allies, enemies);
          }
      }
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

  if (source.skills.indexOf("청룡 출격") !== -1 && type === '병기' && source.용의포효Count < 4 && Math.random() < 0.76) {
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
    var aliveEnemies = allies.filter(function(c) { return c.hp > 0; }); 
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
      var targetEnemies = getWeightedRandomTargets(aliveEnemies, 2); 
      for(var t=0; t < targetEnemies.length; t++) {
          targetEnemies[t].damageTakenMod = Math.min(2.0, targetEnemies[t].damageTakenMod + 0.1); 
          if (Math.random() < 0.6) {
              aliveEnemies[t].disarm = 2; 
              logAction("🛡️ [침착한 지휘] " + aliveEnemies[t].name + "에게 무장해제를 2턴간 부여합니다.");
          }
      }
  }

  return finalDmg;
}

function heal(source, target, coef, skillName, teamArray) {
  if (!source || !target || source.hp <= 0 || target.hp <= 0) return 0;
  
  var troopMod = Math.sqrt(source.hp) / 50.0; 
  var healAmt = Math.round(source.intel * coef * troopMod);
  if (skillName === "강동 제패") healAmt = Math.round(source.force * coef * troopMod);

  // =================================================
  // 🔴 [병법 패치] 공용 병법 치유량 증감 연산
  // =================================================
  var healMod = 1.0;
  if (source.tacticMods) {
      healMod += source.tacticMods.healDone;
      if (target.pos === '전열') healMod += source.tacticMods.healDoneToFront; // 연기
  }
  if (target.tacticMods) {
      healMod += target.tacticMods.healTaken; // 치병
      if (target.pos === '전열') healMod += target.tacticMods.healTakenIfFront; // 군용
  }
  healAmt = Math.round(healAmt * healMod);

  if (source.strategies && source.strategies.indexOf("인의론") !== -1) {
    healAmt = Math.round(healAmt * 1.12); 
  }

  if (target.grainExhaustState > 0) {
    healAmt = Math.round(healAmt * 0.3);
    logAction("🌾 [군량 고갈] " + target.name + "이(가) 군량 고갈로 치유량이 감소했습니다!");
  }

  // ✅ 부상병이 음수나 비정상 값이 되지 않도록 Math.max 처리
  var availableWounded = Math.max(0, Math.round(target.woundedHp || 0)); 
  
  // 실제 회복량은 계산된 healAmt와 남은 부상병 중 작은 값으로 제한
  var finalHealAmt = Math.min(healAmt, availableWounded);
  
  target.hp += finalHealAmt;
  target.woundedHp = Math.max(0, target.woundedHp - finalHealAmt); // 회복된 만큼 부상병 차감
  source.totalHealingDone += finalHealAmt;

  // 로그에도 제한되어 들어간 실제 회복량(finalHealAmt)을 출력하도록 수정
  logAction("💚 [" + skillName + "] " + source.name + "이(가) " + target.name + "의 병력을 " + finalHealAmt + " 회복시켰습니다. (잔여 부상병: " + target.woundedHp + ")");
  
  if (source.strategies && source.strategies.indexOf("인의론") !== -1) {
    if (source !== target) { 
      source.인의론Count = (source.인의론Count || 0) + 1;
      if (source.인의론Count >= 4 && !source.인의론TurnTriggered) {
        source.인의론TurnTriggered = true; 
        source.인의론Count = 0; 
        
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
          if (source.position === "후열" && Math.random() < 0.75) {
              if (!source.원문사극Buff) source.원문사극Buff = [];
              if (source.원문사극Buff.length < 3) {
                  source.activeRateBonus += 0.1;
                  source.원문사극Buff.push(2); // 2턴 지속 스택 추가
                  logAction("📈 [원문사극] 액티브 발동률 10% 증가! (현재 중첩: " + source.원문사극Buff.length + "/3)");
              } else {
                  // 중첩이 꽉 찼을 경우 지속시간만 갱신
                  for(var i=0; i<source.원문사극Buff.length; i++) {
                      if(source.원문사극Buff[i] < 2) { source.원문사극Buff[i] = 2; break; }
                  }
              }
          }
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
        } else if (skill === "순간 돌습") {
          target.command = Math.max(0, target.command - 30.9); // 2턴 감소
          target.순간돌습Debuff = 2; 
          logAction("📉 [순간 돌습] " + target.name + "의 통솔이 30.9 감소합니다. (2턴)");
          dealDamage(source, target, 2.575, '병기', '순간 돌습', allies, enemies);
          onDebuffInflicted(source, target, allies, enemies);
        } else if (skill === "야습") {
          var targets = getWeightedRandomTargets(targetDeck.filter(function(c){return c.hp>0;}), 2);
          for (var t = 0; t < Math.min(2, targets.length); t++) {
            var bonus = (source.speed > targets[t].speed) ? 0.5 : 0;
            dealDamage(source, targets[t], 1.2 + bonus, '병기', '야습', allies, enemies);
          }
        } else if (skill === "철기병 돌격") {
          source.critProb += 0.206; 
          source.철기병돌격Buff = 2;
          var currentTurn = typeof turn !== 'undefined' ? turn : 1;
          var finalCoef = 4.12 * Math.pow(0.75, currentTurn - 1);
          logAction("🏇 [철기병 돌격] 회심 증가 버프 획득 및 턴 비례 삭감된 계수(" + (finalCoef*100).toFixed(1) + "%)로 공격!");
          dealDamage(source, target, finalCoef, '병기', '철기병 돌격', allies, enemies);
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