import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import AuthBrandHeader from "../components/auth/auth-brand-header";
import LoginForm from "../app/login/login-form";

const loginPageSource = readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8");
const setupPasswordPageSource = readFileSync(new URL("../app/auth/setup-password/page.tsx", import.meta.url), "utf8");

test("login and setup-password pages use the shared auth brand header", () => {
  assert.match(loginPageSource, /AuthBrandHeader/);
  assert.match(loginPageSource, /LoginForm/);
  assert.match(setupPasswordPageSource, /AuthBrandHeader/);
  assert.match(setupPasswordPageSource, /showAttribution=\{false\}/);
});

test("auth brand header promotes EntryFlow and keeps attribution secondary", () => {
  const markup = renderToStaticMarkup(
    createElement(AuthBrandHeader, {
      description: "Usá tu correo y contraseña para abrir el workspace autorizado.",
    }),
  );

  assert.ok(markup.includes("EntryFlow"));
  assert.ok(markup.includes("Creado por @_rodriguezleonardo"));
  assert.ok(markup.includes("Usá tu correo y contraseña para abrir el workspace autorizado."));
});

test("login form stays present with the existing notices and submit action", () => {
  const markup = renderToStaticMarkup(
    createElement(LoginForm, {
      next: "/",
      noticeMessage: "Esta invitación expiró o ya fue utilizada. Solicita una nueva invitación.",
    }),
  );

  assert.ok(markup.includes("Correo"));
  assert.ok(markup.includes("Contraseña"));
  assert.ok(markup.includes("Entrar"));
  assert.ok(markup.includes("Esta invitación expiró o ya fue utilizada."));
});

test("setup-password keeps EntryFlow branding without duplicating attribution", () => {
  const markup = renderToStaticMarkup(
    createElement(AuthBrandHeader, {
      description: "Terminá de convertir tu acceso temporal en una contraseña permanente para entrar al equipo.",
      showAttribution: false,
    }),
  );

  assert.ok(markup.includes("EntryFlow"));
  assert.equal(markup.includes("Creado por @_rodriguezleonardo"), false);
});
