const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
window.CARD_TRADING_CONFIG = {
  apiBaseUrl: isLocalPreview ? window.location.origin : "https://card-trading-api.47-82-148-17.sslip.io",
};
