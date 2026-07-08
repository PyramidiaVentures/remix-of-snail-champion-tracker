import { forwardRef } from "react";

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  suffix?: string;
  hint?: string;
}

export const NumberField = forwardRef<HTMLInputElement, Props>(function NumberField(
  { label, suffix, hint, className, ...rest },
  ref,
) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
      </span>
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        step="0.1"
        className={`num-input ${className ?? ""}`}
        {...rest}
      />
      {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
});
