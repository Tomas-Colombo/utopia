'use client'

import {
  forwardRef,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type InputHTMLAttributes,
} from 'react'

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode'> {
  invalid?: boolean
  /**
   * Group the value in thousands while typing ("2.000"). Amounts are hard to
   * read without it once they pass four digits.
   *
   * Grouping forces `type="text"` — `type="number"` rejects a grouped value —
   * so `min`/`max`/`step` are dropped. `onChange` still receives the plain
   * number string ("2000.5"), so callers keep their existing state shape.
   */
  thousands?: boolean
  /** min/max/step map straight to native `<input type="number">` props. */
}

/** "2000.5" → "2.000,5" */
function group(raw: string): string {
  if (raw === '') return ''
  const negative = raw.startsWith('-')
  const [entera = '', ...decimales] = (negative ? raw.slice(1) : raw).split('.')
  const decimal = decimales.length > 0 ? decimales.join('') : null
  const agrupada = entera.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${agrupada}${decimal === null ? '' : `,${decimal}`}`
}

/** "2.000,5" → "2000.5" */
function ungroup(display: string): string {
  const negative = display.trimStart().startsWith('-')
  const [entera = '', ...decimales] = display.replace(/[^\d,]/g, '').split(',')
  const decimal = decimales.length > 0 ? decimales.join('') : null
  return `${negative ? '-' : ''}${entera}${decimal === null ? '' : `.${decimal}`}`
}

const CLASS_NAME =
  'w-full rounded-md border border-control-line bg-control px-3 py-2 text-[13.5px] text-ink transition-colors placeholder:text-dim hover:border-rosa focus:outline-none focus-visible:border-rosa focus-visible:ring-2 focus-visible:ring-rosa-bg disabled:opacity-50 aria-[invalid=true]:border-alerta-ink'

/**
 * Numeric input with `inputMode="decimal"` (better mobile keypad) and
 * native `type="number"` for browser validation. Callers should still
 * validate on the server — this only helps the UX.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput(
    {
      className = '',
      invalid,
      thousands,
      value,
      onChange,
      min,
      max,
      step,
      'aria-invalid': ariaInvalid,
      ...rest
    },
    ref,
  ) {
    const isInvalid = invalid || ariaInvalid === true || ariaInvalid === 'true'
    const innerRef = useRef<HTMLInputElement | null>(null)
    // Digits to the left of the caret before reformatting — the separators we
    // insert would otherwise push the caret around mid-edit.
    const caretDigits = useRef<number | null>(null)

    useLayoutEffect(() => {
      const el = innerRef.current
      const target = caretDigits.current
      caretDigits.current = null
      if (!thousands || !el || target === null) return
      let seen = 0
      let pos = 0
      while (pos < el.value.length && seen < target) {
        if (/\d/.test(el.value[pos]!)) seen++
        pos++
      }
      el.setSelectionRange(pos, pos)
    })

    function setRef(node: HTMLInputElement | null) {
      innerRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    }

    function handleGroupedChange(e: ChangeEvent<HTMLInputElement>) {
      const el = e.currentTarget
      const caret = el.selectionStart ?? el.value.length
      caretDigits.current = el.value.slice(0, caret).replace(/\D/g, '').length
      const raw = ungroup(el.value)
      // Callers read `e.target.value` and expect the ungrouped number string.
      onChange?.({
        ...e,
        target: { ...el, value: raw, name: el.name, id: el.id },
      } as unknown as ChangeEvent<HTMLInputElement>)
    }

    if (thousands) {
      return (
        <input
          ref={setRef}
          type="text"
          inputMode="decimal"
          value={group(value == null ? '' : String(value))}
          onChange={handleGroupedChange}
          aria-invalid={isInvalid || undefined}
          data-invalid={isInvalid || undefined}
          className={`${CLASS_NAME} ${className}`}
          {...rest}
        />
      )
    }

    return (
      <input
        ref={setRef}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        aria-invalid={isInvalid || undefined}
        data-invalid={isInvalid || undefined}
        className={`${CLASS_NAME} ${className}`}
        {...rest}
      />
    )
  },
)
