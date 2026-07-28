"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/actions/auth";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/certificates/new", label: "Issue Certificate" },
  { href: "/certificates/verify", label: "Verify Certificate" },
  { href: "/institutions", label: "Institutions" },
];

export function NavBar({ displayName }: { displayName: string }) {
  const pathname = usePathname();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-5 text-primary" />
            <span>BLC Consortium</span>
          </Link>
          <nav className="flex items-center gap-1">
            {LINKS.map((link) => {
              const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{displayName}</span>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">
              <LogOut className="size-4" />
              Logout
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
