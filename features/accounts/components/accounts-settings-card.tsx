"use client";

import { useMemo, useState } from "react";

import StatusBadge from "@/components/status-badge";
import {
  ACCOUNT_PERMISSION_GROUPS,
  getAccountPresetDescription,
  getAccountPresetLabel,
  getAccountStatusLabel,
  getPermissionLabel,
  getRolePresetBySlug,
  normalizeAccountPermissions,
} from "@/features/accounts/domain/accounts-domain";
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
  };
}

export default function AccountsSettingsCard() {
  const { accounts, currentAccount, createAccount, updateAccount, setAccountStatus, can } = useCheckInStore();
  const canManagePermissions = can("permissions.manage") || currentAccount.isOwner;
  const allAccounts = useMemo(() => {
    const current = currentAccount.id === "bootstrap-account" ? [currentAccount, ...accounts] : [currentAccount, ...accounts];
    const seen = new Set<string>();

    return current.filter((account) => {
      if (seen.has(account.id)) {
        return false;
      }

      seen.add(account.id);
      return true;
    });
  }, [accounts, currentAccount]);
  const [selectedId, setSelectedId] = useState(allAccounts[0]?.id ?? "new");
  const [form, setForm] = useState<AccountFormState>(emptyFormState());
  const [isSaving, setIsSaving] = useState(false);

  const selectedAccount = useMemo(() => allAccounts.find((account) => account.id === selectedId) ?? null, [allAccounts, selectedId]);

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

    try {
      const baseName = form.userDisplayName.trim() || form.displayName.trim() || form.userEmail.split("@")[0] || "Cuenta";
      const displayName = form.displayName.trim() || baseName;
      const userDisplayName = form.userDisplayName.trim() || baseName;
      const permissions = normalizeAccountPermissions(form.permissions, getRolePresetBySlug(form.roleSlug).permissions);

      if (!selectedAccount || selectedId === "new" || selectedAccount.id === "bootstrap-account") {
        const created = await createAccount({
          email: form.userEmail.trim(),
          displayName: userDisplayName,
          organizationId: currentAccount.organizationId,
          roleSlug: form.roleSlug,
          area: form.area.trim(),
          permissions,
        });
        setSelectedId(created.id);
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
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = async (status: "active" | "inactive") => {
    if (!selectedAccount || selectedAccount.id === "bootstrap-account") {
      return;
    }

    setIsSaving(true);
    try {
      await setAccountStatus(selectedAccount.id, status);
      setForm((current) => ({ ...current, status }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Equipo y permisos</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Cuentas de la organización</h2>
          <p className="mt-2 text-sm text-slate-400">
            Los roles son presets. Los permisos efectivos se ajustan por cuenta y se guardan en Supabase.
          </p>
        </div>
        <StatusBadge variant={currentAccount.isOwner ? "success" : "info"}>{currentAccount.isOwner ? "Owner activo" : getAccountPresetLabel(currentAccount.roleSlug)}</StatusBadge>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="space-y-3 rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Cuentas</p>
            <button
              type="button"
              onClick={() => {
                setSelectedId("new");
                setForm(emptyFormState());
              }}
              className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.22em] text-slate-300 transition hover:bg-white/[0.08]"
            >
              Nueva
            </button>
          </div>

          <div className="space-y-2">
            {allAccounts.length ? (
              allAccounts.map((account) => {
                const selected = account.id === selectedId;

                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(account.id);
                      setForm(toFormState(account));
                    }}
                    className={[
                      "w-full rounded-[1.25rem] border px-4 py-3 text-left transition",
                      selected
                        ? "border-cyan-400/40 bg-cyan-400/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{account.displayName}</p>
                        <p className="mt-1 text-xs text-slate-500">{account.userEmail || "Sin email"}</p>
                        <p className="mt-1 text-xs text-slate-500">{account.roleName} · {account.attributes.area ?? "Sin área"}</p>
                      </div>
                      <StatusBadge variant={account.status === "inactive" ? "warning" : account.isOwner ? "success" : "info"}>
                        {getAccountStatusLabel(account.status)}
                      </StatusBadge>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-[1.25rem] border border-dashed border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
                Todavía no hay cuentas creadas.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Cuenta seleccionada</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{selectedAccount?.displayName ?? "Nueva cuenta"}</h3>
              <p className="mt-2 text-sm text-slate-400">
                {selectedAccount ? `${selectedAccount.userEmail} · ${selectedAccount.roleName}` : "Creá un miembro nuevo o elegí una cuenta existente."}
              </p>
            </div>
            {selectedAccount ? (
              <StatusBadge variant={selectedAccount.isOwner ? "success" : selectedAccount.status === "inactive" ? "warning" : "info"}>
                {selectedAccount.isOwner ? "Protegida" : getAccountStatusLabel(selectedAccount.status)}
              </StatusBadge>
            ) : null}
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Nombre visible</span>
              <input
                value={form.displayName}
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                placeholder="Nombre en la interfaz"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Email</span>
              <input
                value={form.userEmail}
                onChange={(event) => setForm((current) => ({ ...current, userEmail: event.target.value }))}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                placeholder="usuario@dominio.com"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Perfil</span>
              <input
                value={form.userDisplayName}
                onChange={(event) => setForm((current) => ({ ...current, userDisplayName: event.target.value }))}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                placeholder="Nombre de usuario"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Área</span>
              <input
                value={form.area}
                onChange={(event) => setForm((current) => ({ ...current, area: event.target.value }))}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/60 focus:bg-white/[0.06]"
                placeholder="Recepción, puerta, dirección..."
              />
            </label>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Preset de rol</span>
              <select
                value={form.roleSlug}
                onChange={(event) => handleRoleChange(event.target.value as AccountRoleSlug)}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
              >
                {(["owner", "administrator", "reception", "door"] as AccountRoleSlug[]).map((slug) => (
                  <option key={slug} value={slug}>
                    {getAccountPresetLabel(slug)}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">{getAccountPresetDescription(form.roleSlug)}</p>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Estado</span>
              <select
                value={form.status}
                onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as "active" | "inactive" }))}
                className="mt-2 h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:bg-white/[0.06]"
              >
                <option value="active">Activo</option>
                <option value="inactive">Inactivo</option>
              </select>
            </label>
          </div>

          <div className="mt-5 rounded-[1.5rem] border border-white/10 bg-slate-950/30 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Permisos efectivos</p>
                <p className="mt-1 text-sm text-slate-400">Agrupados por área. El preset sirve como base y luego podés personalizar la cuenta.</p>
              </div>
              <StatusBadge variant={canManagePermissions ? "success" : "warning"}>{canManagePermissions ? "Editable" : "Solo lectura"}</StatusBadge>
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              {ACCOUNT_PERMISSION_GROUPS.map((group) => (
                <div key={group.id} className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-4">
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
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Guardando..." : selectedAccount ? "Guardar cambios" : "Crear cuenta"}
            </button>
            {selectedAccount && selectedAccount.id !== "bootstrap-account" ? (
              <button
                type="button"
                onClick={() => handleStatusChange(selectedAccount.status === "active" ? "inactive" : "active")}
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {selectedAccount.status === "active" ? "Desactivar" : "Reactivar"}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
