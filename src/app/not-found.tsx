import Link from "next/link";
export default function NotFound() { return <section className="panel"><p className="eyebrow">404</p><h1>Property or page not found.</h1><p className="muted">Return to your workspace to keep exploring.</p><Link href="/properties" className="button">View properties</Link></section>; }
