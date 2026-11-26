export type VideoChapter = { start: number; title: string };
export type VideoResource = {
  category: string;
  title: string;
  description: string;
  href: string;
  action: string;
};
export type VideoCompanion = {
  durationSeconds: number;
  chapters: VideoChapter[];
  resources: VideoResource[];
};

// Editorial content is assigned to a specific video, never inferred for new uploads.
// These chapter titles and timestamps were approved on November 26, 2026.
const companions: Record<string, VideoCompanion> = {
  oDGqUMBvrpY: {
    durationSeconds: 76,
    chapters: [
      { start: 0, title: 'Walking To NIH' },
      { start: 7, title: 'Reading Papers' },
      { start: 14, title: 'Writing And Building Code' },
      { start: 32, title: 'Lunch Break' },
      { start: 37, title: 'Reviewing Protein Structures' },
      { start: 57, title: 'Wrapping Up The Day' },
    ],
    resources: [
      {
        category: 'Ongoing Research',
        title: 'The Research Behind My Day',
        description:
          'Explore my work on protein structures, fold switching, and structural clustering.',
        href: '/experience#projects',
        action: 'Explore Projects',
      },
      {
        category: 'Free Research Tool',
        title: 'Amyloid Structure Analysis',
        description:
          'Compare predicted assemblies, explore structural clusters, and inspect ranked candidates in your browser.',
        href: '/tools/amyloid-inspector',
        action: 'Try The Tool',
      },
      {
        category: 'Research Careers',
        title: 'How I Found An NIH Lab',
        description:
          'The emails, interviews, and decisions that led me to an NIH postbac position.',
        href: '/posts/how-i-found-an-nih-postbac-lab',
        action: 'Read The Story',
      },
    ],
  },
};

export function videoCompanion(videoId: string): VideoCompanion | null {
  if (!Object.hasOwn(companions, videoId)) return null;
  return companions[videoId];
}

export function chapterTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = String(seconds % 60).padStart(2, '0');
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${minutes}:${remainder}`;
}

function validateMoment(videoId: string, seconds: number) {
  if (
    !/^[A-Za-z0-9_-]{11}$/.test(videoId) ||
    !Number.isSafeInteger(seconds) ||
    seconds < 0
  )
    throw new Error('Invalid video timestamp');
}

export function chapterShareUrl(videoId: string, seconds: number): string {
  validateMoment(videoId, seconds);
  return `https://www.youtube.com/watch?v=${videoId}&t=${seconds}s`;
}

export function chapterEmbedUrl(videoId: string, seconds: number): string {
  validateMoment(videoId, seconds);
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&playsinline=1&start=${seconds}`;
}
