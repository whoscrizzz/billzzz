import { useEffect, useRef, useState } from 'react';
import { ActionIcon } from './ActionIcon';

type Operator = '+' | '−' | '×' | '÷';

interface PendingOp {
  value: number;
  op: Operator;
}

const MAX_DIGITS = 15;
const MAX_HISTORY = 6;

function calculate(a: number, b: number, op: Operator): number {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? NaN : a / b;
  }
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  const rounded = parseFloat(n.toFixed(10));
  return rounded.toString();
}

/** Agrega separadores de miles al string crudo que se está tecleando sin alterar su valor. */
function prettyDisplay(raw: string): string {
  if (raw === 'Error') return raw;
  const negative = raw.startsWith('-');
  const unsigned = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = unsigned.split('.');
  const groupedInt = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const grouped = decPart !== undefined ? `${groupedInt}.${decPart}` : groupedInt;
  return negative ? `-${grouped}` : grouped;
}

export function FloatingCalculator() {
  const [open, setOpen] = useState(false);
  const [display, setDisplay] = useState('0');
  const [pending, setPending] = useState<PendingOp | null>(null);
  const [overwrite, setOverwrite] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const tapeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tapeRef.current) tapeRef.current.scrollTop = tapeRef.current.scrollHeight;
  }, [history]);

  const inputDigit = (digit: string) => {
    setDisplay((prev) => {
      if (overwrite || prev === 'Error') return digit;
      if (prev.replace('-', '').replace('.', '').length >= MAX_DIGITS) return prev;
      if (prev === '0') return digit;
      return prev + digit;
    });
    setOverwrite(false);
  };

  const inputDecimal = () => {
    setDisplay((prev) => {
      if (overwrite || prev === 'Error') return '0.';
      if (prev.includes('.')) return prev;
      return `${prev}.`;
    });
    setOverwrite(false);
  };

  const clearAll = () => {
    setDisplay('0');
    setPending(null);
    setOverwrite(true);
  };

  const backspace = () => {
    setDisplay((prev) => {
      if (overwrite || prev === 'Error') return '0';
      const next = prev.slice(0, -1);
      return next === '' || next === '-' ? '0' : next;
    });
  };

  const toggleSign = () => {
    setDisplay((prev) => {
      if (prev === '0' || prev === 'Error') return prev;
      return prev.startsWith('-') ? prev.slice(1) : `-${prev}`;
    });
  };

  const percent = () => {
    setDisplay((prev) => {
      if (prev === 'Error') return prev;
      return formatNumber(parseFloat(prev) / 100);
    });
    setOverwrite(true);
  };

  const applyOperator = (op: Operator) => {
    const current = parseFloat(display === 'Error' ? '0' : display);
    if (pending && !overwrite) {
      const result = calculate(pending.value, current, pending.op);
      setDisplay(formatNumber(result));
      setPending({ value: result, op });
    } else {
      setPending({ value: current, op });
    }
    setOverwrite(true);
  };

  const equals = () => {
    if (!pending) return;
    const current = parseFloat(display === 'Error' ? '0' : display);
    const result = calculate(pending.value, current, pending.op);
    setHistory((prev) =>
      [
        ...prev,
        `${formatNumber(pending.value)} ${pending.op} ${formatNumber(current)} = ${formatNumber(result)}`,
      ].slice(-MAX_HISTORY)
    );
    setDisplay(formatNumber(result));
    setPending(null);
    setOverwrite(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        className="fab-calculator"
        aria-label="Abrir calculadora"
        title="Calculadora"
        onClick={() => setOpen(true)}
      >
        <ActionIcon name="calculator" />
      </button>
    );
  }

  return (
    <section className="calculator-panel" aria-label="Calculadora">
      <header className="calculator-panel-head">
        <span className="calculator-panel-title">Calculadora</span>
        <button
          type="button"
          className="calculator-panel-close"
          aria-label="Cerrar calculadora"
          onClick={() => setOpen(false)}
        >
          <ActionIcon name="close" />
        </button>
      </header>

      {history.length > 0 && (
        <div className="calculator-tape" ref={tapeRef}>
          {history.map((line, i) => (
            <p key={i} className="calculator-tape-line">
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="calculator-display">{prettyDisplay(display)}</div>

      <div className="calculator-grid">
        <button type="button" className="calc-btn calc-btn-fn" onClick={clearAll}>
          AC
        </button>
        <button type="button" className="calc-btn calc-btn-fn" onClick={backspace}>
          ⌫
        </button>
        <button type="button" className="calc-btn calc-btn-fn" onClick={percent}>
          %
        </button>
        <button type="button" className="calc-btn calc-btn-op" onClick={() => applyOperator('÷')}>
          ÷
        </button>

        <button type="button" className="calc-btn" onClick={() => inputDigit('7')}>
          7
        </button>
        <button type="button" className="calc-btn" onClick={() => inputDigit('8')}>
          8
        </button>
        <button type="button" className="calc-btn" onClick={() => inputDigit('9')}>
          9
        </button>
        <button type="button" className="calc-btn calc-btn-op" onClick={() => applyOperator('×')}>
          ×
        </button>

        <button type="button" className="calc-btn" onClick={() => inputDigit('4')}>
          4
        </button>
        <button type="button" className="calc-btn" onClick={() => inputDigit('5')}>
          5
        </button>
        <button type="button" className="calc-btn" onClick={() => inputDigit('6')}>
          6
        </button>
        <button type="button" className="calc-btn calc-btn-op" onClick={() => applyOperator('−')}>
          −
        </button>

        <button type="button" className="calc-btn" onClick={() => inputDigit('1')}>
          1
        </button>
        <button type="button" className="calc-btn" onClick={() => inputDigit('2')}>
          2
        </button>
        <button type="button" className="calc-btn" onClick={() => inputDigit('3')}>
          3
        </button>
        <button type="button" className="calc-btn calc-btn-op" onClick={() => applyOperator('+')}>
          +
        </button>

        <button type="button" className="calc-btn calc-btn-fn" onClick={toggleSign}>
          +/-
        </button>
        <button type="button" className="calc-btn" onClick={() => inputDigit('0')}>
          0
        </button>
        <button type="button" className="calc-btn" onClick={inputDecimal}>
          .
        </button>
        <button type="button" className="calc-btn calc-btn-eq" onClick={equals}>
          =
        </button>
      </div>
    </section>
  );
}
