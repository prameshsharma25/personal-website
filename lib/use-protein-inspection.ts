import { useState } from 'react';
import type { ReferenceProtein } from './protein-annotations';

type Region = { name: string; notes: string; chain: string; keys: string[] };

/** Inspection state belongs to an input slot, never to a shared residue key. */
export function useProteinInspection() {
  const [reference, setReference] = useState<ReferenceProtein | null>(null);
  const [accession, setAccession] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [category, setCategory] = useState('All');
  const [radius, setRadius] = useState(6);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionName, setRegionName] = useState('');
  const [notes, setNotes] = useState('');
  const reset = (ref: ReferenceProtein | null = null, id = '') => {
    setReference(ref);
    setAccession(id);
    setSelectedKeys([]);
    setCategory('All');
    setRadius(6);
    setRegions([]);
    setRegionName('');
    setNotes('');
  };
  return {
    reference,
    setReference,
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
