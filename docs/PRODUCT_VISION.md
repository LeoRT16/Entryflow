# EntryFlow

## Visión

EntryFlow es una plataforma multiempresa para administrar la operación completa de eventos presenciales.

No es un sistema de reservas.

Las reservas son solamente una parte del flujo operativo.

El objetivo es reducir tiempos, errores y fricción durante la organización y operación de eventos.

---

## Problema

La operación de eventos presenciales suele fragmentarse entre herramientas aisladas, hojas de cálculo, mensajes manuales y procesos improvisados. Esto genera retrasos, duplicidad de información y una experiencia inconsistente tanto para el equipo como para los invitados.

EntryFlow resuelve ese problema unificando la operación en un solo flujo:

- **Reservas:** centraliza el ingreso y seguimiento de reservas sin convertir el producto en un sistema genérico de bookings.
- **Check-in:** acelera la validación de llegada y reduce filas, errores manuales y verificación duplicada.
- **Listas:** organiza listas operativas por evento, turno, acceso o rol.
- **Invitados:** permite identificar, revisar y seguir el estado de cada invitado dentro del evento.
- **Operación de puerta:** entrega a recepción y acceso una vista clara de lo que está ocurriendo en tiempo real.
- **Estadísticas:** muestra el comportamiento operativo para evaluar desempeño, flujo y ocupación.
- **Seguimiento del evento:** facilita el control del evento desde antes de abrir puertas hasta el cierre operativo.

El resultado es menos fricción operativa, mejor coordinación entre roles y una ejecución más confiable.

---

## Filosofía del producto

1. Todo comienza con un evento.
2. El software representa la operación real.
3. La interfaz reduce decisiones.
4. Cada rol ve únicamente lo necesario.
5. Todo debe ser configurable.
6. La velocidad es más importante que la cantidad de funciones.

Estos principios definen cómo se diseña EntryFlow, cómo se priorizan las funcionalidades y cómo se construye cada pantalla.

---

## Ciclo de vida del evento

BORRADOR

↓

PUBLICADO

↓

EN CURSO

↓

FINALIZADO

Possible from any state:

CANCELADO

### BORRADOR

Estado inicial del evento. Aquí se configuran nombre, fecha, capacidad, reglas operativas, asignaciones y cualquier detalle previo a la publicación. El evento todavía no está visible para la operación activa.

### PUBLICADO

El evento ya quedó listo para operar y puede recibir reservas, listas o confirmaciones. En esta etapa el equipo puede preparar la logística antes de la apertura.

### EN CURSO

El evento está activo. La operación de puerta, el check-in, la atención de invitados y el seguimiento en tiempo real pasan a ser prioritarios.

### FINALIZADO

El evento ya concluyó. No se espera más actividad operativa, pero la información queda disponible para análisis, seguimiento y reportes.

### CANCELADO

Estado disponible desde cualquier fase. Indica que el evento no continuará o fue detenido antes de completarse. Debe conservar trazabilidad para auditoría y consulta posterior.

---

## Roles

### Administrador

Configura la empresa, define reglas de operación, administra permisos y supervisa la actividad general de la plataforma.

### Recepción

Gestiona reservas, valida invitados y coordina el ingreso inicial al evento.

### Puerta

Controla accesos, verifica listas y ejecuta el flujo de check-in de forma rápida y precisa.

### Supervisor

Monitorea la operación completa, resuelve incidencias y mantiene visibilidad sobre el estado del evento.

### Future:

- Caja
- Consumo
- Seguridad

---

## Flujo operativo

Empresa

↓

Evento

↓

Reservas

↓

QR

↓

Check-in

↓

Invitados dentro

↓

Reportes

Este flujo describe la lógica principal del producto: una empresa administra uno o varios eventos, cada evento recibe reservas y validaciones, el acceso se controla por QR o verificación operativa, y la información resultante alimenta los reportes.

---

## Roadmap

### Phase 1

Core Event Operations

### Phase 2

Reservations

### Phase 3

QR

### Phase 4

Live Dashboard

### Phase 5

Reports

### Phase 6

Integrations

El roadmap prioriza primero la operación esencial del evento y después amplía capacidades alrededor del control de reservas, acceso, visibilidad en vivo, análisis e integración con otros sistemas.

---

## Decisiones de arquitectura

- Código en inglés.
- Interfaz en español.
- Arquitectura multiempresa.
- Next.js.
- Supabase.
- Componentes reutilizables.
- Diseño Mobile First.
- Diseño Dark First.

Estas decisiones mantienen una base técnica clara y consistente: el código permanece mantenible, la experiencia se adapta a múltiples negocios y la interfaz responde al contexto operativo real.

---

## Lo que EntryFlow NO será

EntryFlow no está pensado para convertirse en un CRM genérico ni en un ERP de propósito amplio.

El producto no busca cubrir todas las áreas administrativas de una empresa ni reemplazar sistemas contables, financieros o comerciales de uso general.

Su foco es específico: la operación de eventos presenciales.

Todo lo que no mejore esa operación directa debe evaluarse con cautela o descartarse. La prioridad es mantenerse simple, rápido y útil en escenarios de alta presión operativa.

