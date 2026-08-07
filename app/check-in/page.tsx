import SectionPlaceholder from "@/components/section-placeholder";

export default function CheckInPage() {
  return (
    <SectionPlaceholder
      title="Ingresos"
      description="Espacio dedicado para confirmar invitados conforme llegan al acceso."
      primaryAction={{ label: "Abrir directorio", href: "/customers" }}
      secondaryAction={{ label: "Ver reservas", href: "/reservations" }}
    />
  );
}
