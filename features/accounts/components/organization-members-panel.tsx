"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import StatusBadge from "@/components/status-badge";
import {
  ACCOUNT_PERMISSION_GROUPS,
  getAccountStatusLabel,
  getPermissionLabel,
  getRolePresetBySlug,
  normalizeAccountPermissions,
} from "@/features/accounts/domain/accounts-domain";
import {
  buildOrganizationMembersModel,
  getRoleMvpIntent,
} from "@/features/accounts/domain/members-directory";
import type { AccountPermissionKey, AccountRoleSlug, OrganizationAccount } from "@/features/accounts/types";
import { useCheckInStore } from "@/services/workspace-service";

type AccountFormState = {
  userEmail: string;
  userDisplayName: string;
  displayName: string;
  roleSlug: AccountRoleSlug;
  area: string;
  status: "active" | "inactive";
  permissions: AccountPermissionKey[];
  tempPassword: string;
  confirmTempPassword: string;
};

function toFormState(account: OrganizationAccount): AccountFormState {
  return {
    userEmail: account.userEmail,
    userDisplayName: account.userDisplayName,
    displayName: account.displayName,
    roleSlug: account.roleSlug,
    area: account.attributes.area ?? "",
    status: account.status,
    permissions: account.permissions.length ? account.permissions : account.rolePermissions,
    tempPassword: "",
    confirmTempPassword: "",
  };
}

function emptyFormState(): AccountFormState {
  return {
    userEmail: "",
    userDisplayName: "",
    displayName: "",
    roleSlug: "administrator",
    area: "",
    status: "active",
    permissions: getRolePresetBySlug("administrator").permissions,
    tempPassword: "",
    confirmTempPassword: "",
  };
}

export default function OrganizationMembersPanel() {
  const {
    accounts,
    currentAccount,
    currentOrganization,
    createAccount,
    reloadWorkspace,
    updateAccount,
    setAccountStatus,
    can,
  } = useCheckInStore();
  const canManageAccounts = can("accounts.manage") || currentAccount.isOwner;
  const canManagePermissions = can("permissions.manage") || currentAccount.isOwner;
  const model = useMemo(
    () =>
      buildOrganizationMembersModel({
        accounts,
        organizationId: currentOrganization.id,
        canManageAccounts,
        canManagePermissions,
      }),
    [accounts, canManageAccounts, canManagePermissions, currentOrganization.id],
  );
  const initialSelectedAccount = model.members[0] ? accounts.find((account) => account.id === model.members[0].id) ?? null : null;
  const [selectedId, setSelectedId] = useState<string>(initialSelectedAccount?.id ?? "new");
  const [form, setForm] = useState<AccountFormState>(initialSelectedAccount ? toFormState(initialSelectedAccount) : emptyFormState());
  const [isSaving, setIsSaving] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetTempPassword, setResetTempPassword] = useState("");
  const [resetConfirmTempPassword, setResetConfirmTempPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedId && account.organizationId === currentOrganization.id && account.id !== "bootstrap-account") ?? null,
    [accounts, currentOrganization.id, selectedId],
  );

  const clearResetNotice = () => {
    setResetSuccess(null);
    setResetError(null);
  };

  const togglePermission = (permission: AccountPermissionKey) => {
    setForm((current) => {
      const currentPermissions = new Set(current.permissions);

      if (currentPermissions.has(permission)) {
        currentPermissions.delete(permission);
      } else {
        currentPermissions.add(permission);
      }

      return {
        ...current,
        permissions: normalizeAccountPermissions([...currentPermissions], getRolePresetBySlug(current.roleSlug).permissions),
      };
    });
  };

  const handleRoleChange = (roleSlug: AccountRoleSlug) => {
    const preset = getRolePresetBySlug(roleSlug);

    setForm((current) => ({
      ...current,
      roleSlug,
      permissions: preset.permissions,
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);

    try {
      const baseName = form.userDisplayName.trim() || form.displayName.trim() || form.userEmail.split("@")[0] || "Miembro";
      const displayName = form.displayName.trim() || baseName;
      const userDisplayName = form.userDisplayName.trim() || baseName;
      const permissions = normalizeAccountPermissions(form.permissions, getRolePresetBySlug(form.roleSlug).permissions);

      if (!selectedAccount || selectedId === "new") {
        const tempPassword = form.tempPassword.trim();
        const confirmTempPassword = form.confirmTempPassword.trim();

        if (!tempPassword || tempPassword.length < 8) {
          setSaveError("Ingresá una contraseña temporal de al menos 8 caracteres.");
          return;
        }

        if (confirmTempPassword !== tempPassword) {
          setSaveError("Las contraseñas temporales no coinciden.");
          return;
        }

        const created = await createAccount({
          email: form.userEmail.trim(),
          displayName: userDisplayName,
          organizationId: currentOrganization.id,
          roleSlug: form.roleSlug,
          area: form.area.trim(),
          permissions,
          tempPassword,
          confirmTempPassword,
        });
        setSelectedId(created.id);
        setForm(toFormState(created));
        clearResetNotice();
        return;
      }

      const updated = await updateAccount({
        ...selectedAccount,
        userEmail: form.userEmail.trim(),
        userDisplayName,
        displayName,
        roleSlug: form.roleSlug,
        roleId: getRolePresetBySlug(form.roleSlug).id,
        roleName: getRolePresetBySlug(form.roleSlug).name,
        rolePermissions: getRolePresetBySlug(form.roleSlug).permissions,
        permissions,
        attributes: {
          ...selectedAccount.attributes,
          area: form.area.trim(),
          permissions,
          status: form.status,
        },
        status: form.status,
      });
      setSelectedId(updated.id);
      setForm(toFormState(updated));
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : "No se pudo guardar al miembro.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (status: "active" | "inactive") => {
    if (!selectedAccount) {
      return;
    }

    setIsSaving(true);
    try {
      const nextStatus = status;
      await setAccountStatus(selectedAccount.id, nextStatus);
      setForm((current) => ({ ...current, status: nextStatus }));
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetTemporaryPassword = async () => {
    if (!canManageAccounts || !selectedAccount || selectedAccount.id === "bootstrap-account" || selectedAccount.status !== "active") {
      return;
    }

    const tempPassword = resetTempPassword.trim();
    const confirmTempPassword = resetConfirmTempPassword.trim();

    if (!tempPassword || tempPassword.length < 8) {
      setResetError("Ingresá una contraseña temporal de al menos 8 caracteres.");
      return;
    }

    if (confirmTempPassword !== tempPassword) {
      setResetError("Las contraseñas temporales no coinciden.");
      return;
    }

    setIsResetting(true);
    clearResetNotice();

    try {
      const response = await fetch("/api/accounts/resend-invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          memberId: selectedAccount.id,
          tempPassword,
          confirmTempPassword,
        }),
      });

      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error?.message || "No se pudo restablecer la contraseña temporal.");
      }

      await reloadWorkspace();
      setResetSuccess(`Restablecimos la contraseña temporal de ${selectedAccount.userEmail}.`);
      setResetTempPassword("");
      setResetConfirmTempPassword("");
    } catch (error) {
      setResetError(error instanceof Error && error.message ? error.message : "No se pudo restablecer la contraseña temporal.");
    } finally {
      setIsResetting(false);
    }
  };

  const selectedModel = selectedAccount
    ? model.members.find((member) => member.id === selectedAccount.id) ?? null
    : null;
  const selectedRole = getRoleMvpIntent(form.roleSlug);
  const capabilitySummary = (selectedModel?.permissionSummary ?? selectedRole.capabilityLabels.slice(0, 3).join(" · ")) || "Sin permisos asignados.";

  return (
    <section className="space-y-5 rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Miembros de la organización</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">{currentOrganization.name}</h2>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Administración canónica de miembros para la organización activa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge variant="info">{model.totalMembers} miembros</StatusBadge>
          <StatusBadge variant="success">{model.activeMembers} activos</StatusBadge>
          <StatusBadge variant="warning">{model.inactiveMembers} inactivos</StatusBadge>
          <StatusBadge variant={model.readOnly ? "warning" : "info"}>{model.readOnly ? "Solo lectura" : "Edición habilitada"}</StatusBadge>
        </div>
      </div>

      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Alcance</p>
            <p className="mt-2 text-sm text-slate-300">
              Los miembros y permisos se administran por la organización activa.
            </p>
          </div>
          <StatusBadge variant="info">{model.ownerMembers} owners</StatusBadge>
        </div>
      </div>

      <section className="grid gap-3 xl:grid-cols-4">
        {model.roleSummaries.map((role) => (
          <article key={role.slug} className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{role.name}</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">{getRoleMvpIntent(role.slug).intent}</p>
            <p className="mt-3 text-xs text-slate-500">{role.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {role.capabilityLabels.slice(0, 3).map((label) => (
                <span key={label} className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-300">
                  {label}
                </span>
              ))}
              {role.capabilityLabels.length > 3 ? (
                <span className="rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  +{role.capabilityLabels.length - 3}
                </span>
              ) : null}
            </div>
          </article>
        ))}
      </section>

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-4">
        <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Miembros</p>
            {canManageAccounts ? (
              <button
                type="button"
                onClick={() => {
                  clearResetNotice();
                  setSelectedId("new");
                  setForm(emptyFormState());
                }}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/[0.08]"
              >
                Nuevo miembro
              </button>
            ) : (
              <StatusBadge variant="warning">Solo lectura</StatusBadge>
            )}
          </div>

          <div className="space-y-2">
            {model.empty ? (
              <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                Esta organización todavía no tiene miembros visibles.
              </div>
            ) : (
              model.members.map((member) => {
                const selected = member.id === selectedId;

                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => {
                      clearResetNotice();
                      setSelectedId(member.id);
                      const account = accounts.find((item) => item.id === member.id);
                      if (account) {
                        setForm(toFormState(account));
                      }
                    }}
                    className={[
                      "w-full rounded-[1.25rem] border px-4 py-3 text-left transition",
                      selected
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{member.displayName}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{member.userEmail || "Sin email"}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {member.roleName} · {member.area || "Sin área"}
                        </p>
                        <p className="mt-2 text-xs text-slate-400">{member.roleDescription}</p>
                        <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">{member.permissionSummary}</p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <StatusBadge variant={member.status === "inactive" ? "warning" : member.isOwner ? "success" : "info"}>
                          {getAccountStatusLabel(member.status)}
                        </StatusBadge>
                        {member.protectedOwner ? <StatusBadge variant="danger">Owner protegido</StatusBadge> : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Detalle del miembro</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{selectedAccount?.displayName ?? "Nuevo miembro"}</h3>
              <p className="mt-2 text-sm text-slate-400">{selectedAccount ? selectedAccount.userEmail : "Creá un miembro nuevo o elegí uno existente."}</p>
            </div>
            {selectedModel ? (
              <StatusBadge variant={selectedModel.isOwner ? "success" : selectedModel.status === "inactive" ? "warning" : "info"}>
                {selectedModel.isOwner ? "Owner" : getAccountStatusLabel(selectedModel.status)}
              </StatusBadge>
            ) : null}
            {selectedAccount?.mustChangePassword ? <StatusBadge variant="warning">Contraseña temporal</StatusBadge> : null}
          </div>

          <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Rol fijo</p>
            <p className="mt-2 text-sm font-medium text-white">{selectedRole.name}</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">{selectedRole.intent}</p>
            <p className="mt-3 text-xs text-slate-500">{selectedRole.description}</p>
            <p className="mt-4 text-sm text-slate-300">{capabilitySummary}</p>
          </div>

          <fieldset disabled={!canManageAccounts} className="mt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Nombre visible</span>
                <input
                  value={form.displayName}
                  onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  placeholder="Nombre en la interfaz"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Email</span>
                <input
                  value={form.userEmail}
                  onChange={(event) => setForm((current) => ({ ...current, userEmail: event.target.value }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  placeholder="miembro@dominio.com"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Perfil</span>
                <input
                  value={form.userDisplayName}
                  onChange={(event) => setForm((current) => ({ ...current, userDisplayName: event.target.value }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  placeholder="Nombre del perfil"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Área</span>
                <input
                  value={form.area}
                  onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                  placeholder="Recepción, puerta, dirección..."
                />
              </label>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-medium text-slate-200">Rol fijo</span>
                <select
                  value={form.roleSlug}
                  onChange={(event) => handleRoleChange(event.target.value as AccountRoleSlug)}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                >
                  {(["owner", "administrator", "reception", "door"] as AccountRoleSlug[]).map((slug) => (
                    <option key={slug} value={slug}>
                      {getRolePresetBySlug(slug).name}
                    </option>
                  ))}
                </select>
                <p className="mt-2 text-xs text-slate-500">{selectedRole.intent}</p>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Estado</span>
                <select
                  value={form.status}
                  onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}
                  className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition disabled:cursor-not-allowed disabled:bg-white/[0.02] disabled:text-slate-400 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </select>
              </label>
            </div>

            {selectedId === "new" ? (
              <div className="mt-5 rounded-[1.5rem] border border-cyan-400/15 bg-cyan-400/8 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/80">Contraseña temporal</p>
                    <p className="mt-1 text-sm text-cyan-50/80">
                      Esta contraseña la entrega el Owner/Admin al miembro por fuera de EntryFlow. En su primer ingreso deberá crear la propia.
                    </p>
                  </div>
                  <StatusBadge variant="info">Requerida para crear</StatusBadge>
                </div>

                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">Contraseña temporal</span>
                    <input
                      value={form.tempPassword}
                      onChange={(event) => setForm((current) => ({ ...current, tempPassword: event.target.value }))}
                      type="password"
                      autoComplete="new-password"
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                      placeholder="Mínimo 8 caracteres"
                    />
                  </label>

                  <label className="block">
                    <span className="text-sm font-medium text-slate-200">Confirmar contraseña</span>
                    <input
                      value={form.confirmTempPassword}
                      onChange={(event) => setForm((current) => ({ ...current, confirmTempPassword: event.target.value }))}
                      type="password"
                      autoComplete="new-password"
                      className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                      placeholder="Repetí la contraseña"
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Personalizar permisos</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {canManagePermissions
                      ? "Avanzado. Normalmente no hace falta tocar permisos individuales; el rol fijo ya cubre la operación habitual."
                      : "Solo lectura para este perfil."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge variant={canManagePermissions ? "success" : "warning"}>{canManagePermissions ? "Avanzado" : "Solo lectura"}</StatusBadge>
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((current) => !current)}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white transition hover:bg-white/[0.08]"
                  >
                    {advancedOpen ? "Cerrar" : "Abrir"}
                  </button>
                </div>
              </div>

              {!advancedOpen ? (
                <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-slate-950/30 p-4">
                  <p className="text-sm text-slate-300">{capabilitySummary}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    El preset fijo define la base. Solo abre esta sección si necesitas afinar permisos puntuales.
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {ACCOUNT_PERMISSION_GROUPS.map((group) => (
                    <div key={group.id} className="rounded-[1.25rem] border border-white/10 bg-slate-950/30 p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">{group.label}</p>
                      <div className="mt-3 space-y-2">
                        {group.permissions.map((permission) => {
                          const checked = form.permissions.includes(permission.key);

                          return (
                            <label key={permission.key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/30 p-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePermission(permission.key)}
                                disabled={!canManagePermissions}
                                className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent text-cyan-400 focus:ring-cyan-400/60"
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white">{permission.label}</p>
                                <p className="mt-1 text-xs text-slate-500">{permission.description}</p>
                                <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-600">{getPermissionLabel(permission.key)}</p>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Guardando..." : selectedId === "new" ? "Crear miembro" : "Guardar cambios"}
            </button>
            {selectedAccount && selectedAccount.id !== "bootstrap-account" ? (
              selectedModel?.canDeactivate ? (
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedAccount.status === "active" ? "inactive" : "active")}
                  disabled={isSaving}
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedAccount.status === "active" ? "Desactivar" : "Reactivar"}
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-4 text-sm font-medium text-slate-500"
                >
                  Owner protegido
                </button>
              )
            ) : null}
          </div>

          {selectedAccount && selectedAccount.id !== "bootstrap-account" && selectedId !== "new" ? (
            <div className="mt-5 rounded-[1.5rem] border border-cyan-400/15 bg-cyan-400/8 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-100/80">Restablecer contraseña temporal</p>
                  <p className="mt-1 text-sm text-cyan-50/80">
                    El miembro seguirá usando su correo y deberá cambiar esta contraseña al ingresar por primera vez.
                  </p>
                </div>
                <StatusBadge variant="info">{selectedAccount.mustChangePassword ? "Pendiente" : "Disponible"}</StatusBadge>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Contraseña temporal</span>
                  <input
                    value={resetTempPassword}
                    onChange={(event) => setResetTempPassword(event.target.value)}
                    type="password"
                    autoComplete="new-password"
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                    placeholder="Mínimo 8 caracteres"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Confirmar contraseña</span>
                  <input
                    value={resetConfirmTempPassword}
                    onChange={(event) => setResetConfirmTempPassword(event.target.value)}
                    type="password"
                    autoComplete="new-password"
                    className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                    placeholder="Repetí la contraseña"
                  />
                </label>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleResetTemporaryPassword}
                  disabled={isResetting}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isResetting ? "Restableciendo..." : "Restablecer contraseña temporal"}
                </button>
              </div>
            </div>
          ) : null}

            {saveError ? (
              <p className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {saveError}
              </p>
            ) : null}

            {resetSuccess ? (
              <p className="mt-3 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                {resetSuccess}
              </p>
            ) : null}

            {resetError ? (
              <p className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {resetError}
              </p>
            ) : null}
          </fieldset>

          {selectedModel?.deactivationHint ? <p className="mt-3 text-xs text-amber-300">{selectedModel.deactivationHint}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Permisos y protección</p>
          <p className="mt-2">
            {model.readOnly
              ? "Este perfil puede revisar miembros pero no editarlos."
              : "La protección del último Owner activo se mantiene y la UI no expone una acción destructiva inválida."}
          </p>
        </div>
        <Link
          href="/settings"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08]"
        >
          Volver a ajustes
        </Link>
      </div>
    </section>
  );
}
