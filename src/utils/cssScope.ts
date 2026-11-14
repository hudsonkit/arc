/**
 * The class on every Arc component's root element. `lib/arc.css` scopes each
 * of its rules to it (see scripts/scopeCss.mjs), so a host page can load the
 * stylesheet without Arc's tokens, preflight or utilities restyling the host.
 *
 * A host that renders Arc markup somewhere else, for example a portal, can put
 * this class on that container to give it Arc's styles.
 */
export const ARC_ROOT_CLASS = 'arc-root'

/** Join the scope class with a component's own class names. */
export function withArcRoot(...classNames: Array<string | false | null | undefined>): string {
  return [ARC_ROOT_CLASS, ...classNames].filter(Boolean).join(' ')
}
