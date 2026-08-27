type AccreditationParticipantFormValues = {
  name?: string;
  email?: string;
  phone?: string;
  categoryId?: string;
  company?: string;
  jobTitle?: string;
  badgeName?: string;
  participantRole?: string;
};

type AccreditationParticipantFormFieldProps = {
  categories: Array<{ id: string; name: string }>;
  defaults?: AccreditationParticipantFormValues;
};

function Input({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="space-y-2 text-sm text-slate-300">
      <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">{label}</span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400/40"
      />
    </label>
  );
}

export default function AccreditationParticipantFormFields({
  categories,
  defaults,
}: AccreditationParticipantFormFieldProps) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Input label="Nombre" name="name" defaultValue={defaults?.name} placeholder="Nombre del participante" required />
      <Input label="Correo" name="email" defaultValue={defaults?.email} placeholder="correo@ejemplo.com" type="email" />
      <Input label="WhatsApp" name="phone" defaultValue={defaults?.phone} placeholder="+591..." />
      <label className="space-y-2 text-sm text-slate-300">
        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Categoría</span>
        <select
          name="categoryId"
          defaultValue={defaults?.categoryId ?? ""}
          className="w-full rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-sm text-white outline-none transition focus:border-cyan-400/40"
        >
          <option value="">Sin categoría</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <Input label="Empresa" name="company" defaultValue={defaults?.company} placeholder="Empresa u organización" />
      <Input label="Cargo" name="jobTitle" defaultValue={defaults?.jobTitle} placeholder="Rol o cargo" />
      <Input
        label="Nombre para acreditación / badge"
        name="badgeName"
        defaultValue={defaults?.badgeName}
        placeholder="Nombre visible en acreditación"
      />
      <Input
        label="Rol del participante"
        name="participantRole"
        defaultValue={defaults?.participantRole}
        placeholder="Asistente, speaker, staff..."
      />
    </div>
  );
}
