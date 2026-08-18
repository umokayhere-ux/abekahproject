import type { Metadata } from "next";
import { Mail, MapPin, Phone } from "lucide-react";

export const metadata: Metadata = {
  title: "Contact us",
  description: "Get in touch with the RentFinder team in Accra, Ghana.",
  alternates: { canonical: "/contact" },
};

const CHANNELS = [
  {
    icon: Mail,
    label: "Email",
    value: "Nanaabekah90@gmail.com",
    href: "mailto:Nanaabekah90@gmail.com",
  },
  {
    icon: Phone,
    label: "Phone",
    value: "054 333 0134",
    href: "tel:+233543330134",
  },
  {
    icon: MapPin,
    label: "Office",
    value: "Accra, Greater Accra, Ghana",
  },
];

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
      <h1 className="text-4xl font-bold text-ink-900">Contact us</h1>
      <p className="mt-4 text-lg text-ink-500">
        Questions about a listing, a payment, or your account? Reach the team
        directly.
      </p>

      <ul className="mt-10 space-y-4">
        {CHANNELS.map((channel) => (
          <li
            key={channel.label}
            className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <channel.icon className="size-5.5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm text-ink-500">{channel.label}</p>
              {channel.href ? (
                <a
                  href={channel.href}
                  className="text-lg font-semibold text-ink-900 hover:text-brand-700 hover:underline"
                >
                  {channel.value}
                </a>
              ) : (
                <p className="text-lg font-semibold text-ink-900">{channel.value}</p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-sm text-ink-500">
        We aim to respond within one business day. For urgent payment issues,
        please include your payment reference.
      </p>
    </div>
  );
}
