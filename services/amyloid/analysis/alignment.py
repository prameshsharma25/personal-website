"""MM-align output parsing and distance conversion from the research pipeline."""
import math
import re
import numpy as np
NUM = r'[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?'

def parse(output):
    """Require explicit normalization labels, not positional score guessing."""
    out = {}
    for side in (1, 2):
        score = re.findall(rf'^\s*TM-score=\s*({NUM}).*normalized by length of (?:Structure|Chain)_{side}\b', output, re.M)
        length = re.findall(rf'^Length of (?:Structure|Chain)_{side}:\s*(\d+)', output, re.M)
        name = re.findall(rf'^Name of (?:Structure|Chain)_{side}:\s*(.+)', output, re.M)
        if len(score) != 1 or len(length) != 1 or len(name) != 1:
            raise ValueError(f'Missing/ambiguous score, length or chain mapping: input {side}')
        out[f'tm{side}'], out[f'length{side}'] = float(score[0]), int(length[0])
        if not 0 <= out[f'tm{side}'] <= 1 or out[f'length{side}'] <= 0:
            raise ValueError('Invalid score or length')
        # Staged paths contain no colons; tokens retain multicharacter chain IDs.
        out[f'chains{side}'] = name[0].split(' (to be superimposed')[0].strip().split(':')[1:]
    match = re.search(rf'Aligned length=\s*(\d+),\s*RMSD=\s*({NUM}),\s*Seq_ID=.*?=\s*({NUM})', output)
    if not match:
        raise ValueError('Missing alignment statistics')
    aligned, rmsd, identity = int(match[1]), float(match[2]), float(match[3])
    if not 0 < aligned <= min(out['length1'], out['length2']) or not math.isfinite(rmsd) or rmsd < 0 or not 0 <= identity <= 1:
        raise ValueError('Invalid alignment statistics')
    if len(out['chains1']) != len(out['chains2']):
        raise ValueError('Unrecognized chain mapping')
    out.update(aligned_length=aligned, rmsd=rmsd, sequence_identity=identity,
               coverage1=aligned/out['length1'], coverage2=aligned/out['length2'],
               chain_pairs=list(map(list, zip(out['chains1'], out['chains2']))))
    return out

def to_distance(similarity):
    s = np.asarray(similarity,dtype=float)
    if s.ndim != 2 or s.shape[0] != s.shape[1] or not np.isfinite(s).all() or (s<0).any() or (s>1).any():
        raise ValueError('Expected finite square similarity in [0,1]; no missing-pair imputation')
    if not np.allclose(s,s.T,atol=1e-12,rtol=0) or not np.allclose(np.diag(s),1,atol=1e-12,rtol=0):
        raise ValueError('Expected symmetry and validated unit diagonal')
    return 1-s
