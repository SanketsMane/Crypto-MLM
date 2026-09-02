/**
 * Shown only while the session is still resolving.
 *
 * Deliberately not a splash: no wordmark, no navy plate, nothing that reads as
 * an application launching. It exists because until `useMe`/`useAdmin` answers
 * we do not know whether this visitor is signed in, so we cannot render the
 * sidebar and header yet — a logged-out visitor would see the console for a
 * moment before being bounced to the login page. A quiet spinner on the normal
 * page background is the honest middle: it says "working" without pretending to
 * be a launch screen.
 *
 * The animation stops on its own for anyone who has asked for reduced motion —
 * globals.css flattens every animation under that query.
 */
export function SessionLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="grid min-h-screen place-items-center bg-canvas">
      <span
        aria-hidden
        className="h-6 w-6 animate-spin rounded-full border-2 border-line-strong border-t-gold"
      />
      <span className="sr-only">{label}</span>
    </div>
  );
}
