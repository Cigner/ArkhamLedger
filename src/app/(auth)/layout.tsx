/**
 * Layout for the unauthenticated screens.
 *
 * A single centred card with no navigation: there is nowhere else to go until
 * the visitor has a session, and offering links would only invite them to
 * discover which routes exist.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl tracking-[--tracking-display] text-text-primary">
            Arkham Ledger
          </p>
          <p className="mt-1 font-ornament text-lg text-text-muted">
            That is not dead which can eternal lie
          </p>
        </div>
        {children}
      </div>
    </div>
  )
}
