import Link from "next/link";
import { Building2, Mail, Phone } from "lucide-react";

const SECTIONS = [
  {
    heading: "Explore",
    links: [
      { href: "/properties", label: "Browse rentals" },
      { href: "/properties?type=apartment", label: "Apartments" },
      { href: "/properties?type=house", label: "Houses" },
      { href: "/properties?type=studio", label: "Studios" },
      { href: "/properties?type=room", label: "Single rooms" },
    ],
  },
  {
    heading: "Company",
    links: [
      { href: "/about", label: "About RentFinder" },
      { href: "/contact", label: "Contact us" },
      { href: "/auth/register", label: "List a property" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/terms", label: "Terms of service" },
      { href: "/privacy", label: "Privacy policy" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-auto border-t border-slate-200 bg-surface-muted">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 font-bold text-ink-900">
              <span className="flex size-9 items-center justify-center rounded-xl bg-brand-600 text-white">
                <Building2 className="size-5" aria-hidden="true" />
              </span>
              <span className="text-lg">RentFinder</span>
            </Link>
            <p className="mt-3 max-w-xs text-sm text-ink-500">
              Rooms, apartments, houses, and studios for rent across Ghana —
              verified listings and secure payments in Ghana cedis.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-ink-500">
              <li className="flex items-center gap-2">
                <Mail className="size-4 shrink-0" aria-hidden="true" />
                <a
                  href="mailto:Nanaabekah90@gmail.com"
                  className="hover:text-brand-700 hover:underline"
                >
                  Nanaabekah90@gmail.com
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="size-4 shrink-0" aria-hidden="true" />
                <a
                  href="tel:+233543330134"
                  className="hover:text-brand-700 hover:underline"
                >
                  054 333 0134
                </a>
              </li>
            </ul>
          </div>

          {SECTIONS.map((section) => (
            <nav key={section.heading} aria-label={section.heading}>
              <h2 className="text-sm font-semibold text-ink-900">
                {section.heading}
              </h2>
              <ul className="mt-3 space-y-2">
                {section.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-ink-500 transition-colors hover:text-brand-700 hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6">
          <p className="text-sm text-ink-500">
            &copy; {new Date().getFullYear()} RentFinder. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
