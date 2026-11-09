"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./icon";
const items: { href: string; label: string; icon: IconName }[] = [{ href: "/", label: "My Portfolio", icon: "dashboard" }, { href: "/properties", label: "Properties", icon: "properties" }, { href: "/analyze", label: "Analyze Deal", icon: "analyze" }, { href: "/portfolio", label: "Portfolio", icon: "portfolio" }];
export function Navigation() {
  const path = usePathname();
  return <nav className="navigation" aria-label="Main navigation">{items.map(item => { const active = item.href === "/" ? path === "/" : path.startsWith(item.href); return <Link key={item.href} href={item.href} className={`nav-link ${active ? "active" : ""}`} aria-current={active ? "page" : undefined}><Icon name={item.icon} /><span>{item.label}</span></Link>; })}</nav>;
}
