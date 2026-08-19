import assert from "node:assert/strict";
import test from "node:test";

import { renderInvitationImageBlob } from "../features/access/domain/invitation-image-export";

test("renderInvitationImageBlob waits for fonts and returns a reusable blob descriptor", async () => {
  const calls: string[] = [];
  const result = await renderInvitationImageBlob(
    {} as HTMLElement,
    {
      filename: "invitation-res-001.png",
    },
    {
      waitForFontsReady: async () => {
        calls.push("fonts");
      },
      toBlobImpl: async (_node, options) => {
        const normalizedOptions = (options ?? {}) as {
          cacheBust?: boolean;
          pixelRatio?: number;
          backgroundColor?: string;
          type?: string;
        };
        calls.push("blob");
        assert.deepEqual(
          {
            cacheBust: normalizedOptions.cacheBust,
            pixelRatio: normalizedOptions.pixelRatio,
            backgroundColor: normalizedOptions.backgroundColor,
            type: normalizedOptions.type,
          },
          {
            cacheBust: true,
            pixelRatio: 1,
            backgroundColor: "#0b111a",
            type: "image/png",
          },
        );

        return new Blob(["png"], { type: "image/png" });
      },
    },
  );

  assert.deepEqual(calls, ["fonts", "blob"]);
  assert.equal(result.filename, "invitation-res-001.png");
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.blob.type, "image/png");
});

test("renderInvitationImageBlob throws when no blob is produced", async () => {
  await assert.rejects(
    () =>
      renderInvitationImageBlob(
        {} as HTMLElement,
        {
          filename: "invitation-res-001.png",
        },
        {
          waitForFontsReady: async () => undefined,
          toBlobImpl: async () => null,
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as Error).message, "No se pudo generar la imagen de la invitación.");
      return true;
    },
  );
});
