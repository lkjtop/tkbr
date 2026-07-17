/**
 * Config.gs
 * 파일 간 공유되는 전역 변수와 로그 기록 유틸리티 전담
 */

var isLogging = false;
var currentLogs = [];

// 엔진(Engine.gs)에서 참조할 덱/캐릭터 데이터 전역 캐시
var aNames, aCamps, aTroops, aFormation, aPositions, aForce, aIntel, aCommand, aFirst, aSkills, aStrategies;
var bNames, bCamps, bTroops, bFormation, bPositions, bForce, bIntel, bCommand, bFirst, bSkills, bStrategies;
var bonds = [];
var skillRates = {};
var skillTypes = {};
var uniqueRates = {};

function logAction(msg) {
  if (isLogging) {
    if (msg && msg.toString().indexOf("=") === 0) msg = "'" + msg;
    currentLogs.push(msg);
  }
}

function getSkillProb(skillName, genName) {
  if (!skillName) return 0;
  if (skillRates[skillName] !== undefined) return skillRates[skillName];
  if (uniqueRates[genName] !== undefined) return uniqueRates[genName];
  return 0.35;
}