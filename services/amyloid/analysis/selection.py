"""Frozen scientific functions, extracted without changing their definitions.
Source hashes and provenance are recorded in SCIENTIFIC_SOURCES.json.
No benchmark outcomes or research-workspace paths are read at runtime.
"""
"""Unmodified pct/features definitions from November 9 top10 selector."""
import numpy as np
import pandas as pd
PILLARS=['geometry_percentile', 'dryness_percentile', 'energy_percentile', 'low_soluble_percentile']
def pct(x,ref):
    ref=np.sort(ref.dropna().to_numpy(dtype=float))
    out=pd.Series(np.nan,index=x.index,dtype=float)
    if len(ref):
        ok=x.notna()
        out.loc[ok]=(np.searchsorted(ref,x[ok],side='left')+np.searchsorted(ref,x[ok],side='right'))/(2*len(ref))
    return out
def features(f):
    f=f.copy();passed=f.qc_status.eq('pass')
    for src,dst,sgn,gate in [('G_geometry','geometry_percentile',1,None),('D_sasa','dryness_percentile',1,'packing_gate_eligible'),('N_soluble_core','low_soluble_percentile',-1,None),('dG_total_per_residue','total_energy_percentile',-1,'energy_gate_eligible'),('dG_interchain_per_residue','interchain_energy_percentile',-1,'energy_gate_eligible')]:
        v=sgn*f[src]
        if gate:v=v.where(f[gate].eq(True))
        f[dst]=pct(v,v[passed])
    e=f[['total_energy_percentile','interchain_energy_percentile']]
    f['energy_percentile']=e.mean(axis=1).where(e.notna().all(axis=1))
    f['evidence_components']=f[PILLARS].notna().sum(axis=1)
    f['amyloid_score']=100*f[PILLARS].mean(axis=1)
    f['tier']=np.select([~passed,f.evidence_components.eq(4),f.evidence_components.ge(2)],[3,0,1],default=2)
    for src,dst in [('iptm','iptm_percentile'),('mean_plddt','plddt_percentile')]:
        f[dst]=pct(f[src],f.loc[passed,src])
        f[dst+'_method']=np.nan
        for _,g in f.groupby('method'):
            f.loc[g.index,dst+'_method']=pct(g[src],g.loc[g.qc_status.eq('pass'),src])
    f['confidence_score']=50*(f.iptm_percentile+f.plddt_percentile)
    f['confidence_score_method']=50*(f.iptm_percentile_method+f.plddt_percentile_method)
    return f

def greedy(frame,matrix,delta,limit=10):
    chosen=[]
    for idx in frame.index:
        if not chosen or np.all(matrix[idx,chosen]>=delta):chosen.append(int(idx))
        if len(chosen)==limit:break
    return chosen

def supported(f):
    return f.qc_status.eq('pass') & f.evidence_components.eq(4) & f.amyloid_score.ge(50) & np.isfinite(f.confidence_score) & np.isfinite(f.confidence_score_method)

def center(f,d):
    f=f.copy();f['centrality']=np.nan
    for _,g in f[f.cluster.ge(0)].groupby('cluster'):
        sub=d[np.ix_(g.index,g.index)]
        neg=pd.Series(-sub.sum(axis=1)/(len(g)-1) if len(g)>1 else [0.],index=g.index)
        f.loc[g.index,'centrality']=pct(neg,neg)
    f['I']=100*f.iptm_percentile
    f['S']=.75*f.amyloid_score+.25*f.I
    f['R']=.8*f.S+20*f.centrality
    f['support_eligible']=supported(f)
    return f
