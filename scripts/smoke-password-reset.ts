/* Local smoke test for the password reset API handlers (mocked req/res).
 * Run: npx tsx scripts/smoke-password-reset.ts
 * Temporary QA helper; safe to delete.
 */
import requestHandler from "../api/auth/request-password-reset.js";
import completeHandler from "../api/auth/complete-password-reset.js";

function mockReqRes(body: Record<string, unknown>) {
  const req: any = {
    method: "POST",
    headers: { "user-agent": "smoke-test" },
    body,
    socket: { remoteAddress: "127.0.0.1" },
    query: {},
  };
  const out: { status: number | null; body: unknown } = { status: null, body: null };
  const res: any = {
    setHeader() {},
    status(code: number) {
      out.status = code;
      return res;
    },
    json(payload: unknown) {
      out.body = payload;
      return res;
    },
    end() {},
  };
  return { req, res, out };
}

async function run() {
  const cases: Array<{ name: string; handler: any; body: Record<string, unknown>; expect: number }> = [
    { name: "request: unknown email -> generic 200", handler: requestHandler, body: { email: "definitely-not-a-user-xyz@example.com" }, expect: 200 },
    { name: "request: invalid email -> generic 200", handler: requestHandler, body: { email: "not-an-email" }, expect: 200 },
    { name: "request: missing email -> generic 200", handler: requestHandler, body: {}, expect: 200 },
    { name: "complete: weak password -> 400", handler: completeHandler, body: { token: "x".repeat(43), password: "short" }, expect: 400 },
    { name: "complete: mismatch confirm -> 400", handler: completeHandler, body: { token: "x".repeat(43), password: "longenough1", confirmPassword: "different1" }, expect: 400 },
    { name: "complete: bogus token -> 400 INVALID_TOKEN", handler: completeHandler, body: { token: "x".repeat(43), password: "longenough1", confirmPassword: "longenough1" }, expect: 400 },
    { name: "complete: missing token -> 400 INVALID_TOKEN", handler: completeHandler, body: { password: "longenough1" }, expect: 400 },
  ];

  let failures = 0;
  for (const c of cases) {
    const { req, res, out } = mockReqRes(c.body);
    try {
      await c.handler(req, res);
    } catch (e) {
      console.log(`FAIL ${c.name}: threw`, e);
      failures += 1;
      continue;
    }
    const ok = out.status === c.expect;
    console.log(`${ok ? "PASS" : "FAIL"} ${c.name}: status=${out.status} body=${JSON.stringify(out.body)}`);
    if (!ok) failures += 1;
  }
  process.exit(failures ? 1 : 0);
}

run();
