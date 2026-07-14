/*
 * QA: Stripe webhook security (no network, no real Stripe account needed).
 *
 * Exercises POST /api/stripe/webhook with mock req/res objects:
 *   1. GET request                      -> 405
 *   2. Missing Stripe-Signature header  -> 400
 *   3. Invalid signature                -> 400
 *   4. Correctly signed event           -> passes signature verification
 *      (the handler then proceeds to processing; with no reachable database
 *      the response is 500 "retry later", proving the 400 path is signature
 *      verification only and a valid signature is accepted)
 *
 * Usage: npx tsx scripts/qa-stripe-webhook.ts
 */
import Stripe from "stripe";
import { EventEmitter } from "node:events";

// Fake config: signature verification only needs the webhook secret; a
// syntactically valid (fake) secret key lets the Stripe client construct.
process.env.STRIPE_SECRET_KEY = "sk_test_qa_fake_key_never_real";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_qa_fake_secret";
process.env.SUPABASE_URL = "https://qa-fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "qa-fake-service-role-key";

type MockRes = {
  statusCode: number | null;
  body: unknown;
  status: (code: number) => MockRes;
  json: (body: unknown) => MockRes;
};

function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: null,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

function mockReq(method: string, rawBody: string, headers: Record<string, string>) {
  const emitter = new EventEmitter() as EventEmitter & {
    method: string;
    headers: Record<string, string>;
  };
  emitter.method = method;
  emitter.headers = headers;
  process.nextTick(() => {
    if (rawBody) emitter.emit("data", Buffer.from(rawBody));
    emitter.emit("end");
  });
  return emitter;
}

const results: { name: string; pass: boolean; detail: string }[] = [];
function record(name: string, pass: boolean, detail: string) {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  (${detail})`);
}

(async () => {
  const { default: handler } = await import("../api/stripe/webhook.js");

  const eventPayload = JSON.stringify({
    id: "evt_qa_test_1",
    object: "event",
    type: "checkout.session.completed",
    data: { object: { id: "cs_qa_test", object: "checkout.session", payment_status: "unpaid", metadata: {} } },
  });

  // 1. Wrong method
  {
    const res = mockRes();
    await handler(mockReq("GET", "", {}) as never, res as never);
    record("GET is rejected", res.statusCode === 405, `status ${res.statusCode}`);
  }

  // 2. Missing signature
  {
    const res = mockRes();
    await handler(mockReq("POST", eventPayload, {}) as never, res as never);
    record("Missing signature returns 400", res.statusCode === 400, `status ${res.statusCode}`);
  }

  // 3. Invalid signature
  {
    const res = mockRes();
    await handler(
      mockReq("POST", eventPayload, { "stripe-signature": "t=1,v1=deadbeef" }) as never,
      res as never
    );
    record("Invalid signature returns 400", res.statusCode === 400, `status ${res.statusCode}`);
  }

  // 4. Valid signature is accepted (proceeds past verification; DB is fake so
  //    processing ends in a retryable 500, never a signature 400).
  {
    const header = Stripe.webhooks.generateTestHeaderString({
      payload: eventPayload,
      secret: process.env.STRIPE_WEBHOOK_SECRET as string,
    });
    const res = mockRes();
    await handler(
      mockReq("POST", eventPayload, { "stripe-signature": header }) as never,
      res as never
    );
    record(
      "Valid signature passes verification",
      res.statusCode !== 400 && res.statusCode !== 405,
      `status ${res.statusCode} (500 = processing failed on fake DB, expected)`
    );
  }

  const failed = results.filter((r) => !r.pass);
  console.log(failed.length ? `\n${failed.length} check(s) FAILED` : "\nAll webhook security checks passed.");
  process.exit(failed.length ? 1 : 0);
})();
