/**
 * DataLoader.gs
 * 구글 시트와의 데이터 통신(읽기/쓰기) 및 UI 서식 반영 전담
 */

function loadGameData(ss, sheet) {
  var skillSheet = ss.getSheetByName("전법");
  var generalSheet = ss.getSheetByName("장수");
  var bondSheet = ss.getSheetByName("인연");

  var aData = sheet.getRange("C12:E38").getValues();
  var bData = sheet.getRange("H12:J38").getValues();

  aNames = aData[0]; aCamps = aData[1]; aTroops = aData[2]; aFormation = aData[3][0]; aPositions = aData[5];
  aForce = aData[17]; aIntel = aData[20]; aCommand = aData[23]; aFirst = aData[26];

  bNames = bData[0]; bCamps = bData[1]; bTroops = bData[2]; bFormation = bData[3][0]; bPositions = bData[5];
  bForce = bData[17]; bIntel = bData[20]; bCommand = bData[23]; bFirst = bData[26];

  if (!aNames[0] || !bNames[0]) return false;

  aSkills = [
    [sheet.getRange("C18").getValue(), sheet.getRange("C20").getValue(), sheet.getRange("C21").getValue()],
    [sheet.getRange("D18").getValue(), sheet.getRange("D20").getValue(), sheet.getRange("D21").getValue()],
    [sheet.getRange("E18").getValue(), sheet.getRange("E20").getValue(), sheet.getRange("E21").getValue()]
  ];
  bSkills = [
    [sheet.getRange("H18").getValue(), sheet.getRange("H20").getValue(), sheet.getRange("H21").getValue()],
    [sheet.getRange("I18").getValue(), sheet.getRange("I20").getValue(), sheet.getRange("I21").getValue()],
    [sheet.getRange("J18").getValue(), sheet.getRange("J20").getValue(), sheet.getRange("J21").getValue()]
  ];

  aStrategies = [
    [sheet.getRange("C19").getValue(), sheet.getRange("C22").getValue(), sheet.getRange("C23").getValue()],
    [sheet.getRange("D19").getValue(), sheet.getRange("D22").getValue(), sheet.getRange("D23").getValue()],
    [sheet.getRange("E19").getValue(), sheet.getRange("E22").getValue(), sheet.getRange("E23").getValue()]
  ];
  bStrategies = [
    [sheet.getRange("H19").getValue(), sheet.getRange("H22").getValue(), sheet.getRange("H23").getValue()],
    [sheet.getRange("I19").getValue(), sheet.getRange("I22").getValue(), sheet.getRange("I23").getValue()],
    [sheet.getRange("J19").getValue(), sheet.getRange("J22").getValue(), sheet.getRange("J23").getValue()]
  ];

  bonds = [];
  if (bondSheet) {
    var bondData = bondSheet.getDataRange().getValues();
    for (var i = 2; i < bondData.length; i++) {
      if (bondData[i][0] && bondData[i][1]) {
        bonds.push({
          name: bondData[i][0],
          generals: bondData[i][1].toString().split(',').map(function(s) { return s.trim(); }),
          effect: bondData[i][2] ? bondData[i][2].toString() : "",
          // [인연 패치] E열(4)과 F열(5)의 TRUE/FALSE 값을 읽어와 불리언으로 저장
          activeA: String(bondData[i][4]).toUpperCase() === "TRUE",
          activeB: String(bondData[i][5]).toUpperCase() === "TRUE"
        });
      }
    }
  }

  skillRates = {}; skillTypes = {};
  if (skillSheet) {
    var skillData = skillSheet.getDataRange().getValues();
    for (var i = 2; i < skillData.length; i++) {
      if (skillData[i][2]) {
        var rawRate = skillData[i][4];
        // 셀 값이 숫자(0.65)면 그대로, 문자면 숫자로 변환
        var rate = typeof rawRate === 'number' ? rawRate : parseFloat(rawRate.toString().replace("%", ""));
        if (isNaN(rate)) rate = 35; // 기본값 35%
        // 1.0보다 크면(예: 65) 100으로 나누고, 이미 소수점(0.65)이면 그대로 저장
        skillRates[skillData[i][2]] = rate > 1.0 ? rate / 100 : rate;
        skillTypes[skillData[i][2]] = skillData[i][3];
      }
    }
  }

  uniqueRates = {};
  if (generalSheet) {
    var genData = generalSheet.getDataRange().getValues();

    // 🚻 [패치] 헤더(2행, 인덱스 1)에서 '성별' 열의 위치를 동적으로 탐색
    var genderColIdx = -1;
    if (genData.length > 1) {
        for (var c = 0; c < genData[1].length; c++) {
            if (genData[1][c].toString().trim() === "성별") genderColIdx = c;
        }
    }

    for (var i = 2; i < genData.length; i++) {
      if (genData[i][1]) {
        var rawRate = genData[i][11];
        // 고유 전법 확률 동일하게 안전 변환 처리
        var rate = typeof rawRate === 'number' ? rawRate : parseFloat(rawRate.toString().replace("%", ""));
        if (isNaN(rate)) rate = 40; // 기본값 40%
        uniqueRates[genData[i][1]] = rate > 1.0 ? rate / 100 : rate;
        if (genData[i][9]) {
          skillTypes[genData[i][8]] = genData[i][9]; 
        }

        // 🚻 [패치] 찾은 열 위치를 바탕으로 이름-성별 매핑 저장
        if (genderColIdx !== -1) {
            genGenders[genData[i][1]] = genData[i][genderColIdx].toString().trim();
        }
      }
    }
  }

  return true;
}

function writeMultiResults(sheet, winnerStr, turns, aHp, aDmg, aRec, aHeal, bHp, bDmg, bRec, bHeal) {
  var multiOutRange = sheet.getRange("M12:P23");
  var data = multiOutRange.getValues();
  data[0][0] = winnerStr; 
  data[1][0] = turns.toFixed(1) + " 턴";
  // 🔴 [패치] A덱 장수 이름 동기화
  data[2] = ["합계", aNames[0] || "", aNames[1] || "", aNames[2] || ""];

  data[3] = [aHp.reduce(function(a,b){return a+b},0), aHp[0], aHp[1], aHp[2]];
  data[4] = [aDmg.reduce(function(a,b){return a+b},0), aDmg[0], aDmg[1], aDmg[2]];
  data[5] = [aRec.reduce(function(a,b){return a+b},0), aRec[0], aRec[1], aRec[2]];
  data[6] = [aHeal.reduce(function(a,b){return a+b},0), aHeal[0], aHeal[1], aHeal[2]];
  
  // 🔴 [패치] B덱 장수 이름 동기화
  data[7] = ["합계", bNames[0] || "", bNames[1] || "", bNames[2] || ""];

  data[8] = [bHp.reduce(function(a,b){return a+b},0), bHp[0], bHp[1], bHp[2]];
  data[9] = [bDmg.reduce(function(a,b){return a+b},0), bDmg[0], bDmg[1], bDmg[2]];
  data[10] = [bRec.reduce(function(a,b){return a+b},0), bRec[0], bRec[1], bRec[2]];
  data[11] = [bHeal.reduce(function(a,b){return a+b},0), bHeal[0], bHeal[1], bHeal[2]];
  multiOutRange.setValues(data);
}

function writeSingleResults(sheet, winnerStr, turns, aHp, aDmg, aRec, aHeal, bHp, bDmg, bRec, bHeal) {
  var singleOutRange = sheet.getRange("M27:P38");
  var data = singleOutRange.getValues();
  data[0][0] = winnerStr; 
  data[1][0] = turns + " 턴";
  // 🔴 [패치] A덱 장수 이름 동기화
  data[2] = ["합계", aNames[0] || "", aNames[1] || "", aNames[2] || ""];

  data[3] = [aHp.reduce(function(a,b){return a+b},0), aHp[0], aHp[1], aHp[2]];
  data[4] = [aDmg.reduce(function(a,b){return a+b},0), aDmg[0], aDmg[1], aDmg[2]];
  data[5] = [aRec.reduce(function(a,b){return a+b},0), aRec[0], aRec[1], aRec[2]];
  data[6] = [aHeal.reduce(function(a,b){return a+b},0), aHeal[0], aHeal[1], aHeal[2]];
  
  // 🔴 [패치] B덱 장수 이름 동기화
  data[7] = ["합계", bNames[0] || "", bNames[1] || "", bNames[2] || ""];

  data[8] = [bHp.reduce(function(a,b){return a+b},0), bHp[0], bHp[1], bHp[2]];
  data[9] = [bDmg.reduce(function(a,b){return a+b},0), bDmg[0], bDmg[1], bDmg[2]];
  data[10] = [bRec.reduce(function(a,b){return a+b},0), bRec[0], bRec[1], bRec[2]];
  data[11] = [bHeal.reduce(function(a,b){return a+b},0), bHeal[0], bHeal[1], bHeal[2]];
  singleOutRange.setValues(data);
}

function renderBattleLogSheet(ss) {
  var logSheet = ss.getSheetByName("전투 로그") || ss.insertSheet("전투 로그");
  logSheet.clear();

  var logData = [
    ["⚔️ 천하결전 정밀 전투 시뮬레이션 로그"],
    ["시뮬레이션 실행 시각: " + Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss")],
    [""]
  ];
  for (var i = 0; i < currentLogs.length; i++) logData.push([currentLogs[i]]);

  var range = logSheet.getRange(1, 1, logData.length, 1);
  range.setValues(logData);
  
  logSheet.setColumnWidth(1, 950);
  logSheet.getRange("A1").setFontSize(16).setFontWeight("bold").setFontColor("#1F2937");
  logSheet.getRange("A2").setFontSize(10).setFontColor("#4B5563").setFontStyle("italic");

  var bg = [], fg = [], wt = [];
  for (var r = 0; r < logData.length; r++) {
    var text = logData[r][0];
    var b = "#FFFFFF", f = "#1F2937", w = "normal";

    if (r === 0) { b = "#1F2937"; f = "#FFFFFF"; w = "bold"; }
    else if (text.indexOf("====") === 0 || text.indexOf("'====") === 0) { b = "#374151"; f = "#FFFFFF"; w = "bold"; }
    else if (text.indexOf("▶️") === 0) { b = "#F3F4F6"; f = "#1F2937"; w = "bold"; }
    else if (text.indexOf("🏆") !== -1) { b = "#FEF3C7"; f = "#B45309"; w = "bold"; }
    else if (text.indexOf("💚") !== -1) { f = "#15803D"; }
    else if (text.indexOf("🔥") !== -1 || text.indexOf("⚡") !== -1) { f = "#C2410C"; }
    else if (text.indexOf("🛡️") !== -1 || text.indexOf("🧱") !== -1) { f = "#1D4ED8"; }
    else if (text.indexOf("💤") !== -1 || text.indexOf("❌") !== -1 || text.indexOf("🗣️") !== -1) { f = "#DC2626"; }
    bg.push([b]); fg.push([f]); wt.push([w]);
  }
  range.setBackgrounds(bg).setFontColors(fg).setFontWeights(wt).setFontFamily("Arial").setWrap(true);
  logSheet.setHiddenGridlines(true);
}