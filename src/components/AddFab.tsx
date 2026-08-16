interface Props {
  onClick: () => void;
}

/** Botón flotante que reemplaza al tab "Registrar" del nav — abre RegisterPanel
 *  como hoja modal en vez de navegar a una página completa. Es el único punto
 *  de alta rápida (el "+ Registrar" que vivía junto a Lista/Columnas era
 *  redundante con este mismo botón y se quitó), así que lleva su propia
 *  etiqueta en vez de ser un ícono suelto. */
export function AddFab({ onClick }: Props) {
  return (
    <button
      type="button"
      className="add-fab"
      aria-label="Registrar un pago nuevo"
      onClick={onClick}
    >
      <svg
        width="20"
        height="20"
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
      <span className="add-fab-label">Registrar</span>
    </button>
  );
}
