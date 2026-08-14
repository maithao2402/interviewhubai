import Link from 'next/link'

export default function DashboardPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <p>You&apos;re logged in. (Dashboard placeholder — real content comes in a later story.)</p>

      {/* Without this the New Interview page is only reachable by typing the
          URL. Story 5.1 replaces this placeholder with the real dashboard. */}
      <Link href="/interviews/new" className="underline">
        Start a new interview
      </Link>
    </main>
  )
}
