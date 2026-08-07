# What is a Ticket?

## Objetivo

El propósito de este documento es definir la filosofía y la arquitectura del sistema de Tickets de EntryFlow como entidad operativa central.

El Ticket existe como una identidad de negocio independiente de la forma en que se presenta o comparte. La interfaz, las representaciones visuales y los canales de distribución pueden cambiar con el tiempo, pero el modelo del Ticket debe permanecer estable.

---

# What is a Ticket?

El **Ticket** es la entidad operativa central del sistema.

Representa una autorización individual de admisión dentro de un evento.

El Ticket existe de forma independiente de:

- QR
- Imágenes
- WhatsApp
- Instagram
- Wallets

Todo lo anterior son únicamente representaciones del Ticket.

El Ticket es la fuente operativa real; las representaciones son formas distintas de mostrar o distribuir esa misma identidad.

---

# Ticket Identity

Cada Ticket tiene una sola identidad permanente.

Esa identidad no cambia aunque cambien sus datos operativos o visuales.

Cambiar el nombre del invitado no crea un nuevo Ticket.

Cambiar el QR normalmente no crea un nuevo Ticket.

Cambiar el diseño visual no crea un nuevo Ticket.

La identidad del Ticket nunca cambia.

Esto significa que el sistema debe distinguir con claridad entre:

- identidad del Ticket
- estado actual del Ticket
- representación visual del Ticket
- historial de cambios del Ticket

La permanencia de la identidad es una regla estructural del producto.

---

# Ticket Representations

Las representaciones son distintas formas de presentar el mismo Ticket según el contexto operativo o el canal de distribución.

## 1. Landing Page

La Landing Page es la fuente oficial de verdad del Ticket.

Contiene:

- invitado actual
- evento
- QR
- estado operativo
- información más reciente

Toda otra representación debe reflejar el estado actual del Ticket definido en esta fuente.

## 2. WhatsApp Entry

Representación visual del Ticket optimizada para mensajería.

Su propósito es facilitar el envío rápido, legible y útil dentro de conversaciones operativas.

## 3. Instagram Story

Pieza visual sin QR.

Está diseñada para compartir información del Ticket en un formato narrativo o promocional, no para validación de ingreso.

## 4. Downloadable Entry

Representación descargable del Ticket con QR.

Está pensada para almacenamiento local, impresión o distribución directa al invitado.

## 5. Future representations

Representaciones futuras previstas:

- Apple Wallet
- Google Wallet
- PDF
- NFC

Estas formas no cambian la identidad del Ticket. Solo amplían los canales de uso y acceso.

---

# QR Philosophy

El QR **NO** es el Ticket.

El QR identifica al Ticket.

El Ticket puede existir sin QR.

Esto permite que el sistema mantenga la identidad operativa aunque el QR cambie, se regenere, no haya sido emitido todavía o exista una representación sin código visible.

La lógica correcta es:

- Ticket primero
- QR después
- representación después

El QR es una clave de acceso y de consulta, no la identidad del negocio.

---

# Ticket History

Toda acción relevante se convierte en historial.

Ejemplos:

- Transferencia de invitado
- Rotación de QR
- Regeneración visual
- Check-in
- Admisión manual
- Cancelación

El historial nunca debe eliminarse.

El historial no es un registro secundario. Es parte del valor operativo del Ticket porque permite trazabilidad, auditoría y reconstrucción del comportamiento del evento.

Cada cambio importante debe conservar tanto el estado actual como el rastro histórico de lo que ocurrió.

---

# Ticket Assets

Los **Ticket Assets** son representaciones visuales generadas a partir de plantillas reutilizables.

Una plantilla define la estructura visual y contiene marcadores de posición.

Ejemplos de placeholders:

- Nombre del invitado
- QR
- Fecha
- Evento
- Logo
- Dress Code

La plantilla es reutilizable.

EntryFlow inyecta los datos del Ticket en esa plantilla para producir la representación final.

El sistema debe regenerar los assets cuando cambien los datos relevantes del Ticket.

Esto garantiza que la representación siempre permanezca alineada con el estado operativo actual.

Los Ticket Assets no reemplazan al Ticket. Solo materializan su información para un canal o formato específico.

---

# Product Rules

Reglas de negocio descubiertas hasta ahora:

- Todo comienza con un Evento.
- Una Reserva no es un Ticket.
- El QR pertenece al Ticket.
- El Ticket tiene una identidad permanente.
- Cambiar el invitado no crea un Ticket nuevo.
- Cambiar el QR normalmente no crea un Ticket nuevo.
- Cambiar el diseño visual no crea un Ticket nuevo.
- El Ticket puede existir sin QR.
- El historial del Ticket es inmutable.
- Nunca eliminar información operativa.
- Un Ticket representa una admisión individual.
- Un Ticket puede tener múltiples representaciones.
- La Landing Page es la fuente oficial de verdad.
- Las representaciones deben reflejar el estado actual del Ticket.
- La transferencia de invitado debe conservar trazabilidad.
- La rotación del QR debe conservar la identidad del Ticket.
- Los Ticket Assets se generan desde plantillas reutilizables.
- Las plantillas deben aceptar datos del Ticket como entrada.
- La interfaz puede cambiar, pero la identidad del Ticket no.

Estas reglas protegen el sistema contra fragmentación conceptual y aseguran que la operación permanezca estable aunque cambien los canales de distribución o el diseño visual.

