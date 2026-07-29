/**
 * Minimal auth-only layout (Slice 7, design §5). Centers the login/settings
 * card on the page. `ThemeProvider`/`ThemeToggle` already wrap every route
 * from the root layout (`app/layout.tsx`), so the toggle stays available
 * here without any extra wiring.
 */
export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex flex-1 items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-8 shadow-sm">
        {children}
      </div>
    </div>
  )
}
