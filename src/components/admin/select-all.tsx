"use client";

/** Checkbox that toggles every `name` checkbox of its form (bulk actions). */
export function SelectAll({ name, label }: { name: string; label: string }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      onChange={(e) => {
        const form = e.currentTarget.form;
        if (!form) return;
        for (const el of form.querySelectorAll<HTMLInputElement>(`input[type="checkbox"][name="${name}"]`)) {
          el.checked = e.currentTarget.checked;
        }
      }}
    />
  );
}
