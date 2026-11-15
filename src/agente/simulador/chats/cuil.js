// Los chats que mandan un CUIL usan todos el mismo (el del documento). El backend no deja consultar un CUIL
// que ya está en la ficha de otra persona, así que dos de esos chats a la vez (repeticiones o --paralelo)
// chocan y el segundo recibe "no coincide". Se corren de a uno.

// 11 dígitos, con o sin guiones: 20-12345678-6.
const CUIL = /\b\d{2}-?\d{8}-?\d\b/;

export const traeCuil = (chat) => chat.pasos.some((p) => p.tipo !== "espera" && CUIL.test(p.texto ?? ""));

// Una fila: cada tarea espera a que termine la anterior (aunque falle).
export function crearExclusion() {
  let cola = Promise.resolve();
  return (tarea) => {
    const corrida = cola.then(tarea);
    cola = corrida.catch(() => {});
    return corrida;
  };
}
