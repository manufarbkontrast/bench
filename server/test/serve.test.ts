import type { AddressInfo } from "node:net";
import { afterEach, expect, it } from "vitest";
import type { Server } from "node:http";
import { serve } from "../src/app.js";
import { appWithVault, emptyVault } from "./vault/app.js";

let server: Server | undefined;

afterEach(() => {
  server?.close();
});

it("answers on the loopback interface only, never on the network", async () => {
  // Bench has no login and can write to the vault and start jobs, so the address the OS reports
  // for the socket is the property itself: 127.0.0.1, not "::" or "0.0.0.0", which would accept a
  // connection from any machine on the same network.
  server = await new Promise<Server>((resolve) => {
    const s = serve(appWithVault(emptyVault()), 0, () => {
      resolve(s);
    });
  });
  expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
});
