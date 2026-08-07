# Objetivo

EntryFlow es un sistema guiado por estados.

Cada entidad importante tiene un ciclo de vida definido.

Las acciones mueven a las entidades entre estados.

Las transiciones inválidas deben rechazarse.

El historial debe preservarse siempre.

Este documento es una especificación de negocio. No describe implementación técnica.

---

# Principios

- Cada entidad tiene un ciclo de vida definido.
- Los estados son finitos.
- Los cambios de estado son explícitos.
- Las transiciones inválidas se rechazan.
- Cada transición genera historial de auditoría.
- Los cambios de estado nunca eliminan información.
- El estado determina las operaciones disponibles.
- Roles y permisos se evalúan junto con el estado.

---

# EVENT

## BORRADOR

**Propósito:** etapa inicial de configuración.

**Operaciones permitidas:**

- crear
- editar configuración
- definir capacidad
- definir puertas
- definir políticas

**Operaciones prohibidas:**

- admisiones
- check-in
- cierre operativo
- archivado final

**Transiciones posibles:**

- BORRADOR → PUBLICADO
- BORRADOR → CANCELADO

## PUBLICADO

**Propósito:** evento listo para operar, pero aún no activo para ingreso.

**Operaciones permitidas:**

- recibir reservas
- generar tickets
- preparar comunicaciones
- validar configuración previa

**Operaciones prohibidas:**

- check-in
- cierre final
- archivado

**Transiciones posibles:**

- PUBLICADO → CHECK-IN HABILITADO
- PUBLICADO → CANCELADO

## CHECK-IN HABILITADO

**Propósito:** fase de preparación operativa previa a la apertura real.

**Operaciones permitidas:**

- verificación de cámara
- verificación de conectividad
- pruebas de escaneo
- validación de accesos
- revisión de pendientes

**Operaciones prohibidas:**

- cierre final
- archivado
- borrar registros

**Transiciones posibles:**

- CHECK-IN HABILITADO → EN CURSO
- CHECK-IN HABILITADO → CANCELADO

## EN CURSO

**Propósito:** el evento está activo y en operación viva.

**Operaciones permitidas:**

- check-in
- admisión manual
- seguimiento en vivo
- resolución de incidencias
- monitoreo de métricas

**Operaciones prohibidas:**

- creación libre de nuevas reglas estructurales
- archivado directo sin cierre

**Transiciones posibles:**

- EN CURSO → FINALIZADO
- EN CURSO → CANCELADO

## FINALIZADO

**Propósito:** operación cerrada y sin nuevos ingresos.

**Operaciones permitidas:**

- consultar historial
- generar reportes
- revisar métricas finales

**Operaciones prohibidas:**

- nuevos check-ins
- nuevas reservas operativas para ese evento

**Transiciones posibles:**

- FINALIZADO → ARCHIVADO

## ARCHIVADO

**Propósito:** estado de conservación y consulta histórica.

**Operaciones permitidas:**

- consultar historial
- consultar reportes
- exportar información autorizada

**Operaciones prohibidas:**

- nuevas operaciones vivas
- nuevas admisiones

**Transiciones posibles:**

- ninguna transición ordinaria

## CANCELADO

**Propósito:** el evento no continuará.

**Operaciones permitidas:**

- consulta histórica
- revisión administrativa

**Operaciones prohibidas:**

- reservas nuevas
- tickets nuevos
- check-in

**Transiciones posibles:**

- ninguna transición ordinaria
- reabrir como transición excepcional solo si una política futura lo permite

### Diagrama de transición

```text
BORRADOR
  ↓
PUBLICADO
  ↓
CHECK-IN HABILITADO
  ↓
EN CURSO
  ↓
FINALIZADO
  ↓
ARCHIVADO

Desde cualquier estado:
  → CANCELADO
```

---

# RESERVATION

## CREADA

**Significado:** la reserva existe, pero todavía no se ha consolidado operativamente.

**Operaciones permitidas:**

- editar
- agregar información del titular
- agregar invitados
- revisar estado comercial

**Operaciones prohibidas:**

- considerar la reserva cerrada
- asumir entrega completa

**Transiciones:**

- CREADA → PENDIENTE DE PAGO
- CREADA → CANCELADA

## PENDIENTE DE PAGO

**Significado:** la reserva espera validación económica.

**Operaciones permitidas:**

- registrar pagos
- corregir datos
- agregar observaciones

**Operaciones prohibidas:**

- marcar como finalizada

**Transiciones:**

- PENDIENTE DE PAGO → PAGO PARCIAL
- PENDIENTE DE PAGO → PAGADA
- PENDIENTE DE PAGO → CANCELADA

## PAGO PARCIAL

**Significado:** existe un abono, pero la reserva aún no está cubierta por completo.

**Operaciones permitidas:**

- completar pago
- revisar saldo
- ajustar observaciones

**Operaciones prohibidas:**

- tratarla como completamente cerrada

**Transiciones:**

- PAGO PARCIAL → PAGADA
- PAGO PARCIAL → CANCELADA

## PAGADA

**Significado:** la reserva quedó validada comercialmente.

**Operaciones permitidas:**

- generar tickets
- enviar tickets
- preparar ingreso

**Operaciones prohibidas:**

- anular sin trazabilidad

**Transiciones:**

- PAGADA → TICKETS GENERADOS
- PAGADA → CANCELADA

## TICKETS GENERADOS

**Significado:** los tickets individuales ya fueron creados.

**Operaciones permitidas:**

- asignar invitados
- revisar entregas
- reenviar entradas

**Operaciones prohibidas:**

- asumir entrega completa

**Transiciones:**

- TICKETS GENERADOS → TICKETS ENVIADOS
- TICKETS GENERADOS → EN PROCESO
- TICKETS GENERADOS → CANCELADA

## TICKETS ENVIADOS

**Significado:** los tickets ya fueron distribuidos al titular o a los invitados.

**Operaciones permitidas:**

- seguimiento de entrega
- transferencias autorizadas
- reenvíos

**Operaciones prohibidas:**

- eliminar historial de envío

**Transiciones:**

- TICKETS ENVIADOS → EN PROCESO
- TICKETS ENVIADOS → CANCELADA

## EN PROCESO

**Significado:** la reserva está siendo utilizada operativamente durante el evento.

**Operaciones permitidas:**

- check-in parcial
- revisión de tickets pendientes
- monitoreo operativo

**Operaciones prohibidas:**

- tratarla como cerrada hasta completarse

**Transiciones:**

- EN PROCESO → FINALIZADA
- EN PROCESO → CANCELADA

## FINALIZADA

**Significado:** todos los tickets aplicables fueron procesados o la operación de la reserva concluyó.

**Operaciones permitidas:**

- consulta histórica
- reportes

**Operaciones prohibidas:**

- cambios no excepcionales

**Transiciones:**

- ninguna ordinaria

## CANCELADA

**Significado:** la reserva dejó de estar activa.

**Operaciones permitidas:**

- consulta histórica

**Operaciones prohibidas:**

- reuso silencioso

**Transiciones:**

- ninguna ordinaria
- reactivación solo como transición excepcional

### Transiciones excepcionales

- CREADA → PAGADA por corrección administrativa
- PAGADA → PAGO PARCIAL si hubo reversión o ajuste
- FINALIZADA → EN PROCESO solo en casos excepcionales con auditoría
- CANCELADA → PENDIENTE DE PAGO o CREADA solo mediante acción autorizada

---

# PAYMENT

## PENDIENTE

**Significado:** el pago todavía no fue confirmado.

**Transiciones:**

- PENDIENTE → PARCIAL
- PENDIENTE → PAGADO
- PENDIENTE → RECHAZADO

## PARCIAL

**Significado:** existe un pago parcial registrado.

**Transiciones:**

- PARCIAL → PAGADO
- PARCIAL → RECHAZADO
- PARCIAL → REEMBOLSADO

## PAGADO

**Significado:** el pago quedó validado.

**Transiciones:**

- PAGADO → REEMBOLSADO

## RECHAZADO

**Significado:** el pago no fue aceptado.

**Transiciones:**

- RECHAZADO → PENDIENTE
- RECHAZADO → PARCIAL

## REEMBOLSADO

**Significado:** el pago fue devuelto total o parcialmente según la política del negocio.

**Transiciones:**

- ninguna ordinaria

---

# TICKET

## CREADO

**Significado:** el Ticket existe pero aún no está completamente preparado para distribución.

**Operaciones permitidas:**

- asignar invitado
- generar QR
- generar assets visuales

**Operaciones prohibidas:**

- considerarlo admitible

**Estados siguientes válidos:**

- ASIGNADO
- PENDIENTE DE ENVÍO
- CANCELADO

## ASIGNADO

**Significado:** el Ticket ya tiene invitado asociado.

**Operaciones permitidas:**

- preparar entrega
- revisar datos del invitado
- generar o regenerar representación

**Operaciones prohibidas:**

- asumir que ya fue enviado

**Estados siguientes válidos:**

- PENDIENTE DE ENVÍO
- ENVIADO
- CANCELADO

**Estados previos válidos cuando aplique:**

- CREADO

## PENDIENTE DE ENVÍO

**Significado:** el Ticket está listo para distribución, pero aún no fue entregado.

**Operaciones permitidas:**

- enviar
- reenviar
- transferir antes del envío

**Operaciones prohibidas:**

- tratarlo como ya compartido

**Estados siguientes válidos:**

- ENVIADO
- CANCELADO

**Estados previos válidos cuando aplique:**

- ASIGNADO

## ENVIADO

**Significado:** el Ticket fue compartido con el canal correspondiente.

**Operaciones permitidas:**

- seguimiento de entrega
- regeneración de assets
- transferencia autorizada

**Operaciones prohibidas:**

- borrar el registro de envío

**Estados siguientes válidos:**

- ACTIVO
- TRANSFERIDO
- QR ROTADO
- CANCELADO

**Estados previos válidos cuando aplique:**

- PENDIENTE DE ENVÍO

## ACTIVO

**Significado:** el Ticket está vigente y disponible para uso operativo.

**Operaciones permitidas:**

- check-in
- búsqueda
- validación

**Operaciones prohibidas:**

- tratarlo como usado o cancelado

**Estados siguientes válidos:**

- CHECK-IN REALIZADO
- TRANSFERIDO
- QR ROTADO
- BLOQUEADO
- CANCELADO

**Estados previos válidos cuando aplique:**

- ENVIADO
- ASIGNADO

## TRANSFERIDO

**Significado:** el Ticket cambió de invitado sin perder identidad.

**Operaciones permitidas:**

- regenerar assets
- reenviar entrada
- mantener el QR o rotarlo si corresponde

**Operaciones prohibidas:**

- crear un Ticket nuevo como sustituto silencioso

**Estados siguientes válidos:**

- ACTIVO
- ENVIADO
- PENDIENTE DE ENVÍO

**Estados previos válidos cuando aplique:**

- ACTIVO
- ENVIADO
- PENDIENTE DE ENVÍO

**Casos excepcionales:**

- transferencia sobre Ticket ya usado solo con aprobación elevada

## QR ROTADO

**Significado:** el QR anterior quedó inválido y se generó uno nuevo para el mismo Ticket.

**Operaciones permitidas:**

- regenerar assets
- notificar al invitado

**Operaciones prohibidas:**

- alterar la identidad del Ticket

**Estados siguientes válidos:**

- ACTIVO
- ENVIADO
- PENDIENTE DE ENVÍO

**Estados previos válidos cuando aplique:**

- ACTIVO
- ENVIADO

**Casos excepcionales:**

- rotación durante el evento con trazabilidad completa

## BLOQUEADO

**Significado:** el Ticket quedó temporalmente restringido.

**Operaciones permitidas:**

- revisión
- desbloqueo autorizado

**Operaciones prohibidas:**

- admisión normal

**Estados siguientes válidos:**

- ACTIVO
- CANCELADO

**Estados previos válidos cuando aplique:**

- ACTIVO
- ENVIADO

## CHECK-IN REALIZADO

**Significado:** el Ticket ya fue admitido.

**Operaciones permitidas:**

- consulta histórica
- revisión excepcional

**Operaciones prohibidas:**

- nuevo check-in automático
- transferencia libre
- cancelación silenciosa

**Estados siguientes válidos:**

- CANCELADO
- EXPIRADO

**Estados previos válidos cuando aplique:**

- ACTIVO
- ENVIADO
- QR ROTADO

**Casos excepcionales:**

- modificación solo por Supervisor o Administrador

## CANCELADO

**Significado:** el Ticket fue anulado.

**Operaciones permitidas:**

- consulta histórica
- revisión administrativa

**Operaciones prohibidas:**

- admisión normal

**Estados siguientes válidos:**

- ninguno ordinario

**Estados previos válidos cuando aplique:**

- cualquier estado previo con trazabilidad

## EXPIRADO

**Significado:** el Ticket ya no es válido por cierre, vencimiento o condición operativa equivalente.

**Operaciones permitidas:**

- consulta histórica

**Operaciones prohibidas:**

- admisión

**Estados siguientes válidos:**

- ninguno ordinario

**Estados previos válidos cuando aplique:**

- CHECK-IN REALIZADO
- ACTIVO

### Casos excepcionales

- Transferido no crea un Ticket nuevo.
- QR Rotado no crea un Ticket nuevo.
- La identidad del Ticket nunca cambia.

---

# QR

El QR tiene su propio ciclo de vida.

## Generated

El QR fue creado para un Ticket.

## Active

El QR es válido y puede escanearse.

## Rotated

El QR anterior quedó reemplazado por uno nuevo.

## Invalidated

El QR ya no puede usarse.

## Archived

El QR queda conservado para consulta histórica.

### Relación con Ticket

- Un Ticket puede existir sin QR.
- El QR identifica al Ticket.
- El QR no es la identidad del Ticket.
- La rotación del QR no altera la identidad del Ticket.

---

# TICKET ASSET

## Generated

Se generó una representación visual del Ticket.

## Delivered

El asset fue entregado por un canal operativo.

## Regenerated

El asset fue creado nuevamente porque cambió un dato relevante.

## Archived

El asset queda conservado para consulta histórica.

La regeneración no altera la identidad del Ticket.

---

# WHATSAPP DELIVERY

## Pending

El envío todavía no se ejecutó.

## Queued

El envío quedó en cola.

## Sent

El mensaje salió del sistema.

## Delivered (future)

La entrega fue confirmada por la integración, cuando exista.

## Failed

El envío falló.

## Cancelled

El envío fue cancelado antes de completarse.

La confirmación real de entrega depende de integraciones futuras.

---

# CHECK-IN

## Not Started

El Ticket todavía no fue evaluado para ingreso.

## Validated

El QR o la referencia fue validada.

## Manual Validation

La validación se realizó sin QR.

## Admitted

El ingreso fue confirmado.

## Rejected

La admisión fue negada.

## Duplicate Scan

Se detectó un segundo intento sobre un Ticket ya usado.

## Resolved

La excepción fue resuelta por un rol autorizado.

### Transiciones

- Not Started → Validated
- Not Started → Manual Validation
- Validated → Admitted
- Manual Validation → Admitted
- Validated → Rejected
- Manual Validation → Rejected
- Admitted → Duplicate Scan
- Duplicate Scan → Resolved

---

# GUEST TRANSFER

Flujo operativo:

Original Guest

↓

Transfer Requested

↓

Approved

↓

Ticket Updated

↓

Visual Assets Regenerated

↓

WhatsApp Resent

↓

History Recorded

El Ticket permanece siendo el mismo.

---

# QR ROTATION

Flujo operativo:

Current QR

↓

Rotation Requested

↓

Old QR Invalidated

↓

New QR Generated

↓

Assets Regenerated

↓

Guest Notified

↓

History Recorded

---

# EVENT DAY

Ejemplo de interacción entre estados:

Reservation Paid

↓

Tickets Generated

↓

Tickets Sent

↓

Guest Arrives

↓

QR Scan

↓

Validated

↓

Check-in

↓

Reservation Updated

↓

Event Finished

---

# Invalid transitions

Ejemplos de transiciones inválidas:

- Cancelled Ticket → Check-in
- Archived Event → New Reservation
- Rejected Payment → Ticket Delivery
- Finished Event → New Ticket
- Blocked Ticket → Admission

### Por qué son inválidas

- Un Ticket cancelado no puede admitir ingreso porque su autorización fue retirada.
- Un Evento archivado ya no está en operación viva.
- Un pago rechazado no debe disparar la entrega de tickets como si estuviera validado.
- Un Evento finalizado no debe producir tickets nuevos de forma ordinaria.
- Un Ticket bloqueado no puede recibir admisión normal.

Las transiciones inválidas deben ser rechazadas y registradas cuando corresponda.

---

# Exceptional transitions

Existen transiciones excepcionales que pueden ser permitidas por roles con autorización elevada.

Ejemplos:

- Supervisor reactivates Ticket.
- Administrator reopens Event.
- Manual admission without QR.
- Guest transfer after Ticket delivery.
- QR rotation during Event.
- Already checked-in Ticket review.

Estas transiciones no invalidan el modelo. Solo deben quedar claramente marcadas como excepcionales y completamente auditadas.

---

# State matrix

## EVENT

| States | Allowed Operations | Forbidden Operations | Actor |
|---|---|---|---|
| BORRADOR | configurar, editar | check-in, cierre | Administrador |
| PUBLICADO | recibir reservas, preparar operación | ingreso activo | Administrador, Recepción |
| CHECK-IN HABILITADO | pruebas, validaciones | cierre, archivado | Administrador, Supervisor |
| EN CURSO | check-in, monitoreo, incidencias | cambios estructurales libres | Puerta, Supervisor, Administrador |
| FINALIZADO | consultar, reportar | nuevos ingresos | Administrador, Supervisor |
| ARCHIVADO | consultar histórico | operaciones vivas | Administrador |
| CANCELADO | consulta histórica | operación viva | Administrador |

## RESERVATION

| States | Allowed Operations | Forbidden Operations | Actor |
|---|---|---|---|
| CREADA | editar, completar datos | cierre operativo | Recepción, Administrador |
| PENDIENTE DE PAGO | registrar pago | tratar como cerrada | Caja, Recepción |
| PAGO PARCIAL | completar pago | cerrar sin validación | Caja, Administrador |
| PAGADA | generar tickets | borrar historial | Administrador, Recepción |
| TICKETS GENERADOS | asignar, enviar | asumir entrega completa | Recepción, Administrador |
| TICKETS ENVIADOS | seguimiento, reenviar | borrar envíos | Recepción, Administrador |
| EN PROCESO | seguimiento operativo | reescritura silenciosa | Puerta, Supervisor |
| FINALIZADA | consultar | cambios ordinarios | Administrador, Supervisor |
| CANCELADA | consultar | reuso silencioso | Administrador, Recepción |

## TICKET

| States | Allowed Operations | Forbidden Operations | Actor |
|---|---|---|---|
| CREADO | asignar invitado, generar QR | admisión | Administrador, Recepción |
| ASIGNADO | preparar entrega | usar como admitido | Administrador, Recepción |
| PENDIENTE DE ENVÍO | enviar, transferir antes del envío | asumir distribución | Recepción, Administrador |
| ENVIADO | reenviar, rastrear | borrar entrega | Recepción, Administrador |
| ACTIVO | validar, escanear | cancelación silenciosa | Puerta, Supervisor |
| TRANSFERIDO | regenerar, reenviar | crear nuevo Ticket | Recepción, Administrador |
| QR ROTADO | validar con nuevo QR | preservar QR anterior como válido | Administrador, Supervisor |
| BLOQUEADO | revisar, desbloquear | admisión normal | Supervisor, Administrador |
| CHECK-IN REALIZADO | consultar, revisar excepción | nuevo ingreso automático | Puerta, Supervisor, Administrador |
| CANCELADO | consultar histórico | admisión | Administrador, Supervisor |
| EXPIRADO | consultar histórico | admisión | Administrador, Supervisor |

## QR

| States | Allowed Operations | Forbidden Operations | Actor |
|---|---|---|---|
| Generated | validar, distribuir | alterar identidad | Sistema, Administrador |
| Active | escanear | reusar tras invalidez | Puerta, Supervisor |
| Rotated | invalidar anterior, generar nuevo | mantener dos vigentes | Administrador |
| Invalidated | consulta, auditoría | admisión | Administrador, Supervisor |
| Archived | consulta histórica | uso operativo | Administrador |

## CHECK-IN

| States | Allowed Operations | Forbidden Operations | Actor |
|---|---|---|---|
| Not Started | buscar, preparar | admitir | Puerta |
| Validated | confirmar ingreso | duplicar admisión | Puerta |
| Manual Validation | confirmar ingreso manual | omitir motivo | Puerta, Supervisor |
| Admitted | consultar, auditar | repetir admisión | Sistema, Supervisor |
| Rejected | consultar, resolver | admitir sin revisión | Puerta, Supervisor |
| Duplicate Scan | revisar, resolver | aceptar en silencio | Supervisor, Administrador |
| Resolved | consultar historial | borrar incidente | Supervisor, Administrador |

---

# Product rules

- El estado guía el comportamiento.
- Los permisos por sí solos no son suficientes.
- El historial es inmutable.
- Las transiciones son explícitas.
- Las transiciones inválidas se rechazan.
- La identidad del Ticket nunca cambia.
- El QR no es el Ticket.
- Los assets visuales son representaciones.
- Cada transición crea historial.

---

# Consistencia y observaciones

Este documento introduce un nivel de detalle de estados más fino que los documentos anteriores.

Contradicciones o diferencias conceptuales detectadas:

- El documento de visión y el modelo de dominio usan un ciclo de vida más corto para el Evento, mientras que aquí se añade **CHECK-IN HABILITADO** y **ARCHIVADO** como estados operativos adicionales.
- El modelo de dominio describe el Ticket de forma más general, mientras que aquí se amplía con un ciclo de vida más granular.
- El documento de operación ya sugiere cierre y conservación histórica, y este documento formaliza **ARCHIVADO** como estado explícito.

Estas diferencias no modifican documentos previos. Se registran aquí como ampliaciones de la especificación operativa.

