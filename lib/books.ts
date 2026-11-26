import type { StaticImageData } from 'next/image';
import cloudCuckooLandCover from '../public/books/cloud-cuckoo-land.jpg';
import aCityOnMarsCover from '../public/books/a-city-on-mars.jpg';
import hyperionCover from '../public/books/hyperion.jpg';
import fallOfHyperionCover from '../public/books/fall-of-hyperion.jpg';
import endymionCover from '../public/books/endymion.jpg';
import riseOfEndymionCover from '../public/books/rise-of-endymion.jpg';
import duneCover from '../public/books/dune.jpg';
import snowCrashCover from '../public/books/snow-crash.jpg';
import endersGameCover from '../public/books/enders-game.jpg';
import skywatchersCover from '../public/books/skywatchers.jpg';
import allTheLightWeCannotSeeCover from '../public/books/all-the-light-we-cannot-see.jpg';

export interface Book {
  id: string;
  title: string;
  author: string;
  cover: StaticImageData;
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
    cover: cloudCuckooLandCover,
    status: 'completed',
    description:
      'An intricate tapestry of stories spanning centuries, connected by an ancient Greek text and the power of storytelling.',
  },
  {
    id: 'a-city-on-mars',
    title: 'A City on Mars',
    author: 'Kelly & Zach Weinersmith',
    cover: aCityOnMarsCover,
    status: 'reading',
    description:
      'An exploration of the scientific, legal, and social challenges of settling space.',
  },
  {
    id: 'hyperion',
    title: 'Hyperion',
    author: 'Dan Simmons',
    cover: hyperionCover,
    status: 'completed',
    rating: 5,
    description:
      'Seven pilgrims journey to face the Shrike on Hyperion. One of the greatest science fiction novels ever written.',
  },
  {
    id: 'fall-of-hyperion',
    title: 'The Fall of Hyperion',
    author: 'Dan Simmons',
    cover: fallOfHyperionCover,
    status: 'completed',
    rating: 5,
    description:
      'The Hyperion pilgrimage reaches its conclusion as mythology, AI, and the fate of humanity collide.',
  },
  {
    id: 'endymion',
    title: 'Endymion',
    author: 'Dan Simmons',
    cover: endymionCover,
    status: 'completed',
    rating: 4,
    description:
      'A new hero, a resurrected Church, and a girl who can kill with her touch. The Hyperion Cantos continues.',
  },
  {
    id: 'rise-of-endymion',
    title: 'The Rise of Endymion',
    author: 'Dan Simmons',
    cover: riseOfEndymionCover,
    status: 'completed',
    rating: 4,
    description:
      'The Hyperion Cantos concludes with love, sacrifice, and the evolution of consciousness.',
  },
  {
    id: 'dune',
    title: 'Dune',
    author: 'Frank Herbert',
    cover: duneCover,
    status: 'completed',
    rating: 5,
    description:
      'The foundational epic of science fiction. Politics, religion, ecology, and destiny on a desert world.',
  },
  {
    id: 'snow-crash',
    title: 'Snow Crash',
    author: 'Neal Stephenson',
    cover: snowCrashCover,
    status: 'completed',
    rating: 5,
    description:
      'The book that coined "metaverse." Language as a virus, corporate dystopia, and a pizza-delivering samurai hacker.',
  },
  {
    id: 'enders-game',
    title: "Ender's Game",
    author: 'Orson Scott Card',
    cover: endersGameCover,
    status: 'completed',
    rating: 5,
    description:
      'A child prodigy trained to save humanity from alien annihilation. A masterpiece of military sci-fi.',
  },
  {
    id: 'skywatchers',
    title: 'Skywatchers',
    author: 'Carrie Arcos',
    cover: skywatchersCover,
    status: 'completed',
    rating: 4,
    description:
      'A lyrical novel about grief, connection, and finding meaning under an open sky.',
  },
  {
    id: 'all-the-light-we-cannot-see',
    title: 'All the Light We Cannot See',
    author: 'Anthony Doerr',
    cover: allTheLightWeCannotSeeCover,
    status: 'completed',
    rating: 5,
    description:
      'A lyrical novel about grief, connection, and finding meaning under an open sky.',
  },
];
