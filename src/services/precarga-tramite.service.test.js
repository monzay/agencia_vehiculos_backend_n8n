import { test } from "node:test";
import assert from "node:assert/strict";
import { kmDeclarado, precargaDeConsulta } from "./precarga-tramite.service.js";

const AUTO = { id: 7, ref: "A7", marca: "Fiat", modelo: "Cronos", anio: 2022, precio: 20000000, vendido_at: null, consignaciones: [] };

const CLIENTE = {
  id: 5,
  nombre: "Ana Vilte",
  dni: null,
  telefono: "3885550000",
  email: null,
  canal: "whatsapp",
  cuil: "20990000115",
  cliente_perfiles: null,
};

const sesion = (extra = {}) => ({
  id: 10,
  cliente_id: 5,
  auto_id: 7,
  tipo_lead: null,
  modalidad_venta: null,
  pago_tipo: null,
  entrega_usado: null,
  vehiculo_cliente: [],
  clientes: CLIENTE,
  ...extra,
});

// Base falsa: `tomado` simula un auto ya comprometido en otro trámite.
function base({ fila = sesion(), auto = AUTO, tomado = false } = {}) {
  const auto_ = auto && { ...auto };
  return {
    chat_estado: { findUnique: async () => fila },
    autos: { findFirst: async () => auto_ },
    compraventa_contratos: { findFirst: async () => null },
    consignacion_ingresos: { findFirst: async () => (tomado ? { id: 99 } : null) },
    senas: { findFirst: async () => null },
  };
}

test("los kilómetros se toman solo si son un número", () => {
  assert.equal(kmDeclarado("45.000"), 45000);
  assert.equal(kmDeclarado("60000"), 60000);
  assert.equal(kmDeclarado(" 98,000 km "), 98000);
  assert.equal(kmDeclarado("80 mil"), null);
  assert.equal(kmDeclarado("no sé"), null);
  assert.equal(kmDeclarado(null), null);
});

test("trae los datos del cliente y lo que respondió en la consulta", async () => {
  const fila = sesion({ pago_tipo: "contado", anticipo: "la mitad" });
  const p = await precargaDeConsulta(10, base({ fila }));

  assert.equal(p.sesionId, 10);
  assert.equal(p.cliente.nombre, "Ana Vilte");
  assert.equal(p.cliente.telefono, "3885550000");
  assert.equal(p.titulo, "Fiat Cronos 2022");
  assert.equal(p.sugerida, undefined, "no sugiere: la operación la elige el admin");
  assert.ok(p.respuestas.some((r) => r.pregunta === "Anticipo" && r.respuesta === "la mitad"));
  assert.equal(p.anticipo, undefined, "el anticipo queda a la vista, no como monto");
});

test("trae el anticipo que la agencia cargó en el vehículo", async () => {
  const conAnticipo = await precargaDeConsulta(10, base({ auto: { ...AUTO, anticipo: 4000000 } }));
  assert.equal(conAnticipo.auto.anticipo, 4000000);

  const sinAnticipo = await precargaDeConsulta(10, base());
  assert.equal(sinAnticipo.auto.anticipo, null);
});

test("el CUIL del perfil manda sobre el de la ficha", async () => {
  const sinPerfil = await precargaDeConsulta(10, base());
  assert.equal(sinPerfil.cliente.cuit, "20990000115");

  const clientes = { ...CLIENTE, cliente_perfiles: { cuit: "27990000223" } };
  const conPerfil = await precargaDeConsulta(10, base({ fila: sesion({ clientes }) }));
  assert.equal(conPerfil.cliente.cuit, "27990000223");
});

test("una consulta inexistente o un id inválido no tiene precarga", async () => {
  assert.equal(await precargaDeConsulta(10, base({ fila: null })), null);
  for (const id of ["abc", 0, -1, "1.5"]) assert.equal(await precargaDeConsulta(id, base()), null, String(id));
});

test("un auto libre se puede vender y señar", async () => {
  const p = await precargaDeConsulta(10, base());
  assert.deepEqual(
    { ref: p.auto.ref, puedeVender: p.auto.puedeVender, puedeSenar: p.auto.puedeSenar, aviso: p.auto.aviso },
    { ref: "A7", puedeVender: true, puedeSenar: true, aviso: null }
  );
});

test("un auto vendido no se ofrece y dice por qué", async () => {
  const p = await precargaDeConsulta(10, base({ auto: { ...AUTO, vendido_at: new Date() } }));
  assert.equal(p.auto.puedeVender, false);
  assert.equal(p.auto.puedeSenar, false);
  assert.match(p.auto.aviso, /vendido/);
});

test("un auto en consignación solo se puede señar", async () => {
  const p = await precargaDeConsulta(10, base({ fila: sesion({ pago_tipo: "contado" }), auto: { ...AUTO, consignaciones: [{ id: 1 }] } }));
  assert.equal(p.auto.puedeVender, false);
  assert.equal(p.auto.puedeSenar, true);
  assert.match(p.auto.aviso, /consignación/);
});

test("un auto en otro trámite no se ofrece", async () => {
  const p = await precargaDeConsulta(10, base({ tomado: true }));
  assert.equal(p.auto.puedeVender, false);
  assert.equal(p.auto.puedeSenar, false);
  assert.match(p.auto.aviso, /trámite/);
});

test("un auto borrado se avisa", async () => {
  const p = await precargaDeConsulta(10, base({ auto: null }));
  assert.equal(p.auto, null);
  assert.match(p.avisoAuto, /ya no está/);
});

test("el usado se precarga sin valor de toma", async () => {
  const usado = { contexto: "trade_in", marca: "Volkswagen", modelo: "Gol", anio: 2015, kms: "80.000", detalles: "Choque leve", precio_pedido: "9.000.000" };
  const p = await precargaDeConsulta(10, base({ fila: sesion({ entrega_usado: true, vehiculo_cliente: [usado] }) }));

  assert.deepEqual(p.parteDePago, { entregaUsado: true, vehiculo: "Volkswagen Gol 2015", km: 80000, notas: "Choque leve" });
  assert.ok(p.respuestas.some((r) => r.pregunta === "Cuánto pide por el usado"), "lo que pide queda a la vista");
});
