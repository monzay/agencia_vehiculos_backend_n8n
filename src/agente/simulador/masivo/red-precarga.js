// Se precarga con `node --import` antes de cargar cualquier código del backend: corta la salida a
// internet del proceso (solo deja conectar a la máquina local) y deja la barrera a mano para que
// el script de simulación lea, al final, cuántos intentos de salir hubo.
import { cortarRed } from "./red.js";

globalThis.__RED_BARRERA__ = cortarRed();
globalThis.__RED_CORTADA__ = true;
