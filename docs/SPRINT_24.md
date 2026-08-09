# Sprint 24 - Reservations Operational Flow

## Objetivo

Acercar EntryFlow a una beta funcional haciendo que `Reservations` opere como un flujo completo sobre estado mock compartido, sin backend, sin Supabase, sin autenticación, sin nuevas librerias y sin cambiar UX, diseno, rutas ni navegacion.

## Decisiones tomadas

- Se centralizo el ciclo de vida de la reserva en un modelo canonico `ReservationStatus`.
- Se mantuvo el enfoque de feature architecture sin mover codigo innecesariamente.
- Se conecto `Reservations` con el mismo estado compartido que ya consumen `Check-in`, `Customers` y `Dashboard`.
- Se priorizo el estado derivado sobre la duplicacion de datos.
- Se agrego un board operativo visual para trabajar reservas, invitados, timeline y check-ins sobre una unica fuente de verdad.

## Modelos

### `ReservationStatus`

Estados soportados:

- `Draft`
- `Pending`
- `Confirmed`
- `Checked In`
- `Completed`
- `Cancelled`
- `No Show`

### Tipos de dominio creados o consolidados

- `ReservationCreationInput`
- `ReservationRecord`
- `ReservationSummary`
- `ReservationMetrics`
- `ReservationTimelineEntry`
- `ReservationGuestSummary`
- `ReservationGuestAction`
- `ReservationGuestInput`
- `ReservationTone`

## Flujo operativo

### Creacion de reserva

- El wizard de `Reservations` ahora crea una reserva real dentro del estado mock compartido.
- La reserva nueva genera:
  - registro base de reserva
  - lista inicial de invitados
  - timeline inicial
  - estado canonico de reserva

### Operacion de invitados

Desde el detalle de la reserva se puede:

- agregar invitado
- eliminar invitado
- confirmar invitado
- cancelar invitado
- registrar ingreso
- revertir ingreso

### Registro de ingreso

- El check-in normal y el check-in manual usan el mismo estado compartido.
- Si el invitado ya ingreso, el sistema bloquea el segundo intento con el mensaje:
  - `Esta invitación ya fue utilizada.`
- Si el codigo no existe, el sistema devuelve error de codigo invalido.
- Si el invitado o la reserva estan anulados o bloqueados, el ingreso no se permite.
- Si el ingreso es manual, el estado se actualiza igual que en el flujo normal.

## Sincronizacion

La misma fuente de verdad alimenta:

- `Reservations`
- `Customers`
- `Check-in`
- `Dashboard`

Los cambios se propagan de forma derivada, sin duplicar estado para:

- invitados confirmados
- invitados pendientes
- invitados ingresados
- invitados anulados
- porcentaje de ingreso
- ocupacion
- capacidad restante
- invitaciones visibles
- timeline operativo

## Estado derivado

Los siguientes datos no se almacenan dos veces:

- invitados confirmados
- invitados pendientes
- invitados ingresados
- invitados anulados
- porcentaje de ingreso
- ocupacion
- capacidad restante
- ultimo ingreso

Estos valores se recalculan desde el estado mock compartido.

## Evidencia del flujo

Caso de extremo a extremo:

1. Se crea una reserva desde `Reservations`.
2. La reserva entra al estado compartido como `Draft` o `Pending`, segun su configuracion de pago.
3. Se agrega o confirma un invitado dentro de la misma reserva.
4. Se registra el ingreso del invitado.
5. `Check-in` refleja el cambio inmediatamente porque consume el mismo store.
6. `Customers` refleja el cambio inmediatamente porque los guests se actualizan en el mismo estado.
7. `Reservations` recalcula su resumen, timeline y métricas derivadas.
8. `Dashboard` actualiza sus indicadores desde el mismo snapshot compartido.
9. Un segundo intento de ingreso devuelve bloqueo y mensaje de uso previo.
10. Si se revierte el ingreso, los estados vuelven a recalcularse sin persistencia externa.

### Ejemplo concreto

- Estado inicial: invitado pendiente, invitacion valida, sin ingreso.
- Accion: registro de ingreso manual.
- Resultado:
  - `Check-in` pasa a `Ingresó`
  - `Reservations` muestra el invitado como ingresado
  - `Customers` refleja el nuevo estado
  - `Dashboard` ajusta sus metricas
- Segundo intento:
  - resultado bloqueado
  - mensaje: `Esta invitación ya fue utilizada.`

## Limitaciones

- El estado sigue siendo totalmente en memoria.
- No existe persistencia real.
- No hay backend, Supabase ni autenticacion.
- Los ids y timestamps son mock.
- La sincronizacion funciona dentro de la sesion actual, no entre sesiones distintas.

## Validacion

- `npm run lint` paso correctamente.
- `npm run build -- --webpack` paso correctamente.
- Rutas verificadas en build:
  - `/`
  - `/customers`
  - `/reservations`
  - `/check-in`
  - `/events`
  - `/settings`
  - `/statistics`
  - `/reservations/mock-reservation`

## Estado del Sprint

- `Reservations` ya opera como un flujo funcional sobre estado compartido.
- El modelo de reserva quedo centralizado.
- La sincronizacion entre `Reservations`, `Customers`, `Check-in` y `Dashboard` quedo establecida.
- Queda pendiente solo evolucionar esto hacia persistencia real cuando el producto lo requiera.
