// Cuándo una seña tiene el auto reservado. Lo usan el catálogo público (el auto
// reservado no se muestra), el panel (insignia "Señado") y el boleto (no se
// puede vender a otro).
//
// Reserva = una vigente que todavía no venció, o una que ya pasó a un trámite
// que sigue abierto. Vencida no reserva: el auto vuelve a estar libre.

const ZONA = "America/Argentina/Buenos_Aires";

// Hoy en Argentina, como lo guarda una columna DATE (medianoche UTC). Así una
// seña que vence hoy sigue vigente todo el día, aunque el servidor esté en UTC.
export const hoyFecha = () => new Date(`${new Date().toLocaleDateString("en-CA", { timeZone: ZONA })}T00:00:00Z`);

export const senaReservando = (hoy = hoyFecha()) => ({
  deleted_at: null,
  OR: [
    { estado: "vigente", vence: { gte: hoy } },
    { estado: "convertida", ingreso: { is: { deleted_at: null } } },
  ],
});

// Filtro para `autos`: los que NO tienen una seña reservándolos.
export const SIN_RESERVA = () => ({ senas: { none: senaReservando() } });

// Un trámite de venta abierto también compromete el auto, aunque no tenga seña.
// Filtro para `autos`: lo usan la web y el agente, para que digan lo mismo.
export const TRAMITE_ABIERTO = { deleted_at: null, estado: { not: "vendido" } };
export const BOLETO_ABIERTO = { deleted_at: null, consignacion_ingresos: { deleted_at: null } };
export const SIN_TRAMITE_ABIERTO = { tramites_interes: { none: TRAMITE_ABIERTO }, permutas: { none: BOLETO_ABIERTO } };

export const vencida = (s, hoy = hoyFecha()) => s.estado === "vigente" && new Date(s.vence) < hoy;
