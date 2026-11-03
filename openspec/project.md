# Convenciones de las specs

Este proyecto trabaja **spec-anchored**: cada regla de negocio está escrita una vez acá,
vive versionada junto al código y se actualiza en el mismo commit que el código. Cada
escenario apunta al test que lo prueba.

- **Spec** = lo que el sistema DEBE hacer, se puede comprobar, es corto.
- **Bóveda de Obsidian** = cómo se usa, por qué y para quién. No se copian reglas allá: se cita el requisito.

## Stack

Backend Node + Express + Prisma + MySQL (`web/backend`), tests con `node --test`.
Front Next.js (`web/sea_automotores`). Agente de WhatsApp con Claude en `src/agente`.
Las reglas viven en el backend; el front y la bóveda las citan.

## Estructura

```
openspec/
├── project.md                 ← este archivo
├── specs/<capacidad>/spec.md  ← la verdad vigente, una carpeta por capacidad
└── changes/<cambio>/          ← cambios en curso: proposal.md, tasks.md, specs/ (delta)
```

- **Una lista plana de capacidades**, sin subcarpetas. Se agrupan con un prefijo de dominio.
- **Capacidad = un conjunto de reglas que cambian por el mismo motivo**, no una carpeta de código.
- El nombre de la carpeta es el id de la capacidad: no se renombra sin un cambio formal.
- Si una spec pasa las ~800 líneas, se divide.

### Capacidades

| Prefijo / nombre | Estado |
|---|---|
| `agente-entrada`, `agente-cupos`, `agente-conversacion`, `agente-calificacion`, `agente-herramientas`, `agente-cobranza`, `agente-comportamiento` | Borrador (2026-10-30) |
| `agente-credito` | Borrador (2026-11-01), revisado con el dueño; apagado por defecto |
| `vehiculos`, `senas`, `clientes`, `financiaciones`, `financiaciones-avisos`, `ia-costos`, `autenticacion-permisos`, `tramites-*`, `entregas`, `horarios`, … | Pendientes |

## Formato de un requisito

```markdown
### Requirement: <nombre corto>
El sistema MUST <regla>.
<!-- id: archivo.funcion -->

#### Scenario: <caso>
- **WHEN** <situación>
- **THEN** <resultado>
<!-- test: src/ruta/archivo.test.js › "nombre exacto del test" -->
```

Prosa en español; las palabras normativas van en inglés (MUST, MUST NOT, SHALL), como las
espera OpenSpec.

### Marcas

| Marca | Significa |
|---|---|
| `<!-- id: archivo.funcion -->` | Dónde se hace cumplir la regla. Es estable: no cambia aunque cambie el título del requisito |
| `<!-- test: archivo › "nombre" -->` | El test que prueba el escenario. Tiene que existir con ese nombre exacto |
| `<!-- test: FALTA -->` | Escenario sin test. Se cierra con TDD |
| `<!-- eval: … -->` | Solo para reglas que cumple la IA: lo mide el simulador, no un test |
| `<!-- observacion: … -->` | Diferencia entre el código y el negocio, o un riesgo. Se anota en "22 - Observaciones Pendientes" de la bóveda; no se arregla en silencio |
| `<!-- dueña-futura: <capacidad> -->` | La regla es de otra capacidad que todavía no existe. Se mueve cuando se extraiga esa capacidad |

## Reglas para crecer sin romper

1. **Cada regla vive en una sola capacidad.** Las demás la citan, no la copian:
   `Un auto se ofrece solo si está disponible (ver \`vehiculos\` › Qué auto está disponible).`
2. **Al extraer una capacidad nueva**, se buscan sus `dueña-futura` en las demás. Las reglas se mueven a la nueva y en el lugar viejo queda la cita. Todo en el mismo cambio.
3. **Todo cambio de comportamiento entra con un delta** en `changes/`. Si toca varias capacidades, el delta lleva un archivo por cada una y se integran juntos.
4. **Sin delta:** refactors, estilos, y bugs que devuelven el comportamiento que la spec ya describe.
5. **Spec, código y tests van en el mismo commit.**
6. **Control automático:** antes del commit se verifica que cada `test:` exista, que cada cita "ver `X` › Y" apunte a un requisito real y que ninguna regla esté escrita en dos capacidades.

## Flujo de un cambio

`/plan` arma el delta → el dueño aprueba el delta → `/feature-dev` con TDD (cada escenario
nuevo es un test que primero falla) → `/code-review` revisa que código, delta y tests
coincidan → `openspec archive` integra el delta → un solo commit.
