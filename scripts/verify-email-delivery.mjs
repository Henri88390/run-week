import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/features/account/server/auth.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
let response;
let calls = 0;
const exports = {};
vm.runInNewContext(outputText, {
  exports,
  require(name) {
    if (name === "next-auth") return { default: () => ({}) };
    return {};
  },
  process: { env: { NODE_ENV: "production" } },
  AbortSignal,
  fetch: async () => { calls++; return response; },
});
const request = {
  identifier: "private-recipient@example.com", token: "123456",
  provider: { apiKey: "private-api-key", from: "QA <sender@example.com>" },
};
async function failure(body, status, expected, from = request.provider.from) {
  response = new Response(body, { status });
  await assert.rejects(() => exports.sendCode({ ...request, provider: { ...request.provider, from } }), (error) => {
    assert.equal(error.name, "EmailDeliveryError");
    assert.equal(error.status, status);
    assert.match(error.message, expected);
    for (const secret of [request.identifier, request.token, request.provider.apiKey, "sender@example.com"]) {
      assert.ok(!error.message.includes(secret));
    }
    return true;
  });
}
await failure(JSON.stringify({ name: "validation_error", message: "Invalid from sender@example.com" }),
  422, /validation_error.*AUTH_EMAIL_FROM/);
await failure(JSON.stringify({ name: "missing_required_field", message: "Missing from" }),
  422, /missing_required_field.*AUTH_EMAIL_FROM/, "");
await failure(JSON.stringify({ name: "validation_error", message: `Invalid recipient ${request.identifier}` }),
  422, /recipient email address/);
await failure(JSON.stringify({ name: request.provider.apiKey, message: request.token }),
  422, /unknown_error.*Resend Logs/);
await failure("not json", 502, /unreadable_response/);
await failure("null", 422, /unknown_error/);
await failure(JSON.stringify({ name: "restricted_api_key" }), 403, /permissions/);
await failure(JSON.stringify({ name: "daily_quota_exceeded" }), 429, /quota/);
response = new Response(JSON.stringify({ id: "synthetic" }), { status: 200 });
await exports.sendCode(request);
assert.equal(calls, 9);
console.log("Email delivery diagnostics: 9 mocked cases passed; no real emails sent.");
