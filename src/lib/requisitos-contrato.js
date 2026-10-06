import { CATALOGO } from "./documentos-catalogo.js";
import { error } from "./contrato-campos.js";

// Qué tiene que estar en el legajo para que el contrato de consignación se
// pueda armar sin ningún dato en blanco. Es la lista de lo que el contrato
// imprime: los papeles que lo respaldan y los datos que salen en sus líneas.
//
// Un papel cuenta solo si la agencia lo tiene (copia u original): uno escaneado
// cuyo papel nunca llegó no respalda nada.

const PAPELES = ["titulo", "dni_titular"];

const presente = (v) => v !== null && v !== undefined && String(v).trim() !== "";

const DATOS_TITULAR = [
  ["nombre", "Nombre"],
  ["apellido", "Apellido"],
  ["dni", "DNI"],
  ["cuit", "CUIT / CUIL"],
  ["domicilio", "Domicilio"],
  ["localidad", "Localidad"],
  ["provincia", "Provincia"],
  ["telefono", "Teléfono"],
];

// El dominio, la marca, el modelo y el año son obligatorios en el título: si el
// título está, están. Motor y chasis son opcionales en el papel pero el
// contrato los imprime.
const DATOS_VEHICULO = [
  ["motor", "Número de motor", "Se completa en el papel Título del automotor"],
  ["chasis", "Número de chasis", "Se completa en el papel Título del automotor"],
  ["kmRecepcion", "Kilómetros al recibirlo", "Se completa en Editar ingreso"],
];

const DONDE_TITULAR = "Se completa en Editar ingreso, datos del titular";

// `detalle` es el ingreso ya mapeado con documentos y contrato.
// El CBU (o su alias) se exige solo si la liquidación es por transferencia: sin condiciones
// cargadas todavía, la forma por defecto es transferencia.
export function requisitosContrato({ vehiculo, titular, documentos, contrato }) {
  const tenencias = new Map(documentos.map((d) => [d.tipo, d.tenencia]));
  const persona = titular ?? {};
  const porTransferencia = (contrato?.liquidacion?.forma ?? "transferencia") === "transferencia";

  const items = [
    ...PAPELES.map((tipo) => ({
      grupo: "papeles",
      clave: tipo,
      label: CATALOGO[tipo].label,
      donde: "Cargalo en Papeles con tenencia Copia u Original",
      cumplido: ["copia", "original"].includes(tenencias.get(tipo)),
    })),
    ...DATOS_TITULAR.map(([clave, label]) => ({
      grupo: "titular",
      clave,
      label,
      donde: DONDE_TITULAR,
      cumplido: presente(persona[clave]),
    })),
    ...(porTransferencia
      ? [
          {
            grupo: "titular",
            clave: "cbu",
            label: "CBU o alias (la liquidación es por transferencia)",
            donde: DONDE_TITULAR,
            cumplido: presente(persona.cbu) || presente(persona.aliasCbu),
          },
        ]
      : []),
    ...DATOS_VEHICULO.map(([clave, label, donde]) => ({
      grupo: "vehiculo",
      clave,
      label,
      donde,
      cumplido: presente(vehiculo?.[clave]),
    })),
  ];

  return { habilitado: items.every((i) => i.cumplido), items };
}

export function exigirRequisitosContrato(detalle) {
  const faltan = requisitosContrato(detalle).items.filter((i) => !i.cumplido);
  if (faltan.length) {
    throw error(`Para habilitar el contrato falta: ${faltan.map((i) => i.label).join(", ")}.`, 409);
  }
}
