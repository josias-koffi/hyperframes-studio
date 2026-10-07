import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createGateway } from "./gateway";

const fake = join(__dirname, "..", "test", "fake-hyperframes.mjs");

describe("hf-studio gateway", () => {
  let gateway: ReturnType<typeof createGateway> | null = null;
  afterEach(async () => {
    await gateway?.close();
    gateway = null;
  });

  async function start(token = "", frameAncestors = "") {
    gateway = createGateway({
      workspaceDir: __dirname,
      hyperframes: [process.execPath, fake],
      previewPort: 34000 + Math.floor(Math.random() * 1000),
      token,
      readyTimeoutMs: 10_000,
      frameAncestors,
    });
    await new Promise<void>((resolve) => gateway!.server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(gateway.server.address() as AddressInfo).port}`;
  }

  const open = (base: string, slug: string, token?: string) =>
    fetch(`${base}/__gateway/open`, {
      method: "POST",
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: JSON.stringify({ slug }),
    });

  it("says no project is open before the first open", async () => {
    const base = await start();
    expect((await fetch(base)).status).toBe(503);
  });

  it("proxies the opened project's studio and switches project", async () => {
    const base = await start();
    expect((await open(base, "demo")).status).toBe(200);
    expect(await (await fetch(`${base}/`)).text()).toBe("studio:videos/demo");

    expect((await open(base, "other")).status).toBe(200);
    expect(await (await fetch(`${base}/`)).text()).toBe("studio:videos/other");
    expect(await (await fetch(`${base}/__gateway/status`)).json()).toEqual({ slug: "other" });
  });

  it("rejects bad slugs and missing tokens", async () => {
    const base = await start("secret");
    expect((await open(base, "demo")).status).toBe(401);
    expect((await open(base, "../etc", "secret")).status).toBe(400);
  });

  it("lets only the web app frame the studio", async () => {
    const framed = await start("", "https://studio.example");
    await open(framed, "demo");
    expect((await fetch(`${framed}/`)).headers.get("content-security-policy")).toBe(
      "frame-ancestors 'self' https://studio.example",
    );
    await gateway!.close();

    const unframed = await start();
    await open(unframed, "demo");
    expect((await fetch(`${unframed}/`)).headers.get("content-security-policy")).toBeNull();
  });
});
