import { createServer, type Server as NetServer } from "node:net";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, expect, it } from "vitest";
import { serve } from "../src/app.js";
import { appWithVault, emptyVault } from "./vault/app.js";

const open: (Server | NetServer)[] = [];

afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

it("answers on the loopback interface only, never on the network", async () => {
  // Bench has no login and can write to the vault and start jobs, so the address the OS reports
  // for the socket is the property itself: 127.0.0.1, not "::" or "0.0.0.0", which would accept a
  // connection from any machine on the same network.
  const server = await serve(appWithVault(emptyVault()), 0);
  open.push(server);
  expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
});

it("fails loudly when the port is taken, rather than claiming to run", async () => {
  const taken = await new Promise<NetServer>((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      resolve(s);
    });
  });
  open.push(taken);
  const { port } = taken.address() as AddressInfo;
  await expect(serve(appWithVault(emptyVault()), port)).rejects.toMatchObject({
    code: "EADDRINUSE",
  });
});
