import { useEffect, useMemo, useRef, useState } from 'react';
import AnnotationStructureViewer from './AnnotationStructureViewer';
import AnnotationTypeIcon from './AnnotationTypeIcon';
import {
  ANNOTATION_LIMITS,
  ACCESSION,
  annotationPositions,
  evidenceUrl,
  mapSequence,
  neighbors,
  parseSequence,
  regionAnnotations,
  type ProteinInput,
  type ReferenceProtein,
  type Residue,
} from '../lib/protein-annotations';
import { parseProteinStructure } from '../lib/protein-input';
import styles from '../styles/ProteinAnnotations.module.css';

const title = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
type Region = { name: string; notes: string; chain: string; keys: string[] };
export default function ProteinAnnotationExplorer() {
  const [ready, setReady] = useState(false);
  const [input, setInput] = useState<ProteinInput | null>(null);
  const [reference, setReference] = useState<ReferenceProtein | null>(null);
  const [chain, setChain] = useState(''),
    [accession, setAccession] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]),
    [hover, setHover] = useState<Residue | null>(null);
  const [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [paste, setPaste] = useState('');
  const [category, setCategory] = useState('All'),
    [radius, setRadius] = useState(6),
    [focus, setFocus] = useState(0);
  const [regions, setRegions] = useState<Region[]>([]),
    [regionName, setRegionName] = useState(''),
    [notes, setNotes] = useState('');
  const operation = useRef(0),
    abort = useRef<AbortController | null>(null),
    anchor = useRef<number | null>(null),
    dragging = useRef(false);
  const residueRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    setReady(true);
    const stop = () => {
      dragging.current = false;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('blur', stop);
      abort.current?.abort();
    };
  }, []);
  const residues = useMemo(
    () => input?.chains.find((c) => c.id === chain)?.residues || [],
    [input, chain]
  );
  const sequence = useMemo(
    () => residues.map((r) => r.letter).join(''),
    [residues]
  );
  const mapping = useMemo(
    () =>
      reference && sequence ? mapSequence(sequence, reference.sequence) : null,
    [reference, sequence]
  );
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const mapped = useMemo(
    () =>
      reference && mapping?.usable
        ? reference.annotations.filter(
            (a) => annotationPositions(a, residues, mapping).length > 0
          )
        : [],
    [reference, mapping, residues]
  );
  const annotated = useMemo(
    () =>
      new Set(
        mapping
          ? mapped
              .filter((a) => category === 'All' || a.category === category)
              .flatMap((a) =>
                annotationPositions(a, residues, mapping).map((r) => r.key)
              )
          : []
      ),
    [mapped, residues, mapping, category]
  );
  const relevant = useMemo(
    () =>
      selected.size && mapping
        ? regionAnnotations(mapped, residues, mapping, selected)
        : mapped,
    [mapped, residues, mapping, selected]
  );
  const categories = useMemo(
    () => [...new Set(mapped.map((a) => a.category))].sort(),
    [mapped]
  );
  const displayed = relevant.filter(
    (a) => category === 'All' || a.category === category
  );
  const replaceInput = (
    next: ProteinInput,
    ref: ReferenceProtein | null = null
  ) => {
    setInput(next);
    setChain(next.chains[0].id);
    setReference(ref);
    setSelectedKeys([]);
    setRegions([]);
    setRegionName('');
    setNotes('');
    setHover(null);
    setCategory('All');
    anchor.current = null;
  };
  const run = async (
    label: string,
    task: (signal: AbortSignal, current: () => boolean) => Promise<void>
  ) => {
    const id = ++operation.current;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(label);
    setError('');
    try {
      await task(
        controller.signal,
        () => operation.current === id && !controller.signal.aborted
      );
    } catch (e) {
      if (operation.current === id && !controller.signal.aborted)
        setError(
          e instanceof Error ? e.message : 'The protein could not be opened.'
        );
    } finally {
      if (operation.current === id) setBusy('');
    }
  };
  const get = async (url: string, signal: AbortSignal) => {
    const response = await fetch(url, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(25000)]),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(
        data?.error || 'The data could not be loaded. Try again shortly.'
      );
    }
    return response;
  };
  const loadFile = (file?: File) => {
    if (!file) return;
    void run('Opening Your File…', async (_, current) => {
      if (file.size > ANNOTATION_LIMITS.bytes)
        throw new Error('Choose a file up to 5 MB.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer()
      );
      const next = /\.(pdb|cif|mmcif)$/i.test(file.name)
        ? parseProteinStructure(text, file.name)
        : /\.(fa|fasta|faa|txt)$/i.test(file.name)
          ? parseSequence(text, file.name)
          : null;
      if (!next) throw new Error('Choose PDB, mmCIF, or a protein FASTA file.');
      if (current()) {
        replaceInput(next);
        setAccession(next.suggestedAccession || '');
      }
    });
  };
  const openReferenceProtein = (data: ReferenceProtein) => {
    replaceInput(
      {
        ...parseSequence(data.sequence, data.name),
        suggestedAccession: data.accession,
        origin: `UniProt ${data.accession}, ${data.organism}. Reference sequence.`,
      },
      data
    );
    setAccession(data.accession);
    setError('');
  };
  const loadReference = (asNewProtein = false) =>
    void run('Retrieving Public Annotations…', async (signal, current) => {
      const id = accession.trim().toUpperCase();
      if (!ACCESSION.test(id))
        throw new Error(
          'Enter a canonical UniProt accession, such as P00698. Isoform identifiers are not supported yet.'
        );
      const data: ReferenceProtein = await (
        await get(`/api/protein-annotations?kind=reference&id=${id}`, signal)
      ).json();
      if (current()) {
        if (!input || asNewProtein) openReferenceProtein(data);
        else {
          setReference(data);
          setCategory('All');
        }
        setAccession(data.accession);
      }
    });
  const loadExample = () =>
    void run('Opening Lysozyme…', async (signal, current) => {
      const [structure, data] = await Promise.all([
        get('/tools/protein-annotations/1LYZ.pdb', signal).then((r) =>
          r.text()
        ),
        get('/tools/protein-annotations/P00698.json', signal).then((r) =>
          r.json()
        ),
      ]);
      if (current()) {
        replaceInput(
          {
            ...parseProteinStructure(structure, '1LYZ.pdb'),
            origin:
              'RCSB PDB 1LYZ, chicken lysozyme. Bundled public structure.',
          },
          data
        );
        setAccession('P00698');
      }
    });
  const loadModel = () =>
    void run(
      'Retrieving An Existing AlphaFold Model…',
      async (signal, current) => {
        if (
          !reference ||
          sequence !== reference.sequence ||
          input?.kind !== 'sequence'
        )
          throw new Error(
            'An existing model can only be loaded for an exact reference sequence. Upload your own structure for a variant or fragment.'
          );
        const data = await (
          await get(
            `/api/protein-annotations?kind=model&id=${reference.accession}`,
            signal
          )
        ).json();
        if (data.sequence !== sequence)
          throw new Error(
            'The available model uses a different sequence version. Upload a matching structure instead.'
          );
        const next = {
          ...parseProteinStructure(data.text, data.name),
          origin: data.label,
        };
        if (
          next.chains.length !== 1 ||
          next.chains[0].residues.map((r) => r.letter).join('') !== sequence
        )
          throw new Error(
            'The model coordinates do not cover this exact sequence. Upload a matching structure instead.'
          );
        if (current()) replaceInput(next, reference);
      }
    );
  const switchChain = (id: string) => {
    setChain(id);
    setSelectedKeys([]);
    setHover(null);
    setCategory('All');
    anchor.current = null;
  };
  const pick = (key: string, add: boolean) => {
    const target = input?.chains.find((c) =>
      c.residues.some((r) => r.key === key)
    );
    if (!target) return;
    if (target.id !== chain) {
      switchChain(target.id);
      setSelectedKeys([key]);
    } else
      setSelectedKeys((old) =>
        add
          ? old.includes(key)
            ? old.filter((k) => k !== key)
            : [...old, key]
          : [key]
      );
    anchor.current = target.residues.findIndex((r) => r.key === key);
    residueRefs.current
      .get(key)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const pickSequence = (index: number, range: boolean, add: boolean) => {
    if (range && anchor.current != null)
      setSelectedKeys(
        residues
          .slice(
            Math.min(anchor.current, index),
            Math.max(anchor.current, index) + 1
          )
          .map((r) => r.key)
      );
    else {
      anchor.current = index;
      const key = residues[index].key;
      setSelectedKeys((old) =>
        add
          ? old.includes(key)
            ? old.filter((k) => k !== key)
            : [...old, key]
          : [key]
      );
    }
  };
  const exportRegion = () => {
    const document = {
      schema: 'protein-annotation-review-1.0',
      exportedAt: new Date().toISOString(),
      input: {
        name: input.name,
        kind: input.kind,
        origin: input.origin,
        chains: input.chains,
      },
      chain,
      residues,
      selectedResidues: residues.filter((r) => selected.has(r.key)),
      mapping,
      reference,
      savedRegions: regions,
      note: 'Annotations describe the cited reference. Mapping is not experimental validation of the uploaded protein. Neighborhoods use alpha carbon distances within the selected chain.',
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(document, null, 2)], {
        type: 'application/json',
      })
    );
    const link = window.document.createElement('a');
    link.href = url;
    link.download = 'protein-annotation-review.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section
      className={styles.explorer}
      aria-label="Protein Annotation Explorer"
    >
      {!ready && (
        <p className={styles.status}>
          Enable JavaScript to open proteins, select residues, and retrieve
          annotations.
        </p>
      )}
      <div className={styles.setup}>
        <div className={styles.inputPanel}>
          <p className={styles.eyebrow}>01 / Your Protein</p>
          <h2>Start With A Structure Or Sequence.</h2>
          <label htmlFor="protein-upload">Upload Protein</label>
          <input
            id="protein-upload"
            type="file"
            accept=".pdb,.cif,.mmcif,.fasta,.fa,.faa,.txt"
            disabled={!ready || Boolean(busy)}
            onChange={(e) => {
              loadFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <p className={styles.small}>
            PDB, mmCIF, or one FASTA sequence. Up to 5 MB and 2,000 residues per
            chain.
          </p>
          <details>
            <summary>Paste A Sequence</summary>
            <label htmlFor="protein-sequence">Protein Sequence Or FASTA</label>
            <textarea
              id="protein-sequence"
              value={paste}
              maxLength={6000}
              onChange={(e) => setPaste(e.target.value)}
              placeholder="Paste amino acid letters here"
              rows={4}
            />
            <button
              disabled={!ready || Boolean(busy) || !paste.trim()}
              onClick={() => {
                setError('');
                try {
                  const next = parseSequence(paste);
                  replaceInput(next);
                  setAccession(next.suggestedAccession || '');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Open Sequence
            </button>
          </details>
        </div>
        <div className={styles.inputPanel}>
          <p className={styles.eyebrow}>02 / Reference Annotations</p>
          <h2>Connect A Reference Protein.</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              loadReference();
            }}
          >
            <label htmlFor="protein-accession">UniProt Accession</label>
            <div className={styles.inline}>
              <input
                id="protein-accession"
                value={accession}
                disabled={!ready || Boolean(busy)}
                maxLength={15}
                onChange={(e) => setAccession(e.target.value)}
                placeholder="For Example, P00698"
                autoCapitalize="characters"
                spellCheck={false}
              />
              <button
                className={styles.primary}
                disabled={!ready || Boolean(busy) || !accession.trim()}
              >
                Load Annotations
              </button>
            </div>
            {input && (
              <button
                className={styles.newProtein}
                type="button"
                disabled={!ready || Boolean(busy) || !accession.trim()}
                onClick={() => loadReference(true)}
              >
                Open As New Protein
              </button>
            )}
          </form>
          <p className={styles.small}>
            {input
              ? 'Load Annotations compares the reference with your current protein. Open As New Protein replaces it with the reference sequence and clears the current selection and notes.'
              : 'Enter an accession to open its reference sequence and annotations. You can then load its existing AlphaFold structure.'}
          </p>
          {input && (
            <div
              className={styles.proteinContext}
              aria-label="Loaded Protein And Reference"
            >
              <p>
                <strong>Currently Viewing:</strong> {input.name} · Chain{' '}
                {chain || 'Unnamed'} · {residues.length} Residues
              </p>
              <p>
                <strong>Annotations From:</strong>{' '}
                {reference
                  ? `${reference.name} (${reference.accession})`
                  : 'No Reference Loaded'}
              </p>
            </div>
          )}
          <button
            className={styles.example}
            onClick={loadExample}
            disabled={!ready || Boolean(busy)}
          >
            Try Lysozyme <span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
      <p className={styles.privacy}>
        Your uploaded sequence and coordinates stay in this tab. Annotation
        lookups send only the accession to this website, UniProt, and InterPro.
        Loading an existing model requests it from AlphaFold DB. No structure
        prediction runs here.
      </p>
      {busy && (
        <p role="status" className={styles.status}>
          {busy}
        </p>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {!input && (
        <div className={styles.welcome}>
          <span className={styles.orbit} aria-hidden="true">
            ◎
          </span>
          <div>
            <h2>Follow A Region From Sequence To Structure.</h2>
            <p>
              Select residues to inspect binding sites, catalytic features,
              domains, modifications, and published variants. Try lysozyme to
              explore a real example with known catalytic residues.
            </p>
          </div>
        </div>
      )}
      {input && (
        <>
          <div className={styles.heading}>
            <div>
              <p className={styles.eyebrow}>03 / Explore Your Protein</p>
              <h2>{input.name}</h2>
              <p className={styles.small}>
                {input.kind === 'structure'
                  ? 'First coordinate model · Observed protein residues · Original residue labels'
                  : 'Sequence view · Positions start at 1'}
                {input.origin && (
                  <>
                    <br />
                    {input.origin}
                  </>
                )}
              </p>
            </div>
            <div className={styles.inline}>
              <button onClick={exportRegion}>Export Review</button>
              <button
                disabled={!ready || Boolean(busy)}
                onClick={() => {
                  setInput(null);
                  setReference(null);
                  setSelectedKeys([]);
                  setRegions([]);
                  setError('');
                }}
              >
                Clear Protein
              </button>
            </div>
          </div>
          <div className={styles.workspace}>
            <div className={styles.visualColumn}>
              <div className={styles.panel}>
                <div className={styles.toolbar}>
                  <label>
                    Chain
                    <select
                      value={chain}
                      onChange={(e) => switchChain(e.target.value)}
                    >
                      {input.chains.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id || 'Unnamed Chain'} ({c.residues.length}{' '}
                          Residues)
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={styles.hover} aria-live="polite">
                    {hover
                      ? `${hover.name} ${hover.number} · ${hover.chain || 'Unnamed Chain'}`
                      : 'Hover To Inspect A Residue'}
                  </div>
                </div>
                {input.pdb ? (
                  <AnnotationStructureViewer
                    input={input}
                    chain={chain}
                    selected={selected}
                    annotated={annotated}
                    reference={reference}
                    mapping={mapping}
                    onPick={pick}
                    onHover={setHover}
                    focus={focus}
                  />
                ) : (
                  <div className={styles.noStructure}>
                    <h3>Sequence Ready</h3>
                    <p>
                      Select residues below to explore annotations. A 3D view
                      needs coordinates.
                    </p>
                    <button
                      disabled={
                        Boolean(busy) ||
                        !reference ||
                        sequence !== reference.sequence
                      }
                      onClick={loadModel}
                    >
                      Load Existing AlphaFold Structure
                    </button>
                    <p className={styles.small}>
                      Available when this sequence exactly matches the
                      reference. Predicted models are labeled as predictions.
                    </p>
                  </div>
                )}
                <p className={styles.legend}>
                  <span>● Reference Annotations</span>
                  <span>● Your Selection</span>
                  <span>● Hovered Residue</span>
                </p>
                <p className={styles.small}>
                  Drag the structure to rotate. Hover over a residue for its
                  amino acid and annotation preview. Click to select it. Hold
                  Shift to add residues. Colors identify annotations and
                  selections, not confidence.
                </p>
              </div>
              <div className={styles.panel}>
                <div className={styles.heading}>
                  <h3>Residue Selection</h3>
                  <span className={styles.badge} role="status">
                    {selected.size} Selected
                  </span>
                </div>
                <p className={styles.small}>
                  Drag across sequence letters or use Shift + click to select a
                  range. Use Tab and Enter for keyboard selection. Labels below
                  letters preserve your file’s residue numbers.
                </p>
                <div
                  className={styles.sequence}
                  aria-label="Protein Sequence"
                  onPointerLeave={() => {
                    dragging.current = false;
                  }}
                >
                  {residues.map((r, i) => (
                    <button
                      key={r.key}
                      ref={(node) => {
                        if (node) residueRefs.current.set(r.key, node);
                        else residueRefs.current.delete(r.key);
                      }}
                      type="button"
                      aria-label={`${r.name} ${r.number}, ${chain || 'Unnamed Chain'}${mapping?.usable && mapping.positions[i] ? `, Reference ${mapping.positions[i]}` : ''}`}
                      aria-pressed={selected.has(r.key)}
                      data-annotated={annotated.has(r.key)}
                      title={`${r.name} ${r.number}${mapping?.usable ? ` · UniProt ${mapping.positions[i] || 'Unmapped'}` : ''}`}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        pickSequence(i, e.shiftKey, e.ctrlKey || e.metaKey);
                        dragging.current =
                          e.pointerType === 'mouse' && !e.ctrlKey && !e.metaKey;
                      }}
                      onPointerEnter={() => {
                        setHover(r);
                        if (dragging.current) pickSequence(i, true, false);
                      }}
                      onPointerUp={() => {
                        dragging.current = false;
                      }}
                      onPointerCancel={() => {
                        dragging.current = false;
                      }}
                      onMouseLeave={() => setHover(null)}
                      onClick={(e) => {
                        if (e.detail === 0)
                          pickSequence(i, e.shiftKey, e.ctrlKey || e.metaKey);
                      }}
                    >
                      <strong>{r.letter}</strong>
                      <small>{r.number}</small>
                    </button>
                  ))}
                </div>
                <div className={styles.actions}>
                  <button
                    disabled={!selected.size}
                    onClick={() => {
                      setSelectedKeys([]);
                      anchor.current = null;
                    }}
                  >
                    Clear Selection
                  </button>
                  <button
                    disabled={!selected.size || !input.pdb}
                    onClick={() => setFocus((v) => v + 1)}
                  >
                    Focus Selection
                  </button>
                </div>
                {input.pdb && (
                  <div className={styles.neighborhood}>
                    <label>
                      Neighborhood Radius (Å)
                      <input
                        type="number"
                        min={1}
                        max={12}
                        step={1}
                        value={radius}
                        onChange={(e) => setRadius(Number(e.target.value))}
                      />
                    </label>
                    <button
                      disabled={!selected.size || radius < 1 || radius > 12}
                      onClick={() =>
                        setSelectedKeys(neighbors(residues, selected, radius))
                      }
                    >
                      Include Nearby Residues
                    </button>
                    <p className={styles.small}>
                      Alpha carbon distances within this chain. This does not
                      calculate atomic contacts or binding pockets.
                    </p>
                  </div>
                )}
              </div>
              <details className={styles.panel}>
                <summary>Save A Region And Notes</summary>
                <p className={styles.small}>
                  Saved regions stay in this tab and are included in Export
                  Review. Download your review before leaving.
                </p>
                <label>
                  Region Name
                  <input
                    value={regionName}
                    maxLength={100}
                    onChange={(e) => setRegionName(e.target.value)}
                    placeholder="For Example, Catalytic Region"
                  />
                </label>
                <label>
                  Research Notes
                  <textarea
                    value={notes}
                    maxLength={4000}
                    rows={3}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
                <button
                  disabled={
                    !selected.size || !regionName.trim() || regions.length >= 30
                  }
                  onClick={() => {
                    setRegions((old) => [
                      ...old,
                      {
                        name: regionName.trim(),
                        notes,
                        chain,
                        keys: [...selected],
                      },
                    ]);
                    setRegionName('');
                    setNotes('');
                  }}
                >
                  Save Selected Region
                </button>
                {regions.map((region, i) => (
                  <div key={i} className={styles.saved}>
                    <button
                      onClick={() => {
                        setChain(region.chain);
                        setSelectedKeys(region.keys);
                        setCategory('All');
                        anchor.current = null;
                      }}
                    >
                      {region.name} · {region.keys.length} Residues
                    </button>
                    <button
                      aria-label={`Remove ${region.name}`}
                      onClick={() =>
                        setRegions((old) => old.filter((_, j) => i !== j))
                      }
                    >
                      Remove
                    </button>
                    <p>{region.notes}</p>
                  </div>
                ))}
              </details>
            </div>
            <aside
              className={styles.annotationPanel}
              aria-label="Region Annotations"
            >
              <p className={styles.eyebrow}>04 / What Is Known Here?</p>
              <h2>
                {selected.size
                  ? 'Selected Region'
                  : 'Annotations In This Chain'}
              </h2>
              {!reference ? (
                <p>
                  Load a UniProt reference above to connect this protein to
                  published annotations.
                </p>
              ) : (
                <>
                  <div className={styles.reference}>
                    <a
                      href={`https://www.uniprot.org/uniprotkb/${reference.accession}/entry`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {reference.name} ↗
                    </a>
                    <p>
                      {reference.accession} · {reference.organism}
                    </p>
                    <p>
                      {reference.reviewed
                        ? 'Reviewed UniProt Entry'
                        : 'Unreviewed UniProt Entry'}{' '}
                      · Version {reference.version}
                    </p>
                    <p>Retrieved {reference.retrievedAt.slice(0, 10)}</p>
                  </div>
                  {mapping && (
                    <div
                      className={
                        mapping.usable ? styles.mapping : styles.mappingWarning
                      }
                    >
                      <strong>
                        {mapping.usable
                          ? mapping.exact
                            ? 'Exact Sequence Match'
                            : 'Aligned To Reference'
                          : 'Reference Mapping Needs Review'}
                      </strong>
                      <p>
                        {Math.round(mapping.identity * 100)}% Sequence Identity
                        · {Math.round(mapping.coverage * 100)}% Query Coverage ·{' '}
                        {mapping.substitutions} Substitutions
                      </p>
                      <p>
                        {mapping.usable
                          ? 'Annotations describe the reference protein. Their presence here does not establish function in your uploaded structure.'
                          : mapping.identity < 0.9 || mapping.coverage < 0.9
                            ? 'The loaded protein does not closely match this reference. Mapping requires at least 90% identity and 90% query coverage. Annotations are withheld. Check the accession and selected chain, or open the reference as a new protein.'
                            : mapping.ambiguous
                              ? 'This sequence has more than one equally scoring alignment. Annotations are withheld to avoid assigning them to the wrong region.'
                              : 'Too few matching residues support this mapping. Check the accession and selected chain. Annotations are withheld.'}
                      </p>
                      {!mapping.usable && (
                        <>
                          <p>
                            Comparing {input.name}, chain {chain || 'Unnamed'},
                            with {reference.name} ({reference.accession}).
                            Loading annotations keeps the current protein in the
                            viewer.
                          </p>
                          <button
                            disabled={Boolean(busy)}
                            onClick={() => openReferenceProtein(reference)}
                          >
                            Open Reference Protein
                          </button>
                          <p className={styles.small}>
                            Opens {reference.accession} as a new sequence and
                            clears the current selection and notes. You can then
                            load its existing AlphaFold structure.
                          </p>
                        </>
                      )}
                    </div>
                  )}
                  <div className={styles.sourceStatus}>
                    {reference.sources.map((source) => (
                      <p key={source.name}>
                        {source.name}: {title(source.status)}
                        {source.message && ` · ${source.message}`}
                      </p>
                    ))}
                  </div>
                  {mapping?.usable && (
                    <>
                      <label>
                        Annotation Type
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                        >
                          <option value="All">All Types</option>
                          {categories.map((c) => (
                            <option key={c} value={c}>
                              {title(c)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className={styles.small}>
                        {displayed.length} Annotations
                        {selected.size
                          ? ' Overlap Your Selection'
                          : ' Mapped To This Chain'}
                      </p>
                      <div className={styles.cards}>
                        {!displayed.length && (
                          <p className={styles.empty}>
                            {category === 'All'
                              ? 'No annotation found for this region in the available sources. This does not mean the region has no function.'
                              : 'No annotations of this type overlap the selection. Try All Types.'}
                          </p>
                        )}
                        {displayed.map((annotation) => {
                          const hits = annotationPositions(
                            annotation,
                            residues,
                            mapping
                          );
                          const mismatches = hits.filter(
                            (r) =>
                              r.letter !==
                              reference.sequence[
                                mapping.positions[r.position - 1] - 1
                              ]
                          );
                          return (
                            <article
                              key={annotation.id}
                              className={styles.annotationCard}
                            >
                              <div className={styles.heading}>
                                <span className={styles.badge}>
                                  {annotation.source}
                                </span>
                                <span className={styles.annotationType}>
                                  {title(annotation.category)}
                                  <AnnotationTypeIcon
                                    category={annotation.category}
                                  />
                                </span>
                              </div>
                              <h3>{annotation.description}</h3>
                              <p className={styles.small}>
                                Reference Residues:{' '}
                                {annotation.spans
                                  .map(([a, b]) =>
                                    a === b ? a : `${a} to ${b}`
                                  )
                                  .join(', ')}
                              </p>
                              {mismatches.length > 0 && (
                                <p className={styles.caution}>
                                  The uploaded chain has a sequence difference
                                  within this annotation. Reference activity may
                                  not transfer.
                                </p>
                              )}
                              {annotation.uncertainty && (
                                <p className={styles.caution}>
                                  {annotation.uncertainty}
                                </p>
                              )}
                              <details>
                                <summary>Evidence And Residue Mapping</summary>
                                <p>
                                  {annotation.evidence.length
                                    ? 'Evidence reported by the source:'
                                    : 'No feature evidence code was supplied by the source.'}
                                </p>
                                <ul>
                                  {annotation.evidence.map((e, i) => {
                                    const url = evidenceUrl(e.source, e.id);
                                    return (
                                      <li key={i}>
                                        {e.code}
                                        {e.source && ` · ${e.source}`}
                                        {url ? (
                                          <>
                                            {' '}
                                            ·{' '}
                                            <a
                                              href={url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                            >
                                              {e.id} ↗
                                            </a>
                                          </>
                                        ) : e.id ? (
                                          ` · ${e.id}`
                                        ) : (
                                          ''
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                                <p>
                                  File Residues:{' '}
                                  {hits
                                    .map((r) => `${r.letter}${r.number}`)
                                    .join(', ')}
                                </p>
                              </details>
                              <div className={styles.actions}>
                                <button
                                  onClick={() => {
                                    setSelectedKeys(hits.map((r) => r.key));
                                    anchor.current = null;
                                  }}
                                >
                                  Highlight Region
                                </button>
                                <a
                                  href={annotation.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  View Source ↗
                                </a>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </>
                  )}
                </>
              )}
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
