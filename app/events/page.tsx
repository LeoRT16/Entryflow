import SectionPlaceholder from "@/components/section-placeholder";

export default function EventsPage() {
  return (
    <SectionPlaceholder
      title="Eventos"
      description="Planifica las noches, la capacidad y los detalles operativos de cada sede."
      primaryAction={{ label: "Ver reservas", href: "/reservations" }}
      secondaryAction={{ label: "Volver al centro", href: "/" }}
    />
  );
}
