'use client'

import { useState } from 'react'
import { Button, Select, TextInput } from '@/components/ui'
import { hhmm } from '@/domain/time'
import { useActions, useApp } from '@/screens/app'

/**
 * Pick an approved building, or propose one that is not listed (BR-12, BR-16, CN-11). On the
 * profile (`placeholder`) the field can be empty, for a new customer or a declined default
 * building, which is never offered (CN-78, AC188); `error` is its message under the field.
 */
export function BuildingPicker({
  value,
  onChange,
  id,
  label,
  placeholder,
  error,
  name: fieldName,
}: {
  value: string
  onChange: (id: string) => void
  id: string
  label?: string
  placeholder?: string
  error?: string
  /** The form field that carries the choice (the profile's Save). */
  name?: string
}) {
  const { s, m } = useApp()
  const { proposeBuilding, pending } = useActions()
  const [proposing, setProposing] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const options = s.buildings.filter((b) => b.state === 'approved' || (b.state === 'pending' && (b.proposedBy === s.me || b.id === value)))
  const current = s.buildings.find((b) => b.id === value)

  return (
    <div className="flex flex-col gap-2">
      <Select
        label={label ?? m.cart.building}
        id={id}
        name={fieldName}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.state === 'pending' ? ` (${m.cart.pending})` : b.deliveryTime !== null ? ` · ${hhmm(b.deliveryTime)}` : ''}
          </option>
        ))}
      </Select>
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-chili">
          {error}
        </p>
      )}
      {current?.state === 'pending' && <p className="text-sm text-turmeric-ink">{m.cart.proposeNote}</p>}
      {proposing ? (
        <div className="flex flex-col gap-2 rounded-lg bg-tray p-3">
          <TextInput label={m.cart.proposeName} value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label={m.cart.proposeAddress} value={address} onChange={(e) => setAddress(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={pending || !name.trim()}
              onClick={async () => {
                const r = await proposeBuilding(name, address)
                if (r.ok && r.id) {
                  onChange(r.id)
                  setProposing(false)
                  setName('')
                  setAddress('')
                }
              }}
            >
              {m.cart.proposeSave}
            </Button>
            <Button variant="ghost" onClick={() => setProposing(false)}>
              {m.detail.discard}
            </Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setProposing(true)} className="self-start text-sm font-semibold text-leaf underline">
          {m.cart.propose}
        </button>
      )}
    </div>
  )
}
