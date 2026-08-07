import SectionPlaceholder from "@/components/section-placeholder";

export default function SettingsPage() {
  return (
    <SectionPlaceholder
      title="Ajustes"
      description="Marca, preferencias del negocio y configuración de cada sede."
      primaryAction={{ label: "Volver al centro", href: "/" }}
      secondaryAction={{ label: "Explorar eventos", href: "/events" }}
    />
  );
}
