import type { Metadata } from "next";
import Link from "next/link";

import PublicLegalShell from "@/components/public-legal-shell";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Política de privacidad pública de EntryFlow para Meta y visitantes sin sesión.",
};

export default function PrivacyPage() {
  return (
    <PublicLegalShell
      currentPath="/privacy"
      title="Política de privacidad"
      description="Esta política explica cómo EntryFlow procesa datos para operar eventos, gestionar invitaciones y registrar la actividad necesaria para prestar el servicio."
    >
      <section className="surface-elevated p-6 sm:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-8">
            <article className="space-y-3">
              <p className="text-sm text-slate-400">Última actualización: 20 de agosto de 2026</p>
              <p className="text-sm leading-7 text-slate-300">
                EntryFlow es una plataforma de gestión y operación de eventos. En general, procesamos datos por cuenta de
                las organizaciones que administran sus eventos con EntryFlow, y también podemos procesar ciertos datos
                operativos necesarios para prestar y proteger el servicio.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Información que procesamos</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-slate-300">
                <li>Nombre del invitado, asistente u otros datos de identificación proporcionados por la organización.</li>
                <li>Información de reserva y acceso asociada al evento.</li>
                <li>Número de teléfono y canal de WhatsApp cuando se usa para invitaciones o comunicaciones operativas.</li>
                <li>Estado de invitaciones, confirmaciones y entregas.</li>
                <li>Identificadores técnicos necesarios para operar invitaciones, códigos QR y seguimiento operativo.</li>
                <li>Registros operativos y estados de entrega de comunicaciones relacionadas con el evento.</li>
              </ul>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Cómo utilizamos la información</h2>
              <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-slate-300">
                <li>Gestionar reservas, invitados y accesos.</li>
                <li>Generar y administrar invitaciones.</li>
                <li>Controlar el ingreso y apoyar la operación del evento.</li>
                <li>Enviar comunicaciones relacionadas con el evento, cuando la organización lo solicite.</li>
                <li>Registrar estados operativos de esas comunicaciones para trazabilidad y soporte.</li>
                <li>Mantener la seguridad, el funcionamiento y la confiabilidad del servicio.</li>
              </ul>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Proveedores y terceros</h2>
              <p className="text-sm leading-7 text-slate-300">
                Podemos utilizar proveedores de infraestructura y comunicación necesarios para prestar el servicio, como
                hosting, base de datos, almacenamiento, mensajería y plataformas de WhatsApp/Meta cuando corresponda.
                Estos proveedores solo participan en la medida necesaria para operar EntryFlow y sus integraciones.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Conservación de datos</h2>
              <p className="text-sm leading-7 text-slate-300">
                Conservamos la información durante el tiempo necesario para prestar el servicio, apoyar la operación del
                evento, resolver incidencias, cumplir obligaciones aplicables y mantener trazabilidad técnica. Cuando
                una organización solicita eliminación, podremos conservar ciertos registros si son necesarios por
                obligaciones legales, seguridad, prevención de fraude o resolución de disputas.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Seguridad</h2>
              <p className="text-sm leading-7 text-slate-300">
                Implementamos medidas razonables de seguridad y control de acceso para proteger la información operativa.
                Ningún sistema es perfecto, pero buscamos minimizar el acceso no autorizado y preservar la integridad de
                los datos.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Derechos y solicitudes del usuario</h2>
              <p className="text-sm leading-7 text-slate-300">
                Si tus datos fueron cargados en EntryFlow por una organización, normalmente esa organización es el mejor
                punto de contacto para revisar acceso, corrección o eliminación. También puedes escribirnos para pedir
                orientación o derivación a la organización correspondiente.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Eliminación de datos</h2>
              <p className="text-sm leading-7 text-slate-300">
                Para solicitar la eliminación de datos, visitá nuestra{" "}
                <Link href="/data-deletion" className="text-cyan-200 underline decoration-cyan-400/40 underline-offset-4 hover:text-cyan-100">
                  página de eliminación de datos
                </Link>
                . Ahí explicamos cómo enviar una solicitud y qué información incluir.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Cambios a esta política</h2>
              <p className="text-sm leading-7 text-slate-300">
                Podemos actualizar esta política para reflejar cambios en el servicio, en nuestras prácticas operativas o
                en requisitos aplicables. La versión vigente será la publicada en esta página.
              </p>
            </article>

            <article className="space-y-3">
              <h2 className="text-xl font-semibold text-white">Contacto</h2>
              <p className="text-sm leading-7 text-slate-300">
                Si tenés preguntas sobre esta política o sobre el tratamiento de datos en EntryFlow, podés escribir a{" "}
                <a href="mailto:leorodrigueztoro1@gmail.com" className="text-cyan-200 underline decoration-cyan-400/40 underline-offset-4 hover:text-cyan-100">
                  leorodrigueztoro1@gmail.com
                </a>
                .
              </p>
            </article>
          </div>

          <aside className="space-y-4">
            <div className="surface-quiet p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Resumen</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
                <li>EntryFlow opera eventos, invitados e invitaciones.</li>
                <li>Procesa datos proporcionados por cada organización para prestar el servicio.</li>
                <li>Puede usar WhatsApp/Meta y otros proveedores técnicos.</li>
                <li>Los datos pueden conservarse por motivos legales, de seguridad o de trazabilidad.</li>
              </ul>
            </div>

            <div className="surface-quiet p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Navegación</p>
              <div className="mt-4 flex flex-col gap-3 text-sm">
                <Link href="/privacy" className="text-cyan-200">
                  Política de privacidad
                </Link>
                <Link href="/data-deletion" className="text-slate-300 hover:text-white">
                  Eliminación de datos
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </PublicLegalShell>
  );
}
