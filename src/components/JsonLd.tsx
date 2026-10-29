import { serializeJsonLd } from "@/lib/json-ld";

/** Server component: inject safely serialized JSON-LD schema.org */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
