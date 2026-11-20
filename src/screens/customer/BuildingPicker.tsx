'use client'

import { useState } from 'react'
import { Button, Select, TextInput } from '@/components/ui'
import { proposeBuilding } from '@/proto/logic'
import { run } from '@/proto/store'
import { hhmm } from '@/proto/time'
import { useApp } from '@/proto/useApp'

/** Pick an approved building, or propose one that is not listed (BR-12, BR-16, CN-11). */
export function BuildingPicker({ value, onChange, id }: { value: string; onChange: (id: string) => void; id: string }) {
  const { s, m } = useApp()
  const [proposing, setProposing] = useState(false)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const options = s.buildings.filter((b) => b.state === 'approved' || (b.state === 'pending' && (b.proposedBy === s.me || b.id === value)))
  const current = s.buildings.find((b) => b.id === value)

  return (
    <div className="flex flex-col gap-2">
      <Select label={m.cart.building} id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.state === 'pending' ? ` (${m.cart.pending})` : b.deliveryTime !== null ? ` · ${hhmm(b.deliveryTime)}` : ''}
          </option>
        ))}
      </Select>
      {current?.state === 'pending' && <p className="text-sm text-turmeric-ink">{m.cart.proposeNote}</p>}
      {proposing ? (
        <div className="flex flex-col gap-2 rounded-lg bg-tray p-3">
          <TextInput label={m.cart.proposeName} value={name} onChange={(e) => setName(e.target.value)} />
          <TextInput label={m.cart.proposeAddress} value={address} onChange={(e) => setAddress(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              disabled={!name.trim()}
              onClick={() => {
                const r = run((st) => proposeBuilding(st, name, address))
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
