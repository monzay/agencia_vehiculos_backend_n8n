// Solo para tests: nota de voz ogg mínima con la duración pedida (página "OggS"
// con la posición final en muestras de 48 kHz).
export function notaDeVoz(segundos) {
  const pagina = Buffer.alloc(27);
  pagina.write("OggS", 0);
  pagina.writeBigUInt64LE(BigInt(Math.round(segundos * 48_000)), 6);
  return Buffer.concat([pagina, Buffer.alloc(1000, 7), pagina]);
}
