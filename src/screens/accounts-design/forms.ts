// What each account screen asks, the same in every direction (UI16); the directions lay it out.
import type { ExpiredType, Field, ProfileCase, Screen, useT } from './common'

type T = ReturnType<typeof useT>['t']
type F = ReturnType<typeof useT>['f']

export type FieldSpec = {
  field: Field
  label: string
  type?: string
  inputMode?: 'tel' | 'email' | 'text'
  autoComplete?: string
  readOnly?: boolean
  hint?: string
}

export type Form = {
  title: string
  intro?: string
  /** Groups of fields: direction C shows one group per step; the others show them all. */
  steps: FieldSpec[][]
  /** The profile adds the building and language fields after the steps. */
  profile: boolean
  button: string
  google: boolean
  /** Screens linked under the form. */
  links: { screen: Screen; before?: string; label: string }[]
  undecided?: string
  /** A mockup note about the decided part, shown with the undecided one. */
  note?: string
}

export function formOf(screen: Screen, type: ExpiredType, profile: ProfileCase, t: T, f: F): Form {
  const id: FieldSpec = { field: 'id', label: t.id, inputMode: 'email', autoComplete: 'username' }
  const phone: FieldSpec = { field: 'phone', label: t.phone, type: 'tel', inputMode: 'tel', autoComplete: 'tel' }
  const email: FieldSpec = { field: 'email', label: t.email, type: 'email', inputMode: 'email', autoComplete: 'email' }
  const newPassword: FieldSpec = {
    field: 'password',
    label: t.newPassword,
    type: 'password',
    autoComplete: 'new-password',
    hint: t.passwordRule,
  }
  const base = { profile: false, google: false, links: [] as Form['links'] }
  switch (screen) {
    case 'signIn':
      return {
        ...base,
        title: t.signInTitle,
        steps: [[id], [{ field: 'password', label: t.password, type: 'password', autoComplete: 'current-password' }]],
        button: t.signIn,
        google: true,
        links: [
          { screen: 'forgot', label: t.forgotLink },
          { screen: 'signUp', before: t.noAccountYet, label: t.signUp },
        ],
      }
    case 'signUp':
      return {
        ...base,
        title: t.signUpTitle,
        intro: t.signUpIntro,
        steps: [[phone], [email], [{ ...newPassword, label: t.password }]],
        button: t.signUp,
        google: true,
        links: [{ screen: 'signIn', before: t.haveAccount, label: t.signIn }],
      }
    case 'forgot':
      return {
        ...base,
        title: t.forgotTitle,
        intro: t.forgotIntro,
        steps: [[id]],
        button: t.sendReset,
        links: [{ screen: 'signIn', label: t.signIn }],
      }
    case 'reset':
      return { ...base, title: t.resetTitle, intro: t.resetIntro, steps: [[newPassword]], button: t.saveNewPassword }
    case 'expired':
      return {
        ...base,
        title: t.expiredTitle,
        intro: type === 'email_change' ? undefined : t.expiredIntro,
        steps: type === 'email_change' ? [] : [[id]],
        button: t.sendNewLink,
        links: [{ screen: 'signIn', label: t.signIn }],
        undecided: type === 'email_change' ? 'A1, A2, A3' : undefined,
        note: type === 'email_change' ? f.expiredSignedOut : undefined,
      }
    case 'profile': {
      const google = profile === 'google'
      return {
        ...base,
        // A declined building: the notice says what to do (BR-16), so no completion wording.
        title: profile === 'new' || google ? t.completeTitle : t.profileTitle,
        intro: profile === 'new' || google ? t.completeIntro : undefined,
        steps: [
          [{ field: 'name', label: t.name, autoComplete: 'name' }],
          [phone, google ? { ...email, readOnly: true, hint: t.googleEmailNote } : { ...email, hint: t.emailChangeNote }],
        ],
        profile: true,
        button: t.save,
      }
    }
  }
}
