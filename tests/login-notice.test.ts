import assert from "node:assert/strict";
import test from "node:test";

import { getLoginNoticeMessage } from "../app/login/login-notice";

test("expired invite query params map to a friendly login message", () => {
  const message = getLoginNoticeMessage({
    error: "access_denied",
    error_code: "otp_expired",
    error_description: "Email link is invalid or has expired",
  });

  assert.equal(message, "Esta invitación expiró o ya fue utilizada. Solicita una nueva invitación.");
});

test("login notice stays empty for normal login errors", () => {
  assert.equal(getLoginNoticeMessage({ error: "auth", error_description: "Correo o contraseña inválidos." }), null);
});
