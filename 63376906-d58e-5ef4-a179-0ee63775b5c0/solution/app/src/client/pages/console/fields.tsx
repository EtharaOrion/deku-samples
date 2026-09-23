/**
 * The controls a form is built from: one text, number or date field, and one
 * choice whose first option is a placeholder rather than a default.
 */

import type { JSX } from 'preact';

export interface FieldSpec {
  name: string;
  label: string;
  kind: 'text' | 'integer' | 'date';
}

export function Field({
  spec,
  value,
  onSet,
}: {
  spec: FieldSpec;
  value: string;
  onSet: (name: string, next: string) => void;
}): JSX.Element {
  const id = `intake-${spec.name}`;
  return (
    <div class="field">
      <label class="field__label" for={id}>
        {spec.label}
      </label>
      <input
        id={id}
        name={spec.name}
        class="field__control"
        type={spec.kind === 'date' ? 'date' : spec.kind === 'integer' ? 'number' : 'text'}
        step={spec.kind === 'integer' ? 1 : undefined}
        value={value}
        onInput={(event) => onSet(spec.name, (event.currentTarget as HTMLInputElement).value)}
      />
    </div>
  );
}

interface Option {
  value: string;
  label: string;
}

export function Choice({
  name,
  label,
  placeholder,
  options,
  value,
  onSet,
}: {
  name: string;
  label: string;
  placeholder: string;
  options: Option[];
  value: string;
  onSet: (name: string, next: string) => void;
}): JSX.Element {
  const id = `intake-${name}`;
  return (
    <div class="field">
      <label class="field__label" for={id}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        class="field__control"
        value={value}
        onChange={(event) => onSet(name, (event.currentTarget as HTMLSelectElement).value)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
