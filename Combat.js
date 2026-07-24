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

function dealDamage(source, target, coef, type, skillName, allies, enemies, isTransfer) {
  if (source.hp <= 0 || target.hp <= 0) return 0;
  
  // 1. 방어막, 회피, 백리의성 처리
  var hasSeoseong = allies.find(function(c) { return c.skills.indexOf("백리의성") !== -1 && c.hp > 0; });
  if (hasSeoseong && typeof turn !== 'undefined' && turn <= 4) {
    // 🧱 [역산 패치] 통솔 비례 방어막 획득 확률 (기본 25% + 통솔 1당 0.05% 증가)
    var blockProb = 0.25 + (hasSeoseong.command * 0.0005);
    if (Math.random() < blockProb) {
      target.shieldStacks++;
      logAction("🧱 [백리의성] 서성의 지휘! " + target.name + "이(가) 피격 직전 방어막 1스택을 획득했습니다. (확률: " + (blockProb*100).toFixed(1) + "%)");
    }
  }

  var dodgeChance = target.dodgeProb;
  if (target.name === "조운") dodgeChance = Math.max(dodgeChance, 0.35);
  
  // 🛡️ [패치] '금고'(4턴간), '승민'(전열) 피신(회피) 증가 적용
  if (target.tacticMods) {
      if (typeof turn !== 'undefined' && turn <= 4) dodgeChance += (target.tacticMods.dodgeTurn4 || 0);
      if (target.position === '전열') dodgeChance += (target.tacticMods.dodgeIfFront || 0);
  }

  var ignoreDodge = (source.백발백중 > 0);
  
  // 🎯 [패치] '호익': 매 턴 자신이 처음 주는 피해 80% 확률로 회피 불가
  if (!ignoreDodge && source.tacticMods && source.tacticMods.ignoreDodgeFirstHit && source.damageDealtThisTurn === 0) {
      if (Math.random() < 0.8) {
          ignoreDodge = true;
          logAction("🎯 [호익] " + source.name + "의 타격은 피신(회피)할 수 없습니다!");
      }
  }

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
  // 🛡️ [방어 및 방어파괴 패치] 공격자가 방어파괴(shieldPierce)를 가지지 않았을 때만 방어 발동
  if (target.shieldStacks > 0 && !source.shieldPierce) {
    target.shieldStacks--; // 스택 차감
    var blockRate = 0.7 + Math.random() * 0.2; // 70~90% 감소
    shieldMult = 1.0 - blockRate;
    logAction("🧱 [방어막] " + target.name + "의 방어막 작동! 피해가 " + (blockRate*100).toFixed(1) + "% 감소합니다. (남은 스택: " + target.shieldStacks + ")");
  } else if (target.shieldStacks > 0 && source.shieldPierce) {
    logAction("🔨 [방어파괴] " + source.name + "의 공격이 " + target.name + "의 방어막을 무시하고 타격합니다!");
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

  // 🔴 ['후기' 누락 반영] 후기 스택당 묘책 확률 3% 증가 적용
  if (source.hugiStacks > 0) curSpellCrit += (source.hugiStacks * 0.03);

  var defCommand = target.command - (target.floodState > 0 ? 20 : 0);
  if (curPierce > 0) defCommand *= (1 - curPierce);
  var defIntel = target.intel - (target.fireState > 0 ? 15 : 0);
  if (source.insight > 0) defIntel *= (1 - source.insight);

  // 2. 기본 대미지 및 크리티컬 연산
  var baseDmg = 0;
  var critMult = 1.5;
  if (source.critDamageMod) critMult += source.critDamageMod;
  
  // 🔮 [요술 패치] 요술(magicState)에 걸려있으면 회심/묘책 피해 배율 15% 감소
  if (source.magicState > 0) critMult -= 0.15;

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

  // ⚔️ [패치] 병사 수 비례 계수 제거 및 고정 상수 도입
  // 기존 10,000 병력 기준 계수인 2.0을 고정값으로 적용합니다. (전체 데미지 밸런스를 맞출 때 이 2.0을 수정하세요)
  var scaleConstant = 2.0;
  baseDmg *= scaleConstant;

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

// 🟢 [스택/트리거형 8종 동기화] 스택형 병법 실시간 반영
  if (source.jeolbongStacks > 0) totalDmgMod += (source.jeolbongStacks * 0.03); 
  if (target.jeokyongStacks > 0) totalDmgMod += (target.jeokyongStacks * 0.03); // 피뎀증이므로 딜계수 증가
  if (target.jeokmoStacks > 0) totalDmgMod -= (target.jeokmoStacks * 0.03); // 피뎀감이므로 딜계수 감소
  if (target.bunchiStacks > 0) totalDmgMod -= (target.bunchiStacks * 0.03); 
  if (target.wondoBuffTurns > 0) totalDmgMod -= 0.10;
  
  if (source.tacticMods) {
      totalDmgMod += source.tacticMods.dmgDealt;
      if (source.position === '후열') totalDmgMod += source.tacticMods.dmgDealtIfBack; // 수정 완료 (현기)
      if (source.position === '전열') totalDmgMod += source.tacticMods.dmgDealtIfFront; // 수정 완료 (적무)
      if (target.position === '전열') totalDmgMod += source.tacticMods.dmgDealtToFront; // 수정 완료 (군쟁)

      // ⚔️ [패치] '강전': 병력이 가장 높은 적군 타격 시 피해 증가
      var maxHpEnemy = enemies.filter(function(e) { return e.hp > 0; }).sort(function(a, b) { return b.hp - a.hp; })[0];
      if (maxHpEnemy && target.name === maxHpEnemy.name) {
          totalDmgMod += (source.tacticMods.dmgDealtToHighestHp || 0);
      }
      
      // 🚻 [패치] '불양': 대상이 이성(성별이 다름)일 경우 피해 증가
      if (source.gender && target.gender && source.gender !== target.gender) {
          totalDmgMod += (source.tacticMods.dmgDealtToOppositeSex || 0);
      }

      var targetHasDebuff = target.silence > 0 || target.disarm > 0 || target.fear > 0 || 
                            target.weakness > 0 || target.confusion > 0 || target.magicState > 0 || 
                            target.stormState > 0 || target.floodState > 0 || target.fireState > 0 || 
                            target.threatState > 0 || target.grainExhaustState > 0 || 
                            target.탈주병State > 0 || target.국색State > 0 || 
                            target.손견통솔Debuff > 0 || target.순간돌습Debuff > 0 || target.기풍당당SpeedDebuff > 0;
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
      if (target.position === '후열') totalDmgMod -= target.tacticMods.dmgTakenIfBack;
      if (target.position === '전열') totalDmgMod -= target.tacticMods.dmgTakenIfFront;
      
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
 
  // 🔴 [초선 폐월] 이성(성별 다름)에게 받는 피해 감소 및 타격자 추적
  if (target.skills.indexOf("폐월") !== -1) {
      // 1. 이성 판정 (초선은 여성이므로 공격자가 남성이면 발동)
      if (source.gender && target.gender && source.gender !== target.gender) {
          // 2. 최고 속성 비례 뎀감 (기본 30% + 최고 속성의 0.05% 증가 예시)
          var maxStat = Math.max(target.force, target.intel, target.command, target.speed);
          var reduceAmt = 0.30 + (maxStat * 0.0005);
          totalDmgMod -= reduceAmt;
      }
      
      // 3. 턴 종료 반격을 위해 초선에게 피해를 준 타겟 목록에 추가
      if (!target.폐월Targets) target.폐월Targets = [];
      if (target.폐월Targets.indexOf(source) === -1) {
          target.폐월Targets.push(source);
      }
  }

  if (target.허점공략State > 0 && target.허점공략ReduceAmt) totalDmgMod -= target.허점공략ReduceAmt;
  if (target.흥왕의위업State > 0) totalDmgMod -= 0.14;
  if (target.skills.indexOf("위기의 결전") !== -1 && skillName === '일반 공격') totalDmgMod -= 0.212;
  if (target.국색State > 0) totalDmgMod += 0.2;
  if (target.skills.indexOf("양번 사수") !== -1 && isOdd) {
      // 🛡️ [역산 패치] 기본 수치 + 통솔 비례 추가 뎀감 (통솔 1당 0.05% 증가)
      var cmdBonus = target.command * 0.0005;
      if (source.position === '후열') totalDmgMod -= (0.3 + cmdBonus);
      else if (source.position === '전열') totalDmgMod -= (0.15 + cmdBonus);
  }
  
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

  // 🥀 [허약 패치] 허약(weakness) 상태일 경우 주는 최종 피해 70% 감소
  if (source.weakness > 0 && source.regenState <= 0) {
      finalDmg = Math.floor(finalDmg * 0.3);
      logAction("🥀 [허약] " + source.name + "의 최종 피해가 70% 감소했습니다.");
  }

  if (finalDmg < 10) finalDmg = 10;
  // 🔴 [고유병법 특수 피해 판정 기믹] (HP 차감 전에 계산)
  if (source.floodState > 0 && target.strategies && target.strategies.indexOf("의성") !== -1) {
      finalDmg = Math.floor(finalDmg * 0.92); // 홍수 대상에게 피격 시 -8%
  }
  if (type === '병기' && source.장검행Buff > 0) {
      finalDmg = Math.floor(finalDmg * 1.4);
      source.장검행Buff = 0;
      logAction("💥 [고유병법] '장검행' 폭발! 이번 병기 피해가 40% 증폭되었습니다.");
  }

  finalDmg = Math.min(finalDmg, target.hp);
  target.hp -= finalDmg;
  
  // 🔴 [타격 적중 직후 트리거 발동]
  if (target.hp > 0 && target.hp < target.maxHp * 0.5 && target.strategies && target.strategies.indexOf("호신") !== -1 && !target.호신Triggered) {
      target.호신Triggered = true;
      logAction("📖 [고유병법] '호신' 발동! 정보의 병력이 50% 미만이 되어 체력 회복 및 뎀감(12%) 획득.");
      heal(target, target, 2.0, "호신");
      target.damageTakenMod -= 0.12;
  }
  
  if (type === '책략' && source.strategies && source.strategies.indexOf("장검행") !== -1) {
      source.장검행Buff = 1;
      logAction("📖 [고유병법] '장검행' 발동! 다음 병기 피해가 40% 증가합니다.");
  }
  
  if (type === '책략' && target.strategies && target.strategies.indexOf("왕예") !== -1 && Math.random() < 0.5) {
      if (!target.왕예Buff) target.왕예Buff = [];
      if (target.왕예Buff.length < 2) {
          target.왕예Buff.push(2);
          target.activeRateBonus += 0.04;
          logAction("📖 [고유병법] '왕예' 발동! 관우의 액티브 발동률이 4% 증가합니다.");
      } else {
          for(var i=0; i<target.왕예Buff.length; i++) if(target.왕예Buff[i] < 2) { target.왕예Buff[i] = 2; break; }
      }
  }

  // 🩸 [부상병 패치] 대미지의 15%는 전사(회복 불가), 85%만 부상병으로 누적
  target.woundedHp = (target.woundedHp || 0) + Math.round(finalDmg * 0.85);

  // 🟢 [스택/트리거형 8종 동기화] 타격 직후 스택 누적 판별 (최대 5스택)
  if (finalDmg > 0 && target.hp > 0) {
      if (type === '병기' && allies.some(function(c) { return c.tacticMods && c.tacticMods.jeokyong; })) {
          if (target.jeokyongStacks < 5) target.jeokyongStacks++;
      }
      if (type === '책략' && enemies.some(function(c) { return c.tacticMods && c.tacticMods.jeokmo; })) {
          if (target.jeokmoStacks < 5) target.jeokmoStacks++;
      }
      if ((skillName === '일반 공격' || skillName === '반격') && target.tacticMods && target.tacticMods.jeolbong) {
          if (target.jeolbongStacks < 5) target.jeolbongStacks++;
      }
      if (isCrit && source.tacticMods && source.tacticMods.gongjeok) {
          if (source.gongjeokStacks < 5) {
              source.gongjeokStacks++;
              source.force += 5; // 1스택당 무력 5 증가
              logAction("🔥 [공적] " + source.name + "의 회심 발동! 무력이 상승합니다. (현재 " + source.gongjeokStacks + "스택)");
          }
      }
  }

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
  if (source.tacticMods && source.strategies) {
    // 💡 ES5 map을 사용하여 모든 병법 이름의 공백을 제거한 안전한 배열 생성
    var safeStrats = source.strategies.map(function(s) { return s ? s.toString().trim() : ""; });

    if (type === '병기' && safeStrats.indexOf("구전") !== -1 && source.tacticMods.stackWeaponDmg < 5) {
      source.tacticMods.stackWeaponDmg++;
      logAction("  └ 📈 [구전 중첩] " + source.name + "의 병기 피해 1.8% 증가! (스택: " + source.tacticMods.stackWeaponDmg + "/5)");
    }
    if (type === '책략' && safeStrats.indexOf("탈계") !== -1 && source.tacticMods.stackSpellDmg < 8) {
      source.tacticMods.stackSpellDmg++;
      logAction("  └ 📈 [탈계 중첩] " + source.name + "의 책략 피해 1% 증가! (스택: " + source.tacticMods.stackSpellDmg + "/8)");
    }
    if (safeStrats.indexOf("득세") !== -1 && source.tacticMods.stackPierce < 5) {
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

  // 🩸 [패치] '고군': 홀수 턴 회유 증가
  var curLifesteal = source.lifestealProb;
  if (source.tacticMods && isOdd) curLifesteal += (source.tacticMods.lifestealOdd || 0); 

  if (type === '병기' && curLifesteal > 0) {
    var lsAmt = Math.round(finalDmg * curLifesteal);
    
    // ✅ (수정 후) Math.max(0, ...) 추가
    var availableWounded = Math.max(0, Math.round(source.woundedHp || 0));
    var actualLs = Math.min(lsAmt, availableWounded); 
    
    source.hp += actualLs;
    source.woundedHp = Math.max(0, source.woundedHp - actualLs);
    source.totalHealingDone += actualLs;
    if (actualLs > 0) logAction("💚 [회유] " + source.name + "이(가) 병력을 " + actualLs + " 회복했습니다. (잔여 부상병: " + source.woundedHp + ")");
  }

  // 🔮 [패치] '위지': 짝수 턴 심리공격 증가
  var curPsyLifesteal = source.psyLifestealProb;
  if (source.tacticMods && isEven) curPsyLifesteal += (source.tacticMods.psyLifestealEven || 0);
  
  if (type === '책략' && curPsyLifesteal > 0) {
    var lsAmt = Math.round(finalDmg * curPsyLifesteal);
    
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
          // 🛡️ [역산 패치] 통솔 비례 피해 증가 디버프 (기본 10% + 통솔 1당 0.03% 추가)
          var increaseAmt = 0.1 + (target.command * 0.0003);
          targetEnemies[t].damageTakenMod = Math.min(2.0, targetEnemies[t].damageTakenMod + increaseAmt); 
          logAction("🛡️ [침착한 지휘] " + targetEnemies[t].name + "의 받는 피해가 " + (increaseAmt*100).toFixed(1) + "% 증가합니다.");
          
          if (Math.random() < 0.6) {
              targetEnemies[t].disarm = 2; 
              logAction("🛡️ [침착한 지휘] " + targetEnemies[t].name + "에게 무장해제를 2턴간 부여합니다.");
          }
      }
  }

  // 🔗 [피해 전달 패치] 최초 타격일 때만 전달 로직 발동 (무한 루프 방지)
  if (!isTransfer && source.damageTransfer > 0) {
      // 타겟을 제외한 살아있는 랜덤 적군 1명 탐색
      var aliveEnemies = enemies.filter(function(e) { return e.hp > 0 && e.name !== target.name; });
      if (aliveEnemies.length > 0) {
          var transferTarget = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
          var transferCoef = coef * source.damageTransfer; // 전달 계수 적용
          
          logAction("🔗 [피해 전달] " + target.name + "에게 적중한 공격이 " + transferTarget.name + "에게 전달됩니다!");
          
          // 방어 무시 등을 반영하기 위해 특수 파라미터(isTransfer = true)를 넣고 재귀 호출
          dealDamage(source, transferTarget, transferCoef, type, skillName + "(전달)", allies, enemies, true);
      }
  }

  // 🔴 [백전불태] 타겟(피격자) 피격 시 발동
  // Combat.js의 파라미터를 활용: target이 속한 팀 배열 찾기
  var targetTeam = (allies.indexOf(target) !== -1) ? allies : enemies;
  var hasBaekJeon = targetTeam.some(function(c) { return c.skills.indexOf("백전불태") !== -1 && c.hp > 0; });
  
  if (hasBaekJeon && target.hp > 0) {
      var aliveTeam = targetTeam.filter(function(a) { return a.hp > 0; });
      
      // 통솔, 지력, 무력이 각각 가장 높은 아군 찾기
      var maxCmdAlly = aliveTeam.slice().sort(function(a, b) { return b.command - a.command; })[0];
      var maxIntAlly = aliveTeam.slice().sort(function(a, b) { return b.intel - a.intel; })[0];
      var maxForAlly = aliveTeam.slice().sort(function(a, b) { return b.force - a.force; })[0];

      var effects = [];
      
      // 1. 피격자(target)가 팀 내 통솔 1위일 경우 개별 판정
      if (target === maxCmdAlly && Math.random() < 0.60) {
          if ((target.백전통솔Stack || 0) < 8) {
              target.command += 7;
              target.백전통솔Stack = (target.백전통솔Stack || 0) + 1;
              effects.push("통솔 +7 (스택: " + target.백전통솔Stack + "/8)");
          }
      }
      
      // 2. 피격자(target)가 팀 내 지력 1위일 경우 개별 판정
      if (target === maxIntAlly && Math.random() < 0.60) {
          if ((target.백전지력Stack || 0) < 8) {
              target.intel += 7;
              target.백전지력Stack = (target.백전지력Stack || 0) + 1;
              effects.push("지력 +7 (스택: " + target.백전지력Stack + "/8)");
          }
      }
      
      // 3. 피격자(target)가 팀 내 무력 1위일 경우 개별 판정
      if (target === maxForAlly && Math.random() < 0.60) {
          if ((target.백전무력Stack || 0) < 8) {
              target.force += 7;
              target.백전무력Stack = (target.백전무력Stack || 0) + 1;
              effects.push("무력 +7 (스택: " + target.백전무력Stack + "/8)");
          }
      }
      
      if (effects.length > 0) {
          logAction("🛡️ [백전불태] " + target.name + " 피격 반응! 최고 스탯 증가: " + effects.join(", "));
      }
  }

  return finalDmg;
}

function heal(source, target, coef, skillName, teamArray) {
  if (!source || !target || source.hp <= 0 || target.hp <= 0) return 0;
  
  // 💚 [패치] 병사 수 비례 힐량 계수 제거 및 고정 상수(2.0) 도입
  var scaleConstant = 1.0;
  var healAmt = Math.round(source.intel * coef * scaleConstant);
  if (skillName === "강동 제패") healAmt = Math.round(source.force * coef * scaleConstant);

  // 🔴 [전쟁 조달 패치] 지력과 무력 두 스탯을 동시에 합산하여 치유량에 반영
  if (skillName === "전쟁 조달" || skillName === "지혜의 바람") {
      healAmt = Math.round((source.intel + source.force) * 0.5 * coef * scaleConstant);
  }

// =================================================
  // 🔴 [병법 패치] 공용 병법 치유량 증감 연산
  // =================================================
  var healMod = 1.0;
  if (source.tacticMods) {
      healMod += source.tacticMods.healDone;
      if (target.position === '전열') healMod += source.tacticMods.healDoneToFront; // 수정 완료 (연기)
  }
  if (target.tacticMods) {
      healMod += target.tacticMods.healTaken; 
      if (target.position === '전열') healMod += target.tacticMods.healTakenIfFront; // 수정 완료 (군용)
  }
  healAmt = Math.round(healAmt * healMod);

  if (source.strategies && source.strategies.indexOf("인의론") !== -1) {
    // 💚 [역산 패치] 치유량 증가: 기본 12% + (지력 1당 0.02% 추가)
    var inEuiRonBonus = 1.0 + 0.12 + (source.intel * 0.0002);
    healAmt = Math.round(healAmt * inEuiRonBonus);
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

  // 🟢 [스택/트리거형 8종 동기화] 치유 발생 시 버프/스택 부여
  if (finalHealAmt > 0) {
      if (source.tacticMods && source.tacticMods.wondo) {
          target.wondoBuffTurns = 1; 
      }
      if (source.tacticMods && source.tacticMods.geunseon) {
          if (source.geunseonStacks < 5) {
              source.geunseonStacks = (source.geunseonStacks || 0) + 1;
              source.command += 5;
          }
      }
  }

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

  // 🔴 [청낭경 치유 연계]
  if (source.strategies && source.strategies.indexOf("청낭경") !== -1) {
      if (!target.청낭경Buff) target.청낭경Buff = [];
      if (target.청낭경Buff.length < 2) {
          target.청낭경Buff.push(2);
          target.damageDealtMod += 0.06;
          logAction("📖 [고유병법] '청낭경' 연계! 화타의 치유를 받은 " + target.name + "의 주는 피해가 6% 증가합니다.");
      } else {
          for(var i=0; i<target.청낭경Buff.length; i++) if(target.청낭경Buff[i] < 2) { target.청낭경Buff[i] = 2; break; }
      }
  }

  return healAmt;
}

function performNormalAttack(source, target, allies, enemies, isCounter) {
  if (source.hp <= 0 || target.hp <= 0) return;
  source.normalAttackCount = (source.normalAttackCount || 0) + 1; // 궁술을 위한 카운트 누적

  // 🔴 [산림탈기] 평타 전 추가 타격
  if (source.strategies && source.strategies.indexOf("산림탈기") !== -1 && !isCounter && Math.random() < 0.6) {
      var aliveEnemies = enemies.filter(function(e) { return e.hp > 0; });
      if (aliveEnemies.length > 0) {
          var rEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
          logAction("📖 [고유병법] '산림탈기' 발동! 감녕이 일반 공격 전 추가 책략 피해를 줍니다.");
          dealDamage(source, rEnemy, 0.3, '책략', '산림탈기', allies, enemies);
      }
  }

  var dmgCoef = 1.0;
  var currentForce = source.force; // 버프 연산용 임시 변수
  if (source.skills.indexOf("수전의 제왕") !== -1) {
      dmgCoef = 2.5;
      if (source.감녕무력Buff.length < 4) {
          source.감녕무력Buff.push(2); // 2턴 지속 버프 스택 추가
      }
      currentForce += (source.감녕무력Buff.length * 12);
      if (!isCounter) logAction("⚓ [수전의 제왕] 감녕 무력 증가(현재중첩:" + source.감녕무력Buff.length + ") 및 피해 150% 증폭!");
  }

  // ⚔️ [패치] 반격일 경우 스킬명을 '반격'으로 표기
  var attackName = isCounter ? '반격' : '일반 공격';
  dealDamage(source, target, dmgCoef, '병기', attackName, allies, enemies);
  
  // 🛑 [패치 핵심] 반격으로 때린 평타라면, 추격 전법 및 후속 반격 트리거를 무시하고 즉시 종료!
  if (isCounter) return;

  var targetDeck = enemies;
  var sourceDeck = allies;

  source.skills.forEach(function(skill) {
    if (!skill) return;
    
    if (!skillTypes[skill] || skillTypes[skill].toString().indexOf("추격") === -1) {
      return; 
    }

    var rate = getSkillProb(skill, source.name);

    // 🔴 [궁술 패치] 추격 확률 및 계수 실시간 펌핑
    var prevDmgMod = source.damageDealtMod;
    if (source.궁술Buff > 0) { rate += 0.25; source.damageDealtMod += 0.25; }

    if (rate > 0) {
      // 🔇 신무 침묵 면역 처리 (스킬 쏘기 전)
      if (source.신무Immunity > 0 && skillTypes[skill] && skillTypes[skill].indexOf("액티브") !== -1 && source.silence > 0) source.silence = 0;
      
      if (Math.random() < rate) {
        logAction("⚡ [추격 전법] " + source.name + "의 추격 전법 '" + skill + "' 발동!");

        // --- 🔴 [추격 발동 직후 연계 기믹 추가] ---
        if (source.궁술Buff > 0) source.damageDealtMod = prevDmgMod; // 계수 원상 복구

        if (source.strategies && source.strategies.indexOf("신무") !== -1 && Math.random() < 0.16) {
            source.신무Immunity = 2;
            logAction("📖 [고유병법] '신무' 발동! 화웅이 2턴간 침묵에 면역됩니다.");
        }

        var hasMuha = (source.strategies && source.strategies.indexOf("무하") !== -1);
        if (!hasMuha) {
            var maxForceAlly = allies.filter(function(a) { return a.hp > 0; }).sort(function(a, b) { return b.force - a.force; })[0];
            if (maxForceAlly && maxForceAlly.name === source.name && allies.some(function(a) { return a.strategies && a.strategies.indexOf("무하") !== -1; })) hasMuha = true;
        }
        if (hasMuha) {
            if (!source.무하Buff) source.무하Buff = [];
            if (source.무하Buff.length < 2) {
                source.무하Buff.push(2);
                source.damageTakenMod -= 0.07;
                logAction("📖 [고유병법] '무하' 연계! " + source.name + "의 받는 피해가 7% 감소합니다.");
            } else {
                for(var i=0; i<source.무하Buff.length; i++) if(source.무하Buff[i] < 2) { source.무하Buff[i] = 2; break; }
            }
        }

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
          // 📉 [역산 패치] 무력 비례 선공/무력 삭감 (기본 24 + 무력의 10%)
          var debuffAmt = 24 + (source.force * 0.1);
          target.speed = Math.max(0, target.speed - debuffAmt);
          target.force = Math.max(0, target.force - debuffAmt);
          dealDamage(source, target, 1.8, '병기', '전장 평정', allies, enemies);
          logAction("📉 [전장 평정] 대상의 선공과 무력을 " + debuffAmt.toFixed(1) + " 감소시킵니다.");
          onDebuffInflicted(source, target, allies, enemies);
        } else if (skill === "천리기습") {
          // 1. 타겟팅: 선공(Speed)이 가장 낮은 적군
          var aliveEnemies = targetDeck.filter(function(e) { return e.hp > 0; });
          var lowestSpeedEnemy = aliveEnemies.sort(function(a, b) { return a.speed - b.speed; })[0];

          if (lowestSpeedEnemy) {
            // 2. 피해 계수 계산
            // 기본 계수: 2.8 (280%)
            var damageMultiplier = 2.8;

            // 선공 차이 영향: (아군 선공 - 적군 선공) * 0.02 (계수는 밸런스에 맞춰 조정 가능)
            var speedDiff = Math.max(0, source.speed - lowestSpeedEnemy.speed);
            var speedBonus = speedDiff * 0.02; 
    
            // 최종 계수에 추가
            damageMultiplier += speedBonus;

            // 3. 후열 추가 피해: 목표가 후열이면 1.0 (100%) 추가
            if (lowestSpeedEnemy.position === '후열') {
              damageMultiplier += 1.0;
              logAction("🎯 [천리기습] 목표가 후열이므로 추가 피해를 가합니다.");
            }

            logAction("🏹 [천리기습] " + source.name + "의 추격! " + lowestSpeedEnemy.name + "에게 " + (damageMultiplier * 100).toFixed(0) + "%의 병기 피해를 입힙니다.");
    
            // 4. 피해 적용
            dealDamage(source, lowestSpeedEnemy, damageMultiplier, '병기', '천리기습', allies, enemies);
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
            // 💨 [역산 패치] 선공 비례 데미지 증가 (기본 1.8배 + 선공 1당 0.1% 계수 추가)
            var dmgMod = 1.8 + (source.speed * 0.001);
            dealDamage(source, targets[t], dmgMod, '병기', '신속전개', allies, enemies);
          }
        } else if (skill === "경무장") {
          var aliveAllies = sourceDeck.filter(function(c) { return c.hp > 0; });
          
          // 1. 랜덤 아군 2명 타겟팅을 위해 배열 무작위 섞기 (Shuffle)
          aliveAllies.sort(function() { return Math.random() - 0.5; });
          
          for (var t = 0; t < Math.min(2, aliveAllies.length); t++) {
            var ally = aliveAllies[t];
            
            // 2. 방어막 1스택 부여
            ally.shieldStacks++;
            logAction("🧱 [경무장] " + ally.name + "에게 방어막 1스택을 부여합니다.");
            
            // 3. 2턴 동안 받는 피해 20% 감소 (중첩 방지 및 갱신 로직)
            if (ally.경무장Buff > 0) {
              ally.경무장Buff = 2; // 이미 버프가 있다면 수치 중복 없이 턴수만 갱신
              logAction("🛡️ [경무장] " + ally.name + "의 받는 피해 20% 감소 버프가 2턴으로 갱신되었습니다.");
            } else {
              ally.damageTakenMod -= 0.2; 
              ally.경무장Buff = 2; // 2턴 지속 부여
              logAction("🛡️ [경무장] " + ally.name + "의 받는 피해가 2턴 동안 20% 감소합니다.");
            }
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

  // 🔴 [패치] 용맹한 삼군 기획 완벽 동기화
  if (source.skills.indexOf("용맹한 삼군") !== -1) {
    // 1. 일반 공격 직후 스택 적립 (tacticMods를 활용하여 '병기' 피해만 증가시키도록 수정)
    if (!source.tacticMods) source.tacticMods = {};
    if (!source.tacticMods.weaponDmg) source.tacticMods.weaponDmg = 0;
    
    if (source.용맹한삼군Stack === undefined) source.용맹한삼군Stack = 0;
    
    // 최대 6회까지만 6%씩 중첩 (0.36)
    if (source.용맹한삼군Stack < 6) {
      source.용맹한삼군Stack++;
      source.tacticMods.weaponDmg += 0.06;
      logAction("📈 [용맹한 삼군] " + source.name + "의 병기 피해가 6% 증가했습니다. (현재 중첩: " + source.용맹한삼군Stack + "/6)");
    }

    // 2. 일반 공격 횟수 3회 누적 판정 및 폭발
    source.용맹한삼군Count++;
    if (source.용맹한삼군Count >= 3) {
      source.용맹한삼군Count = 0; // 3회 달성 시 카운트 초기화
      
      var aliveEnemies = targetDeck.filter(function(c) { return c.hp > 0; });
      if (aliveEnemies.length > 0) {
        var rEnemy = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
        logAction("⚔️ [용맹한 삼군 폭발] 3회 타격 누적! " + rEnemy.name + "에게 강력한 일격을 가합니다!");
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

  // [다짐] 일반 공격 후 50% 확률로 병기 피해 1회
  if (source.다짐 && Math.random() < 0.5) {
    // targetEnemies -> targetDeck 으로 변경
    var aliveEnemies = targetDeck.filter(function(e) { return e.hp > 0; });
    if (aliveEnemies.length > 0) {
      // 랜덤 적군 단일 목표
      var randomTarget = aliveEnemies[Math.floor(Math.random() * aliveEnemies.length)];
      logAction("💥 [다짐] " + source.name + "의 다짐 효과가 발동합니다!");
      
      // 100% (1.0) 병기 피해
      dealDamage(source, randomTarget, 1.0, '병기', '결사의 다짐', allies, enemies);
    }
  }

  // =========================================================
  // 🔴 [신규 패치] 범용 반격(Counter-attack) 시스템
  // =========================================================
  // 피격자(target) 및 공격자(source)가 모두 살아있고, 피격자가 무장 해제(disarm) 상태가 아니어야 함
  var totalCounterProb = target.counterProb || 0;
  if (target.tacticMods && target.tacticMods.counterProb) {
    totalCounterProb += target.tacticMods.counterProb;
  }
      
  if (totalCounterProb > 0 && target.hp > 0 && source.hp > 0 && target.disarm <= 0) {
    if ((target.counterCount || 0) < 5) { // 턴당 5회 제한
      if (Math.random() < totalCounterProb) {
        target.counterCount = (target.counterCount || 0) + 1;
        logAction("⚔️ [반격 발동] " + target.name + "이(가) 방어 후 강력한 일격을 가합니다! (턴 내 발동: " + target.counterCount + "/5)");
        // 반격 시전자(target)가 원래 공격자(source)를 타격. allies와 enemies 배열 순서 교차.
        performNormalAttack(target, source, enemies, allies, true);
      }
    }
  }  
}