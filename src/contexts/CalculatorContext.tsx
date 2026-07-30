import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface CalculatorOpenOptions {
  /** Valor inicial a mostrar al abrir (ej. el monto ya escrito en la hoja de registro). */
  initialValue?: number;
  onUseAsAmount?: (value: number) => void;
  onUseAsBudget?: (value: number) => void;
}

interface CalculatorContextValue {
  isOpen: boolean;
  options: CalculatorOpenOptions | null;
  openCalculator: (options?: CalculatorOpenOptions) => void;
  closeCalculator: () => void;
}

const CalculatorContext = createContext<CalculatorContextValue | null>(null);

/** Levanta el estado de FloatingCalculator para que sea disparable desde cualquier pantalla (topbar, Ajustes, hoja de registro) con el mismo panel flotante. */
export function CalculatorProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<CalculatorOpenOptions | null>(null);

  const openCalculator = useCallback((next?: CalculatorOpenOptions) => {
    setOptions(next ?? null);
    setIsOpen(true);
  }, []);

  const closeCalculator = useCallback(() => {
    setIsOpen(false);
    setOptions(null);
  }, []);

  const value = useMemo(
    () => ({ isOpen, options, openCalculator, closeCalculator }),
    [isOpen, options, openCalculator, closeCalculator]
  );

  return <CalculatorContext.Provider value={value}>{children}</CalculatorContext.Provider>;
}

export function useCalculator(): CalculatorContextValue {
  const ctx = useContext(CalculatorContext);
  if (!ctx) throw new Error('useCalculator debe usarse dentro de CalculatorProvider');
  return ctx;
}
