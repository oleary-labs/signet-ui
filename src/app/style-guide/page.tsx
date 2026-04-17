"use client";

import { useState } from "react";

/* ─── Color data ─── */

const palettes = {
  Primary: {
    description: "Slate blue — trust, security, depth. Used for headings, body text, dark surfaces, and primary buttons.",
    colors: [
      { name: "primary-50", value: "#f0f4f8", text: "dark" },
      { name: "primary-100", value: "#d9e2ec", text: "dark" },
      { name: "primary-200", value: "#bcccdc", text: "dark" },
      { name: "primary-300", value: "#9fb3c8", text: "dark" },
      { name: "primary-400", value: "#829ab1", text: "light" },
      { name: "primary-500", value: "#627d98", text: "light" },
      { name: "primary-600", value: "#486581", text: "light" },
      { name: "primary-700", value: "#334e68", text: "light" },
      { name: "primary-800", value: "#243b53", text: "light" },
      { name: "primary-900", value: "#102a43", text: "light" },
      { name: "primary-950", value: "#0a1929", text: "light" },
    ],
  },
  Accent: {
    description: "Sunset orange to burnt umber — warmth, highlights, CTAs. Used sparingly for interactive elements and emphasis.",
    colors: [
      { name: "accent-50", value: "#fff8f1", text: "dark" },
      { name: "accent-100", value: "#feecdc", text: "dark" },
      { name: "accent-200", value: "#fcd9bd", text: "dark" },
      { name: "accent-300", value: "#fdba8c", text: "dark" },
      { name: "accent-400", value: "#f6a354", text: "dark" },
      { name: "accent-500", value: "#e8873c", text: "light" },
      { name: "accent-600", value: "#cb6d2a", text: "light" },
      { name: "accent-700", value: "#a65521", text: "light" },
      { name: "accent-800", value: "#8a4520", text: "light" },
      { name: "accent-900", value: "#6f3720", text: "light" },
      { name: "accent-950", value: "#3d1c0e", text: "light" },
    ],
  },
  Neutral: {
    description: "Warm stone — backgrounds, borders, secondary text. Slightly warm-tinted to harmonize with the accent palette.",
    colors: [
      { name: "neutral-50", value: "#faf9f7", text: "dark" },
      { name: "neutral-100", value: "#f0eeeb", text: "dark" },
      { name: "neutral-200", value: "#e2dfd9", text: "dark" },
      { name: "neutral-300", value: "#ccc8c0", text: "dark" },
      { name: "neutral-400", value: "#aca69c", text: "dark" },
      { name: "neutral-500", value: "#918a7e", text: "light" },
      { name: "neutral-600", value: "#756e63", text: "light" },
      { name: "neutral-700", value: "#5e5850", text: "light" },
      { name: "neutral-800", value: "#4a453f", text: "light" },
      { name: "neutral-900", value: "#38342f", text: "light" },
      { name: "neutral-950", value: "#1e1c19", text: "light" },
    ],
  },
  Semantic: {
    description: "Success, error, and warning colors for status indicators and feedback.",
    colors: [
      { name: "success-50", value: "#ecfdf5", text: "dark" },
      { name: "success-100", value: "#d1fae5", text: "dark" },
      { name: "success-400", value: "#4ade80", text: "dark" },
      { name: "success-500", value: "#3d9f6f", text: "light" },
      { name: "success-600", value: "#2f8459", text: "light" },
      { name: "success-700", value: "#236b47", text: "light" },
      { name: "error-50", value: "#fef2f0", text: "dark" },
      { name: "error-100", value: "#fde3de", text: "dark" },
      { name: "error-400", value: "#e8614d", text: "light" },
      { name: "error-500", value: "#c4523b", text: "light" },
      { name: "error-600", value: "#a8412e", text: "light" },
    ],
  },
};

/* ─── Component ─── */

export default function StyleGuidePage() {
  const [copied, setCopied] = useState<string | null>(null);

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      {/* Header */}
      <div className="mb-16">
        <p className="text-sm font-medium text-accent-500 mb-2">Design System</p>
        <h1 className="text-4xl font-bold tracking-tight text-primary-900 sm:text-5xl">
          Signet Style Guide
        </h1>
        <p className="mt-4 text-lg text-neutral-500 max-w-2xl">
          A living reference for the Signet Console design system. Colors,
          typography, and component patterns — all built on Tailwind CSS 4
          custom theme tokens.
        </p>
      </div>

      {/* ─── Color Palettes ─── */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-primary-900 mb-2">Color Palette</h2>
        <p className="text-neutral-500 mb-10 max-w-2xl">
          Clean and trustworthy as the foundation, with natural sunset orange highlights
          for warmth and personality. Click any swatch to copy its hex value.
        </p>

        <div className="space-y-12">
          {Object.entries(palettes).map(([name, { description, colors }]) => (
            <div key={name}>
              <h3 className="text-lg font-semibold text-primary-800 mb-1">{name}</h3>
              <p className="text-sm text-neutral-500 mb-4">{description}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {colors.map((c) => (
                  <button
                    key={c.name}
                    onClick={() => copyToClipboard(c.value)}
                    className="group rounded-xl overflow-hidden border border-neutral-200 hover:shadow-md transition-all text-left"
                  >
                    <div
                      className="h-20 flex items-end p-2.5"
                      style={{ backgroundColor: c.value }}
                    >
                      <span
                        className={`text-[10px] font-mono font-medium opacity-70 group-hover:opacity-100 transition-opacity ${
                          c.text === "light" ? "text-white" : "text-primary-900"
                        }`}
                      >
                        {copied === c.value ? "Copied!" : c.value}
                      </span>
                    </div>
                    <div className="px-2.5 py-2 bg-white">
                      <p className="text-xs font-medium text-primary-900">{c.name}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Typography ─── */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-primary-900 mb-2">Typography</h2>
        <p className="text-neutral-500 mb-10 max-w-2xl">
          System font stack with Geist as the preferred typeface. Clear hierarchy
          through size and weight, not decorative treatments.
        </p>

        <div className="space-y-8 max-w-3xl">
          <div className="border-b border-neutral-200 pb-6">
            <p className="text-xs font-mono text-neutral-400 mb-2">text-5xl / font-bold / tracking-tight</p>
            <p className="text-5xl font-bold tracking-tight text-primary-900">
              Page Headline
            </p>
          </div>
          <div className="border-b border-neutral-200 pb-6">
            <p className="text-xs font-mono text-neutral-400 mb-2">text-2xl / font-bold</p>
            <p className="text-2xl font-bold text-primary-900">
              Section Heading
            </p>
          </div>
          <div className="border-b border-neutral-200 pb-6">
            <p className="text-xs font-mono text-neutral-400 mb-2">text-lg / font-semibold</p>
            <p className="text-lg font-semibold text-primary-900">
              Subsection Heading
            </p>
          </div>
          <div className="border-b border-neutral-200 pb-6">
            <p className="text-xs font-mono text-neutral-400 mb-2">text-base / text-primary-900</p>
            <p className="text-base text-primary-900">
              Body text. The quick brown fox jumps over the lazy dog. Signet splits the trust so you can keep the control.
            </p>
          </div>
          <div className="border-b border-neutral-200 pb-6">
            <p className="text-xs font-mono text-neutral-400 mb-2">text-sm / text-neutral-500</p>
            <p className="text-sm text-neutral-500">
              Secondary text for descriptions, helper copy, and metadata.
            </p>
          </div>
          <div className="pb-6">
            <p className="text-xs font-mono text-neutral-400 mb-2">text-xs / font-mono / text-neutral-400</p>
            <p className="text-xs font-mono text-neutral-400">
              0x1234...abcd — monospace for addresses, code, and technical values
            </p>
          </div>
        </div>
      </section>

      {/* ─── Buttons ─── */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-primary-900 mb-2">Buttons</h2>
        <p className="text-neutral-500 mb-10 max-w-2xl">
          Primary actions use the slate blue. Accent buttons (sunset orange) for
          high-emphasis CTAs on dark surfaces. Ghost and outline for secondary actions.
        </p>

        <div className="space-y-8">
          {/* Light surface buttons */}
          <div>
            <p className="text-sm font-medium text-neutral-500 mb-4">On light surfaces</p>
            <div className="flex flex-wrap gap-4 items-center">
              <button className="rounded-lg bg-primary-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 transition-colors">
                Primary Action
              </button>
              <button className="rounded-lg border border-neutral-300 px-5 py-2.5 text-sm font-semibold text-primary-700 hover:border-accent-400 hover:text-accent-600 transition-colors">
                Secondary
              </button>
              <button className="rounded-lg px-5 py-2.5 text-sm font-semibold text-neutral-500 hover:text-primary-800 transition-colors">
                Ghost
              </button>
              <button className="rounded-lg bg-primary-800 px-5 py-2.5 text-sm font-semibold text-white opacity-50 cursor-not-allowed">
                Disabled
              </button>
            </div>
          </div>

          {/* Dark surface buttons */}
          <div>
            <p className="text-sm font-medium text-neutral-500 mb-4">On dark surfaces</p>
            <div className="rounded-xl bg-primary-950 p-8 flex flex-wrap gap-4 items-center">
              <button className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-600 transition-colors">
                Accent CTA
              </button>
              <button className="rounded-lg border border-primary-600 px-5 py-2.5 text-sm font-semibold text-primary-200 hover:border-primary-400 transition-colors">
                Outline
              </button>
              <button className="rounded-lg px-5 py-2.5 text-sm font-semibold text-primary-300 hover:text-primary-100 transition-colors">
                Ghost
              </button>
              <button className="rounded-lg bg-accent-500 px-5 py-2.5 text-sm font-semibold text-white opacity-30 cursor-not-allowed">
                Disabled
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Status Badges ─── */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-primary-900 mb-2">Status Indicators</h2>
        <p className="text-neutral-500 mb-10 max-w-2xl">
          Color-coded badges and dots for node status, operational state, and access levels.
        </p>

        <div className="flex flex-wrap gap-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1.5 text-xs font-medium text-success-700">
            <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
            Online
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-50 px-3 py-1.5 text-xs font-medium text-success-700">
            <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
            Open
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1.5 text-xs font-medium text-accent-700">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-500" />
            Permissioned
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-xs font-medium text-neutral-400">
            <span className="h-1.5 w-1.5 rounded-full bg-neutral-300" />
            Offline
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-error-50 px-3 py-1.5 text-xs font-medium text-error-500">
            <span className="h-1.5 w-1.5 rounded-full bg-error-500" />
            Error
          </span>
        </div>

        {/* Dark variant */}
        <div className="mt-6 rounded-xl bg-primary-950 p-6 flex flex-wrap gap-4">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-400">
            <span className="h-2 w-2 rounded-full bg-success-400" />
            Operational
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-400">
            <span className="h-2 w-2 rounded-full bg-accent-400" />
            Pending
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary-400">
            <span className="h-2 w-2 rounded-full bg-primary-400" />
            Inactive
          </span>
        </div>
      </section>

      {/* ─── Cards ─── */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-primary-900 mb-2">Cards</h2>
        <p className="text-neutral-500 mb-10 max-w-2xl">
          Content containers on light and dark surfaces. Rounded corners, subtle
          borders, and minimal shadows.
        </p>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Light card */}
          <div className="rounded-xl border border-neutral-200 bg-white p-6 hover:shadow-sm transition-all">
            <div className="flex items-center gap-4 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-700 to-primary-500 text-sm font-bold text-white">
                AB
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary-900">Anchorage Digital</h3>
                <p className="text-xs text-neutral-500">Custodian</p>
              </div>
            </div>
            <p className="text-sm text-neutral-500">
              Institutional-grade custody and signing services with regulatory compliance.
            </p>
          </div>

          {/* Light card — selected state */}
          <div className="rounded-xl border border-accent-500 bg-accent-50 ring-2 ring-accent-200 p-6">
            <div className="flex items-center gap-4 mb-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-primary-700 to-primary-500 text-sm font-bold text-white">
                FG
              </div>
              <div>
                <h3 className="text-sm font-semibold text-primary-900">Figment</h3>
                <p className="text-xs text-accent-600">Selected</p>
              </div>
            </div>
            <p className="text-sm text-neutral-500">
              Staking and infrastructure provider — selected state with accent ring.
            </p>
          </div>

          {/* Dark card */}
          <div className="rounded-xl border border-primary-700 bg-primary-900/50 p-6">
            <p className="text-xs text-primary-400 mb-1">Status</p>
            <p className="text-lg font-semibold text-success-400">Operational</p>
          </div>

          {/* Dark card — info */}
          <div className="rounded-xl border border-primary-700 bg-primary-900 p-6">
            <p className="text-sm font-medium text-primary-300 mb-2">Configuration</p>
            <p className="text-primary-50 font-mono">3-of-5 (threshold: 3)</p>
          </div>
        </div>
      </section>

      {/* ─── Dark Surface Example ─── */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-primary-900 mb-2">Dark Surfaces</h2>
        <p className="text-neutral-500 mb-10 max-w-2xl">
          Dashboard and management pages use the deep primary palette as the background,
          with the accent orange as the primary CTA color — giving those warm sunset
          highlights a place to shine.
        </p>

        <div className="rounded-2xl bg-primary-950 p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-primary-50">Your Groups</h3>
              <p className="text-sm text-primary-300 mt-1">
                Managed by <span className="font-mono">0x1234...abcd</span>
              </p>
            </div>
            <button className="rounded-lg bg-accent-500 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600 transition-colors">
              New Group
            </button>
          </div>

          <div className="rounded-lg border border-primary-700 bg-primary-900/50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-success-400" />
              <span className="font-mono text-sm text-primary-50">0xabcd...1234</span>
            </div>
            <span className="text-xs text-primary-400">Active</span>
          </div>

          <div className="rounded-lg border border-primary-700 bg-primary-900/50 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-accent-400" />
              <span className="font-mono text-sm text-primary-50">0xef01...5678</span>
            </div>
            <span className="text-xs text-accent-400">Pending</span>
          </div>
        </div>
      </section>

      {/* ─── Usage Guidelines ─── */}
      <section className="mb-20">
        <h2 className="text-2xl font-bold text-primary-900 mb-2">Usage Guidelines</h2>
        <p className="text-neutral-500 mb-10 max-w-2xl">
          Quick reference for applying the design system consistently.
        </p>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <GuidelineCard
            title="Accent sparingly"
            description="Reserve sunset orange for CTAs, active/selected states, and warning callouts. It should catch the eye, not overwhelm it."
            example="bg-accent-500, border-accent-500, text-accent-400"
          />
          <GuidelineCard
            title="Primary for structure"
            description="Slate blue carries all headings, body text, and dark page backgrounds. The deeper shades (800-950) anchor the layout."
            example="text-primary-900, bg-primary-950, border-primary-700"
          />
          <GuidelineCard
            title="Neutral for space"
            description="Warm stone grays for backgrounds, borders, and secondary text. They keep the interface breathable without going cold."
            example="bg-neutral-50, border-neutral-200, text-neutral-500"
          />
          <GuidelineCard
            title="Status = semantic"
            description="Green (success) for online/operational, orange (accent) for permissioned/pending, red (error) for failures."
            example="text-success-700, bg-error-50, text-accent-400"
          />
          <GuidelineCard
            title="Light + dark parity"
            description="Marketplace pages use the light surface. Dashboard and group management use the dark primary surface. Both share the same token vocabulary."
            example="bg-white → bg-primary-900, text-primary-900 → text-primary-50"
          />
          <GuidelineCard
            title="Tailwind tokens"
            description="All colors are exposed as Tailwind classes via @theme inline. Use bg-primary-800, text-accent-500 etc. — no raw hex values in components."
            example="className=&quot;bg-accent-500 text-white&quot;"
          />
        </div>
      </section>

      {/* ─── Token Reference ─── */}
      <section>
        <h2 className="text-2xl font-bold text-primary-900 mb-2">CSS Token Reference</h2>
        <p className="text-neutral-500 mb-10 max-w-2xl">
          All design tokens are defined as CSS custom properties in globals.css and
          exposed through the Tailwind @theme inline block.
        </p>

        <div className="overflow-x-auto rounded-xl border border-neutral-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="px-4 py-3 text-left font-medium text-primary-800">Tailwind Class</th>
                <th className="px-4 py-3 text-left font-medium text-primary-800">CSS Variable</th>
                <th className="px-4 py-3 text-left font-medium text-primary-800">Use Case</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              <TokenRow tw="bg-primary-800" css="--primary-800" use="Primary buttons, header nav" />
              <TokenRow tw="bg-primary-950" css="--primary-950" use="Dark page backgrounds" />
              <TokenRow tw="bg-accent-500" css="--accent-500" use="Accent CTAs, selected states" />
              <TokenRow tw="text-accent-400" css="--accent-400" use="Warning callouts, links on dark" />
              <TokenRow tw="bg-neutral-50" css="--neutral-50" use="Light page background" />
              <TokenRow tw="border-neutral-200" css="--neutral-200" use="Card and section borders" />
              <TokenRow tw="text-neutral-500" css="--neutral-500" use="Secondary / descriptive text" />
              <TokenRow tw="bg-success-50" css="--success-50" use="Success badge backgrounds" />
              <TokenRow tw="text-success-700" css="--success-700" use="Success badge text" />
              <TokenRow tw="bg-error-50" css="--error-50" use="Error state backgrounds" />
              <TokenRow tw="text-error-600" css="--error-600" use="Error messages" />
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ─── Sub-components ─── */

function GuidelineCard({
  title,
  description,
  example,
}: {
  title: string;
  description: string;
  example: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-primary-900 mb-2">{title}</h3>
      <p className="text-sm text-neutral-500 mb-3">{description}</p>
      <p className="text-xs font-mono text-accent-600 bg-accent-50 rounded-lg px-3 py-2">
        {example}
      </p>
    </div>
  );
}

function TokenRow({
  tw,
  css,
  use,
}: {
  tw: string;
  css: string;
  use: string;
}) {
  return (
    <tr className="hover:bg-neutral-50 transition-colors">
      <td className="px-4 py-3 font-mono text-xs text-primary-700">{tw}</td>
      <td className="px-4 py-3 font-mono text-xs text-neutral-500">{css}</td>
      <td className="px-4 py-3 text-neutral-600">{use}</td>
    </tr>
  );
}
