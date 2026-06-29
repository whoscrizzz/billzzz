import type { Subscription } from '../types/subscription';
import type { QuickTemplate, TemplateGroup } from '../lib/quick-templates';
import { TEMPLATE_GROUPS, templatesByGroup } from '../lib/quick-templates';
import { suggestTemplates } from '../lib/template-suggestions';

interface Props {
  subscriptions: Subscription[];
  onSelect: (template: QuickTemplate) => void;
}

export function QuickTemplatePicker({ subscriptions, onSelect }: Props) {
  const suggested = suggestTemplates(subscriptions, 3);

  return (
    <div className="quick-templates">
      <p className="quick-templates-intro">
        Elige un <strong>tipo</strong> de pago — solo rellena nombre y monto.
      </p>

      {suggested.length > 0 && (
        <div className="quick-templates-group quick-templates-suggested">
          <p className="quick-templates-group-label">Sugeridos para ti</p>
          <div className="quick-templates-row">
            {suggested.map((t) => (
              <TemplateChip key={t.id} template={t} onSelect={onSelect} featured />
            ))}
          </div>
        </div>
      )}

      {TEMPLATE_GROUPS.map((g) => (
        <TemplateGroupSection key={g.id} group={g.id} label={g.label} onSelect={onSelect} />
      ))}
    </div>
  );
}

function TemplateChip({
  template,
  onSelect,
  featured,
}: {
  template: QuickTemplate;
  onSelect: (t: QuickTemplate) => void;
  featured?: boolean;
}) {
  return (
    <button
      type="button"
      className={`quick-template-chip ${featured ? 'quick-template-chip-featured' : ''}`}
      onClick={() => onSelect(template)}
      title={template.hint}
    >
      <span className="quick-template-chip-label">{template.label}</span>
      <span className="quick-template-chip-hint">{template.hint}</span>
    </button>
  );
}

function TemplateGroupSection({
  group,
  label,
  onSelect,
}: {
  group: TemplateGroup;
  label: string;
  onSelect: (t: QuickTemplate) => void;
}) {
  const items = templatesByGroup(group);
  if (items.length === 0) return null;

  return (
    <div className="quick-templates-group">
      <p className="quick-templates-group-label">{label}</p>
      <div className="quick-templates-row">
        {items.map((t) => (
          <TemplateChip key={t.id} template={t} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}
