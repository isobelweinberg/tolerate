// Shared by the functions in this folder: signing in to Google as the service
// account. (Files starting with "_" aren't functions of their own on Vercel.)

const { createSign } = require("node:crypto");

// A signed JWT swapped for an access token for the given scope.
async function accessToken(account, scope) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
    iss: account.client_email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(account.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Google sign-in failed: ${json.error_description || json.error}`);
  return json.access_token;
}

// Vercel usually parses JSON bodies already; this copes either way.
const readBody = (req) => (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {});

module.exports = { accessToken, readBody };
