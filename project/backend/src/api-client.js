const config = require("./config");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldDecodeEucKr(contentType) {
  return /euc-kr|ks_c_5601|cp949/i.test(contentType || "");
}

async function responseToText(response) {
  const contentType = response.headers.get("content-type") || "";
  const buffer = Buffer.from(await response.arrayBuffer());

  if (shouldDecodeEucKr(contentType)) {
    try {
      return new TextDecoder("euc-kr").decode(buffer);
    } catch (error) {
      // Falls back to UTF-8 when euc-kr decoder is unavailable.
    }
  }

  return buffer.toString("utf8");
}

function buildUrl(type, icao = null) {
  const endpoint = config.api.endpoints[type];
  if (!endpoint) {
    throw new Error(`Unknown API type: ${type}`);
  }

  const params = new URLSearchParams({
    ...config.api.default_params,
    authKey: config.api.auth_key
  });

  if (icao) {
    params.set("icao", icao);
  }

  return `${config.api.base_url}${endpoint}?${params.toString()}`;
}

function parseApiHeader(xmlText) {
  const codeMatch = xmlText.match(/<resultCode>([^<]+)<\/resultCode>/i);
  const msgMatch = xmlText.match(/<resultMsg>([^<]+)<\/resultMsg>/i);
  return {
    resultCode: codeMatch ? codeMatch[1].trim() : null,
    resultMsg: msgMatch ? msgMatch[1].trim() : null
  };
}

async function fetchApi(type, icao = null) {
  const url = buildUrl(type, icao);

  for (let attempt = 1; attempt <= config.api.max_retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.api.timeout_ms);

    try {
      const response = await fetch(url, { signal: controller.signal });
      const body = await responseToText(response);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
        if (response.status < 500 && response.status !== 429) {
          error.nonRetryable = true;
        }
        throw error;
      }

      const { resultCode, resultMsg } = parseApiHeader(body);
      if (resultCode && resultCode !== "00") {
        const error = new Error(`API ${resultCode}: ${resultMsg || "UNKNOWN_ERROR"}`);
        if (resultCode === "03" || /유효한 인증키/i.test(resultMsg || "")) {
          error.nonRetryable = true;
        }
        throw error;
      }

      return body;
    } catch (error) {
      if (error.nonRetryable || attempt === config.api.max_retries) {
        throw error;
      }
      await sleep(attempt * 2000);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error("Unexpected fetch flow");
}

module.exports = {
  fetch: fetchApi,
  buildUrl
};
