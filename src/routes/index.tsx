import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "SNOVA — Snail Feeding Study" },
    { name: "description", content: "SNOVA daily snail feeding and growth study records." },
    { property: "og:title", content: "SNOVA — Snail Feeding Study" },
    { property: "og:description", content: "Track snail feeding, welfare and growth with SNOVA." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => {
    throw redirect({ to: "/home" });
  },
});
