import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-line bg-panel/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg">📈</span>
          <span className="font-semibold text-gray-100">Crypto Trading Partner</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            href="/"
            className="rounded-md px-3 py-1.5 text-gray-300 hover:bg-line hover:text-white"
          >
            Dashboard
          </Link>
          <Link
            href="/backtest"
            className="rounded-md px-3 py-1.5 text-gray-300 hover:bg-line hover:text-white"
          >
            Backtest
          </Link>
        </nav>
      </div>
    </header>
  );
}
