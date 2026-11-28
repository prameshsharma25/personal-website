import {
  ACCESSION,
  normalizeInterPro,
  normalizeUniProt,
} from './protein-annotations';

export class AnnotationRequestError extends Error {
  constructor(
    message: string,
    public status = 502
  ) {
    super(message);
  }
}
async function boundedText(response: Response, limit: number) {
  if (!response.ok)
    throw new AnnotationRequestError(
      response.status === 404
        ? 'No entry was found for this accession.'
        : 'The annotation provider is temporarily unavailable.',
      response.status === 404 ? 404 : 502
    );
  if (Number(response.headers.get('content-length')) > limit)
    throw new AnnotationRequestError('The provider response is too large.');
  const reader = response.body?.getReader();
  if (!reader)
    throw new AnnotationRequestError(
      'The provider returned an empty response.'
    );
  const decoder = new TextDecoder();
  let size = 0,
    text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AnnotationRequestError('The provider response is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
export function createAnnotationService(request: typeof fetch = fetch) {
  const get = async (url: string, limit = 2 * 1024 * 1024) =>
    boundedText(
      await request(url, {
        headers: {
          Accept: 'application/json, text/plain',
          'User-Agent':
            'ProteinAnnotationExplorer/1.0 (https://prameshsharma.com/tools/protein-annotations)',
        },
        redirect: 'error',
        signal: AbortSignal.timeout(10000),
      }),
      limit
    );
  return {
    async reference(accession: string) {
      if (!ACCESSION.test(accession))
        throw new AnnotationRequestError(
          'Enter a canonical UniProt accession, for example P00698. Isoform identifiers are not supported in this release.',
          400
        );
      const [uniprot, interpro] = await Promise.allSettled([
        get(`https://rest.uniprot.org/uniprotkb/${accession}.json`),
        get(
          `https://www.ebi.ac.uk/interpro/api/entry/interpro/protein/uniprot/${accession}/?page_size=100`
        ),
      ]);
      if (uniprot.status === 'rejected') throw uniprot.reason;
      const reference = normalizeUniProt(JSON.parse(uniprot.value));
      if (reference.accession !== accession)
        throw new AnnotationRequestError(
          `This accession redirects to ${reference.accession}. Use that accession to retrieve matching annotations.`,
          400
        );
      if (interpro.status === 'fulfilled') {
        try {
          const data = JSON.parse(interpro.value);
          reference.annotations.push(...normalizeInterPro(data, accession));
          reference.sources.push({
            name: 'InterPro',
            status: data.next ? 'partial' : 'available',
            message: data.next
              ? 'Showing the first 100 InterPro entries. Additional entries are available at InterPro.'
              : undefined,
          });
        } catch {
          reference.sources.push({
            name: 'InterPro',
            status: 'unavailable',
            message:
              'InterPro could not be read. UniProt features remain available.',
          });
        }
      } else if (
        interpro.reason instanceof AnnotationRequestError &&
        interpro.reason.status === 404
      ) {
        reference.sources.push({
          name: 'InterPro',
          status: 'available',
          message: 'No InterPro entries were found for this accession.',
        });
      } else
        reference.sources.push({
          name: 'InterPro',
          status: 'unavailable',
          message:
            'InterPro is temporarily unavailable. Retry loading annotations to check it again.',
        });
      return reference;
    },
    async model(accession: string) {
      if (!ACCESSION.test(accession))
        throw new AnnotationRequestError(
          'Enter a canonical UniProt accession.',
          400
        );
      let models: unknown;
      try {
        models = JSON.parse(
          await get(
            `https://alphafold.ebi.ac.uk/api/prediction/${accession}`,
            256 * 1024
          )
        );
      } catch (error) {
        if (error instanceof AnnotationRequestError && error.status === 404)
          throw new AnnotationRequestError(
            'No AlphaFold model is available for this accession. Upload a PDB or mmCIF structure instead.',
            404
          );
        throw error;
      }
      const model =
        Array.isArray(models) &&
        models.find(
          (m) =>
            m?.uniprotAccession === accession &&
            typeof (m.sequence || m.uniprotSequence) === 'string' &&
            /^[A-Z]+$/.test(m.sequence || m.uniprotSequence) &&
            m.sequenceStart === 1 &&
            m.sequenceEnd === (m.sequence || m.uniprotSequence).length &&
            (!m.uniprotSequence ||
              m.uniprotSequence === (m.sequence || m.uniprotSequence))
        );
      if (
        !model ||
        !new RegExp(
          `^https://alphafold\\.ebi\\.ac\\.uk/files/AF-${accession}-F1-model_v[0-9]+\\.pdb$`
        ).test(model.pdbUrl)
      )
        throw new AnnotationRequestError(
          'No complete AlphaFold model is available for this reference. You can upload your own structure.',
          404
        );
      return {
        name: `AF-${accession}.pdb`,
        text: await get(model.pdbUrl, 5 * 1024 * 1024),
        sequence: model.sequence || model.uniprotSequence,
        url: model.pdbUrl,
        label: `AlphaFold DB prediction for ${accession}; model version ${model.latestVersion}`,
      };
    },
  };
}
