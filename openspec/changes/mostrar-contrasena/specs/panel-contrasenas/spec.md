## ADDED Requirements

### Requirement: Mostrar u ocultar la contraseña
Todo campo de contraseña del sistema MUST tener un botón que muestre u oculte lo escrito. El campo
MUST arrancar oculto, cambiar entre mostrar y ocultar MUST NOT borrar lo escrito, y el botón MUST
decir "Mostrar contraseña" u "Ocultar contraseña" según el estado, para el lector de pantalla.
<!-- id: campo-contrasena.CampoContrasena -->

#### Scenario: Login
- **WHEN** alguien escribe la contraseña en el login y toca el ojo
- **THEN** la ve; si lo toca otra vez se vuelve a ocultar, y lo escrito queda igual
<!-- test: ../sea_automotores/e2e/mostrar-contrasena.spec.mjs › "en el login se puede ver y ocultar la contraseña sin perder lo escrito" -->

#### Scenario: Alta de un asesor
- **WHEN** el admin escribe la contraseña de un asesor nuevo y toca el ojo
- **THEN** la ve; si lo toca otra vez se vuelve a ocultar
<!-- test: ../sea_automotores/e2e/mostrar-contrasena.spec.mjs › "al crear un asesor se puede ver y ocultar la contraseña" -->
