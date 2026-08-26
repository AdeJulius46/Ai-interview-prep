/** A single named prop combination for a component, used to drive snapshot + a11y tests. */
export interface Fixture<P> {
  /** Short, unique, human-readable name for this state, e.g. "disabled" or "with-aside". */
  name: string;
  props: P;
}
