interface Props {
  amount: string;
  currency: string;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (currency: string) => void;
}

export function CurrencyAmountInput({
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
}: Props) {
  return (
    <div className="amount-currency-row">
      <label className="amount-currency-label">
        Monto
        <input
          required
          type="number"
          min="0"
          step="0.01"
          className="amount-currency-input"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          placeholder="0.00"
        />
      </label>
      <div className="currency-toggle" role="group" aria-label="Moneda">
        {(["MXN", "USD"] as const).map((c) => (
          <button
            key={c}
            type="button"
            className={`currency-toggle-btn ${currency === c ? "active" : ""}`}
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
