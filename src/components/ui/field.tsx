import { cn } from "@/lib/utils";

/**
 * Form field primitives.
 *
 * One definition of what an input looks like, shared by the public contact
 * form and every admin form: otherwise "the form style" drifts into three
 * slightly different border radii within a month.
 */

export function fieldClass(error?: string, className?: string) {
  return cn(
    "h-12 w-full rounded-xl border bg-bg px-4 text-[0.95rem] text-ink shadow-[inset_0_1px_2px_rgba(11,34,66,0.06)] placeholder:text-ink-faint focus:outline-none",
    error
      ? "border-danger focus:border-danger"
      : "border-line focus:border-accent",
    className,
  );
}

export function Field({
  label,
  error,
  htmlFor,
  hint,
  className,
  children,
}: {
  label: string;
  error?: string;
  htmlFor: string;
  /** Shown when there is no error: units, formats, why the field exists. */
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-2 block text-sm font-medium text-ink"
      >
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-sm text-ink-faint">{hint}</p>
      )}
    </div>
  );
}
