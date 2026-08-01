import { useEffect, useRef, useState } from 'react';
import type { Subscription } from '../types/subscription';
import { formatMoney } from '../lib/format-money';
import { daysRemainingInTrash } from '../lib/trash';

interface Props {
  trashed: Subscription[];
  onRestore: (id: string) => Promise<void>;
  onClose: () => void;
}

export function TrashPanel({ trashed, onRestore, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const handleRestore = async (id: string) => {
    setRestoringId(id);
    try {
      await onRestore(id);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-card">
        <h3>Papelera</h3>
        {trashed.length === 0 ? (
          <p className="panel-hint">
            No hay pagos en la papelera. Los que elimines aparecen aquí durante 30 días.
          </p>
        ) : (
          <ul className="completed-list">
            {trashed.map((sub) => (
              <li key={sub.id} className="completed-row">
                <div className="completed-row-main">
                  <p className="completed-name">{sub.name}</p>
                  <p className="completed-meta">
                    {formatMoney(sub.amount, sub.currency)}
                    {sub.trashed_at &&
                      ` · se borra en ${daysRemainingInTrash(sub.trashed_at)} día${daysRemainingInTrash(sub.trashed_at) === 1 ? '' : 's'}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={restoringId === sub.id}
                  onClick={() => void handleRestore(sub.id)}
                >
                  {restoringId === sub.id ? 'Restaurando…' : 'Restaurar'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="form-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>
    </dialog>
  );
}
