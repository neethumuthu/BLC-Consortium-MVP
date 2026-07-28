import { requireSession } from "@/lib/session";
import { NavBar } from "@/components/nav-bar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <NavBar displayName={session.displayName} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
