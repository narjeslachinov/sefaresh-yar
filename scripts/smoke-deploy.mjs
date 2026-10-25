const BASE = process.env.BASE_URL;
const PASSWORD = process.env.DEMO_PASSWORD;
if (!BASE || !PASSWORD) {
  console.error("Set BASE_URL and DEMO_PASSWORD, e.g. $env:BASE_URL='https://host'");
  process.exit(1);
}

let failed = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name} ${cond ? "" : extra}`);
  if (!cond) failed++;
}

async function login(email) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status}`);
  const setCookie = res.headers.getSetCookie()[0];
  const cookie = setCookie.split(";")[0];
  const call = async (path) => {
    const r = await fetch(BASE + path, { headers: { cookie } });
    let json = null;
    try { json = await r.json(); } catch {}
    return { status: r.status, json };
  };
  return { cookie, call, setCookie };
}

const health = await fetch(`${BASE}/api/health`);
check("health is up over https", health.status === 200 && BASE.startsWith("https://"));
check("HSTS is on", /max-age/.test(health.headers.get("strict-transport-security") ?? ""));
check("security headers are on", health.headers.get("x-content-type-options") === "nosniff" && health.headers.get("x-frame-options") === "DENY");

const anon = await fetch(`${BASE}/api/auth/me`);
check("no session -> 401 with a request id", anon.status === 401 && Boolean(anon.headers.get("x-request-id")));

const plain = await fetch(BASE.replace("https://", "http://"), { redirect: "manual" });
check("plain http redirects to https", [301, 302, 307, 308].includes(plain.status));

const waiter = await login("waiter@niloofar.test");
check("session cookie is Secure + HttpOnly", /secure/i.test(waiter.setCookie) && /httponly/i.test(waiter.setCookie));
const tables = await waiter.call("/api/tables");
check("niloofar has 12 tables", tables.json?.tables?.length === 12);
check("menu has items", (await waiter.call("/api/menu")).json?.categories?.length > 0);
const orderId = tables.json.tables.find((t) => t.order_id)?.order_id;
check("there is a live order to look at", Boolean(orderId));

const kitchen = await login("kitchen@niloofar.test");
const queue = await kitchen.call("/api/kitchen/queue");
check("kitchen queue has items", queue.json?.items?.length > 0);

const ctrl = new AbortController();
const stream = await fetch(`${BASE}/api/events/stream?after=${queue.json.cursor}`, {
  headers: { cookie: kitchen.cookie },
  signal: ctrl.signal,
});
check("live stream opens as text/event-stream", stream.status === 200 && /text\/event-stream/.test(stream.headers.get("content-type") ?? ""));
const first = await Promise.race([
  stream.body.getReader().read(),
  new Promise((r) => setTimeout(() => r("timeout"), 5000)),
]);
check("the first stream bytes arrive at once (nothing is buffering)", first !== "timeout");
ctrl.abort();

const other = await login("manager@bagh.test");
check("another restaurant sees only its own tables", (await other.call("/api/tables")).json?.tables?.length === 8);
check("another restaurant cannot open this order -> 404", (await other.call(`/api/orders/${orderId}`)).status === 404);

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);