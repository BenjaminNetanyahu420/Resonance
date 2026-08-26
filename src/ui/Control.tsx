interface RangeProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export function RangeControl({ label, value, min, max, step, onChange }: RangeProps) {
  return (
    <label className="control range-control">
      <span>{label}</span>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
      <output>{Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)}</output>
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
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
      <output>{value.toUpperCase()}</output>
    </label>
  );
}

