import { customAlphabet } from 'nanoid';

// Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/l) para códigos fáceis de digitar/ler em voz alta.
const alphabet = '23456789abcdefghjkmnpqrstuvwxyz';
const generate = customAlphabet(alphabet, 10);

/** Gera um novo código de sala no formato xxx-xxx-xxx (estilo Google Meet). */
export function generateRoomId(): string {
  const raw = generate();
  return `${raw.slice(0, 3)}-${raw.slice(3, 6)}-${raw.slice(6, 9)}`;
}

/** Normaliza uma entrada de usuário (link colado ou código digitado) para um roomId. */
export function normalizeRoomInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Se for um link completo, extrai o segmento após /sala/
  try {
    if (trimmed.includes('/sala/')) {
      const url = trimmed.includes('://') ? new URL(trimmed) : new URL(`https://x${trimmed}`);
      const parts = url.pathname.split('/sala/');
      if (parts[1]) return sanitizeCode(parts[1]);
    }
  } catch {
    // não era uma URL válida, segue para tratar como código puro
  }

  return sanitizeCode(trimmed);
}

function sanitizeCode(code: string): string | null {
  const cleaned = code
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/^-+|-+$/g, '');
  return cleaned.length >= 4 ? cleaned : null;
}
