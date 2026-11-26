import type { NextApiRequest, NextApiResponse } from 'next';
import {
  AnnotationRequestError,
  createAnnotationService,
} from '../../lib/protein-annotations-server';
const service = createAnnotationService();
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res
      .status(405)
      .json({ error: 'Use GET to retrieve public protein annotations.' });
  }
  if (
    typeof req.query.id !== 'string' ||
    !['reference', 'model'].includes(String(req.query.kind))
  )
    return res
      .status(400)
      .json({ error: 'Choose a reference accession and request type.' });
  try {
    const id = req.query.id.trim().toUpperCase();
    const data =
      req.query.kind === 'model'
        ? await service.model(id)
        : await service.reference(id);
    res.setHeader(
      'Cache-Control',
      'sources' in data &&
        data.sources.some((source) => source.status !== 'available')
        ? 'no-store'
        : 'public, max-age=300, s-maxage=86400'
    );
    return res.status(200).json(data);
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res
      .status(error instanceof AnnotationRequestError ? error.status : 502)
      .json({
        error:
          error instanceof AnnotationRequestError
            ? error.message
            : 'Annotations could not be retrieved. Try again shortly or use the lysozyme example.',
      });
  }
}
