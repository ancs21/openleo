import { expect, test } from "bun:test";
import { verifyIdToken } from "./siwc";

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
