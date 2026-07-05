"use client";

import Link from "next/link";
import { useState } from "react";

type HeaderProps = {
  isLoggedIn: boolean;
};

export function Header({ isLoggedIn }: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="relative border-b border-line bg-white">
      <div className="mx-auto flex min-h-[72px] max-w-[1320px] items-center justify-between gap-8 px-8 py-2 max-md:px-5">
        {/* Logo */}
        <Link href="/" className="text-[36px] font-semibold leading-none tracking-[-0.03em] text-ink" aria-label="Mail Portal home">
          Mailroom
        </Link>

        {/* Desktop Navigation */}
        <nav className="flex items-center gap-8 text-sm font-medium text-ink max-md:hidden" aria-label="Primary navigation">
          <Link className="hover:text-cta transition-colors" href="/claim">Claim</Link>
          <Link className="hover:text-cta transition-colors" href="/dashboard">Dashboard</Link>
          <Link className="hover:text-cta transition-colors" href="/admin">Admin</Link>
          {isLoggedIn ? (
            <a className="hover:text-cta transition-colors" href="/logout">Sign out</a>
          ) : (
            <Link className="hover:text-cta transition-colors" href="/login">Sign in</Link>
          )}
        </nav>

        {/* Desktop Action Button */}
        {!isLoggedIn && (
          <Link className="button button-primary max-md:hidden" href="/claim">Get started</Link>
        )}

        {/* Mobile Hamburger Toggle */}
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="hidden max-md:grid h-11 w-11 place-items-center border border-line bg-white text-ink transition-colors hover:border-cta hover:text-cta focus:outline-none"
          aria-label="Toggle navigation menu"
        >
          {isOpen ? (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          ) : (
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile Drawer (Right Sidebar) */}
      {isOpen && (
        <>
          {/* Backdrop Overlay */}
          <div 
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm transition-opacity duration-200" 
          />
          {/* Drawer Menu */}
          <aside className="fixed inset-y-0 right-0 z-50 w-[280px] border-l border-line bg-white p-6 shadow-xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between border-b border-line pb-4 mb-6">
                <span className="text-xl font-bold tracking-tight text-ink">Navigation</span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="grid h-10 w-10 place-items-center border border-line text-ink hover:text-cta transition-colors"
                  aria-label="Close menu"
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <nav className="flex flex-col gap-5 text-base font-semibold text-ink">
                <Link onClick={() => setIsOpen(false)} className="hover:text-cta transition-colors py-1" href="/claim">Claim</Link>
                <Link onClick={() => setIsOpen(false)} className="hover:text-cta transition-colors py-1" href="/dashboard">Dashboard</Link>
                <Link onClick={() => setIsOpen(false)} className="hover:text-cta transition-colors py-1" href="/admin">Admin</Link>
                {isLoggedIn ? (
                  <a onClick={() => setIsOpen(false)} className="hover:text-cta transition-colors py-1 text-red-600" href="/logout">Sign out</a>
                ) : (
                  <Link onClick={() => setIsOpen(false)} className="hover:text-cta transition-colors py-1" href="/login">Sign in</Link>
                )}
              </nav>
            </div>

            {!isLoggedIn && (
              <div className="border-t border-line pt-6">
                <Link onClick={() => setIsOpen(false)} className="button button-primary w-full text-center" href="/claim">
                  Get started
                </Link>
              </div>
            )}
          </aside>
        </>
      )}
    </header>
  );
}
