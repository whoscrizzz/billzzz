const WEEKDAYS = [
  { value: '1', label: 'Lun' },
  { value: '2', label: 'Mar' },
  { value: '3', label: 'Mié' },
  { value: '4', label: 'Jue' },
  { value: '5', label: 'Vie' },
  { value: '6', label: 'Sáb' },
  { value: '7', label: 'Dom' },
] as const;

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function WeekdayPills({ value, onChange }: Props) {
  return (
    <div className="weekday-pills" role="group" aria-label="Día de la semana">
      {WEEKDAYS.map((w) => (
        <button
          key={w.value}
          type="button"
          className={`weekday-pill ${value === w.value ? 'active' : ''}`}
          onClick={() => onChange(w.value)}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}

export { WEEKDAYS };
