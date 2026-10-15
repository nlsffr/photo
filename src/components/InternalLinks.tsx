import Link from 'next/link';

export default function InternalLinks() {
  const popularTags = [
    { name: "Trending Galleries", slug: "/sitemaps/popular" },
    { name: "Top Profiles", slug: "/sitemaps/profiles" },
    { name: "Latest Media HD", slug: "/sitemaps/media/1" },
  ];

  return (
    <nav className="my-8 p-6 bg-gray-900 rounded-lg border border-gray-800" aria-label="Maillage SEO">
      <h3 className="text-lg font-semibold text-white mb-4">🔥 Tendances et Galeries Populaires</h3>
      <ul className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {popularTags.map((tag, idx) => (
          <li key={idx}>
            <Link 
              href={tag.slug}
              className="text-gray-400 hover:text-white hover:underline block text-sm transition-colors"
            >
              ➔ {tag.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
