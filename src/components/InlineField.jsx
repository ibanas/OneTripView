import { useEffect, useRef, useState } from 'react';

/**
 * Click-to-edit field. Renders a read view until clicked, then a native
 * input/textarea/date/time control that commits on blur or Enter and cancels
 * on Escape.
 *
 * Props:
 *  value       current string value
 *  onSave(v)   called with the trimmed new value when it changes
 *  as          'text' | 'textarea' | 'date' | 'time'
 *  display     optional (value) => string for the read view
 *  placeholder shown (muted) when value is empty
 *  className   applied to the read view text
 *  inputClassName extra classes for the editing control
 */
export default function InlineField({
  value,
  onSave,
  as = 'text',
  display,
  placeholder = 'Add…',
  className = '',
  inputClassName = '',
  ariaLabel,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef(null);

  useEffect(() => {
    if (editing && ref.current) {
      ref.current.focus();
      if (ref.current.select && as !== 'date' && as !== 'time') {
        ref.current.select();
      }
    }
  }, [editing, as]);

  // Keep draft in sync if the value changes from outside while not editing.
  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = (draft ?? '').trim();
    if (next !== (value ?? '')) onSave(next);
  };

  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation(); // don't let Escape bubble to a parent modal's close handler
      cancel();
    } else if (e.key === 'Enter' && as !== 'textarea') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      commit();
    }
  };

  if (editing) {
    const common = {
      ref,
      value: draft,
      onChange: (e) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown,
      'aria-label': ariaLabel,
      className: `inline-input w-full ${inputClassName}`,
    };
    if (as === 'textarea') {
      return <textarea {...common} rows={2} />;
    }
    return <input {...common} type={as === 'date' || as === 'time' ? as : 'text'} />;
  }

  const hasValue = value !== null && value !== undefined && value !== '';
  const shown = hasValue ? (display ? display(value) : value) : placeholder;

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={ariaLabel}
      className={`text-left cursor-text rounded-sm hover:bg-sky-50 hover:ring-1 hover:ring-sky-100 transition-colors ${
        hasValue ? '' : 'text-slate-400 italic'
      } ${className}`}
    >
      {shown}
    </button>
  );
}
