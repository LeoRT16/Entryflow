# Product Audit - EntryFlow

Auditoría realizada sobre el frontend existente, la estructura del proyecto y la documentación de dominio/operación. El alcance de este documento es deliberadamente crítico: identificar qué está bien, qué está frágil y qué conviene resolver antes de introducir backend, autenticación, persistencia o integraciones.

## Fortalezas

- La visión de producto está bien definida y el foco es claro: operación de eventos presenciales, no un sistema genérico de reservas.
- La documentación de dominio es consistente entre visión, modelo de negocio, flujo operativo y máquina de estados.
- La arquitectura conceptual ya diferencia empresa, evento, reserva, ticket e invitado, lo cual reduce ambiguedad futura.
- El shell de aplicación existe y la navegación principal está resuelta con un layout persistente.
- La UI base tiene una identidad visual clara, oscura y consistente con contexto operativo nocturno.
- Hay componentes reutilizables útiles ya disponibles: `Topbar`, `MetricCard`, `StatusBadge`, `SectionPlaceholder`, `Skeleton*`, `EmptyState`.
- El proyecto ya separa, al menos a nivel de intención, dashboard, reservas, check-in, invitados, estadísticas y ajustes.
- Hay soporte visual para loading states, empty states, toasts y confirmaciones, lo que mejora la percepción de producto aun en modo prototipo.
- La documentación ya anticipa estados, permisos y auditoría, algo que suele faltar antes del backend.

## Debilidades

- La mayor parte de la aplicación vive en componentes monolíticos muy grandes. `guest-directory.tsx`, `reservation-flow.tsx` y `app/reservations/mock-reservation/page.tsx` ya funcionan como mini-aplicaciones dentro de un solo archivo.
- El frontend depende de datos mock locales en puntos centrales del producto, lo que bloquea cualquier lectura real de operación, permisos, persistencia o multiempresa.
- Existe una mezcla fuerte entre “prototipo demostrativo” y “producto operativo”, lo que genera una frontera poco clara entre demo, placeholder y flujo real.
- La arquitectura de rutas es simple, pero todavía no refleja la riqueza del dominio documentado. Hay menos profundidad estructural que la complejidad del negocio promete.
- Varias pantallas están reducidas a placeholders, mientras otras están extremadamente desarrolladas. Eso crea una experiencia desigual y una percepción de producto inconcluso.
- El sistema de navegación presenta una ruta interna de demostración (`/reservations/mock-reservation`) que no parece formar parte del mapa principal del producto.
- El shell global es un componente cliente, así que el costo de hidratación y bundle inicial se extiende a todas las páginas.
- Falta una capa de abstracción de dominio en frontend. Hoy la UI conoce demasiado de estados, tonos, textos y simulaciones.
- Hay repetición visible de patrones de cards, botones, chips y paneles, con variaciones menores pero sin un sistema de composición más estricto.
- El producto todavía no expresa con claridad la separación entre organizador, operador y invitado desde la navegación y las pantallas reales.

## Quick Wins

- Unificar estilos repetidos de tarjetas, botones y badges en un set más pequeño de primitives.
- Extraer constantes visuales y de copy para evitar que estados, tonos y textos se repitan en varios archivos.
- Reducir la superficie de los componentes gigantes dividiendo por secciones funcionales sin cambiar comportamiento.
- Estabilizar el mapa de rutas visibles e internas para distinguir demo, operación y contenido productivo.
- Normalizar naming entre español de interfaz e inglés técnico para que no haya mezcla innecesaria en textos, archivos y variables.
- Consolidar una convención clara para empty states, skeletons y call to action.
- Reemplazar textos que enfatizan “modo demo”, “mock” o “simulado” en pantallas no dedicadas a demo, para no mezclar expectativas.
- Añadir una capa ligera de tipado compartido para estados de reserva, invitado y entrega.

## Refactors recomendados

- Dividir `guest-directory.tsx` en módulos menores por responsabilidad: filtros, tarjetas, drawer de detalle, timeline, incidencias, auditoría y acciones.
- Dividir `reservation-flow.tsx` en piezas de dominio visual: encabezado, panel de contexto, wizard, pasos y resumen final.
- Separar `app/reservations/mock-reservation/page.tsx` en subcomponentes reutilizables o moverlo a una estructura de feature mejor organizada.
- Crear un sistema de design primitives más estable para:
  - contenedores
  - botones
  - labels
  - chips
  - métricas
  - secciones vacías
- Centralizar los estados operativos en un archivo de tipos compartidos.
- Extraer los arrays mock a una capa de fixtures claramente identificada como temporal.
- Separar componentes de navegación de la lógica de estado del shell móvil.
- Preparar el frontend para consumir datos reales sin reescribir pantallas completas.

## Riesgos

- Riesgo de producto: lanzar backend sobre una UI todavía semisimulada puede fijar flujos incorrectos y obligar a rehacer pantallas enteras.
- Riesgo UX: la experiencia puede sentirse premium en el dashboard, pero inconsistente o vacía en áreas clave como check-in, eventos y estadísticas.
- Riesgo técnico: el crecimiento de archivos monolíticos hará más difícil mantener, testear y perfilar el producto.
- Riesgo de escalabilidad: cada nuevo rol, entidad o excepción operativa puede duplicar lógica si no se formaliza una capa de dominio y componentes base.
- Riesgo de accesibilidad: hay elementos correctos, pero todavía faltan garantías fuertes de foco, navegación por teclado, cierre de modales y control de foco en overlays complejos.
- Riesgo de performance: el shell cliente y las pantallas con mucho estado local aumentan el costo inicial sin necesidad funcional clara.
- Riesgo operativo: el producto todavía no demuestra con la misma madurez los tres flujos clave: organizador, operador y invitado.
- Riesgo de alineación: la documentación habla de multiempresa, tickets, QR, auditoría y permisos; la UI actual aún no traduce eso de forma consistente.

## Prioridad Alta

- Definir una arquitectura de frontend más modular antes del backend.
- Separar el dominio visual de los fixtures mock.
- Reducir los componentes de gran tamaño a unidades mantenibles.
- Alinear navegación, rutas y jerarquía operativa con el modelo de negocio real.
- Establecer un sistema único de estados, badges y acciones para reserva, invitado y check-in.
- Revisar la accesibilidad de overlays, paneles laterales y flujos con teclado.
- Aclarar qué rutas son producto y cuáles son demo interna.

## Prioridad Media

- Mejorar consistencia visual entre dashboard, reservas, directorio e indicadores.
- Revisar naming mixto y normalizar terminología operativa.
- Reforzar la jerarquía visual para que las pantallas de operación se lean más rápido.
- Reducir el número de variaciones de cards y paneles para evitar sensación de UI fragmentada.
- Preparar el sistema para estados vacíos más realistas y menos genéricos.
- Introducir lineamientos de responsive específicos para tablas densas, drawers y wizard largos.

## Prioridad Baja

- Pulir microcopy para hacerlo más cercano al lenguaje operativo real.
- Refinar la capa visual del dashboard para hacerlo más distintivo sin cambiar flujo.
- Mejorar animaciones y skeletons donde realmente aporten comprensión.
- Ajustar detalles menores de spacing, tonalidad y densidad visual.
- Reorganizar assets públicos si se va a expandir la identidad visual más adelante.

## Roadmap recomendado

1. Consolidar el frontend base.
   - Modularizar los componentes más grandes.
   - Separar fixtures de UI.
   - Homogeneizar primitives y estados visuales.

2. Formalizar el dominio en frontend.
   - Crear tipos compartidos para empresa, evento, reserva, ticket, invitado y auditoría.
   - Dejar de codificar estados directamente en componentes de pantalla.

3. Unificar la experiencia operativa.
   - Hacer que organizador, operador y invitado se lean como flujos distintos dentro de una misma lógica de producto.
   - Revisar jerarquía visual, navegación y lenguaje de cada rol.

4. Preparar la capa de datos.
   - Reemplazar mock data por contratos de datos bien definidos.
   - Mantener la UI estable mientras la fuente de datos evoluciona.

5. Recién después, introducir backend.
   - Persistencia.
   - Autenticación.
   - Auditoría real.
   - QR y check-in reales.
   - Multiempresa con reglas y permisos.

## ¿Lanzaría este producto en producción?

No lo lanzaría todavía en producción.

La razón principal no es visual, sino estructural: hoy EntryFlow ya comunica bien su intención y tiene un frontend convincente, pero todavía depende demasiado de datos mock, flujos simulados y componentes monolíticos. El producto parece cercano por fuera, pero por dentro aún no está listo para sostener la complejidad real de una operación de eventos con permisos, auditoría, check-in y trazabilidad.

Lo que sí lanzaría sería una versión de validación interna o una demo controlada. Para producción, antes haría dos cosas: estabilizar la arquitectura del frontend y traducir el modelo de dominio documentado en contratos y pantallas coherentes. Si se salta ese paso y se agrega backend encima, el riesgo de deuda, inconsistencias de flujo y re-trabajo sería alto.
