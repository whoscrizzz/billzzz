import { useLayoutEffect, useRef } from 'react';

interface Props {
  amount: string;
  currency: string;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (currency: string) => void;
}

/** Deja solo dígitos y el primer punto decimal — lo que el padre guarda como
 *  `amount` (RegisterPanel/EditSubscriptionModal lo parsean con parseFloat). */
function stripToRawNumber(display: string): string {
  const cleaned = display.replace(/[^0-9.]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot === -1) return cleaned;
  return cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
}

/** Versión con comas de miles para mostrar en el input — separa la parte
 *  entera de la decimal a mano (no Intl.NumberFormat) porque acá no hay
 *  currency: es solo el separador de miles, sin redondear ni completar
 *  decimales mientras el usuario todavía está escribiendo. */
function formatWithThousands(raw: string): string {
  const [intPart, ...rest] = raw.split('.');
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length > 0 ? `${withCommas}.${rest.join('')}` : withCommas;
}

/** Cuántos dígitos hay en `text` antes del índice `pos` — las comas no cuentan,
 *  así que este conteo es estable sea cual sea el valor con o sin formatear. */
function digitsBefore(text: string, pos: number): number {
  let count = 0;
  for (let i = 0; i < pos && i < text.length; i++) {
    if (text[i] !== ',') count++;
  }
  return count;
}

/** Índice en `formatted` justo después del n-ésimo dígito (saltando comas). */
function indexAfterDigits(formatted: string, n: number): number {
  if (n <= 0) return 0;
  let count = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] !== ',') {
      count++;
      if (count === n) return i + 1;
    }
  }
  return formatted.length;
}

/** Al escribir "79000" el input debe mostrar "79,000" sin que el cursor salte al final.
 *  `typedValue` es el valor crudo del DOM justo después de la tecla (puede traer comas
 *  viejas sin tocar), `caretPosBefore` la posición del cursor en ESE string. Se cuentan
 *  los dígitos antes del cursor ahí (las comas no cuentan), se formatea `rawTyped`, y se
 *  ubica el cursor después de esa misma cantidad de dígitos en el resultado. */
function reformatWithCursor(
  typedValue: string,
  rawTyped: string,
  caretPosBefore: number
): { display: string; caretPosAfter: number } {
  const digitsCount = digitsBefore(typedValue, caretPosBefore);
  const display = formatWithThousands(rawTyped);
  return { display, caretPosAfter: indexAfterDigits(display, digitsCount) };
}

export function CurrencyAmountInput({ amount, currency, onAmountChange, onCurrencyChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingCaretRef = useRef<number | null>(null);

  // El value del input se recalcula desde `amount` en cada render (controlado) — el
  // navegador manda el cursor al final cada vez que el value cambia por código, así
  // que hay que recolocarlo a mano después de que React ya pintó el nuevo texto.
  useLayoutEffect(() => {
    if (pendingCaretRef.current != null && inputRef.current) {
      inputRef.current.setSelectionRange(pendingCaretRef.current, pendingCaretRef.current);
      pendingCaretRef.current = null;
    }
  }, [amount]);

  return (
    <div className="amount-currency-row">
      <label className="amount-currency-label">
        <span className="field-label-text">
          Monto <span className="field-required">*</span>
        </span>
        <input
          ref={inputRef}
          required
          type="text"
          inputMode="decimal"
          className="amount-currency-input"
          value={formatWithThousands(amount)}
          onChange={(e) => {
            const typedValue = e.target.value;
            const caretPosBefore = e.target.selectionStart ?? typedValue.length;
            const rawTyped = stripToRawNumber(typedValue);
            const { caretPosAfter } = reformatWithCursor(typedValue, rawTyped, caretPosBefore);
            pendingCaretRef.current = caretPosAfter;
            onAmountChange(rawTyped);
          }}
          placeholder="$ 0.00"
        />
      </label>
      <div className="currency-toggle" role="group" aria-label="Moneda">
        {(['MXN', 'USD'] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={`currency-toggle-btn ${currency === c ? 'active' : ''}`}
            aria-pressed={currency === c}
            onClick={() => onCurrencyChange(c)}
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}
