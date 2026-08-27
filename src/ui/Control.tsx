import type { ReactNode } from 'react';

interface RangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  defaultValue?: number;
  title?: string;
  action?: ReactNode;
}

export function RangeControl({ label, value, min, max, step, onChange, defaultValue, title, action }: RangeProps) {
  const decimals = step >= 1 ? 0 : Math.min(3, Math.max(2, String(step).split('.')[1]?.length ?? 2));
  const apply = (next: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(next) ? next : value)));
  return (
    <label className="control range-control" title={title}>
      <span>{label}{action}</span>
      <input
        aria-label={label}
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onDoubleClick={() => defaultValue !== undefined && onChange(defaultValue)}
        onChange={(event) => apply(Number(event.target.value))}
      />
      <input
        className="number-entry"
        aria-label={`${label} exact value`}
        type="number"
        value={Number(value.toFixed(decimals))}
        min={min}
        max={max}
        step={step}
        onChange={(event) => apply(Number(event.target.value))}
      />
    </label>
  );
}

interface ColorProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export function ColorControl({ label, value, onChange }: ColorProps) {
  return (
    <label className="control color-control">
      <span>{label}</span>
      <input aria-label={label} type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      <output>{value.toUpperCase()}</output>
    </label>
  );
}

export function ToggleControl({ label, value, onChange, title }: { label: string; value: boolean; onChange: (value: boolean) => void; title?: string }) {
  return (
    <label className="control toggle-control" title={title}>
      <span>{label}</span>
      <input aria-label={label} type="checkbox" checked={value} onChange={(event) => onChange(event.target.checked)} />
      <output>{value ? 'ON' : 'OFF'}</output>
    </label>
  );
}

export function SelectControl<T extends string>({ label, value, options, onChange, title }: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  title?: string;
}) {
  return (
    <label className="control select-control-wide" title={title}>
      <span>{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value as T)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
