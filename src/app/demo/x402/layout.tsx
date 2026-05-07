import { ClerkProvider } from "@clerk/nextjs";

export const metadata = {
  title: "Signet x402 Demo — Scoped Subkeys & Delegation",
};

export default function X402DemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <div className="min-h-screen bg-neutral-50 text-primary-900">
        {children}
      </div>
    </ClerkProvider>
  );
}
