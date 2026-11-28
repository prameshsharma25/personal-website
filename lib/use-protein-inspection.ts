import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCESSION, type ReferenceProtein } from './protein-annotations';

type Region = { name: string; notes: string; chain: string; keys: string[] };

/** Inspection state belongs to an input slot, never to a shared residue key. */
export function useProteinInspection() {
  const [reference, setReference] = useState<ReferenceProtein | null>(null);
  const [accession, updateAccession] = useState('');
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const request = useRef({
    generation: 0,
    controller: null as AbortController | null,
  });
  const cancelReference = useCallback(() => {
    request.current.generation++;
    request.current.controller?.abort();
    request.current.controller = null;
    setReferenceLoading(false);
    setReferenceError('');
  }, []);
  useEffect(() => {
    const pending = request.current;
    return () => {
      pending.generation++;
      pending.controller?.abort();
    };
  }, []);
  const setAccession = (value: string) => {
    cancelReference();
    updateAccession(value);
  };
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [category, setCategory] = useState('All');
  const [radius, setRadius] = useState(6);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionName, setRegionName] = useState('');
  const [notes, setNotes] = useState('');
  const reset = (ref: ReferenceProtein | null = null, id = '') => {
    cancelReference();
    setReference(ref);
    updateAccession(id);
    setSelectedKeys([]);
    setCategory('All');
    setRadius(6);
    setRegions([]);
    setRegionName('');
    setNotes('');
  };
  const clearReference = (id = '') => {
    cancelReference();
    setReference(null);
    updateAccession(id);
    setCategory('All');
  };
  const retrieveReference = async (
    accession: string
  ): Promise<ReferenceProtein | null> => {
    cancelReference();
    const id = accession.trim().toUpperCase();
    updateAccession(id);
    if (!ACCESSION.test(id)) {
      setReferenceError(
        'Enter a canonical UniProt accession, such as P00698. Isoform identifiers are not supported yet.'
      );
      return null;
    }
    const generation = request.current.generation;
    const controller = new AbortController();
    request.current.controller = controller;
    const current = () =>
      request.current.generation === generation && !controller.signal.aborted;
    setReferenceLoading(true);
    try {
      const response = await fetch(
        `/api/protein-annotations?kind=reference&id=${encodeURIComponent(id)}`,
        {
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(25000),
          ]),
        }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data?.error ||
            'Annotations could not be retrieved. Try again shortly.'
        );
      if (
        !data ||
        typeof data.accession !== 'string' ||
        !ACCESSION.test(data.accession) ||
        typeof data.sequence !== 'string' ||
        !data.sequence ||
        !Array.isArray(data.annotations) ||
        !Array.isArray(data.sources)
      )
        throw new Error(
          'The annotation response could not be read. Try again shortly.'
        );
      if (!current()) return null;
      setReference(data);
      updateAccession(data.accession);
      setCategory('All');
      return data;
    } catch (error) {
      if (current())
        setReferenceError(
          error instanceof Error
            ? error.message
            : 'Annotations could not be retrieved. Try again shortly.'
        );
      return null;
    } finally {
      if (current()) {
        request.current.controller = null;
        setReferenceLoading(false);
      }
    }
  };
  return {
    reference,
    referenceLoading,
    referenceError,
    retrieveReference,
    cancelReference,
    clearReference,
    accession,
    setAccession,
    selectedKeys,
    setSelectedKeys,
    category,
    setCategory,
    radius,
    setRadius,
    regions,
    setRegions,
    regionName,
    setRegionName,
    notes,
    setNotes,
    reset,
  };
}
