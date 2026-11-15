# Nivel de razonamiento — medición del 2026-11-15

Los 25 chats, 2 veces cada uno, con el bot ya arreglado (antes del freno por código de la pregunta repetida).

| Nivel | Chats que pasan los controles | Fallan | Costo de IA | Tiempo de la corrida | Largo medio de la respuesta |
|---|---|---|---|---|---|
| low (el de hoy) | 24 de 25 | K1 | USD 0,100 | 185 s | 176 caracteres |
| medium | 23 de 25 | K1, P1 | USD 0,110 | 193 s | 176 caracteres |
| high | 22 de 25 | K1, K3, E1 | USD 0,133 | 228 s | 184 caracteres |

**Queda `low`.** Subir el nivel no arregla K1 (la pregunta repetida) y no mejora ningún otro chat; las
diferencias entre niveles están dentro de lo que cambia el modelo de una pasada a otra. Ninguna respuesta se
cortó por el máximo de tokens.

Límite de esta medición: compara los controles automáticos. La revisión de Codex se hace sobre el nivel
elegido, en las rondas.
