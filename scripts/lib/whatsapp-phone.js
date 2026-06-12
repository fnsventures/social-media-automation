export function normalizeWhatsAppDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function phoneMatchesBusiness(connectedDigits, businessNumber) {
  const connected = normalizeWhatsAppDigits(connectedDigits);
  const expected = normalizeWhatsAppDigits(businessNumber);
  if (!connected || !expected) return false;
  return connected === expected || connected.endsWith(expected.slice(-10));
}

export function formatPairingCode(code) {
  const value = String(code ?? "").replace(/\W/g, "").toUpperCase();
  return value.length === 8 ? `${value.slice(0, 4)}-${value.slice(4)}` : value;
}
