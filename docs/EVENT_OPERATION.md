# Operación de un evento

## Objetivo

Este documento define cómo administradores, recepcionistas, operadores de puerta y supervisores utilizan EntryFlow durante el ciclo completo de un evento.

Se trata de un documento operativo, no de una descripción de pantallas ni de una explicación técnica de implementación.

EntryFlow es multiempresa, pero este documento usa a **La Rota Carlota** como ejemplo práctico principal para describir la operación real.

---

## Actores operativos

### Administrador

- Crea y configura eventos.
- Administra reservas y tickets.
- Controla permisos.
- Puede realizar cambios excepcionales.
- Revisa reportes e historial.

### Recepción

- Crea reservas.
- Registra la información del titular.
- Registra los nombres de todos los invitados.
- Edita nombres antes del check-in.
- Transfiere tickets.
- Cancela tickets cuando está autorizada.
- Busca reservas e invitados.

### Puerta

- Escanea códigos QR.
- Confirma el check-in.
- Busca invitados sin QR.
- Detecta tickets duplicados, cancelados o inválidos.
- No puede modificar libremente tickets ya utilizados.

### Supervisor

- Monitorea el estado vivo del evento.
- Resuelve situaciones excepcionales.
- Autoriza cambios sobre tickets ya utilizados.
- Revisa la actividad de los operadores.

---

## Flujo previo al evento

1. El evento se crea en estado **Draft**.
2. Se completa la configuración:
   - nombre
   - fecha
   - hora de apertura
   - hora de inicio
   - hora de cierre
   - capacidad
   - reservas habilitadas
   - QR habilitado
   - llegadas parciales permitidas
3. El evento se publica en estado **Published**.
4. Comienzan las reservas.
5. Cada reserva incluye una cantidad variable de Tickets individuales.
6. Cada Ticket se asigna a un invitado con nombre.
7. Se generan códigos QR por Ticket.
8. Los tickets se comparten con el titular de la reserva o con cada invitado, según la operación definida.
9. Recepción puede actualizar nombres antes del evento.
10. Todos los cambios relevantes se registran en el historial.

En esta fase, La Rota Carlota puede preparar el flujo completo antes de abrir puertas, manteniendo trazabilidad de cada cambio.

---

## Reserva y tickets

La Reserva agrupa varios Tickets.

El tamaño habitual de una reserva puede ser de cinco Tickets, pero esa cantidad es configurable según el negocio.

Reglas operativas:

- Cada Ticket pertenece a un invitado con nombre.
- Cada Ticket tiene su propio QR.
- La Reserva no es por sí misma una credencial de admisión.
- Los invitados pueden llegar por separado.
- Cada Ticket se valida de forma independiente.
- Un Ticket no usado no afecta a los demás.
- El titular de la reserva no necesariamente es la única persona que puede presentar los Tickets.

### Ejemplo de reserva con cinco tickets

Reserva: mesa de 5 personas

- Ticket 1: Sofía Rivas
- Ticket 2: Marco Salas
- Ticket 3: Daniela Paredes
- Ticket 4: Jorge Quintana
- Ticket 5: Camila Torres

Cada uno de esos Tickets puede ingresar en momentos distintos sin alterar la identidad ni el historial de los demás.

---

## Apertura de la operación

Antes de abrir puertas, el equipo realiza una validación operativa.

1. El evento cambia de **Published** a **Live**.
2. Los operadores confirman que el evento correcto está activo.
3. Se verifican los permisos del escáner.
4. Se prueba el acceso a cámara y la conectividad.
5. Se revisa la cantidad de reservas, invitados esperados y tickets pendientes.
6. Se configuran puertas o accesos.
7. Se confirma un mecanismo de búsqueda manual como respaldo.
8. Puede prepararse una lista o exportación como copia de emergencia.

En esta etapa, el objetivo no es abrir el evento todavía, sino asegurar que la puerta pueda operar sin fricción una vez que comience el ingreso.

---

## Flujo normal de ingreso

1. El invitado presenta su QR.
2. El operador de puerta lo escanea.
3. EntryFlow recupera los datos actuales del Ticket desde la base de datos.
4. El sistema muestra:
   - nombre del invitado
   - evento
   - titular de la reserva
   - estado del Ticket
   - información previa de check-in, si existe
5. El operador confirma la admisión.
6. Se crea un registro de Check-in.
7. El estado del Ticket cambia a **Checked In**.
8. Las métricas en vivo del evento se actualizan.

El nombre del invitado no se almacena directamente en el QR.

El QR solo identifica al Ticket.

Por lo tanto, si el nombre del invitado cambia, el mismo QR puede reflejar el nombre actualizado sin reemplazar la credencial.

---

## Cambio de nombre antes del ingreso

El proceso estándar para cambiar un nombre es el siguiente:

1. El operador busca la reserva o el Ticket.
2. Selecciona **Transferir ticket** o **Cambiar nombre**.
3. Ingresa el nuevo nombre del invitado.
4. Selecciona o escribe un motivo.
5. Confirma la operación.
6. El Ticket conserva la misma identidad y el mismo QR, salvo que se solicite rotación explícita.
7. El Ticket permanece en estado **Pending**.
8. El cambio completo se registra en el historial.

Registro requerido:

- nombre anterior
- nombre nuevo
- fecha y hora
- operador
- motivo
- dispositivo o fuente, cuando esté disponible

Motivos sugeridos:

- Error de escritura
- Cambio de invitado
- El invitado original no asistirá
- Solicitud del titular
- Otro

---

## Anulación de un ticket

- Un Ticket nunca se elimina.
- Cancelar un Ticket cambia su estado a **Cancelled**.
- Su QR se invalida.
- Al escanearlo debe mostrarse una advertencia clara de cancelación.
- La cancelación debe quedar registrada en el historial.
- La reactivación debe requerir permisos adecuados.
- Cancelar un Ticket no cancela toda la Reserva.

La anulación es una acción operativa sensible y debe preservar trazabilidad completa.

---

## Regeneración o rotación del QR

El QR normalmente es estable.

Se genera uno nuevo solo cuando:

- el original fue compartido de forma incorrecta
- existe sospecha de fraude
- el QR debe invalidarse
- un administrador solicita la rotación

Al rotar:

- el token anterior del QR queda inválido
- el Ticket permanece igual
- el invitado y la Reserva permanecen sin cambios
- la operación se registra en el historial

La rotación no crea una nueva admisión. Solo reemplaza el identificador de acceso.

---

## Invitado sin QR

Cuando una persona llega sin QR, el flujo de respaldo es:

1. Buscar por nombre del invitado.
2. Buscar por titular de la reserva.
3. Buscar por código de reserva o número de teléfono, si la política del negocio lo permite.
4. Confirmar la identidad según las reglas operativas del negocio.
5. Abrir el Ticket correcto.
6. Confirmar el check-in manualmente.

Toda admisión manual debe registrar el operador y el motivo.

---

## QR ya utilizado

Cuando un QR ya fue usado, el sistema debe responder con claridad.

- Mostrar una advertencia prominente.
- Mostrar el nombre del invitado.
- Mostrar la hora original del check-in.
- Mostrar la puerta y el operador.
- No crear un segundo Check-in automáticamente.
- Permitir la resolución solo a supervisores o administradores autorizados.

El objetivo es evitar duplicaciones, preservar el historial y mantener control sobre excepciones.

---

## Cambio solicitado después del ingreso

Regla operativa:

- Un Ticket en estado **Checked In** no puede transferirse, renombrarse ni cancelarse libremente.
- Cualquier modificación requiere permisos elevados.
- El sistema debe indicar claramente que el Ticket ya fue utilizado.
- Las modificaciones excepcionales nunca deben borrar el Check-in original.
- Toda intervención debe agregarse al historial.

Una vez que el ingreso ya ocurrió, la prioridad pasa a ser la auditoría y no la reescritura del pasado.

---

## Llegadas separadas

Como cada persona tiene un Ticket individual:

- los integrantes de una misma Reserva pueden llegar en distintos momentos
- cada Ticket se procesa de forma independiente
- la Reserva debe mostrar:
  - total de Tickets
  - Tickets ingresados
  - Tickets pendientes
  - Tickets cancelados

### Ejemplo

Reserva de cinco personas:

- 3 invitados ya ingresaron
- 2 invitados siguen pendientes

La Reserva continúa activa mientras exista al menos un Ticket pendiente y el evento siga en curso.

---

## Problemas de conexión

Política operativa inicial:

- La primera versión depende de conectividad para validar en tiempo real.
- La búsqueda manual y una lista exportada funcionan como respaldo de emergencia.
- No se debe afirmar soporte offline completo todavía.
- La sincronización offline futura puede evaluarse por separado.
- Toda admisión registrada manualmente debe reconciliarse luego con el sistema.

La prioridad es preservar la continuidad operativa sin prometer capacidades que todavía no forman parte del alcance actual.

---

## Cierre del evento

1. La operación de puerta termina.
2. El evento deja de aceptar nuevos check-ins.
3. El evento cambia a **Finished**.
4. Se calculan los totales finales:
   - reservas
   - Tickets emitidos
   - Tickets ingresados
   - Tickets pendientes
   - Tickets cancelados
   - Tickets transferidos
   - intentos de escaneo duplicado
   - admisiones manuales
5. El historial operativo permanece disponible.
6. Pueden generarse reportes.
7. No se elimina información operativa.

El cierre consolida el resultado del evento sin perder trazabilidad.

---

## Estados operativos

### Evento

- Draft
- Published
- Live
- Finished
- Cancelled

### Reserva

- Pending
- Confirmed
- Partially Checked In
- Fully Checked In
- Cancelled

### Ticket

- Pending
- Checked In
- Cancelled
- Blocked

“Transferred” es una acción registrada en el historial, no necesariamente un estado permanente del Ticket.

---

## Principios de auditoría

- Nunca eliminar registros operativos.
- Nunca sobrescribir historial importante.
- Toda acción sensible registra al operador.
- Todo cambio de estado registra fecha y hora.
- Los check-ins son eventos operativos de solo anexado.
- Un Ticket puede cambiar de invitado, pero conserva su identidad.
- El QR identifica al Ticket, no al nombre del invitado.
- El estado actual y el estado histórico deben estar disponibles.

Estos principios aseguran que EntryFlow conserve memoria operativa y pueda explicar qué pasó en cualquier momento del evento.

---

## Consideraciones futuras

Sin diseñarlas todavía, la operación podría extenderse hacia:

- mesas y sectores
- validación de pago
- consumo
- check-out
- múltiples puertas
- sincronización offline
- alertas de capacidad
- listas de espera
- automatización por WhatsApp
- plantillas de evento
- terminología personalizada por negocio

Estas extensiones no cambian el núcleo operativo del producto: primero se resuelve la operación del evento; luego se amplía alrededor de ella.

