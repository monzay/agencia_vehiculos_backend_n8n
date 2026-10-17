// Crea en Meta la plantilla del recordatorio de cuota (categoría UTILITY) y
// muestra su estado. Si ya existe, solo muestra el estado.
//
// Uso (desde web/backend):
//   node scripts/crear-plantilla-cuota.js            → busca la cuenta de WhatsApp (WABA) en el token
//   node scripts/crear-plantilla-cuota.js --waba=ID  → usa esa cuenta
//
// El token se lee de WA_TOKEN_FILE (por defecto .local-dev/wa-token.txt en la raíz
// del proyecto) y nunca se imprime. Necesita el permiso whatsapp_business_management.
import { readFileSync } from "node:fs";
import { PLANTILLA_CUOTA, TEXTO_PLANTILLA_CUOTA } from "../src/services/avisos-cuotas.service.js";

const GRAPH = "https://graph.facebook.com/v22.0";
const IDIOMA = "es_AR";
const EJEMPLO = ["Juan", "8", "24", "en 3 días", "18/10", "250.000"];
const ARCHIVO_TOKEN = process.env.WA_TOKEN_FILE ?? new URL("../../../.local-dev/wa-token.txt", import.meta.url);

function leerToken() {
  const token = readFileSync(ARCHIVO_TOKEN, "utf8").trim();
  if (!token) throw new Error("El archivo del token está vacío.");
  return token;
}

async function graph(token, ruta, { method = "GET", body } = {}) {
  const res = await fetch(`${GRAPH}${ruta}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body && { "Content-Type": "application/json" }) },
    body: body && JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Meta respondió ${res.status}: ${json.error?.message ?? "sin detalle"}`);
  return json;
}

// La cuenta de WhatsApp Business a la que el token tiene acceso.
async function wabaDelToken(token) {
  const { data } = await graph(token, `/debug_token?input_token=${encodeURIComponent(token)}`);
  if (data?.is_valid === false) throw new Error("El token venció o no es válido.");
  const alcance = data?.granular_scopes?.find((s) => s.scope === "whatsapp_business_management");
  const waba = alcance?.target_ids?.[0];
  if (!waba) throw new Error("El token no tiene el permiso whatsapp_business_management (pasá --waba=ID o usá otro token).");
  return waba;
}

const argumentoWaba = () => process.argv.find((a) => a.startsWith("--waba="))?.slice("--waba=".length);

async function main() {
  const token = leerToken();
  const waba = argumentoWaba() ?? (await wabaDelToken(token));
  if (!/^\d{5,30}$/.test(waba)) throw new Error("El id de la cuenta (WABA) no es válido.");

  const existentes = await graph(token, `/${waba}/message_templates?name=${PLANTILLA_CUOTA}&fields=name,status,language,category`);
  const existente = existentes.data?.find((p) => p.name === PLANTILLA_CUOTA && p.language === IDIOMA);
  if (existente) {
    console.log(`La plantilla ya existe: ${existente.name} (${existente.language}) · estado ${existente.status} · categoría ${existente.category}`);
    return;
  }

  const creada = await graph(token, `/${waba}/message_templates`, {
    method: "POST",
    body: {
      name: PLANTILLA_CUOTA,
      language: IDIOMA,
      category: "UTILITY",
      components: [{ type: "BODY", text: TEXTO_PLANTILLA_CUOTA, example: { body_text: [EJEMPLO] } }],
    },
  });
  console.log(`Plantilla enviada a revisión: id ${creada.id} · estado ${creada.status} · categoría ${creada.category}`);
  if (creada.category && creada.category !== "UTILITY") {
    console.log("Ojo: Meta la clasificó distinto de UTILITY; cada aviso costaría más. Revisar el texto.");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
