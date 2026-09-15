'use client';

/**
 * The last boundary — the root layout itself failed.
 *
 * Next replaces the whole document when this renders, so it gets no global
 * stylesheet, no fonts and no theme attribute. Every style here is therefore
 * inline, and the dark variant follows the OS rather than the app's toggle,
 * because the class that toggle sets never reaches this document.
 *
 * If this is on screen, the shell is gone: there is no navigation to offer and
 * no session to trust. The only useful things are a plain explanation, the
 * digest that identifies the failure in the log, and a way back.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <head>
        {/* metadata exports are unsupported in a client boundary; React renders
            the title element into the document head instead. */}
        <title>Something went wrong</title>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          background: '#0B1220',
          color: '#E7ECF3',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        }}
      >
        <main style={{ maxWidth: '30rem', textAlign: 'center' }}>
          <div
            aria-hidden
            style={{
              width: 48, height: 48, margin: '0 auto 20px',
              display: 'grid', placeItems: 'center',
              borderRadius: 12, background: 'rgba(255,122,26,0.12)',
              color: '#FF7A1A', fontSize: 24, lineHeight: 1,
            }}
          >
            !
          </div>

          <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 12px' }}>
            This page could not load
          </h1>

          <p style={{ fontSize: 14, lineHeight: 1.6, margin: '0 0 8px', color: '#A9B4C4' }}>
            Something failed before the page could start. This is a problem loading the
            application, not with your account — nothing has been changed and no money has moved.
          </p>

          <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 24px', color: '#A9B4C4' }}>
            If it keeps happening, contact support and quote the reference below.
          </p>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => retry()}
              style={{
                cursor: 'pointer', border: 0, borderRadius: 10,
                padding: '11px 20px', fontSize: 14, fontWeight: 600,
                background: 'linear-gradient(135deg,#FF7A1A 0%,#E2670A 100%)', color: '#0B1220',
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                borderRadius: 10, padding: '11px 20px', fontSize: 14, fontWeight: 600,
                border: '1px solid rgba(231,236,243,0.18)', color: '#E7ECF3', textDecoration: 'none',
              }}
            >
              Go to the home page
            </a>
          </div>

          {error.digest && (
            <p style={{ marginTop: 24, fontSize: 11, color: '#7C8798', fontFamily: 'ui-monospace, monospace' }}>
              Reference <span style={{ userSelect: 'all', color: '#A9B4C4' }}>{error.digest}</span>
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
