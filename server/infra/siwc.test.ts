import { afterAll, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Sign-in keeps this machine's id under ~/.config/openleo: point HOME at a temp folder before loading it.
const realHome = process.env.HOME;
process.env.HOME = mkdtempSync(join(tmpdir(), "openleo-home-"));
const { verifyIdToken } = await import("./siwc");
afterAll(() => { process.env.HOME = realHome; });

const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");

test("ID token: valid passes; bad sig, alg, iss, aud, exp, nonce fail", async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwks = { keys: [{ ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1" }] };
  const sign = async (claims: object, header: object = { alg: "RS256", kid: "k1" }) => {
    const data = `${enc(header)}.${enc(claims)}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(data));
    return `${data}.${Buffer.from(sig).toString("base64url")}`;
  };
  const good = { iss: "https://auth.openai.com", sub: "user-1", aud: "oaiapp_x", exp: Date.now() / 1000 + 600, nonce: "n1", email: "a@b.c" };
  const opts = { jwks, issuer: "https://auth.openai.com", clientId: "oaiapp_x", nonce: "n1" };

  expect((await verifyIdToken(await sign(good), opts)).sub).toBe("user-1");
  expect((await verifyIdToken(await sign({ ...good, aud: ["other", "oaiapp_x"] }), opts)).sub).toBe("user-1");

  const tampered = (await sign(good)).split(".");
  tampered[1] = enc({ ...good, sub: "attacker" });
  await expect(verifyIdToken(tampered.join("."), opts)).rejects.toThrow("signature invalid");
  await expect(verifyIdToken(`${enc({ alg: "none" })}.${enc(good)}.x`, opts)).rejects.toThrow("unsupported");
  await expect(verifyIdToken(await sign({ ...good, iss: "https://evil" }), opts)).rejects.toThrow("issuer");
  await expect(verifyIdToken(await sign({ ...good, aud: "oaiapp_other" }), opts)).rejects.toThrow("audience");
  await expect(verifyIdToken(await sign({ ...good, exp: Date.now() / 1000 - 1 }), opts)).rejects.toThrow("expired");
  await expect(verifyIdToken(await sign({ ...good, nonce: "replayed" }), opts)).rejects.toThrow("nonce");
  await expect(verifyIdToken(await sign(good, { alg: "RS256", kid: "unknown" }), opts)).rejects.toThrow("key not found");
});

test("accounts are keyed by verified email, so a new registration (new sub) is the same account", async () => {
  const { accountKey } = await import("./siwc");
  const { tenantId } = await import("./tenant");
  const before = accountKey({ email: "Ada@Example.com ", email_verified: true });
  const after = accountKey({ email: "ada@example.com", email_verified: true }); // different `sub`, same person
  expect(before).toBe("ada@example.com");
  expect(tenantId(before)).toBe(tenantId(after));
  expect(() => accountKey({ email: "x@y.z", email_verified: false })).toThrow("verified email");
  expect(() => accountKey({ email: "x@y.z" })).toThrow("verified email");
  expect(() => accountKey({ email_verified: true })).toThrow("verified email");
});

test("sign-in asks for the account picker, and picking another account signs in again as that account", async () => {
  const { handleCallback, startLogin } = await import("./siwc");
  const { tenantDir, tenantId } = await import("./tenant");
  const { writePrivate } = await import("./private-file");
  const { jwks, signer } = await keys();

  // This browser signed in as ada before, so her registration is reused. Bob has signed in here before, too.
  const ada = tenantId("ada@example.com");
  await writePrivate(`${tenantDir(ada)}/chatgpt.json`, JSON.stringify({ client_id: "oaiapp_ada", sub: "s", email: "ada@example.com", app_name: "OpenLeo" }));
  await writePrivate(`${tenantDir(tenantId("bob@example.com"))}/chatgpt.json`, JSON.stringify({ client_id: "oaiapp_bob", sub: "b", email: "bob@example.com", app_name: "OpenLeo" }));
  const first = new URL((await startLogin("http://127.0.0.1:3000/auth/callback", "/b/main", ada)).url);
  expect(first.searchParams.get("prompt")).toBe("select_account");
  expect(first.searchParams.get("client_id")).toBe("oaiapp_ada");
  expect(first.searchParams.has("login_hint")).toBe(false);
  expect(first.searchParams.has("id_token_hint")).toBe(false);

  // In the picker, the person chooses bob instead.
  const realFetch = globalThis.fetch;
  const revoked: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.endsWith("/.well-known/openid-configuration")) return Response.json({ issuer: "https://auth.openai.com", jwks_uri: "https://jwks.test", revocation_endpoint: "https://revoke.test" });
    if (url === "https://jwks.test") return Response.json(jwks);
    if (url === "https://revoke.test") return revoked.push(String(init?.body)), new Response(null);
    const idToken = await signer({ iss: "https://auth.openai.com", sub: "bob-1", aud: "oaiapp_ada", exp: Date.now() / 1000 + 600, nonce: first.searchParams.get("nonce"), email: "bob@example.com", email_verified: true });
    return Response.json({ access_token: "a", refresh_token: "r", id_token: idToken, scope: "openid chatgpt.tokens.use.direct", expires_in: 3600 });
  }) as typeof fetch;
  try {
    const callback = new URL(`http://127.0.0.1:3000/auth/callback?state=${first.searchParams.get("state")}&code=c`);
    const res = await handleCallback(callback, async () => { throw new Error("must not admit bob with ada's registration"); }, () => "openleo_account=; Max-Age=0");
    const again = new URL(res.headers.get("location")!);
    expect(again.origin + again.pathname).toBe("https://auth.openai.com/api/accounts/authorize"); // no error page
    expect(again.searchParams.get("client_id")).toBe("oaiapp_bob"); // bob's own registration
    expect(again.searchParams.get("prompt")).toBe("select_account");
    expect(res.headers.get("set-cookie")).toBe("openleo_account=; Max-Age=0"); // ada is no longer this browser's account
    for (let i = 0; i < 50 && !revoked.length; i++) await Bun.sleep(10);
    expect(revoked).toEqual([new URLSearchParams({ token: "r", token_type_hint: "refresh_token", client_id: "oaiapp_ada" }).toString()]); // bob's unused token
  } finally {
    globalThis.fetch = realFetch;
  }
});

/** A signing key and its JWKS, for ID tokens the test makes up. */
async function keys() {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const jwks = { keys: [{ ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1" }] };
  const signer = async (claims: object) => {
    const data = `${enc({ alg: "RS256", kid: "k1" })}.${enc(claims)}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(data));
    return `${data}.${Buffer.from(sig).toString("base64url")}`;
  };
  return { jwks, signer };
}
