interface Props {
  onClick: () => void;
}

/** Botón flotante que reemplaza al tab "Registrar" del nav — abre RegisterPanel
 *  como hoja modal en vez de navegar a una página completa. */
export function AddFab({ onClick }: Props) {
  return (
    <button
      type="button"
      className="add-fab"
      aria-label="Registrar un pago nuevo"
      onClick={onClick}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
