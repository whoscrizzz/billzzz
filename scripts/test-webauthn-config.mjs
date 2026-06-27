/** Inline tests for WebAuthn RP ID / origin resolution (mirrors worker/src/webauthn-config.ts). */

function appOrigin(envAppUrl, requestUrl) {
  if (envAppUrl) return envAppUrl.replace(/\/$/, "");
  const url = new URL(requestUrl);
  return `${url.protocol}//${url.host}`;
}

function getWebAuthnConfig(envAppUrl, requestUrl) {
  const origin = appOrigin(envAppUrl, requestUrl);
  const url = new URL(origin);
  const hostname = url.hostname;

  let rpID;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    rpID = "localhost";
  } else {
    rpID = hostname;
  }

  const expectedOrigins = new Set([origin]);
  if (rpID === "localhost") {
    expectedOrigins.add("http://localhost:5173");
    expectedOrigins.add("http://localhost:8787");
    expectedOrigins.add("http://127.0.0.1:5173");
    expectedOrigins.add("http://127.0.0.1:8787");
  }

  return { rpName: "Bills", rpID, origin, expectedOrigins: [...expectedOrigins] };
}

const prod = getWebAuthnConfig("https://bills.whoscrizzz.com", "https://bills.whoscrizzz.com/");
if (prod.rpID !== "bills.whoscrizzz.com") {
  console.error("prod rpID expected bills.whoscrizzz.com, got", prod.rpID);
  process.exit(1);
}
if (!prod.expectedOrigins.includes("https://bills.whoscrizzz.com")) {
  console.error("prod origins missing production URL", prod.expectedOrigins);
  process.exit(1);
}

const local = getWebAuthnConfig(null, "http://localhost:8787/bills-api/health");
if (local.rpID !== "localhost") {
  console.error("local rpID expected localhost, got", local.rpID);
  process.exit(1);
}
for (const o of ["http://localhost:5173", "http://localhost:8787"]) {
  if (!local.expectedOrigins.includes(o)) {
    console.error("local origins missing", o, local.expectedOrigins);
    process.exit(1);
  }
}

const trailing = getWebAuthnConfig("https://bills.whoscrizzz.com/", "https://x.example/");
if (trailing.origin !== "https://bills.whoscrizzz.com") {
  console.error("APP_URL trailing slash not stripped", trailing.origin);
  process.exit(1);
}

console.log("test-webauthn-config: OK");
