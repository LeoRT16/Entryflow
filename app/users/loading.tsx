export default function LoadingUsersPage() {
  return (
    <section className="flex min-h-[55vh] items-center justify-center rounded-[2rem] border border-white/10 bg-white/[0.03] p-8">
      <div className="max-w-2xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">Cargando miembros</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Estamos preparando la organización activa.</h1>
        <p className="mt-4 text-sm leading-6 text-slate-400">Recuperando miembros, roles fijos y permisos efectivos del workspace actual.</p>
      </div>
    </section>
  );
}
