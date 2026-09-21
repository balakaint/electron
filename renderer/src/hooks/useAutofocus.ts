import { useEffect, useRef } from 'react';

// Same behaviour as the declarative `autoFocus` prop — every call site
// this replaces only ever mounts in direct response to the user's own
// click ("edit this", "add one"), never on initial page load, which is
// the actual case jsx-a11y/no-autofocus warns about. An imperative
// .focus() in an effect reads as deliberate to the linter (and to the
// next person editing this file) where the bare prop didn't.
export function useAutofocus<T extends HTMLElement>(when: boolean = true) {
  const ref = useRef<T>(null);
  // Deliberately [when], not []: every call site here lives in a
  // component that mounts once and toggles an "editing"/"composing"
  // flag internally (the input itself mounts and unmounts, the
  // component around it doesn't) — an empty dep array would fire this
  // effect at the PARENT's mount, while `ref.current` is still null,
  // and never again.
  useEffect(() => {
    if (when) ref.current?.focus();
  }, [when]);
  return ref;
}
