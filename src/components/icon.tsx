export type IconName = "dashboard" | "properties" | "analyze" | "portfolio" | "arrow" | "plus";
const paths: Record<IconName, string> = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  properties: "m3 10 9-7 9 7v11H3z M9 21v-8h6v8",
  analyze: "M5 3h14v18H5z M8 7h8 M8 11h1 M12 11h1 M16 11h1 M8 15h1 M12 15h1 M16 15h1 M8 18h1 M12 18h1 M16 18h1",
  portfolio: "M3 21h18 M5 17V9h4v8 M11 17V5h4v12 M17 17V2h4v15",
  arrow: "M5 12h14 m-6-6 6 6-6 6", plus: "M12 5v14 M5 12h14",
};
export function Icon({ name, className = "" }: { name: IconName; className?: string }) { return <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>; }
