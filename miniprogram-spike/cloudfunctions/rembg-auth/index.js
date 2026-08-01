const cloud = require("wx-server-sdk");
const crypto = require("crypto");

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const TOKEN_TTL_SECONDS = 15 * 60;

exports.main = async () => {
  const secret = process.env.REMBG_AUTH_SECRET;
  if (!secret) {
    throw new Error("rembg_auth_not_configured");
  }

  const { OPENID: openId } = cloud.getWXContext();
  if (!openId) {
    throw new Error("missing_openid");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: openId,
    aud: "rembg-api",
    iat: now,
    exp: now + TOKEN_TTL_SECONDS
  };
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(encodedPayload)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: payload.exp
  };
};

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
