"use client";

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Form primitives. Every control is wired to a real `<label>` and, when
 * invalid, to a described-by error message so screen readers announce it.
 */

const CONTROL =
  "w-full rounded-xl border bg-white px-3.5 text-sm text-ink-900 " +
  "placeholder:text-ink-500/70 transition-colors " +
  "focus:border-brand-600 focus:ring-2 focus:ring-brand-600/20 focus:outline-none " +
  "disabled:bg-surface-sunken disabled:text-ink-500";

function controlClass(error?: string, extra?: string): string {
  return cn(
    CONTROL,
    error ? "border-red-400" : "border-slate-300",
    extra,
  );
}

interface WrapperProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

function FieldWrapper({
  label,
  htmlFor,
  error,
  hint,
  required,
  children,
  className,
}: WrapperProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-ink-700"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && (
        <p id={`${htmlFor}-hint`} className="text-xs text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={`${htmlFor}-error`}
          role="alert"
          className="text-xs font-medium text-red-600"
        >
          {error}
        </p>
      )}
    </div>
  );
}

interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export function Input({
  label,
  error,
  hint,
  wrapperClassName,
  id,
  required,
  ...rest
}: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <FieldWrapper
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
      className={wrapperClassName}
    >
      <input
        {...rest}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        className={controlClass(error, "h-11")}
      />
    </FieldWrapper>
  );
}

interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  label: string;
  error?: string;
  hint?: string;
  wrapperClassName?: string;
}

export function Textarea({
  label,
  error,
  hint,
  wrapperClassName,
  id,
  required,
  rows = 5,
  ...rest
}: TextareaProps) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <FieldWrapper
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
      className={wrapperClassName}
    >
      <textarea
        {...rest}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        className={controlClass(error, "py-2.5 resize-y")}
      />
    </FieldWrapper>
  );
}

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className"> {
  label: string;
  options: SelectOption[];
  error?: string;
  hint?: string;
  placeholder?: string;
  wrapperClassName?: string;
}

export function Select({
  label,
  options,
  error,
  hint,
  placeholder,
  wrapperClassName,
  id,
  required,
  ...rest
}: SelectProps) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <FieldWrapper
      label={label}
      htmlFor={inputId}
      error={error}
      hint={hint}
      required={required}
      className={wrapperClassName}
    >
      <select
        {...rest}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
        }
        className={controlClass(error, "h-11 pr-8")}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldWrapper>
  );
}

/** Label-less variant used inside compact filter/search bars. */
export function BareSelect({
  label,
  options,
  placeholder,
  ...rest
}: {
  label: string;
  options: SelectOption[];
  placeholder?: string;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">) {
  return (
    <select
      {...rest}
      // No visible label here, so the accessible name comes from aria-label.
      aria-label={label}
      className={controlClass(undefined, "h-11 pr-8")}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
