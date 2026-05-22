export const metadata = {
  title: "Signet x402 Demo — Scoped Subkeys & Delegation",
};

export default function X402DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 text-primary-900">
      {children}
    </div>
  );
}
