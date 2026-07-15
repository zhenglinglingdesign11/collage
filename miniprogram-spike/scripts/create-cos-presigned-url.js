#!/usr/bin/env node

const crypto = require("crypto");

const args = parseArgs(process.argv.slice(2));

const secretId = process.env.COS_SECRET_ID || process.env.TENCENTCLOUD_SECRET_ID;
const secretKey = process.env.COS_SECRET_KEY || process.env.TENCENTCLOUD_SECRET_KEY;
const sessionToken = process.env.COS_SESSION_TOKEN || process.env.TENCENTCLOUD_SESSION_TOKEN || "";
const host = args.host || "packs-1327435159.cos.ap-guangzhou.myqcloud.com";
const key = normalizeKey(args.key || "hudiejie/items/1.png");
const method = (args.method || "GET").toLowerCase();
const expires = Math.max(60, Number(args.expires || 1800));
const protocol = args.protocol || "https";

if (!secretId || !secretKey) {
  console.error("Missing COS credentials.");
  console.error("Set COS_SECRET_ID and COS_SECRET_KEY before running this script.");
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);
const keyTime = `${now};${now + expires}`;
const pathname = `/${key.split("/").map(cosEncode).join("/")}`;
const signedQueryParams = sessionToken
  ? { "x-cos-security-token": sessionToken }
  : {};
const signedHeaders = {
  host
};

const { list: headerList, string: httpHeaders } = formatKeyValues(signedHeaders);
const { list: urlParamList, string: httpParameters } = formatKeyValues(signedQueryParams);
const httpString = `${method}\n${pathname}\n${httpParameters}\n${httpHeaders}\n`;
const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
const signKey = hmacSha1(secretKey, keyTime);
const signature = hmacSha1(signKey, stringToSign);

const query = {
  ...signedQueryParams,
  "q-sign-algorithm": "sha1",
  "q-ak": secretId,
  "q-sign-time": keyTime,
  "q-key-time": keyTime,
  "q-header-list": headerList,
  "q-url-param-list": urlParamList,
  "q-signature": signature
};

const url = `${protocol}://${host}${pathname}?${formatQuery(query)}`;
console.log(url);

function parseArgs(argv) {
  return argv.reduce((result, arg) => {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) {
      result[toCamelCase(match[1])] = match[2];
    }
    return result;
  }, {});
}

function normalizeKey(value) {
  return String(value || "").replace(/^\/+/, "");
}

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function sha1(value) {
  return crypto.createHash("sha1").update(value, "utf8").digest("hex");
}

function hmacSha1(key, value) {
  return crypto.createHmac("sha1", key).update(value, "utf8").digest("hex");
}

function formatKeyValues(values) {
  const encoded = Object.keys(values)
    .filter((key) => values[key] !== undefined && values[key] !== null)
    .map((key) => ({
      key: cosEncode(key).toLowerCase(),
      value: cosEncode(values[key])
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return {
    list: encoded.map((item) => item.key).join(";"),
    string: encoded.map((item) => `${item.key}=${item.value}`).join("&")
  };
}

function formatQuery(values) {
  return Object.keys(values)
    .filter((key) => values[key] !== undefined && values[key] !== null)
    .map((key) => `${cosEncode(key)}=${cosEncode(values[key])}`)
    .join("&");
}

function cosEncode(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}
