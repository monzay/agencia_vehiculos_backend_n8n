// Deduce la provincia argentina a partir del teléfono del cliente, usando el
// código de área.
//
// Un número argentino en formato internacional se arma así:
//   54 [9] <área (2, 3 o 4 dígitos)> <abonado>
// donde área + abonado suman siempre 10 dígitos. El `9` aparece solo en móviles
// (es el que usa WhatsApp) y el `15` es la forma vieja de marcar un móvil dentro
// del país.
//
// Los códigos se buscan de más corto a más largo (2 → 3 → 4) y gana el primero
// que exista en la tabla. Hace falta recorrerlos en ese orden porque el largo
// del área no se puede deducir del número: `3886567587` se lee tanto como
// 388 + 6567587 (San Salvador de Jujuy) como 3886 + 567587 (San Pedro), y las
// dos lecturas consumen los mismos 10 dígitos. Ante el empate conviene el área
// más general, que es la que la gente reconoce. No hay ningún caso donde un
// prefijo corto pertenezca a una provincia y uno largo que lo contenga a otra,
// así que la provincia sale bien igual.
//
// Cobertura: las 23 provincias más CABA. La tabla tiene los códigos de área de
// las capitales y ciudades principales. Un código que no esté acá devuelve
// `null` — preferimos "no identificada" antes que una provincia inventada.

const AREAS = {
  // ── CABA y Gran Buenos Aires ──
  11: "CABA / GBA",

  // ── Buenos Aires ──
  220: "Buenos Aires",
  221: "Buenos Aires",
  223: "Buenos Aires",
  230: "Buenos Aires",
  236: "Buenos Aires",
  237: "Buenos Aires",
  249: "Buenos Aires",
  291: "Buenos Aires",
  336: "Buenos Aires",
  348: "Buenos Aires",
  2202: "Buenos Aires",
  2241: "Buenos Aires",
  2242: "Buenos Aires",
  2245: "Buenos Aires",
  2254: "Buenos Aires",
  2257: "Buenos Aires",
  2262: "Buenos Aires",
  2265: "Buenos Aires",
  2266: "Buenos Aires",
  2267: "Buenos Aires",
  2271: "Buenos Aires",
  2281: "Buenos Aires",
  2284: "Buenos Aires",
  2291: "Buenos Aires",
  2296: "Buenos Aires",
  2314: "Buenos Aires",
  2317: "Buenos Aires",
  2320: "Buenos Aires",
  2323: "Buenos Aires",
  2324: "Buenos Aires",
  2325: "Buenos Aires",
  2326: "Buenos Aires",
  2342: "Buenos Aires",
  2344: "Buenos Aires",
  2345: "Buenos Aires",
  2346: "Buenos Aires",
  2352: "Buenos Aires",
  2353: "Buenos Aires",
  2354: "Buenos Aires",
  2355: "Buenos Aires",
  2356: "Buenos Aires",
  2357: "Buenos Aires",
  2362: "Buenos Aires",
  2364: "Buenos Aires",
  2392: "Buenos Aires",
  2394: "Buenos Aires",
  2473: "Buenos Aires",
  2474: "Buenos Aires",
  2475: "Buenos Aires",
  2477: "Buenos Aires",
  2478: "Buenos Aires",
  2923: "Buenos Aires",
  2924: "Buenos Aires",
  2925: "Buenos Aires",
  2926: "Buenos Aires",
  2927: "Buenos Aires",
  2928: "Buenos Aires",
  2929: "Buenos Aires",
  2932: "Buenos Aires",
  2933: "Buenos Aires",
  2934: "Buenos Aires",
  2935: "Buenos Aires",
  2936: "Buenos Aires",

  // ── Catamarca ──
  383: "Catamarca",
  3832: "Catamarca",
  3833: "Catamarca",
  3835: "Catamarca",
  3837: "Catamarca",
  3838: "Catamarca",

  // ── Chaco ──
  362: "Chaco",
  364: "Chaco",
  3722: "Chaco",
  3725: "Chaco",
  3731: "Chaco",
  3735: "Chaco",

  // ── Chubut ──
  280: "Chubut",
  297: "Chubut",
  2945: "Chubut",
  2965: "Chubut",

  // ── Córdoba ──
  351: "Córdoba",
  353: "Córdoba",
  358: "Córdoba",
  3521: "Córdoba",
  3522: "Córdoba",
  3524: "Córdoba",
  3525: "Córdoba",
  3541: "Córdoba",
  3542: "Córdoba",
  3543: "Córdoba",
  3544: "Córdoba",
  3546: "Córdoba",
  3547: "Córdoba",
  3548: "Córdoba",
  3549: "Córdoba",
  3562: "Córdoba",
  3563: "Córdoba",
  3564: "Córdoba",
  3571: "Córdoba",
  3572: "Córdoba",
  3573: "Córdoba",
  3574: "Córdoba",
  3576: "Córdoba",
  3582: "Córdoba",
  3583: "Córdoba",
  3585: "Córdoba",

  // ── Corrientes ──
  379: "Corrientes",
  3772: "Corrientes",
  3773: "Corrientes",
  3774: "Corrientes",
  3775: "Corrientes",
  3777: "Corrientes",
  3781: "Corrientes",
  3782: "Corrientes",

  // ── Entre Ríos ──
  343: "Entre Ríos",
  345: "Entre Ríos",
  3435: "Entre Ríos",
  3436: "Entre Ríos",
  3437: "Entre Ríos",
  3438: "Entre Ríos",
  3442: "Entre Ríos",
  3443: "Entre Ríos",
  3444: "Entre Ríos",
  3445: "Entre Ríos",
  3446: "Entre Ríos",
  3447: "Entre Ríos",

  // ── Formosa ──
  370: "Formosa",
  3711: "Formosa",
  3715: "Formosa",
  3716: "Formosa",
  3718: "Formosa",

  // ── Jujuy ──
  388: "Jujuy",
  3885: "Jujuy",
  3886: "Jujuy",
  3887: "Jujuy",
  3888: "Jujuy",

  // ── La Pampa ──
  2302: "La Pampa",
  2952: "La Pampa",
  2953: "La Pampa",
  2954: "La Pampa",

  // ── La Rioja ──
  380: "La Rioja",
  3821: "La Rioja",
  3825: "La Rioja",
  3827: "La Rioja",

  // ── Mendoza ──
  260: "Mendoza",
  261: "Mendoza",
  263: "Mendoza",
  2622: "Mendoza",
  2624: "Mendoza",
  2625: "Mendoza",
  2626: "Mendoza",

  // ── Misiones ──
  376: "Misiones",
  3751: "Misiones",
  3754: "Misiones",
  3755: "Misiones",
  3756: "Misiones",
  3757: "Misiones",
  3758: "Misiones",

  // ── Neuquén ──
  299: "Neuquén",
  2942: "Neuquén",
  2948: "Neuquén",
  2972: "Neuquén",

  // ── Río Negro ──
  294: "Río Negro",
  298: "Río Negro",
  2920: "Río Negro",
  2931: "Río Negro",
  2940: "Río Negro",
  2941: "Río Negro",
  2944: "Río Negro",
  2946: "Río Negro",

  // ── Salta ──
  387: "Salta",
  3861: "Salta",
  3868: "Salta",
  3873: "Salta",
  3877: "Salta",
  3878: "Salta",

  // ── San Juan ──
  264: "San Juan",
  2646: "San Juan",
  2647: "San Juan",
  2648: "San Juan",

  // ── San Luis ──
  266: "San Luis",
  2651: "San Luis",
  2655: "San Luis",
  2656: "San Luis",
  2657: "San Luis",

  // ── Santa Cruz ──
  2902: "Santa Cruz",
  2962: "Santa Cruz",
  2963: "Santa Cruz",
  2966: "Santa Cruz",

  // ── Santa Fe ──
  341: "Santa Fe",
  342: "Santa Fe",
  3401: "Santa Fe",
  3402: "Santa Fe",
  3404: "Santa Fe",
  3405: "Santa Fe",
  3406: "Santa Fe",
  3407: "Santa Fe",
  3408: "Santa Fe",
  3409: "Santa Fe",
  3460: "Santa Fe",
  3462: "Santa Fe",
  3463: "Santa Fe",
  3464: "Santa Fe",
  3465: "Santa Fe",
  3466: "Santa Fe",
  3467: "Santa Fe",
  3468: "Santa Fe",
  3471: "Santa Fe",
  3476: "Santa Fe",
  3482: "Santa Fe",
  3483: "Santa Fe",
  3489: "Santa Fe",
  3491: "Santa Fe",
  3492: "Santa Fe",
  3493: "Santa Fe",
  3496: "Santa Fe",
  3497: "Santa Fe",

  // ── Santiago del Estero ──
  385: "Santiago del Estero",
  3841: "Santiago del Estero",
  3843: "Santiago del Estero",
  3844: "Santiago del Estero",
  3845: "Santiago del Estero",

  // ── Tierra del Fuego ──
  2901: "Tierra del Fuego",
  2964: "Tierra del Fuego",

  // ── Tucumán ──
  381: "Tucumán",
  3863: "Tucumán",
  3865: "Tucumán",
  3867: "Tucumán",
};

// Deja el número nacional (área + abonado, 10 dígitos) sin prefijos de marcado.
function normalizar(valor) {
  let n = String(valor ?? "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("54")) n = n.slice(2); // país
  if (n.startsWith("0")) n = n.slice(1); // marcado nacional (0388…)
  if (n.startsWith("9")) n = n.slice(1); // móvil (el que usa WhatsApp)
  return n;
}

// Saca el `15` que la forma vieja intercala entre el área y el abonado.
function sinQuince(resto) {
  return resto.startsWith("15") ? resto.slice(2) : resto;
}

/**
 * Descompone el número en `{ provincia, area, abonado }`, o `null` si no se
 * puede determinar (número extranjero, vacío, o código de área fuera de la
 * tabla).
 *
 * Acepta cualquiera de los formatos que aparecen en la base: `5493886567587`,
 * `03886567587`, `388 656-7587`, `3886567587`.
 */
export function provinciaDeTelefono(valor) {
  const n = normalizar(valor);
  if (n.length < 6) return null;

  for (const largo of [2, 3, 4]) {
    const area = n.slice(0, largo);
    const provincia = AREAS[area];
    if (!provincia) continue;
    const abonado = sinQuince(n.slice(largo));
    // El resto tiene que alcanzar para un número de abonado real; así un
    // prefijo corto no se "come" un número mal formado.
    if (abonado.length < 6) continue;
    return { provincia, area, abonado };
  }
  return null;
}

/**
 * El número como se escribe dentro del país: código de área, espacio, y el
 * abonado con guión antes de los últimos cuatro dígitos.
 *
 *   5493886567587 → "388 656-7587"
 *   5491145678901 → "11 4567-8901"
 *   5492954123456 → "2954 12-3456"
 *
 * Si el número no se puede descomponer (extranjero, o área desconocida) se
 * devuelve tal cual vino: es preferible mostrarlo entero que recortarlo mal.
 */
export function telefonoLocal(valor) {
  const d = provinciaDeTelefono(valor);
  if (!d) return String(valor ?? "").trim() || null;
  const { area, abonado } = d;
  const conGuion = abonado.length > 4 ? `${abonado.slice(0, -4)}-${abonado.slice(-4)}` : abonado;
  return `${area} ${conGuion}`;
}

// Las jurisdicciones que la tabla puede devolver (para tests y filtros).
export const PROVINCIAS = [...new Set(Object.values(AREAS))].sort();
