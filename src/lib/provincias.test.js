import { test } from "node:test";
import assert from "node:assert/strict";
import { provinciaDeTelefono, telefonoLocal, PROVINCIAS } from "./provincias.js";

const prov = (n) => provinciaDeTelefono(n)?.provincia ?? null;

// Un caso por jurisdicción: si algún día se rompe la tabla, el test dice cuál.
const UNA_POR_PROVINCIA = [
  ["5491145678901", "CABA / GBA"],
  ["5492214567890", "Buenos Aires"],
  ["5493834567890", "Catamarca"],
  ["5493624567890", "Chaco"],
  ["5492804567890", "Chubut"],
  ["5493514567890", "Córdoba"],
  ["5493794567890", "Corrientes"],
  ["5493434567890", "Entre Ríos"],
  ["5493704567890", "Formosa"],
  ["5493886567587", "Jujuy"],
  ["5492954456789", "La Pampa"],
  ["5493804567890", "La Rioja"],
  ["5492614567890", "Mendoza"],
  ["5493764567890", "Misiones"],
  ["5492994567890", "Neuquén"],
  ["5492984567890", "Río Negro"],
  ["5493874567890", "Salta"],
  ["5492644567890", "San Juan"],
  ["5492664567890", "San Luis"],
  ["5492966456789", "Santa Cruz"],
  ["5493414567890", "Santa Fe"],
  ["5493854567890", "Santiago del Estero"],
  ["5492901456789", "Tierra del Fuego"],
  ["5493814567890", "Tucumán"],
];

test("identifica las 24 jurisdicciones argentinas", () => {
  for (const [numero, esperada] of UNA_POR_PROVINCIA) {
    assert.equal(prov(numero), esperada, `${numero} debería ser ${esperada}`);
  }
  const cubiertas = new Set(UNA_POR_PROVINCIA.map(([, p]) => p));
  assert.equal(cubiertas.size, 24, "deben ser 24 jurisdicciones distintas");
  assert.equal(PROVINCIAS.length, 24, "la tabla no debe exponer otras");
});

test("acepta los formatos que aparecen en la base", () => {
  // Todos son el mismo teléfono de Jujuy escrito distinto.
  for (const n of ["5493886567587", "03886567587", "3886567587", "388 656-7587", "+54 9 388 656 7587"]) {
    assert.equal(prov(n), "Jujuy", `falló con "${n}"`);
  }
});

test("soporta el 15 viejo entre área y abonado", () => {
  assert.equal(prov("0388156567587"), "Jujuy");
});

test("resuelve el largo del área sin ambigüedad", () => {
  // 2954 (Santa Rosa) solo existe como código de 4 dígitos: 29 y 295 no están
  // en la tabla, así que la búsqueda tiene que seguir hasta encontrarlo.
  assert.equal(prov("5492954123456"), "La Pampa");
  assert.equal(provinciaDeTelefono("5492954123456").area, "2954");
  // 3886567587 se puede leer como 388+7 dígitos o 3886+6. Ante el empate gana
  // el área general, y la provincia es Jujuy en cualquiera de las dos lecturas.
  assert.equal(provinciaDeTelefono("5493886567587").area, "388");
  assert.equal(prov("5493886567587"), "Jujuy");
});

test("devuelve null en vez de adivinar", () => {
  assert.equal(prov(null), null);
  assert.equal(prov(""), null);
  assert.equal(prov("hola"), null);
  assert.equal(prov("123"), null, "demasiado corto");
  assert.equal(prov("5215512345678"), null, "número de México");
  assert.equal(prov("5491145"), null, "área conocida pero sin abonado válido");
});

test("telefonoLocal saca el prefijo de país y separa el área", () => {
  assert.equal(telefonoLocal("5493886567587"), "388 656-7587");
  assert.equal(telefonoLocal("5493884708347"), "388 470-8347");
  // Áreas de otro largo: el corte tiene que seguir al área, no a una posición fija.
  assert.equal(telefonoLocal("5491145678901"), "11 4567-8901", "área de 2 dígitos");
  assert.equal(telefonoLocal("5492954123456"), "2954 12-3456", "área de 4 dígitos");
});

test("telefonoLocal normaliza los otros formatos de la base", () => {
  for (const n of ["5493886567587", "03886567587", "3886567587", "0388156567587"]) {
    assert.equal(telefonoLocal(n), "388 656-7587", `falló con "${n}"`);
  }
});

test("telefonoLocal no recorta lo que no reconoce", () => {
  assert.equal(telefonoLocal("5215512345678"), "5215512345678", "número de México, se muestra entero");
  assert.equal(telefonoLocal(""), null);
  assert.equal(telefonoLocal(null), null);
});
