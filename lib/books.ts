export interface Book {
  id: string;
  title: string;
  author: string;
  coverUrl: string;
  status: 'reading' | 'completed';
  rating?: number;
  year?: number;
  description?: string;
}

export const books: Book[] = [
  {
    id: 'cloud-cuckoo-land',
    title: 'Cloud Cuckoo Land',
    author: 'Anthony Doerr',
    coverUrl: '/books/cloud-cuckoo-land.jpg',
    status: 'reading',
    description: 'An intricate tapestry of stories spanning centuries, connected by an ancient Greek text and the power of storytelling.',
  },
  {
    id: 'a-city-on-mars',
    title: 'A City on Mars',
    author: 'Kelly & Zach Weinersmith',
    coverUrl: '/books/a-city-on-mars.jpg',
    status: 'reading',
    description: 'A deep dive into whether humanity is actually ready to settle space — scientifically, legally, and socially.',
  },
  {
    id: 'hyperion',
    title: 'Hyperion',
    author: 'Dan Simmons',
    coverUrl: '/books/hyperion.jpg',
    status: 'completed',
    rating: 5,
    description: 'Seven pilgrims journey to face the Shrike on Hyperion. One of the greatest science fiction novels ever written.',
  },
  {
    id: 'fall-of-hyperion',
    title: 'The Fall of Hyperion',
    author: 'Dan Simmons',
    coverUrl: '/books/fall-of-hyperion.jpg',
    status: 'completed',
    rating: 5,
    description: 'The stunning conclusion to the Hyperion pilgrimage — mythology, AI, and the fate of humanity collide.',
  },
  {
    id: 'endymion',
    title: 'Endymion',
    author: 'Dan Simmons',
    coverUrl: '/books/endymion.jpg',
    status: 'completed',
    rating: 4,
    description: 'A new hero, a resurrected Church, and a girl who can kill with her touch. The Hyperion Cantos continues.',
  },
  {
    id: 'rise-of-endymion',
    title: 'The Rise of Endymion',
    author: 'Dan Simmons',
    coverUrl: '/books/rise-of-endymion.jpg',
    status: 'completed',
    rating: 4,
    description: 'The epic conclusion to the Hyperion Cantos — love, sacrifice, and the evolution of consciousness.',
  },
  {
    id: 'dune',
    title: 'Dune',
    author: 'Frank Herbert',
    coverUrl: '/books/dune.jpg',
    status: 'completed',
    rating: 5,
    description: 'The foundational epic of science fiction. Politics, religion, ecology, and destiny on a desert world.',
  },
  {
    id: 'snow-crash',
    title: 'Snow Crash',
    author: 'Neal Stephenson',
    coverUrl: '/books/snow-crash.jpg',
    status: 'completed',
    rating: 5,
    description: 'The book that coined "metaverse." Language as a virus, corporate dystopia, and a pizza-delivering samurai hacker.',
  },
  {
    id: 'enders-game',
    title: "Ender's Game",
    author: 'Orson Scott Card',
    coverUrl: '/books/enders-game.jpg',
    status: 'completed',
    rating: 5,
    description: 'A child prodigy trained to save humanity from alien annihilation. A masterpiece of military sci-fi.',
  },
  {
    id: 'skywatchers',
    title: 'Skywatchers',
    author: 'Carrie Arcos',
    coverUrl: '/books/skywatchers.jpg',
    status: 'completed',
    rating: 4,
    description: 'A lyrical novel about grief, connection, and finding meaning under an open sky.',
  },
  {
    id: 'all-the-light-we-cannot-see',
    title: 'All the Light We Cannot See',
    author: 'Anthony Doerr',
    coverUrl: '/books/all-the-light-we-cannot-see.jpg',
    status: 'completed',
    rating: 5,
    description: 'A lyrical novel about grief, connection, and finding meaning under an open sky.',
  },
];