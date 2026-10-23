import { test } from "node:test";
import assert from "node:assert/strict";
import { putCuota } from "./financiaciones.controller.js";

const respuesta = () => {
  const res = { codigo: 200, cuerpo: null };
  res.status = (codigo) => ((res.codigo = codigo), res);
  res.json = (cuerpo) => ((res.cuerpo = cuerpo), res);
  return res;
};

// Antes, todo lo que no fuera `true` desmarcaba la cuota: un body vacío o un
// "true" de texto anulaba el pago. Ahora se exige el booleano y no se toca nada.
test("marcar una cuota exige pagado booleano: con otra cosa responde 400 y no anula el pago", async () => {
  for (const body of [undefined, {}, { pagado: "true" }, { pagado: 1 }, { pagado: null }]) {
    const res = respuesta();
    let llegoAlServicio = false;
    await putCuota({ params: { id: "1", numero: "1" }, body }, res, () => (llegoAlServicio = true));
    assert.equal(res.codigo, 400, `body ${JSON.stringify(body)}`);
    assert.equal(res.cuerpo.ok, false);
    assert.equal(llegoAlServicio, false);
  }
});
