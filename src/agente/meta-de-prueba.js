// Solo para tests: payload como lo manda Meta a un webhook, con un mensaje.
export function payloadMeta(mensaje, { nombre = "Ana", desde = "5493885550101", wamid = "wamid.ABC123" } = {}) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "1021389097314057",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: { phone_number_id: "1129459583593480" },
              contacts: [{ profile: { name: nombre }, wa_id: desde }],
              messages: [{ from: desde, id: wamid, timestamp: "1760000000", ...mensaje }],
            },
          },
        ],
      },
    ],
  };
}
