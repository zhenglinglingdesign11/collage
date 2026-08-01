let cachedToken = "";
let tokenExpiresAt = 0;
let pendingTokenPromise = null;

function getRembgAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiresAt - now > 60) {
    return Promise.resolve(cachedToken);
  }
  if (pendingTokenPromise) return pendingTokenPromise;
  if (!wx.cloud || !wx.cloud.callFunction) {
    return Promise.reject(new Error("rembg_auth_unavailable"));
  }

  pendingTokenPromise = wx.cloud.callFunction({ name: "rembg-auth" })
    .then((response) => {
      const result = response && response.result ? response.result : {};
      if (!result.token || !result.expiresAt) {
        throw new Error("rembg_auth_invalid_response");
      }
      cachedToken = result.token;
      tokenExpiresAt = Number(result.expiresAt);
      return cachedToken;
    })
    .finally(() => {
      pendingTokenPromise = null;
    });

  return pendingTokenPromise;
}

module.exports = {
  getRembgAccessToken
};
