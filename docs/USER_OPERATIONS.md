# Operaciones de usuario

## Objetivo

EntryFlow separa con claridad cuatro conceptos distintos:

- usuarios
- roles
- permisos
- acciones operativas

Un **Usuario** es una persona real con acceso a la plataforma.

Un **Rol** agrupa permisos.

La misma persona puede tener roles distintos en empresas distintas, o incluso en eventos distintos, en el futuro.

Este documento define qué puede hacer un usuario dentro de EntryFlow, independientemente de pantallas, componentes o implementación técnica.

---

## Principios

1. Toda acción sensible debe identificar al operador.
2. Cada usuario solo ve y ejecuta lo que su rol requiere.
3. Los permisos deben seguir el principio de mínimo privilegio.
4. El historial operativo nunca debe eliminarse.
5. Las acciones excepcionales requieren permisos elevados.
6. Los permisos podrán configurarse por empresa en el futuro.
7. Un operador nunca debe compartir una cuenta genérica con otras personas.
8. Los datos personales sensibles solo deben mostrarse cuando exista necesidad operativa real.

Estos principios protegen la trazabilidad, reducen errores y mantienen el producto alineado con la operación real.

---

# Roles

## Administrador

Responsable de la gestión completa del negocio y de los eventos.

Puede:

- crear, editar, publicar, iniciar, finalizar y cancelar Eventos
- crear y gestionar Usuarios
- asignar Roles
- configurar permisos
- crear y gestionar Reservas
- gestionar pagos
- crear, transferir, cancelar, bloquear y reactivar Tickets
- rotar tokens QR
- regenerar assets visuales del Ticket
- ver datos completos de identidad del invitado
- ver historial completo de auditoría
- resolver excepciones de Tickets ya utilizados
- exportar información
- revisar reportes y estadísticas
- configurar la empresa
- gestionar plantillas de evento y diseños oficiales

Restricciones:

- las acciones críticas deben registrarse en el historial
- las acciones administrativas nunca deben borrar registros operativos previos

## Recepción

Responsable del ingreso de reservas y de la información de invitados.

Puede:

- crear Reservas
- editar detalles de la Reserva antes de que el Evento finalice
- registrar al titular de la reserva
- registrar datos de contacto por WhatsApp
- agregar los nombres, números de documento e información de WhatsApp de cada invitado
- agregar o quitar Tickets no utilizados dentro de límites autorizados
- transferir un Ticket pendiente a otro invitado
- corregir errores de escritura
- actualizar números de documento e información de WhatsApp
- cancelar Tickets pendientes cuando esté autorizada
- reenviar enlaces de Ticket o entradas visuales
- regenerar assets del Ticket después de un cambio de invitado
- buscar Reservas, Tickets e invitados
- ver estado de pago
- agregar notas internas
- ver estado de entrega del Ticket

No puede normalmente:

- alterar un Ticket ya ingresado
- borrar historial
- finalizar o cancelar un Evento
- modificar Usuarios o Roles
- invalidar advertencias de duplicado en check-in
- acceder a configuración global del sistema

## Caja

Responsable de la validación comercial.

Puede:

- crear una Reserva cuando sea necesario
- registrar monto pagado
- registrar método de pago
- registrar fecha y hora del pago
- subir o referenciar comprobantes de pago en el futuro
- marcar el pago como Pendiente, Parcial, Pagado, Rechazado o Reembolsado
- corregir información de pago con historial de auditoría
- buscar Reservas por titular, evento o código
- ver la cantidad de Tickets asociada a la Reserva
- agregar observaciones de pago

No puede normalmente:

- realizar Check-in
- transferir Tickets
- modificar Tickets ya utilizados
- administrar usuarios
- cambiar el estado del ciclo de vida del Evento
- borrar historial de pagos

En negocios pequeños, este rol puede combinarse con Recepción.

## Puerta

Responsable de la admisión de invitados.

Puede:

- activar el escáner para el Evento activo
- escanear el QR de un Ticket
- ver el nombre actual del invitado
- ver información parcialmente enmascarada del documento de identidad
- ver la referencia del Evento y la Reserva
- confirmar el Check-in
- buscar un invitado manualmente
- buscar por titular de la reserva o por código
- registrar una admisión manual con motivo
- ver información previa de Check-in
- detectar Tickets pendientes, ingresados, cancelados, bloqueados o inválidos
- agregar una nota operativa
- identificar qué puerta o punto de acceso realizó la acción

No puede normalmente:

- cambiar nombres libremente
- ver detalles completos de pago
- ver números completos de documento de identidad salvo permiso explícito
- cancelar o reactivar Tickets
- rotar tokens QR
- alterar un Check-in existente
- aprobar admisiones duplicadas
- modificar la configuración del Evento

## Supervisor

Responsable del control operativo en vivo y de los casos excepcionales.

Puede:

- realizar todas las operaciones de Puerta
- monitorear métricas en vivo
- revisar la actividad de los operadores
- resolver situaciones de escaneo duplicado
- autorizar excepciones de admisión manual
- desbloquear o bloquear Tickets
- aprobar cambios sobre un Ticket que ya fue ingresado
- revisar el historial completo del Ticket
- corregir incidentes operativos sin borrar registros originales
- mover operadores entre puertas
- cerrar o reabrir temporalmente un punto de acceso
- ver capacidad actual y llegadas pendientes
- agregar notas de incidente
- escalar casos a un Administrador

No puede normalmente:

- gestionar facturación del negocio
- borrar registros de auditoría
- sobrescribir Check-ins sin rastro
- crear roles a nivel global si no es también Administrador

---

# Roles futuros

Los siguientes roles pueden existir en el futuro sin diseñarse por completo todavía:

- Seguridad
- Anfitrión o Host
- Producción
- Marketing
- Consumo
- Reportes
- Auditor
- Diseñador de entradas

---

# Capacidades operativas

Las capacidades operativas describen acciones de negocio independientes de los roles. Un rol puede habilitar una o varias de estas capacidades.

## Operaciones de evento

- Crear Evento
- Editar Evento
- Publicar Evento
- Iniciar Evento
- Finalizar Evento
- Cancelar Evento
- Reabrir Evento como acción excepcional
- Configurar capacidad
- Configurar puertas
- Configurar políticas de reserva y QR

## Operaciones de reserva

- Crear Reserva
- Editar Reserva
- Cancelar Reserva
- Buscar Reserva
- Agregar o reducir Tickets
- Asignar titular y contacto
- Agregar notas
- Ver estado agregado de Tickets
- Ver estado de pago
- Duplicar una Reserva recurrente solo como consideración futura

## Operaciones de invitado

- Registrar invitado
- Corregir datos del invitado
- Cambiar número de documento
- Cambiar número de WhatsApp
- Buscar invitado
- Ver historial del invitado cuando esté autorizado
- Transferir Ticket a otro invitado

Un registro de invitado no se elimina solo porque un Ticket cambie de dueño.

## Operaciones de Ticket

- Crear Ticket
- Asignar invitado
- Transferir Ticket
- Cancelar Ticket
- Bloquear Ticket
- Reactivar Ticket
- Rotar QR
- Regenerar asset visual
- Enviar o reenviar entrada
- Ver estado de entrega
- Ver historial
- Registrar Check-in
- Resolver incidentes excepcionales de Ticket

## Operaciones de pago

- Registrar pago
- Actualizar estado de pago
- Registrar pago parcial
- Rechazar pago
- Reembolsar pago
- Agregar observación de pago
- Ver historial de pagos

## Operaciones de check-in

- Escanear QR
- Validar Ticket
- Confirmar admisión
- Buscar manualmente
- Registrar admisión manual
- Rechazar admisión inválida
- Resolver escaneo duplicado
- Identificar operador, puerta, dispositivo y hora
- Agregar notas de incidente

## Operaciones de comunicación

- Enviar Ticket individual por WhatsApp
- Reenviar Ticket
- Enviar todos los Tickets de una Reserva
- Enviar entrada actualizada después de un cambio de invitado
- Registrar número de destino
- Registrar fecha y operador
- Registrar resultado de entrega cuando esté técnicamente disponible
- Generar asset compartible para Instagram Story sin QR
- Generar una entrada descargable con QR

La integración automatizada con WhatsApp se considera trabajo futuro.

---

# Niveles de permiso

## Ver

El usuario puede ver información.

## Crear

El usuario puede crear nuevos registros operativos.

## Editar

El usuario puede cambiar información actual preservando el historial.

## Operar

El usuario puede ejecutar acciones en vivo como el Check-in.

## Aprobar

El usuario puede autorizar acciones excepcionales o sensibles.

## Administrar

El usuario puede configurar la empresa, los roles y el comportamiento de la plataforma.

Los permisos no deben depender solo de la página que se está viendo.

Deben proteger la acción subyacente.

---

# Acceso a datos sensibles

EntryFlow almacena información personal:

- nombre completo
- número de documento de identidad
- número de WhatsApp

Reglas:

- el QR nunca debe contener información personal directamente
- los números de documento deben mostrarse enmascarados por defecto
- Puerta ve solo la información necesaria para validar
- los datos completos de identidad requieren permiso explícito
- los exportes con información personal requieren autorización
- el acceso a datos sensibles debe registrarse cuando corresponda
- los logs de producción no deben exponer números de documento completos
- los assets visuales del Ticket no deben incluir números de documento
- los assets de Instagram Story no deben incluir QR ni números de documento
- las políticas de retención y eliminación deben definirse antes del lanzamiento a producción

La protección de datos sensibles forma parte de la operación, no solo de la seguridad técnica.

---

# Acciones sensibles

Se consideran acciones sensibles:

- cambiar un invitado
- cambiar el número de documento
- cancelar un Ticket
- reactivar un Ticket
- rotar un QR
- cambiar un Ticket ya utilizado
- registrar una admisión manual
- invalidar un escaneo duplicado
- reembolsar un pago
- reabrir un Evento finalizado
- exportar datos personales
- modificar roles y permisos

Toda acción sensible debe registrar:

- usuario
- rol
- empresa
- evento
- fecha y hora
- estado anterior
- estado nuevo
- motivo
- dispositivo o fuente cuando esté disponible

---

# Permisos según estado

Los permisos no dependen solo del rol. También dependen del estado actual de la entidad.

Ejemplos:

- Un Ticket pendiente puede ser transferido por Recepción.
- Un Ticket ingresado requiere aprobación de Supervisor o Administrador.
- Un Evento finalizado normalmente rechaza nuevos Check-ins.
- Un Ticket cancelado no puede admitirse sin reactivación.
- Un Evento publicado puede recibir Reservas.
- Un Evento en borrador no puede emitir Tickets operativos finales salvo que esté configurado explícitamente.
- Una Reserva pagada puede requerir permiso elevado para reducir su cantidad de Tickets.
- Un Evento en curso debe restringir cambios estructurales de configuración.

---

# Matriz de permisos

| Acción | Administrador | Recepción | Caja | Puerta | Supervisor |
|---|---|---|---|---|---|
| Crear Evento | Sí | No | No | No | No |
| Publicar Evento | Sí | No | No | No | No |
| Iniciar Evento | Sí | No | No | No | Sí |
| Finalizar Evento | Sí | No | No | No | Sí |
| Crear Reserva | Sí | Sí | Sí | No | No |
| Editar Reserva | Sí | Sí | Sí | No | No |
| Registrar Pago | Sí | No | Sí | No | No |
| Cambiar Invitado | Sí | Sí | No | No | Con autorización |
| Cancelar Ticket Pendiente | Sí | Sí | No | No | Con autorización |
| Modificar Ticket Ingresado | Sí | No | No | No | Con autorización |
| Rotar QR | Sí | No | No | No | Con autorización |
| Enviar Entrada | Sí | Sí | No | No | No |
| Escanear QR | Sí | No | No | Sí | Sí |
| Confirmar Check-in | Sí | No | No | Sí | Sí |
| Admisión Manual | Sí | No | No | Sí | Sí |
| Resolver Escaneo Duplicado | Sí | No | No | No | Sí |
| Ver Datos Completos de Identidad | Sí | Limitado | No | Limitado | Limitado |
| Exportar Datos Personales | Sí | No | No | No | Con autorización |
| Gestionar Usuarios y Roles | Sí | No | No | No | No |
| Ver Historial Completo de Auditoría | Sí | Limitado | Limitado | No | Sí |

Notas:

- **Sí** significa permitido por defecto dentro del alcance del rol.
- **No** significa no permitido normalmente.
- **Limitado** significa acceso parcial, enmascarado o restringido por contexto.
- **Con autorización** significa que la acción solo puede ejecutarse con aprobación elevada.

Algunas acciones pueden depender además del estado del Evento o del Ticket.

---

# Modo negocio pequeño

En un negocio pequeño una misma persona puede combinar funciones de:

- Administrador
- Recepción
- Caja
- Supervisor

Sin embargo, EntryFlow debe registrar siempre qué usuario realizó cada acción.

La combinación de roles no significa usar cuentas compartidas.

La identidad del operador debe permanecer individual aunque el negocio tenga un equipo reducido.

---

# Reglas de seguridad operativa en vivo

- El Evento activo debe identificarse de forma clara.
- Los operadores no deben admitir invitados accidentalmente al Evento equivocado.
- Las acciones de alto impacto requieren confirmación.
- Los escaneos duplicados nunca deben aceptarse en silencio.
- El escáner debe mostrar un resultado claro con lectura mínima.
- La admisión manual siempre debe requerir un motivo.
- Los Tickets ya utilizados requieren resolución con permiso elevado.
- El historial de Ticket y Check-in debe permanecer inmutable.
- Los operadores deben poder bloquear su sesión rápidamente.
- El acceso debe expirar o requerir reautenticación según la política de seguridad futura.

---

# Escenarios de auditoría

## 1. Recepción cambia un invitado antes de abrir puertas

Debe registrarse:

- usuario
- rol
- empresa
- evento
- fecha y hora
- nombre anterior
- nombre nuevo
- motivo
- dispositivo o fuente

## 2. Caja marca una Reserva como pagada

Debe registrarse:

- usuario
- rol
- empresa
- evento
- fecha y hora
- estado anterior de pago
- estado nuevo de pago
- monto
- método
- observación, si existe

## 3. Puerta admite manualmente a un invitado sin QR

Debe registrarse:

- usuario
- rol
- empresa
- evento
- fecha y hora
- invitado o Ticket encontrado
- motivo
- puerta
- dispositivo

## 4. Supervisor resuelve un escaneo duplicado

Debe registrarse:

- usuario
- rol
- empresa
- evento
- fecha y hora
- Ticket afectado
- estado anterior
- estado nuevo
- motivo de la resolución
- resultado de la excepción

## 5. Administrador rota un QR después de sospecha de compartición

Debe registrarse:

- usuario
- rol
- empresa
- evento
- fecha y hora
- QR anterior
- QR nuevo
- motivo
- fuente o dispositivo

## 6. Administrador modifica un Ticket ya ingresado

Debe registrarse:

- usuario
- rol
- empresa
- evento
- fecha y hora
- estado previo del Ticket
- estado posterior del Ticket
- motivo
- autorización utilizada
- intervención original preservada

Estos escenarios muestran que el sistema no solo registra el resultado, sino también el contexto y la responsabilidad de cada acción.

---

# Product rules

- User is not Role.
- Role is not Permission.
- Los permisos protegen acciones, no solo pantallas.
- Toda acción sensible debe dejar historial de auditoría.
- El estado actual afecta los permisos.
- No existen cuentas compartidas para operadores.
- No se elimina ningún registro operativo importante.
- Se aplica el principio de mínimo privilegio.
- Los negocios pequeños pueden combinar roles.
- La información personal solo se muestra cuando es operativamente necesaria.

Este documento no modifica los anteriores. Solo define cómo operan los usuarios, qué pueden hacer y qué restricciones protegen el flujo real de EntryFlow.

