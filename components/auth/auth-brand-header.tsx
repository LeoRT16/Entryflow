type AuthBrandHeaderProps = {
  title?: string;
  description: string;
  attribution?: string;
  showAttribution?: boolean;
};

export default function AuthBrandHeader({
  title = "EntryFlow",
  description,
  attribution = "Creado por @_rodriguezleonardo",
  showAttribution = true,
}: AuthBrandHeaderProps) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-cyan-100/70">Plataforma operativa</p>
      <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">{title}</h1>
      {showAttribution ? (
        <p className="text-sm font-medium text-slate-400">{attribution}</p>
      ) : null}
      <p className="max-w-sm text-sm leading-6 text-slate-400">{description}</p>
    </div>
  );
}
