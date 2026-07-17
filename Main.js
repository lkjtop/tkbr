/**
 * Main.gs
 * 메뉴 생성, 컨트롤 타워, 시뮬레이션 1000회 및 1회 루프 실행
 */

function onOpen() {
  SpreadsheetApp.getUi().createMenu("⚔️ 전투 시뮬레이터")
    .addItem("시뮬레이션 실행", "runSimulation")
    .addToUi();
}

function runSimulation() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName("덱 빌더");
  if (!sheet) return SpreadsheetApp.getUi().alert("'덱 빌더' 시트를 찾을 수 없습니다.");

  // DataLoader.gs 함수 호출하여 데이터 세팅
  if (!loadGameData(ss, sheet)) {
    return SpreadsheetApp.getUi().alert("A 덱과 B 덱의 장수 1을 최소한 선택해 주세요.");
  }

  // ===================================
  // 1. 다중 시뮬레이션 (1,000회)
  // ===================================
  var simCount = 1000, aWins = 0, bWins = 0, totalTurns = 0;
  var aHp = [0,0,0], aDmg = [0,0,0], aRec = [0,0,0], aHeal = [0,0,0];
  var bHp = [0,0,0], bDmg = [0,0,0], bRec = [0,0,0], bHeal = [0,0,0];

  isLogging = false; // 속도 향상을 위해 로깅 중단
  for (var s = 0; s < simCount; s++) {
    var res = simulateBattle();
    if (res.winner === "A 덱") aWins++;
    else if (res.winner === "B 덱") bWins++;
    totalTurns += res.turns;

    for (var i = 0; i < 3; i++) {
      if (res.allies[i]) {
        aHp[i] += res.allies[i].hp; aDmg[i] += res.allies[i].totalDamageDealt;
        aRec[i] += res.allies[i].totalDamageTaken; aHeal[i] += res.allies[i].totalHealingDone;
      }
      if (res.enemies[i]) {
        bHp[i] += res.enemies[i].hp; bDmg[i] += res.enemies[i].totalDamageDealt;
        bRec[i] += res.enemies[i].totalDamageTaken; bHeal[i] += res.enemies[i].totalHealingDone;
      }
    }
  }

  for (var i = 0; i < 3; i++) {
    aHp[i] = Math.round(aHp[i]/simCount); aDmg[i] = Math.round(aDmg[i]/simCount);
    aRec[i] = Math.round(aRec[i]/simCount); aHeal[i] = Math.round(aHeal[i]/simCount);
    bHp[i] = Math.round(bHp[i]/simCount); bDmg[i] = Math.round(bDmg[i]/simCount);
    bRec[i] = Math.round(bRec[i]/simCount); bHeal[i] = Math.round(bHeal[i]/simCount);
  }

  var aWinRate = ((aWins / simCount) * 100).toFixed(1);
  var bWinRate = ((bWins / simCount) * 100).toFixed(1);
  var multiWinnerStr = aWins > bWins ? "A 덱 우세 (" + aWinRate + "% 승리)" : bWins > aWins ? "B 덱 우세 (" + bWinRate + "% 승리)" : "호각세";
  
  // 결과 쓰기 함수 호출
  writeMultiResults(sheet, multiWinnerStr, totalTurns/simCount, aHp, aDmg, aRec, aHeal, bHp, bDmg, bRec, bHeal);

  // ===================================
  // 2. 단일 정밀 시뮬레이션 (1회)
  // ===================================
  isLogging = true;
  currentLogs = [];
  var singleRes = simulateBattle();
  
  var s_aHp = [0,0,0], s_aDmg = [0,0,0], s_aRec = [0,0,0], s_aHeal = [0,0,0];
  var s_bHp = [0,0,0], s_bDmg = [0,0,0], s_bRec = [0,0,0], s_bHeal = [0,0,0];

  for (var i = 0; i < 3; i++) {
    if (singleRes.allies[i]) {
      s_aHp[i] = singleRes.allies[i].hp; s_aDmg[i] = singleRes.allies[i].totalDamageDealt;
      s_aRec[i] = singleRes.allies[i].totalDamageTaken; s_aHeal[i] = singleRes.allies[i].totalHealingDone;
    }
    if (singleRes.enemies[i]) {
      s_bHp[i] = singleRes.enemies[i].hp; s_bDmg[i] = singleRes.enemies[i].totalDamageDealt;
      s_bRec[i] = singleRes.enemies[i].totalDamageTaken; s_bHeal[i] = singleRes.enemies[i].totalHealingDone;
    }
  }
  
  var singleWinnerStr = singleRes.winner === "무승부" ? "무승부" : singleRes.winner + " 승리";
  
  // 단일 결과 및 로그 출력 호출
  writeSingleResults(sheet, singleWinnerStr, singleRes.turns, s_aHp, s_aDmg, s_aRec, s_aHeal, s_bHp, s_bDmg, s_bRec, s_bHeal);
  renderBattleLogSheet(ss);
  
  SpreadsheetApp.getUi().alert("⚔️ 시뮬레이션 완료! 신설된 '전투 로그' 시트에서 상세한 전투 과정을 확인하세요.");
}