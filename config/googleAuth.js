const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");
require("dotenv").config({ quiet: true });

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const DEFAULT_KEY_FILE = path.resolve(__dirname, "service-account.json");

function normalizePrivateKey(privateKey) {
  return privateKey?.replace(/\\n/g, "\n");
}

function parseCredentialsJson(json, source) {
  const trimmedJson = json?.trim();

  if (!trimmedJson) {
    throw new Error(`Google 서비스 계정 JSON이 비어 있습니다: ${source}`);
  }

  try {
    return JSON.parse(trimmedJson);
  } catch (error) {
    throw new Error(`Google 서비스 계정 JSON을 읽을 수 없습니다 (${source}): ${error.message}`);
  }
}

function loadCredentialsFromEnv() {
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (serviceAccountJson) {
    return parseCredentialsJson(serviceAccountJson, "GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  const serviceAccountJsonBase64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64?.trim();
  if (serviceAccountJsonBase64) {
    const json = Buffer.from(serviceAccountJsonBase64, "base64").toString("utf8");
    return parseCredentialsJson(json, "GOOGLE_SERVICE_ACCOUNT_JSON_BASE64");
  }

  if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
    return {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    };
  }

  return null;
}

function loadCredentialsFromFile() {
  const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS
    ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS)
    : DEFAULT_KEY_FILE;

  if (!fs.existsSync(keyFile)) {
    throw new Error(`Google 서비스 계정 키 파일을 찾을 수 없습니다: ${keyFile}`);
  }

  return parseCredentialsJson(fs.readFileSync(keyFile, "utf8"), keyFile);
}

function loadCredentials() {
  const credentials = loadCredentialsFromEnv() || loadCredentialsFromFile();
  credentials.private_key = normalizePrivateKey(credentials.private_key);

  if (credentials.type && credentials.type !== "service_account") {
    throw new Error("Google Sheets 쓰기 작업에는 API 키가 아니라 service_account JSON 키가 필요합니다.");
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error("Google 서비스 계정 키에 client_email 또는 private_key가 없습니다.");
  }

  return credentials;
}

async function getClient() {
  const credentials = loadCredentials();
  const client = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
  });

  await client.authorize();
  return client;
}

module.exports = { getClient, loadCredentials, loadCredentialsFromFile, parseCredentialsJson };
