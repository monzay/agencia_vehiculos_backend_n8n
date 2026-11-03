import { config } from "dotenv";

// El .env manda: una variable vieja de Windows con el mismo nombre no lo pisa.
// Tiene que importarse antes que el resto: varios módulos leen process.env al cargar.
config({ override: true });
