// Fechas como las dice una persona en Argentina: "hoy 15:12", "el miércoles 11/11".

const ZONA = "America/Argentina/Buenos_Aires";
const formato = (fecha, opciones) => new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, ...opciones }).format(fecha);

// es-AR escribe "7/10": se arma a mano con ceros a la izquierda ("07/10").
const diaYMes = (fecha) => {
  const partes = new Intl.DateTimeFormat("es-AR", { timeZone: ZONA, day: "numeric", month: "numeric" }).formatToParts(fecha);
  const valor = (tipo) => partes.find((p) => p.type === tipo).value.padStart(2, "0");
  return `${valor("day")}/${valor("month")}`;
};

export const elDia = (fecha) => `el ${formato(fecha, { weekday: "long" })} ${diaYMes(fecha)}`;
export const hora = (fecha) => formato(fecha, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

// "hoy 15:12" si fue el mismo día que `ahora`; si no, "el miércoles 11/11".
export const cuando = (fecha, ahora) => (formato(fecha, { dateStyle: "short" }) === formato(ahora, { dateStyle: "short" }) ? `hoy ${hora(fecha)}` : elDia(fecha));
