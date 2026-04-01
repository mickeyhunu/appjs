const { google } = require("googleapis");
const auth = require("../config/googleAuth");

const SPREADSHEET_ID = "1Uv928vFAG1V-8YfmCrblZu4Hu2KKf7EV_tunig0Z1os";
const ORIGINAL_SHEET_NAME = "원본";

const storeRanges = {
  "달토": "A2:E",
  "엘리트": "F2:J",
  "디저트": "K2:O",
  "유앤미": "P2:T",
  "도파민": "U2:Y",
  "제우스": "Z2:AD",
  "드라마": "AE2:AI",
  "": "AJ2:AN",
  "": "AO2:AS",
  "독고": "AT2:AX",
};

let SHEET_DATE = null;

// 날짜 계산
function getSheetName() {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  const localTime = new Date(now.getTime() - offsetMinutes * 60 * 1000);
  const currentHour = now.getHours();
  const currentDate = localTime.toISOString().split("T")[0].replace(/-/g, "");

  if (currentHour >= 15) {
    if (SHEET_DATE !== currentDate) {
      console.log(`시트탐색 날짜 변경: ${SHEET_DATE} -> ${currentDate}`);
    }
    SHEET_DATE = currentDate.toString();
  } else {
    const yesterday = new Date(localTime);
    yesterday.setDate(yesterday.getDate() - 1);
    const previousDate = yesterday.toISOString().split("T")[0].replace(/-/g, "");
    SHEET_DATE = previousDate.toString();
  }
  return SHEET_DATE;
}

// Google Sheets API 클라이언트 생성
async function getSheetsClient() {
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

// 시트 복사
async function copySheetIfNeeded(sheets, sheetName) {
  const sheetList = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetNames = sheetList.data.sheets.map(s => s.properties.title);

  if (!sheetNames.includes(sheetName)) {
    console.log(`[INFO] ${sheetName} 시트 생성 중...`);

    const originalSheet = sheetList.data.sheets.find(s => s.properties.title === ORIGINAL_SHEET_NAME);
    if (!originalSheet) throw new Error(`[ERROR] 원본 시트를 찾을 수 없습니다.`);

    const copyResponse = await sheets.spreadsheets.sheets.copyTo({
      spreadsheetId: SPREADSHEET_ID,
      sheetId: originalSheet.properties.sheetId,
      resource: { destinationSpreadsheetId: SPREADSHEET_ID },
    });

    const copiedSheetId = copyResponse.data.sheetId;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      resource: {
        requests: [{
          updateSheetProperties: {
            properties: { sheetId: copiedSheetId, title: sheetName },
            fields: "title",
          },
        }],
      },
    });

    console.log(`[INFO] ${sheetName} 시트 생성 완료`);
  }
}

// 출근 처리
async function checkIn(req, res) {
  const { storeName, name, manager, id, status } = req.body;
  if (!storeRanges[storeName]) {
    return res.status(400).json({ error: `가게명 "${storeName}"은 유효하지 않습니다.` });
  }

  const sheetName = getSheetName();

  try {
    const sheets = await getSheetsClient();
    await copySheetIfNeeded(sheets, sheetName);

    const range = storeRanges[storeName];
    const getResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!${range}`,
    });

    const sheetData = getResponse.data.values || [];
    let rowNumber = sheetData.findIndex(row => row[1] === name);
    let existingRecord = rowNumber !== -1 ? sheetData[rowNumber] : null;

    if (existingRecord) {
      if (existingRecord[3] !== id) {
        return res.status(400).json({ message: `기존 출근 등록자와 다름` });
      }
      if (existingRecord[4] === status && status === "출") {
        if (!existingRecord[2] && manager) {
          existingRecord[2] = manager;
        } else {
          return res.status(400).json({ message: `이미 출근 상태입니다.` });
        }
      } else {
        existingRecord[4] = status;
      }
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheetName}!${storeRanges[storeName].split(":")[0]}${rowNumber + 2}:${storeRanges[storeName].split(":")[1]}${rowNumber + 2}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [existingRecord] },
      });
      return res.status(200).json({ message: `상태가 업데이트되었습니다.` });
    }

    const newRow = [storeName, name, manager, id, status];
    const startColumn = storeRanges[storeName].split(":")[0];
    const endColumn = storeRanges[storeName].split(":")[1];
    const nextRowNumber = sheetData.length + 2;
    const newRange = `${sheetName}!${startColumn}${nextRowNumber}:${endColumn}${nextRowNumber}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: newRange,
      valueInputOption: "USER_ENTERED",
      resource: { values: [newRow] },
    });

    return res.status(200).json({ message: `출근이 완료되었습니다.` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: `서버 에러: ${error.message}` });
  }
}

// 퇴근 처리
async function checkOut(req, res) {
  const { storeName, name } = req.body;
  if (!storeRanges[storeName]) {
    return res.status(400).json({ error: `가게명 "${storeName}"은 유효하지 않습니다.` });
  }

  const sheetName = getSheetName();

  try {
    const sheets = await getSheetsClient();
    await copySheetIfNeeded(sheets, sheetName);

    const range = storeRanges[storeName];
    const getResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!${range}`,
    });

    const rows = getResponse.data.values || [];
    const rowNumber = rows.findIndex(row => row[1] === name);

    if (rowNumber === -1) {
      return res.status(404).json({ message: `출근 기록이 없습니다.` });
    }
    if (rows[rowNumber][4] === "퇴") {
      return res.status(400).json({ message: `이미 퇴근 처리된 이름입니다.` });
    }

    rows[rowNumber][4] = "퇴";
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${sheetName}!${storeRanges[storeName].split(":")[0]}${rowNumber + 2}:${storeRanges[storeName].split(":")[1]}${rowNumber + 2}`,
      valueInputOption: "USER_ENTERED",
      resource: { values: [rows[rowNumber]] },
    });

    return res.status(200).json({ message: `퇴근 처리 완료` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: `서버 에러: ${error.message}` });
  }
}

module.exports = { checkIn, checkOut };