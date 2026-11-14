/** Native disclosure control shared by the activity panels and chart tracks. */
export function DisclosureHeading({ title, id, level = 2, color }: {
  title: string; id?: string; level?: 2 | 3; color?: string;
}) {
  const Heading = level === 2 ? "h2" : "h3";
  return <summary style={{ color }} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
    <Heading id={id} className={level === 2 ? "text-xl font-semibold" : "text-sm font-medium"}>{title}</Heading>
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      className="size-5 shrink-0 transition-transform group-open/disclosure:rotate-180">
      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
    </svg>
  </summary>;
}
