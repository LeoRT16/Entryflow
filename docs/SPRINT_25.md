# Sprint 25 - Tables Operational Feature

## Objetivo

Convertir `Tables` en una feature operativa real sobre el mismo estado mock compartido de EntryFlow, sin backend, sin Supabase, sin autenticacion y sin nuevas librerias.

## Decisiones tomadas

- Se creo `features/tables/` con separacion por:
  - `components/`
  - `domain/`
  - `mock/`
  - `state/`
  - `types/`
  - `utils/`
- Se unifico el origen de las mesas entre `Reservations` y `Tables`.
- Se mantuvo la arquitectura por feature sin introducir dependencias circulares.
- Se priorizo un flujo estable de asignacion y movimiento por selector, no drag & drop fragil.
- Se mantuvo el estilo premium actual.

## Modelo de dominio

### Tipos centrales

- `Table`
- `TableStatus`
- `TableAssignment`
- `SeatAssignment`
- `TableCapacity`

### Estados soportados

- `Available`
- `Partially Occupied`
- `Full`
- `Over Capacity`
- `Reserved`
- `Closed`

## Ownership del estado

- `Check-in` sigue siendo la fuente de verdad del store compartido.
- `Tables` vive como una feature operativa que consume y modifica ese mismo store.
- `Reservations`, `Customers`, `Check-in` y `Dashboard` leen el mismo estado.
- No se duplican métricas derivadas.

## Estado derivado

Se calculan automaticamente:

- invitados asignados
- capacidad restante
- porcentaje de ocupacion
- cantidad ingresados
- cantidad pendientes
- sobrecapacidad

## Flujo operativo

### Asignacion de reserva

- Una reserva puede tener mesa o no tenerla.
- Una reserva puede reasignarse a otra mesa.
- La asignacion se refleja en:
  - `Reservations`
  - `Customers`
  - `Check-in`
  - `Tables`
  - `Dashboard`

### Movimiento de invitados

- Se puede mover un invitado entre mesas mediante selector.
- El cambio actualiza la misma sesion mock compartida.
- La mesa origen recalcula su ocupacion.
- La mesa destino recalcula su ocupacion.

### Liberacion y cierre

- Una mesa puede liberarse.
- Una mesa puede cerrarse.
- El estado de cierre se conserva en memoria y se refleja en los summaries.

## Integracion con otras features

- `Reservations` comparte el mismo set de mesas para crear reservas.
- `Customers` muestra la mesa asignada en el drawer y en la busqueda.
- `Check-in` mantiene la mesa visible en el contexto del ingreso.
- `Dashboard` agrega metricas derivadas de mesas.

## Metricas derivadas

- mesas activas
- mesas completas
- mesas con capacidad disponible
- mesas sobreocupadas
- porcentaje general de ocupacion

## Evidencia funcional

### Escenario inicial

- `Mesa 4`
  - capacidad: 4
  - invitados asignados: 5
  - estado: sobrecapacidad
- `VIP Lounge`
  - capacidad: 2
  - invitados asignados: 2
  - estado: completa
- `Terraza`
  - capacidad: 6
  - invitados asignados: 1
  - estado: parcial
- `Mesa 8`
  - capacidad: 8
  - estado: disponible
- `Bar 1`
  - estado: cerrada

### Movimiento concreto

1. Se abre `Mesa 4`.
2. Se mueve un invitado a `Mesa 8`.
3. `Mesa 4` reduce su ocupacion.
4. `Mesa 8` incrementa su ocupacion.
5. `Reservations` refleja la mesa del invitado.
6. `Customers` refleja la mesa del invitado.
7. `Dashboard` recalcula las metricas de mesas.

### Asignacion de reserva

1. Se selecciona una reserva sin mesa o reasignable.
2. Se asigna a una mesa desde el selector.
3. La reserva y sus invitados quedan vinculados a esa mesa.
4. El resumen de `Tables` y el de `Reservations` muestran el mismo dato.

## Limitaciones

- El estado sigue siendo en memoria.
- No hay persistencia real.
- No hay backend, Supabase ni autenticacion.
- No se implemento drag & drop; se priorizo estabilidad con selectores.
- Las mesas no sobreviven a un refresh completo.

## Validacion

- `npm run lint` paso correctamente.
- `npm run build -- --webpack` paso correctamente.
- Rutas verificadas en build:
  - `/`
  - `/customers`
  - `/reservations`
  - `/check-in`
  - `/events`
  - `/statistics`
  - `/settings`
  - `/tables`

## Estado del Sprint

- `Tables` quedo creada como feature operativa real.
- El estado compartido se mantiene consistente entre mesas, reservas, invitados, check-in y dashboard.
- Las metricas derivadas se recalculan sin duplicar estado.
- Queda pendiente migrar este mock a persistencia real cuando el producto lo requiera.
