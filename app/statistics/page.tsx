import SectionPlaceholder from "@/components/section-placeholder";

export default function StatisticsPage() {
  return (
    <SectionPlaceholder
      title="Estadísticas"
      description="Tendencias operativas, asistencia y rendimiento de reservas."
      primaryAction={{ label: "Ir al centro", href: "/" }}
      secondaryAction={{ label: "Ver eventos", href: "/events" }}
    />
  );
}
